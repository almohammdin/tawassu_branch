import {GoogleGenAI,Modality} from 'https://cdn.jsdelivr.net/npm/@google/genai@2.14.0/+esm';
import {TAWASSU_TOOL_DECLARATIONS,executeTawassuTool} from './tawassu-voice-tools.js?v=1.7.2';

const MODEL='gemini-3.1-flash-live-preview',INPUT_RATE=16000,OUTPUT_RATE=24000,TOOL_TIMEOUT_MS=15000;
let active=false,session=null,micStream=null,micContext=null,outputContext=null,micSource=null,micProcessor=null,silentGain=null,outputWorklet=null,outputGain=null,micSuppressed=false,outputQueuedUntil=0,resumeMicTimer=null,streamEndSent=false,muted=false;
function isIOS(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)}
const IOS_ECHO_GUARD=isIOS();
const endpoint=()=>String(window.TAWASSU_VOICE_TOKEN_ENDPOINT||'https://mesraah-live-token.naif123456.workers.dev/token').trim();
const emitState=(state,label,detail='')=>window.dispatchEvent(new CustomEvent('tawassu:voice-state',{detail:{state,label,detail}}));

function contextInstruction(){
  const context=window.TawassuAssistantBridge?.getAssessmentContext?.()||{};
  return `أنت خبير توسع داخل منصة توسع.
مهمتك مساعدة المستخدم على تقييم فرصة فتح فرع جديد وفهم الموقع والصفقة والمبيعات والتشغيل والمخاطر.
تخدم مختلف الأنشطة التجارية والخدمية، ولديك خبرة أعمق في المطاعم والمقاهي.
هذه محادثة صوتية حقيقية ومستمرة مع المستخدم، وليست قراءة لنصوص الاستبيان.
تحدث بعربية سعودية سهلة ومهنية. اختصر، واسأل سؤالا واحدا في كل مرة. اسمك خبير توسع.
اقرأ الحالة بأداة get_assessment_context قبل كل سؤال جديد أو اقتراح أو تفسير للنتيجة. لا تسأل عن معلومة سبق تسجيلها.
استخدم تعليمات السؤال لفهم المقصود وصياغة سؤال طبيعي. لا تقرأ الشرح الطويل أو المرجع تلقائيا، وقدمه عند طلب التوضيح.
ميز بين المعلومة المؤكدة والتقدير والافتراض والمعلومة الناقصة.
اقترح الإجابة المناسبة بأداة propose_assessment_answer عندما تحتمل أكثر من خيار أو تكون تقديرية أو رقمية، واطلب التأكيد شفهيا.
إذا قلت هل أعتمد، انتظر جواب المستخدم في دور لاحق. لا تستخدم set_assessment_answer في الدور نفسه.
الإجابة الواضحة غير الحساسة التي صاغها المستخدم كاختيار مباشر يمكن تسجيلها. استخدم confirmed=true فقط بعد الاعتماد الصريح أو الأمر المباشر الذي لا يحتمل اللبس.
لا تقل تم التسجيل حتى ترجع أداة set_assessment_answer بالقيمتين ok=true وpersisted=true.
استخدم أدوات توسع للتنقل الفعلي، وإبراز السؤال، وشرح السؤال، وعرض الاقتراح، وتسجيل الإجابة، والفحص، وإظهار النتيجة.
اعتمد محرك توسع الحالي في الدرجة والأوزان والنتيجة. لا تحسب درجة من عندك.
استنتج طريقة التعامل من كلام المستخدم من دون أن تطلب منه اختيار وضع: وصف الفرصة يبدأ التقييم، الحيرة تبدأ نقاشا استشاريا، وطلب التعبئة يفتح النموذج ويترك الاختيار له.
إذا طلب المستخدم التعبئة بنفسه، انقله إلى السؤال الحالي وقل له إن النموذج أمامه وإن علامة المساعدة تشرح السؤال.
إذا طلب شرح المنصة، اشرحها باختصار من دون إجباره على بدء التقييم.
بعد اكتمال التقييم شغل complete_assessment، ثم استخدم explain_assessment_result لشرح النتيجة وشروط المضي والخطوة التالية.
يمكن للمستخدم مقاطعتك. توقف عن الصوت فور المقاطعة واستمع له.
حالة توسع عند بدء الجلسة: ${JSON.stringify(context)}`;
}

function ensureUi(){
  if(document.getElementById('tawassuVoiceSession'))return;
  const host=document.getElementById('assistantVoiceHost')||document.body,card=document.createElement('section');
  card.id='tawassuVoiceSession';card.className='tawassu-voice-session';card.hidden=true;card.setAttribute('aria-label','محادثة صوتية ذكية مع خبير توسع');
  card.innerHTML=`<div class="tawassu-live-mark" aria-hidden="true"><span>✦</span><i></i><i></i><i></i></div><div class="tawassu-live-copy"><strong id="tawassuVoiceStatus" aria-live="polite">أجهز المحادثة</strong><p id="tawassuVoiceDetail">محادثة صوتية ذكية · Gemini</p></div><button type="button" id="tawassuVoiceStop" class="tawassu-live-stop" aria-label="إنهاء المحادثة">إنهاء</button>`;
  host.appendChild(card);document.getElementById('tawassuVoiceStop').addEventListener('click',stop);
}
function setStatus(label,state,detail=''){const el=document.getElementById('tawassuVoiceStatus');if(el)el.textContent=label;const card=document.getElementById('tawassuVoiceSession');if(card)card.dataset.state=state;if(detail)setDetail(detail);emitState(state,label,detail)}
function setDetail(text){const el=document.getElementById('tawassuVoiceDetail');if(el)el.textContent=String(text||'')}
function bytesToBase64(bytes){let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary)}
function base64ToFloat32(value){const binary=atob(value),length=binary.length-(binary.length%2),buffer=new ArrayBuffer(length),bytes=new Uint8Array(buffer);for(let i=0;i<length;i++)bytes[i]=binary.charCodeAt(i);const pcm=new Int16Array(buffer),out=new Float32Array(pcm.length);for(let i=0;i<pcm.length;i++)out[i]=pcm[i]/32768;return out}
function resampleToInt16(input,sourceRate){const ratio=sourceRate/INPUT_RATE,out=new Int16Array(Math.max(1,Math.round(input.length/ratio)));for(let i=0;i<out.length;i++){const pos=i*ratio,left=Math.floor(pos),right=Math.min(left+1,input.length-1),mix=pos-left,value=(input[left]||0)*(1-mix)+(input[right]||0)*mix,clamped=Math.max(-1,Math.min(1,value));out[i]=clamped<0?clamped*32768:clamped*32767}return out}
async function prepareAudio(){const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx||!navigator.mediaDevices?.getUserMedia)throw new Error('voice-not-supported');micContext=new AudioCtx();try{outputContext=new AudioCtx({sampleRate:OUTPUT_RATE})}catch{outputContext=new AudioCtx()}await Promise.all([micContext.resume(),outputContext.resume()]);if(!outputContext.audioWorklet)throw new Error('voice-playback-not-supported');await outputContext.audioWorklet.addModule('./tawassu-voice-playback.worklet.js?v=1.7.2');outputWorklet=new AudioWorkletNode(outputContext,'tawassu-voice-playback');outputGain=outputContext.createGain();outputGain.gain.value=muted?0:1;outputWorklet.connect(outputGain);outputGain.connect(outputContext.destination);outputQueuedUntil=outputContext.currentTime;micStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}})}
function clearPlayback(){try{outputWorklet?.port.postMessage({type:'clear'})}catch{}if(outputContext)outputQueuedUntil=outputContext.currentTime}
function suppressMicForModelOutput(){if(!IOS_ECHO_GUARD||micSuppressed)return;micSuppressed=true;if(!streamEndSent&&session){streamEndSent=true;try{session.sendRealtimeInput({audioStreamEnd:true})}catch{}}}
function resumeMicAfterPlayback(){clearTimeout(resumeMicTimer);if(!IOS_ECHO_GUARD){if(active)setStatus('أسمعك الآن','listening','تكلم بشكل طبيعي، ويمكنك مقاطعة خبير توسع.');return}const remainingMs=outputContext?Math.max(0,(outputQueuedUntil-outputContext.currentTime)*1000):0;resumeMicTimer=setTimeout(()=>{micSuppressed=false;streamEndSent=false;if(active)setStatus('أسمعك الآن','listening','تكلم بشكل طبيعي، ويمكنك مقاطعة خبير توسع.')},remainingMs+140)}
function playPcm(base64){if(!active||!outputContext||!outputWorklet||!base64)return;suppressMicForModelOutput();const samples=base64ToFloat32(base64);if(!samples.length)return;outputQueuedUntil=Math.max(outputContext.currentTime,outputQueuedUntil)+samples.length/OUTPUT_RATE;try{outputWorklet.port.postMessage({samples},[samples.buffer])}catch{outputWorklet.port.postMessage({samples})}setStatus('خبير توسع يتحدث','speaking')}
async function fetchToken(forceRefresh=false){if(typeof window.TawassuVoiceGetAppCheckToken!=='function')throw new Error('voice-app-check-not-ready');const token=await window.TawassuVoiceGetAppCheckToken({forceRefresh}),response=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json','X-Firebase-AppCheck':token},body:'{}'}),data=await response.json().catch(()=>({}));if(response.status===401&&!forceRefresh)return fetchToken(true);if(!response.ok||!data.token)throw new Error('voice-token-failed');return data.token}
function withTimeout(promise,ms=TOOL_TIMEOUT_MS){let timer;return Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('voice-tool-timeout')),ms)})]).finally(()=>clearTimeout(timer))}
async function handleToolCalls(calls=[]){const responses=[];setStatus('أنفذ الخطوة','working');for(const call of calls){let result;try{result=await withTimeout(executeTawassuTool(call.name,call.args||{}))}catch(error){result={ok:false,error:String(error?.message||error)}}responses.push({name:call.name,id:call.id,response:{result}});if(result?.ok&&call.name==='set_assessment_answer')setDetail(`تم تسجيل ${result.answer_labels?.join('، ')||'الإجابة'} داخل التقييم.`)}session?.sendToolResponse({functionResponses:responses})}
function handleMessage(message){
  if(message?.toolCall?.functionCalls?.length)handleToolCalls(message.toolCall.functionCalls).catch(console.error);
  const content=message?.serverContent;if(!content)return;
  if(content.interrupted){clearPlayback();micSuppressed=false;streamEndSent=false;setStatus('أسمعك الآن','listening','تفضل، أكمل كلامك.')}
  if(content.inputTranscription?.text&&!micSuppressed){window.TawassuAssistantBridge?.noteUserMessage?.(content.inputTranscription.text);setStatus('أفهم الإجابة','processing');setDetail(`أنت: ${content.inputTranscription.text}`)}
  if(content.outputTranscription?.text)setDetail(`خبير توسع: ${content.outputTranscription.text}`);
  for(const part of content.modelTurn?.parts||[])if(part.inlineData?.data)playPcm(part.inlineData.data);
  if(content.turnComplete&&active)resumeMicAfterPlayback();
}
function startMic(){if(!active||!session||!micContext||!micStream||micProcessor)return;micSource=micContext.createMediaStreamSource(micStream);micProcessor=micContext.createScriptProcessor(2048,1,1);silentGain=micContext.createGain();silentGain.gain.value=0;micProcessor.onaudioprocess=event=>{if(!active||!session||micSuppressed)return;const pcm=resampleToInt16(event.inputBuffer.getChannelData(0),micContext.sampleRate),bytes=new Uint8Array(pcm.buffer,pcm.byteOffset,pcm.byteLength);try{session.sendRealtimeInput({audio:{data:bytesToBase64(bytes),mimeType:`audio/pcm;rate=${INPUT_RATE}`}})}catch{}};micSource.connect(micProcessor);micProcessor.connect(silentGain);silentGain.connect(micContext.destination)}
async function shutdown(){clearTimeout(resumeMicTimer);resumeMicTimer=null;micSuppressed=false;streamEndSent=false;if(micProcessor)micProcessor.onaudioprocess=null;try{micProcessor?.disconnect();micSource?.disconnect();silentGain?.disconnect();outputWorklet?.disconnect();outputGain?.disconnect()}catch{}micStream?.getTracks?.().forEach(track=>track.stop());micStream=null;try{await micContext?.close();await outputContext?.close()}catch{}micContext=outputContext=null;micProcessor=micSource=silentGain=outputWorklet=outputGain=null}
async function start(options={}){
  if(active)return;ensureUi();document.getElementById('tawassuVoiceSession').hidden=false;active=true;setStatus('أجهز المحادثة','connecting','لحظات وأسمعك عبر Gemini Live.');
  try{
    await prepareAudio();const token=await fetchToken();if(!active)return;
    const ai=new GoogleGenAI({apiKey:token,httpOptions:{apiVersion:'v1alpha'}});
    session=await ai.live.connect({model:MODEL,config:{responseModalities:[Modality.AUDIO],systemInstruction:contextInstruction(),inputAudioTranscription:{},outputAudioTranscription:{},speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}},tools:[{functionDeclarations:TAWASSU_TOOL_DECLARATIONS}]},callbacks:{onopen:()=>setStatus('أجهز المحادثة','connecting','تم الاتصال بخبير توسع.'),onmessage:handleMessage,onerror:event=>console.error('Tawassu voice:',event),onclose:()=>{if(active){setStatus('توقفت المحادثة','error','انقطع الاتصال الصوتي. استخدم الكتابة أو أعد المحاولة.');window.dispatchEvent(new CustomEvent('tawassu:voice-fallback'))}}}});
    if(!active)return;startMic();setStatus('أسمعك الآن','listening','تكلم بشكل طبيعي، ويمكنك مقاطعة خبير توسع.');
    try{session.sendClientContent({turns:[{role:'user',parts:[{text:'ابدأ بتحية قصيرة وقل: احك لي عن فرصة الفرع بطريقتك، وما أكثر نقطة تحتاج مراجعة فيها؟ اقرأ حالة التقييم أولا ولا تسأل عن معلومة مسجلة.'}]}],turnComplete:true})}catch{}
  }catch(error){console.error('Tawassu voice start:',error);setStatus('توقفت المحادثة','error','تعذر تشغيل Gemini Live. استخدم الكتابة أو أكمل النموذج.');try{session?.close?.()}catch{}session=null;active=false;await shutdown();window.dispatchEvent(new CustomEvent('tawassu:voice-fallback'))}
}
async function stop(){active=false;try{session?.close?.()}catch{}session=null;await shutdown();setStatus('توقفت المحادثة','stopped','يمكنك العودة للصوت أو متابعة التقييم كتابة.');const host=document.getElementById('tawassuVoiceSession');if(host)host.hidden=true}
function setMuted(value){muted=Boolean(value);if(outputGain)outputGain.gain.value=muted?0:1;setDetail(muted?'صوت خبير توسع مكتوم.':'صوت خبير توسع يعمل.')}

window.TawassuVoice={start,stop,setMuted,get active(){return active},get muted(){return muted}};
ensureUi();
