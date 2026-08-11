import {executeTawassuTool} from './tawassu-voice-tools.js?v=1.6.0';

const $=id=>document.getElementById(id);
const ENABLED=document.querySelector('meta[name="tawassu-assistant-enabled"]')?.content!=='false';
const HISTORY_STORE='tawassu_assistant_conversations_live_v1';
const ACTIVE_STORE='tawassu_assistant_active_live_v1';
const MODE_STORE='tawassu_assistant_mode_live_v1';
const SECTION_LABELS={1:'تعريف الفرع',2:'الموقع والسوق',3:'الصفقة والجاهزية'};
const MODE_LABELS={guided:'حوار وتقييم مباشر',think:'نقاش الفرصة',manual:'شرح عند الحاجة'};
const NEEDS_VERIFICATION_VALUES=new Set(['unknown','pending']);

let app=null,mode='',activeQuestionId='',history=[],answerMeta={},pendingProposals=[],chatBusy=false,aiUnavailable=false,currentConversationId='';

function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function stripHtml(value=''){const node=document.createElement('div');node.innerHTML=String(value);return (node.textContent||'').replace(/\s+/g,' ').trim()}
function state(){return app?.getState?.()||{step:1,branchName:'',answers:{},result:null}}
function questions(){return app?.getQuestions?.()||[]}
function question(id){return app?.getQuestion?.(id)||null}
function optionLabels(q,values){const wanted=new Set(Array.isArray(values)?values:[values]);return (q?.options||[]).filter(item=>wanted.has(item.value)).map(item=>item.label)}
function sameValues(a=[],b=[]){const left=[...new Set((Array.isArray(a)?a:[]).map(String))].sort(),right=[...new Set((Array.isArray(b)?b:[]).map(String))].sort();return left.length===right.length&&left.every((value,index)=>value===right[index])}
function currentQuestion(){return question(activeQuestionId)||app?.getCurrentQuestion?.()||null}
function missingIds(){return app?.getMissingAnswers?.()||[]}
function missingQuestions(){const missing=new Set(missingIds());return questions().filter(item=>missing.has(item.id))}
function readStore(){try{const value=JSON.parse(localStorage.getItem(HISTORY_STORE)||'{}');return value&&typeof value==='object'?value:{}}catch{return {}}}
function fingerprint(){const s=state(),activity=s.answers.activityType||'',location=s.answers.locationType||'';return `${s.branchName||'فرع'}|${activity}|${location}`.slice(0,180)}
function makeConversation(force=false){if(force||!currentConversationId)currentConversationId=`tawassu-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;history=[];answerMeta={};pendingProposals=[];saveConversation()}
function saveConversation(){if(!currentConversationId)return;const store=readStore();store[currentConversationId]={fingerprint:fingerprint(),updatedAt:Date.now(),mode,messages:history.slice(-24),answerMeta};const trimmed=Object.fromEntries(Object.entries(store).sort((a,b)=>(b[1]?.updatedAt||0)-(a[1]?.updatedAt||0)).slice(0,10));try{localStorage.setItem(HISTORY_STORE,JSON.stringify(trimmed));sessionStorage.setItem(ACTIVE_STORE,currentConversationId);localStorage.setItem(MODE_STORE,mode)}catch{}}
function restoreConversation(){const active=sessionStorage.getItem(ACTIVE_STORE)||'',store=readStore(),record=store[active],currentFingerprint=fingerprint(),match=Object.entries(store).filter(([,value])=>value?.fingerprint===currentFingerprint).sort((a,b)=>(b[1]?.updatedAt||0)-(a[1]?.updatedAt||0))[0],found=record?.fingerprint===currentFingerprint?record:match?.[1];if(found){currentConversationId=record?.fingerprint===currentFingerprint?active:match[0];history=Array.isArray(found.messages)?found.messages.slice(-24):[];answerMeta=found.answerMeta&&typeof found.answerMeta==='object'?found.answerMeta:{};mode=['guided','think','manual'].includes(found.mode)?found.mode:''}else makeConversation(true)}

function questionContext(q){
  const s=state(),raw=s.answers[q.id],values=Array.isArray(raw)?raw:(raw?[raw]:[]),meta=answerMeta[q.id]||{};
  return {id:q.id,section:q.step,title:q.title,help:stripHtml(q.help||''),guide:app.getQuestionGuide?.(q.id)?.text||'',multi:!!q.multi,context_only:!!q.contextOnly,answer_values:values,answer_labels:optionLabels(q,values),certainty:values.length?(meta.certainty||'confirmed'):'missing',source:meta.source||'',options:(q.options||[]).map(item=>({value:item.value,label:item.label,note:item.note||''}))};
}
function getAssessmentContext(){
  const s=state(),all=questions(),missing=new Set(missingIds()),progress=app.getProgress?.()||{done:0,total:all.length},current=currentQuestion()||all.find(item=>missing.has(item.id))||null;
  const completed=all.filter(item=>!missing.has(item.id)).map(questionContext),pending=all.filter(item=>missing.has(item.id)).map(item=>({id:item.id,section:item.step,title:item.title}));
  const needsVerification=completed.filter(item=>item.answer_values.some(value=>NEEDS_VERIFICATION_VALUES.has(value)));
  const assumptions=completed.filter(item=>item.certainty==='assumed');
  const estimated=completed.filter(item=>item.certainty==='estimated'&&!needsVerification.includes(item));
  const confirmed=completed.filter(item=>item.certainty==='confirmed'&&!needsVerification.includes(item));
  const result=s.result?{score:s.result.score,band:s.result.band,band_title:s.result.bandTitle,decision:s.result.decision,summary:s.result.summary,priority:s.result.priority,axis_scores:s.result.axisScores,strengths:(s.result.strengths||[]).map(item=>item.text||item),risks:(s.result.risks||[]).map(item=>item.text||item),blockers:(s.result.blockers||[]).map(item=>item.text||item),recommendations:s.result.recommendations||[]}:null;
  return {platform_id:'tawassu',platform:'توسع',assistant_name:'خبير توسع',conversation_id:currentConversationId,mode,current_section:s.step,section_label:SECTION_LABELS[s.step]||'',branch_name:s.branchName||'',activity_type:s.answers.activityType||'',service_channels:s.answers.serviceChannels||[],location_type:s.answers.locationType||'',answers:completed,completed_questions:completed.map(item=>item.id),missing_questions:pending,current_question:current?questionContext(current):null,completion:{done:progress.done,total:progress.total,percent:progress.total?Math.round(progress.done/progress.total*100):0},confirmed_data:confirmed,estimates:estimated,assumptions,needs_verification:needsVerification,pending_proposals:pendingProposals.map(item=>({...item})),result};
}

function markFocus(questionId){
  document.querySelectorAll('.question-card.assistant-focus').forEach(card=>card.classList.remove('assistant-focus'));
  const card=document.querySelector(`.question-card[data-id="${CSS.escape(questionId)}"]`);
  if(card){card.classList.add('assistant-focus');setTimeout(()=>card.classList.remove('assistant-focus'),2200);return card}
  return null;
}
function focusAssessmentQuestion(questionId,message=''){
  const q=question(questionId);if(!q)return {ok:false,error:'question-not-found'};
  activeQuestionId=q.id;app.goToStep?.(q.step);requestAnimationFrame(()=>{const card=markFocus(q.id);card?.scrollIntoView({behavior:'smooth',block:'center'})});
  renderCurrentQuestion(q);if(message)setStatus(message,'working');saveConversation();
  return {ok:true,question:questionContext(q),section:q.step};
}
function explainAssessmentQuestion(questionId){
  const q=question(questionId)||currentQuestion();if(!q)return {ok:false,error:'question-not-found'};
  const guide=app.getQuestionGuide?.(q.id)?.text||stripHtml(q.help)||'اختر الوصف الأقرب لواقع الفرع.';
  return {ok:true,question_id:q.id,title:q.title,short_explanation:stripHtml(q.help)||q.title,detailed_guide:guide,options:(q.options||[]).map(item=>({value:item.value,label:item.label,note:item.note||''}))};
}
function renderPendingProposals(){
  const host=$('assistantConfirm');if(!pendingProposals.length){host.hidden=true;host.innerHTML='';return}
  host.hidden=false;host.innerHTML=`<strong>اقتراح خبير توسع</strong>${pendingProposals.map(item=>`<p>${escapeHtml(item.interpretation)}</p>`).join('')}<div class="assistant-confirm-actions"><button type="button" data-confirm>اعتماد</button><button type="button" data-reject>تعديل</button></div>`;
  host.querySelector('[data-confirm]').addEventListener('click',async()=>{pendingProposals.forEach(item=>item.user_confirmed=true);const proposals=[...pendingProposals],results=[];for(const item of proposals)results.push(await setAssessmentAnswer(item.question_id,item.answer_values,{confirmed:true,certainty:item.certainty,source:'assistant'}));renderPendingProposals();if(results.every(result=>result.ok)){appendAssistant(`تم تسجيل ${proposals.flatMap(item=>item.answer_labels).join('، ')}.`);goToNextQuestion()}else appendAssistant('تعذر تسجيل إحدى الإجابات. راجع الخيارات الظاهرة.')});
  host.querySelector('[data-reject]').addEventListener('click',()=>{pendingProposals=[];renderPendingProposals();$('assistantInput')?.focus();saveConversation()});
}
function proposeAssessmentAnswer(questionId,values,interpretation='',certainty='estimated'){
  const q=question(questionId);if(!q||!values.length)return {ok:false,error:'answer-not-allowed'};
  const allowed=new Set((q.options||[]).map(item=>item.value)),valid=values.filter(value=>allowed.has(value));if(!valid.length)return {ok:false,error:'answer-not-allowed'};
  const labels=optionLabels(q,valid),copy=interpretation||`فهمت أن الأقرب هو ${labels.join('، ')}. هل أعتمد؟`,proposal={question_id:q.id,answer_values:valid,answer_labels:labels,interpretation:copy,certainty,user_confirmed:false};
  pendingProposals=pendingProposals.filter(item=>item.question_id!==q.id);pendingProposals.push(proposal);focusAssessmentQuestion(q.id,'بانتظار اعتمادك');renderPendingProposals();saveConversation();return {ok:true,status:'awaiting-user-confirmation',proposal};
}
function setAssessmentAnswer(questionId,values,{confirmed=false,certainty='confirmed',source='assistant'}={}){
  const q=question(questionId);if(!q)return {ok:false,error:'question-not-found'};if(!confirmed)return {ok:false,error:'explicit-confirmation-required'};
  const allowed=new Set((q.options||[]).map(item=>item.value)),valid=(Array.isArray(values)?values:[]).filter(value=>allowed.has(value));if(!valid.length||(!q.multi&&valid.length!==1))return {ok:false,error:'answer-not-allowed'};
  const pending=pendingProposals.find(item=>item.question_id===q.id);
  if(pending&&!pending.user_confirmed)return {ok:false,error:'confirmation-not-received'};
  if(pending&&!sameValues(valid,pending.answer_values))return {ok:false,error:'confirmed-value-mismatch'};
  const result=app.setAnswer(q.id,q.multi?valid:valid[0]);if(!result?.ok)return result||{ok:false,error:'set-answer-failed'};
  const stored=state().answers[q.id],storedValues=Array.isArray(stored)?stored:[stored],verified=sameValues(valid,storedValues);if(!verified)return {ok:false,error:'answer-not-persisted'};
  answerMeta[q.id]={certainty:certainty==='estimated'?'estimated':'confirmed',source,updatedAt:Date.now()};pendingProposals=pendingProposals.filter(item=>item.question_id!==q.id);activeQuestionId=q.id;renderCurrentQuestion(q);saveConversation();
  requestAnimationFrame(()=>{const card=markFocus(q.id);card?.scrollIntoView({behavior:'smooth',block:'center'})});
  return {ok:true,persisted:true,question_id:q.id,answer_values:storedValues,answer_labels:optionLabels(q,storedValues),certainty:answerMeta[q.id].certainty};
}
function noteUserMessage(text){const value=String(text||'').trim();if(!pendingProposals.length||!value)return {ok:false,reason:'no-pending-proposal'};if(/^(لا|مو|ليس|غير موافق|لا تعتمد)/.test(value)){pendingProposals.forEach(item=>item.user_confirmed=false);saveConversation();return {ok:true,confirmed:false}}if(/^(نعم|ايه|ايوه|أيوه|موافق|اعتمد|اعتمده|تمام|صح|صحيح|توكل)/.test(value)){pendingProposals.forEach(item=>item.user_confirmed=true);saveConversation();return {ok:true,confirmed:true,count:pendingProposals.length}}return {ok:false,reason:'confirmation-not-detected'}}
function goToNextQuestion(){const missing=missingQuestions();if(!missing.length)return {ok:true,complete:true,result_available:!!state().result};const currentIndex=questions().findIndex(item=>item.id===activeQuestionId),next=missing.find(item=>questions().findIndex(q=>q.id===item.id)>currentIndex)||missing[0];return focusAssessmentQuestion(next.id,'السؤال التالي')}
function goToPreviousQuestion(){const list=questions(),index=list.findIndex(item=>item.id===activeQuestionId),previous=list[Math.max(0,index-1)];return previous?focusAssessmentQuestion(previous.id,'السؤال السابق'):{ok:false,error:'previous-question-unavailable'}}
function getMissingAnswers(){return {ok:true,missing:missingQuestions().map(item=>questionContext(item)),count:missingIds().length}}
function validateAssessment(){
  const s=state(),missing=missingQuestions().map(item=>({question_id:item.id,title:item.title,section:item.step})),conflicts=[];
  if(s.answers.primaryChannel&&s.answers.primaryChannel!=='balanced'&&!s.answers.serviceChannels?.includes(s.answers.primaryChannel))conflicts.push({field:'primaryChannel',message:'قناة المبيعات الرئيسية غير موجودة ضمن قنوات الخدمة.'});
  if(s.answers.locationType==='fuelStation'&&s.answers.activityPermission==='blocked')conflicts.push({field:'activityPermission',message:'النشاط غير معتمد للموقع داخل محطة الوقود.'});
  return {ok:true,valid:missing.length===0&&conflicts.length===0,missing,conflicts,completion:getAssessmentContext().completion};
}
function completeAssessment(){const validation=validateAssessment();if(!validation.valid)return {ok:false,error:'assessment-incomplete',...validation};const result=app.calculateAssessment?.();if(!result)return {ok:false,error:'result-engine-failed'};return {ok:true,persisted:true,result:getAssessmentContext().result}}
function explainAssessmentResult(){const result=getAssessmentContext().result;if(!result)return {ok:false,error:'result-not-available'};return {ok:true,result,rule:'اشرح نتيجة محرك توسع كما هي. لا تعيد احتساب الدرجة ولا تغير الأوزان.'}}

window.TawassuAssistantBridge={getAssessmentContext,focusAssessmentQuestion,explainAssessmentQuestion,proposeAssessmentAnswer,setAssessmentAnswer,noteUserMessage,goToNextQuestion,goToPreviousQuestion,getMissingAnswers,validateAssessment,completeAssessment,explainAssessmentResult,captureConversation:()=>({conversation_id:currentConversationId,messages:history.slice(-24),answer_meta:answerMeta}),allowedQuestions:()=>questions().map(item=>item.id)};

function setStatus(text,stateName='ready'){$('assistantState').className=`assistant-state is-${stateName}`;$('assistantState').querySelector('b').textContent=text}
function appendMessage(role,text){const value=String(text||'').trim();if(!value)return;history.push({role,text:value.slice(0,1600)});history=history.slice(-24);const node=document.createElement('div');node.className=`assistant-message ${role}`;node.textContent=value;$('assistantConversation').appendChild(node);$('assistantConversation').scrollTop=$('assistantConversation').scrollHeight;saveConversation()}
function appendAssistant(text){appendMessage('assistant',text)}
function renderHistory(){$('assistantConversation').innerHTML='';history.forEach(item=>{const node=document.createElement('div');node.className=`assistant-message ${item.role}`;node.textContent=item.text;$('assistantConversation').appendChild(node)})}
function renderCurrentQuestion(q=currentQuestion()){$('assistantCurrentQuestion').textContent=q?q.title:'اكتملت الأسئلة الظاهرة';if(q)activeQuestionId=q.id}
function showNotice(text=''){$('assistantNotice').hidden=!text;$('assistantNotice').textContent=text}
function setBusy(value){chatBusy=value;$('assistantSend').disabled=value;$('assistantInput').disabled=value;setStatus(value?'أفهم الإجابة':'جاهز',value?'processing':'ready')}
function showSuggestions(items=[]){const host=$('assistantSuggestions');host.innerHTML='';items.slice(0,4).forEach(item=>{const config=typeof item==='string'?{label:item,message:item}:item,button=document.createElement('button');button.type='button';button.textContent=config.label;button.addEventListener('click',()=>config.run?config.run():sendMessage(config.message||config.label));host.appendChild(button)})}
function localGuide(text){const q=currentQuestion(),value=String(text||'');if(/اشرح|وش يعني|ماذا يعني|مثال/.test(value)&&q){const result=explainAssessmentQuestion(q.id);return {reply:result.short_explanation||result.detailed_guide,suggestions:q.options.map(item=>item.label)}}if(/النتيجة|ليش.*درجة|اشرح.*نتيجة/.test(value)&&state().result){const result=state().result;return {reply:`نتيجة محرك توسع ${result.score} من 100، والأقل أفضل. التوصية: ${result.decision}. الأولوية الآن: ${result.priority}.`}}return {reply:q?`أفهمك. اربط إجابتك بأحد الخيارات في سؤال: ${q.title}`:'احك لي عن النشاط والموقع وما أكثر نقطة تحتاج مراجعة فيها.'}}
async function askAi(text){if(aiUnavailable)throw new Error('ai-unavailable');if(!window.TawassuAssistantAI)await import('./tawassu-text-ai.js?v=1.6.0');if(!window.TawassuAssistantAI)throw new Error('gemini-text-unavailable');return window.TawassuAssistantAI.ask({message:String(text).slice(0,2000),context:getAssessmentContext(),history:history.slice(-10),conversation_id:currentConversationId})}
async function sendMessage(text){const value=String(text??$('assistantInput').value).trim();if(!value||chatBusy)return;$('assistantInput').value='';noteUserMessage(value);appendMessage('user',value);showSuggestions([]);setBusy(true);try{let result;try{result=await askAi(value)}catch(error){aiUnavailable=true;showNotice('تعذر تشغيل الذكاء الآن. اكتب إجابتك أو أكمل النموذج، وستبقى النتيجة والتصدير يعملان.');result=localGuide(value)}const executions=[];for(const call of result?.tool_calls||[]){setStatus('أنفذ الخطوة','working');const execution=await executeTawassuTool(call.name,call.arguments||{});executions.push({call,execution})}const failed=executions.find(item=>!item.execution?.ok&&item.call.name!=='propose_assessment_answer');if(failed)appendAssistant('تعذر تنفيذ الخطوة داخل النموذج. راجع الخيار الظاهر وأكمل يدويا.');else{if(result?.reply)appendAssistant(result.reply);const saved=executions.find(item=>item.call.name==='set_assessment_answer'&&item.execution?.ok&&item.execution?.persisted);if(saved&&!/تم (تسجيل|اعتماد)/.test(result?.reply||''))appendAssistant(`تم تسجيل ${saved.execution.answer_labels?.join('، ')||'الإجابة'} داخل التقييم.`)}showSuggestions(result?.suggestions||[])}catch(error){console.error('Tawassu assistant:',error);appendAssistant('تعذر إكمال هذه الخطوة. بقي التقييم كما هو.')}finally{setBusy(false)}}

function selectMode(nextMode,{startVoice=false,initialText='',restore=false}={}){
  if(!ENABLED)return;mode=nextMode;$('assessmentModePicker').classList.add('is-compact');$('assessmentModeChange').hidden=false;$('assessmentWorkspace').dataset.assistantMode=mode;$('assessmentWorkspace').classList.add('has-assistant');$('tawassuAssistant').hidden=false;$('assistantModeLabel').textContent=MODE_LABELS[mode]||'مساعد تقييم الفرع';document.querySelectorAll('[data-assistant-mode]').forEach(button=>button.classList.toggle('is-active',button.dataset.assistantMode===mode));
  if(!restore){if(mode==='guided'&&!history.length)appendAssistant('حياك الله. نقيّم الفرصة معك خطوة بخطوة، والصوت هنا محادثة مباشرة مع Gemini.');if(mode==='think'&&!history.length)appendAssistant('احك لي عن فرصة الفرع، وما أكثر شيء محيرك فيها؟ سأفصل المؤكد عن التقديري والناقص.');if(mode==='manual'&&!history.length)appendAssistant('عبئ النموذج بطريقتك، واضغط «اسأل خبير توسع» عند أي سؤال يحتاج شرحا.');}
  const next=missingQuestions()[0]||app.getCurrentQuestion?.();if(next&&!activeQuestionId)focusAssessmentQuestion(next.id,'جاهز');renderHistory();saveConversation();if(initialText)sendMessage(initialText);if(startVoice)window.TawassuVoice?.start?.({mode});
}
function changeMode(){$('assessmentModePicker').classList.remove('is-compact');$('assessmentModeChange').hidden=true;$('assessmentModePicker').scrollIntoView({behavior:'smooth',block:'center'})}
function handleManualQuestion(questionId){selectMode('manual');focusAssessmentQuestion(questionId,'أشرح السؤال');const result=explainAssessmentQuestion(questionId);if(result.ok){appendAssistant(result.short_explanation||result.title);showSuggestions(result.options.map(item=>({label:item.label,run:()=>focusAssessmentQuestion(questionId,item.label)})))}}
function bind(){
  document.querySelectorAll('[data-assistant-mode]').forEach(button=>button.addEventListener('click',event=>{if(event.currentTarget.closest('#assessmentThinkForm'))return;const next=button.dataset.assistantMode;selectMode(next,{startVoice:button.hasAttribute('data-start-live-voice')})}));
  $('assessmentThinkForm').addEventListener('submit',event=>{event.preventDefault();const value=$('assessmentThinkInput').value.trim();selectMode('think',{initialText:value});$('assessmentThinkInput').value=''});
  $('assessmentModeChange').addEventListener('click',changeMode);$('assistantForm').addEventListener('submit',event=>{event.preventDefault();sendMessage()});
  $('assistantMic').addEventListener('click',()=>window.TawassuVoice?.active?window.TawassuVoice.stop():window.TawassuVoice?.start?.({mode:mode||'guided'}));
  $('assistantEnd').addEventListener('click',()=>window.TawassuVoice?.stop?.());$('assistantSoundToggle').addEventListener('click',()=>{const muted=$('assistantSoundToggle').getAttribute('aria-pressed')==='true';$('assistantSoundToggle').setAttribute('aria-pressed',String(!muted));$('assistantSoundToggle').classList.toggle('is-off',muted);window.TawassuVoice?.setMuted?.(muted)});
  $('assistantPrevious').addEventListener('click',()=>goToPreviousQuestion());$('assistantExplain').addEventListener('click',()=>{const result=explainAssessmentQuestion(currentQuestion()?.id);if(result.ok)appendAssistant(result.short_explanation||result.detailed_guide)});
  $('assistantMinimize').addEventListener('click',()=>{const minimized=$('tawassuAssistant').classList.toggle('is-minimized');$('assistantMinimize').textContent=minimized?'⌃':'⌄';$('assistantMinimize').setAttribute('aria-expanded',String(!minimized))});
  $('questionList').addEventListener('click',event=>{const help=event.target.closest('[data-ask-expert]');if(help){event.preventDefault();event.stopPropagation();handleManualQuestion(help.dataset.askExpert);return}const card=event.target.closest('.question-card');if(card){activeQuestionId=card.dataset.id;renderCurrentQuestion(question(activeQuestionId));saveConversation()}},true);
  window.addEventListener('tawassu:answer',event=>{if(event.detail?.source!=='assistant'&&event.detail?.questionId)answerMeta[event.detail.questionId]={certainty:'confirmed',source:'manual',updatedAt:Date.now()};if(event.detail?.questionId){activeQuestionId=event.detail.questionId;renderCurrentQuestion(question(activeQuestionId))}saveConversation()});
  window.addEventListener('tawassu:step',()=>{const next=missingQuestions().find(item=>item.step===state().step)||app.getCurrentQuestion?.();if(next)renderCurrentQuestion(next)});
  window.addEventListener('tawassu:result',()=>{setStatus('اكتمل التقييم','ready');appendAssistant('اكتمل التقييم. النتيجة أمامك، وأقدر أشرح لك لماذا ظهرت وما أهم شرط قبل المضي.')});
  window.addEventListener('tawassu:reset',()=>{makeConversation(true);activeQuestionId='';renderHistory();showNotice('')});
  window.addEventListener('tawassu:voice-state',event=>{const current=event.detail||{},voiceActive=['connecting','listening','processing','working','speaking'].includes(current.state);setStatus(current.label||'جاهز',current.state||'ready');$('assistantMic').dataset.state=current.state||'ready';$('assistantMic').classList.toggle('is-listening',current.state==='listening');$('assistantTranscript').hidden=!current.detail;if(current.detail)$('assistantTranscript').textContent=current.detail;$('tawassuAssistant').classList.toggle('is-voice-active',voiceActive);$('assessmentWorkspace').classList.toggle('voice-active',voiceActive)});
  window.addEventListener('tawassu:voice-fallback',()=>showNotice('تعذرت المحادثة الصوتية الذكية. استخدم الكتابة أو أكمل النموذج، وستبقى النتيجة والمشاركة والتصدير تعمل.'));
  window.addEventListener('online',()=>{aiUnavailable=false;showNotice('')});
}
function init(){if(!ENABLED){$('assessmentModePicker').hidden=true;return}app=window.TawassuApp;if(!app)return setTimeout(init,50);restoreConversation();bind();renderHistory();const saved=localStorage.getItem(MODE_STORE);if(['guided','think','manual'].includes(saved)&&history.length)selectMode(saved,{restore:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
