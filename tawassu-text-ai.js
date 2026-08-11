import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {getAI,getGenerativeModel,GoogleAIBackend,Schema} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-ai.js';

const APP_NAME='tawassu-voice';
const FIREBASE_CONFIG={apiKey:'AIzaSyAAvC9y5jQ_7fAwmkCqBtgFDrBRF5t4uI0',authDomain:'mesraah-a2dfc.firebaseapp.com',projectId:'mesraah-a2dfc',storageBucket:'mesraah-a2dfc.firebasestorage.app',messagingSenderId:'986043593957',appId:'1:986043593957:web:b848313ef8cf83a5f3500c'};
const ACTIONS=['none','get_context','focus','explain_question','propose_answer','set_answer','next','previous','missing','validate','complete','explain_result'];
const schema=Schema.object({properties:{reply:Schema.string(),action:Schema.enumString({enum:ACTIONS}),questionId:Schema.string(),answerValues:Schema.array({items:Schema.string()}),interpretation:Schema.string(),certainty:Schema.enumString({enum:['confirmed','estimated','unknown']}),confirmed:Schema.boolean()},optionalProperties:['questionId','answerValues','interpretation','certainty','confirmed']});
const app=window.TawassuVoiceFirebaseApp||getApps().find(item=>item.name===APP_NAME)||initializeApp(FIREBASE_CONFIG,APP_NAME);
window.TawassuVoiceFirebaseApp=app;

const PERSONALITY=`أنت خبير توسع داخل منصة توسع.
مهمتك مساعدة المستخدم على تقييم فرصة فتح فرع جديد وفهم الموقع والصفقة والمبيعات والتشغيل والمخاطر.
تخدم مختلف الأنشطة التجارية والخدمية، ولديك خبرة أعمق في المطاعم والمقاهي.
هذه محادثة حقيقية مع المستخدم، وليست قراءة لنصوص الاستبيان.
تحدث بعربية سعودية سهلة ومهنية. اختصر، واسأل سؤالا واحدا في كل مرة.
افهم كلام المستخدم واربطه بحالة التقييم الحالية. لا تسأل عن معلومة سبق تسجيلها.
استخدم تعليمات السؤال لفهم المقصود وصياغة سؤال طبيعي. قدم الشرح الطويل أو المرجع عندما يطلب المستخدم ذلك.
ميز بين المعلومة المؤكدة والتقدير والافتراض والمعلومة الناقصة.
اقترح الإجابة المناسبة، واطلب التأكيد عندما تحتمل الإجابة أكثر من خيار أو تتضمن رقما أو تقديرا.
إذا طلبت التأكيد، انتظر موافقة المستخدم في رسالة لاحقة قبل تسجيل الإجابة. لا تستخدم set_answer في الرسالة التي تقول فيها هل أعتمد.
الإجابات الواضحة التي صاغها المستخدم كقرار مباشر يمكن تسجيلها. الأرقام والتقديرات والاختيارات المتعددة تحتاج تأكيدا.
لا تقل إن الإجابة سجلت حتى تنجح أداة set_assessment_answer.
اعتمد محرك توسع الحالي في احتساب الدرجة والأوزان والنتيجة. دورك جمع المعلومات وشرح الأسئلة وتفسير النتيجة.
في مسار ساعدني أفكر، ابدأ بفهم الفرصة وما يحير المستخدم، ثم اربط المعلومات بأسئلة التقييم تدريجيا.
في مسار أعبئ بنفسي، اشرح السؤال عند الطلب واترك الاختيار للمستخدم.
بعد اكتمال التقييم، اشرح النتيجة وأهم نقاط القوة والمخاطر وشروط المضي والخطوة التالية.
لا تقرأ الشرح الطويل أو المراجع تلقائيا. استخدمها معرفة داخلية وقدم سؤالا بشريا قصيرا.`;

{
  const ai=getAI(app,{backend:new GoogleAIBackend()});
  const model=getGenerativeModel(ai,{model:'gemini-3.5-flash-lite',generationConfig:{responseMimeType:'application/json',responseSchema:schema,temperature:.12,maxOutputTokens:850}});
  const waitForAppCheck=async()=>{for(let i=0;i<30&&!window.TawassuVoiceGetAppCheckToken;i++)await new Promise(resolve=>setTimeout(resolve,100))};
  const ask=async payload=>{
    const prompt=`${PERSONALITY}

اختر إجراء واحدا فقط عند الحاجة:
get_context لقراءة الحالة، focus لإبراز سؤال، explain_question لشرحه، propose_answer لعرض فهم يحتاج تأكيدا، set_answer لتسجيل إجابة معتمدة، next أو previous للتنقل، missing للنواقص، validate للفحص، complete لتشغيل محرك النتيجة، explain_result لشرح نتيجة موجودة.
استخدم questionId وanswerValues كما وردت حرفيا في السياق. لا تخترع سؤالا أو قيمة. عند set_answer اجعل confirmed=true فقط إذا وافق المستخدم صراحة في هذه الرسالة أو صاغ اختياره كأمر مباشر لا يحتمل اللبس.
إذا كانت هناك pending_proposals وقال المستخدم نعم أو اعتمد، استخدم قيم الاقتراح أو الاقتراحات نفسها في set_answer، واحدا في كل دور كتابي.
في وضع think ناقش الفكرة أولا، وصنف المؤكد والتقديري والناقص، ولا تحول الكلام إلى إجابة قبل أن يصبح الربط كافيا.

حالة توسع الحالية: ${JSON.stringify(payload.context||{})}
آخر المحادثة الخاصة بهذه الفرصة: ${JSON.stringify(payload.history||[])}
رسالة المستخدم: ${String(payload.message||'').slice(0,2000)}`;
    await waitForAppCheck();
    const response=await model.generateContent(prompt),raw=JSON.parse(response?.response?.text?.()||'{}'),toolCalls=[];
    const values=Array.isArray(raw.answerValues)?raw.answerValues.map(String):[];
    if(raw.action==='get_context')toolCalls.push({name:'get_assessment_context',arguments:{}});
    if(raw.action==='focus')toolCalls.push({name:'focus_assessment_question',arguments:{question_id:String(raw.questionId||''),message:String(raw.interpretation||raw.reply||'')}});
    if(raw.action==='explain_question')toolCalls.push({name:'explain_assessment_question',arguments:{question_id:String(raw.questionId||'')}});
    if(raw.action==='propose_answer')toolCalls.push({name:'propose_assessment_answer',arguments:{question_id:String(raw.questionId||''),answer_values:values,interpretation:String(raw.interpretation||raw.reply||''),certainty:String(raw.certainty||'estimated')}});
    if(raw.action==='set_answer')toolCalls.push({name:'set_assessment_answer',arguments:{question_id:String(raw.questionId||''),answer_values:values,confirmed:raw.confirmed===true,certainty:String(raw.certainty||'confirmed')}});
    if(raw.action==='next')toolCalls.push({name:'go_to_next_question',arguments:{}});
    if(raw.action==='previous')toolCalls.push({name:'go_to_previous_question',arguments:{}});
    if(raw.action==='missing')toolCalls.push({name:'get_missing_answers',arguments:{}});
    if(raw.action==='validate')toolCalls.push({name:'validate_assessment',arguments:{}});
    if(raw.action==='complete')toolCalls.push({name:'complete_assessment',arguments:{}});
    if(raw.action==='explain_result')toolCalls.push({name:'explain_assessment_result',arguments:{}});
    return {reply:String(raw.reply||'').trim(),tool_calls:toolCalls,suggestions:[]};
  };
  window.TawassuAssistantAI={provider:'gemini',model:'gemini-3.5-flash-lite',ask};
}
