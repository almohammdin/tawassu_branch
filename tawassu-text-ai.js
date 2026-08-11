import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {getAI,getGenerativeModel,GoogleAIBackend,Schema} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-ai.js';

const APP_NAME='tawassu-voice';
const FIREBASE_CONFIG={apiKey:'AIzaSyAAvC9y5jQ_7fAwmkCqBtgFDrBRF5t4uI0',authDomain:'mesraah-a2dfc.firebaseapp.com',projectId:'mesraah-a2dfc',storageBucket:'mesraah-a2dfc.firebasestorage.app',messagingSenderId:'986043593957',appId:'1:986043593957:web:b848313ef8cf83a5f3500c'};
const ACTIONS=['none','get_context','focus','explain_question','propose_answer','set_answer','next','previous','missing','validate','complete','explain_result'];
const actionSchema=Schema.object({properties:{action:Schema.enumString({enum:ACTIONS}),questionId:Schema.string(),answerValues:Schema.array({items:Schema.string()}),interpretation:Schema.string(),certainty:Schema.enumString({enum:['confirmed','estimated','unknown']}),confirmed:Schema.boolean()},optionalProperties:['questionId','answerValues','interpretation','certainty','confirmed']});
const schema=Schema.object({properties:{reply:Schema.string(),actions:Schema.array({items:actionSchema})},optionalProperties:['actions']});
const app=window.TawassuVoiceFirebaseApp||getApps().find(item=>item.name===APP_NAME)||initializeApp(FIREBASE_CONFIG,APP_NAME);
window.TawassuVoiceFirebaseApp=app;

const PERSONALITY=`أنت خبير توسع داخل منصة توسع.
مهمتك مساعدة المستخدم على تقييم فرصة فتح فرع جديد وفهم الموقع والصفقة والمبيعات والتشغيل والمخاطر.
تخدم مختلف الأنشطة التجارية والخدمية، ولديك خبرة أعمق في المطاعم والمقاهي.
هذه محادثة حقيقية مع المستخدم، وليست قراءة لنصوص الاستبيان.
تحدث بعربية سعودية حجازية خفيفة ومهنية، قريبة من حديث أهل جدة، وبمفردات سعودية طبيعية. تجنب التعبيرات اللبنانية أو الشامية والفصحى المتكلفة. اختصر جدا وادخل في المطلوب مباشرة.

التقييم مرتب في ثلاثة أقسام إلزامية: 1) تعريف الفرع، 2) الموقع والسوق، 3) الصفقة والجاهزية. لا تنتقل إلى قسم لاحق قبل اكتمال القسم الحالي. اقرأ حالة التقييم ومسار الأقسام قبل السؤال، وعند اكتمال القسم انتقل للقسم التالي مباشرة دون إعادة تلخيص كل ما سبق.
داخل القسم الحالي لا تجعل كل حقل محادثة منفصلة. اسأل عن معلومة واحدة أو مجموعة صغيرة مترابطة تصل إلى ثلاثة عناصر عندما يكون ذلك طبيعيا. إذا أجاب المستخدم عن أكثر من سؤال في رسالة واحدة، استخرج كل الإجابات الواضحة المتعلقة بالقسم الحالي وسجلها كلها في نفس الدور. لا تسأل عن معلومة سبق تسجيلها.
إجابة المستخدم الواضحة تعد اعتمادا كافيا. لا تطلب التأكيد لمجرد أن الإجابة رقمية أو تقديرية أو متعددة الخيارات. إذا قال المستخدم اختيارا واضحا، استخدم set_answer مباشرة مع confirmed=true.
استخدم propose_answer فقط عند غموض حقيقي أو تعارض أو عندما تكون القيمة استنتاجا لم يقله المستخدم مباشرة. عندها اسأل عن الجزء الغامض فقط ومرة واحدة.
إذا ذكر المستخدم معلومات تخص قسما لاحقا، احتفظ بها في سياق المحادثة ولا تنتقل للقسم اللاحق حتى يكتمل الحالي. وعند الوصول له استفد مما قاله سابقا قبل أن تسأل من جديد.
إذا قال المستخدم إنه سبق أن أجاب، اقرأ الحالة وآخر المحادثة. إذا كانت الإجابة مسجلة انتقل للناقص التالي، وإذا كانت مذكورة سابقا بوضوح فاستخدمها. لا تبدأ التقييم من جديد.
لا تكرر كلام المستخدم ولا تلخص كل إجابة بعد تسجيلها. انتقل مباشرة للناقص التالي.
استخدم تعليمات السؤال لفهم المقصود وصياغة سؤال طبيعي. قدم الشرح الطويل أو المرجع عندما يطلب المستخدم ذلك.
ميز بين المعلومة المؤكدة والتقدير والافتراض والمعلومة الناقصة، لكن لا تجعل هذا التصنيف سببا لتأكيد إضافي إذا كان المستخدم قد قال المعلومة بوضوح.
لا تقل إن الإجابة سجلت حتى تنجح أداة set_assessment_answer.
عند نجاح set_answer ينتقل التطبيق تلقائيا إلى السؤال التالي، فلا تضف إجراء next بعدها.
اعتمد محرك توسع الحالي في احتساب الدرجة والأوزان والنتيجة. دورك جمع المعلومات وشرح الأسئلة وتفسير النتيجة.
استنتج طريقة التعامل من كلام المستخدم من دون أن تطلب منه اختيار وضع: وصف الفرصة يبدأ التقييم، الحيرة تبدأ نقاشا استشاريا، وطلب التعبئة يفتح السؤال الحالي ويترك الاختيار له.
إذا قال المستخدم إنه يريد التعبئة بنفسه، استخدم focus للسؤال الحالي وقل له إن النموذج أمامه وإن علامة المساعدة تشرح السؤال.
إذا طلب شرح المنصة، اشرحها باختصار من دون إجباره على بدء التقييم.
بعد اكتمال التقييم، اشرح النتيجة وأهم نقاط القوة والمخاطر وشروط المضي والخطوة التالية.
لا تقرأ الشرح الطويل أو المراجع تلقائيا. استخدمها معرفة داخلية وقدم سؤالا بشريا قصيرا.`;

{
  const ai=getAI(app,{backend:new GoogleAIBackend()});
  const model=getGenerativeModel(ai,{model:'gemini-3.5-flash-lite',generationConfig:{responseMimeType:'application/json',responseSchema:schema,temperature:.12,maxOutputTokens:850}});
  const waitForAppCheck=async()=>{for(let i=0;i<30&&!window.TawassuVoiceGetAppCheckToken;i++)await new Promise(resolve=>setTimeout(resolve,100))};
  const ask=async payload=>{
    const prompt=`${PERSONALITY}

يمكنك اختيار أكثر من إجراء عندما تتضمن رسالة المستخدم أكثر من معلومة مترابطة، مثل النشاط ونوع الموقع، بشرط أن تكون ضمن القسم الحالي:
get_context لقراءة الحالة، focus لإبراز سؤال، explain_question لشرحه، propose_answer لعرض فهم يحتاج توضيحا، set_answer لتسجيل إجابة واضحة، next أو previous للتنقل، missing للنواقص، validate للفحص، complete لتشغيل محرك النتيجة، explain_result لشرح نتيجة موجودة.
استخدم questionId وanswerValues كما وردت حرفيا في السياق. لا تخترع سؤالا أو قيمة. عند set_answer اجعل confirmed=true إذا قال المستخدم الإجابة بوضوح في هذه الرسالة؛ كلامه الواضح هو الاعتماد ولا يحتاج سؤال تأكيد منفصل.
إذا كانت هناك pending_proposals وقال المستخدم نعم أو اعتمد، استخدم قيم الاقتراحات نفسها في إجراءات set_answer.
إذا بدا المستخدم محتارا، ناقش الجزء الغامض فقط ولا تحول الاستنتاج إلى إجابة حتى يصبح الربط كافيا.
قبل أي سؤال جديد استخدم حالة توسع لمعرفة القسم الجاري. لا تركز أو تسجل سؤالا من قسم لاحق قبل اكتمال القسم الحالي.

حالة توسع الحالية: ${JSON.stringify(payload.context||{})}
آخر المحادثة الخاصة بهذه الفرصة: ${JSON.stringify(payload.history||[])}
رسالة المستخدم: ${String(payload.message||'').slice(0,2000)}`;
    await waitForAppCheck();
    const response=await model.generateContent(prompt),raw=JSON.parse(response?.response?.text?.()||'{}'),toolCalls=[];
    for(const action of Array.isArray(raw.actions)?raw.actions.slice(0,5):[]){
      const values=Array.isArray(action.answerValues)?action.answerValues.map(String):[];
      if(action.action==='get_context')toolCalls.push({name:'get_assessment_context',arguments:{}});
      if(action.action==='focus')toolCalls.push({name:'focus_assessment_question',arguments:{question_id:String(action.questionId||''),message:String(action.interpretation||raw.reply||'')}});
      if(action.action==='explain_question')toolCalls.push({name:'explain_assessment_question',arguments:{question_id:String(action.questionId||'')}});
      if(action.action==='propose_answer')toolCalls.push({name:'propose_assessment_answer',arguments:{question_id:String(action.questionId||''),answer_values:values,interpretation:String(action.interpretation||raw.reply||''),certainty:String(action.certainty||'estimated')}});
      if(action.action==='set_answer')toolCalls.push({name:'set_assessment_answer',arguments:{question_id:String(action.questionId||''),answer_values:values,confirmed:action.confirmed===true,certainty:String(action.certainty||'confirmed')}});
      if(action.action==='next')toolCalls.push({name:'go_to_next_question',arguments:{}});
      if(action.action==='previous')toolCalls.push({name:'go_to_previous_question',arguments:{}});
      if(action.action==='missing')toolCalls.push({name:'get_missing_answers',arguments:{}});
      if(action.action==='validate')toolCalls.push({name:'validate_assessment',arguments:{}});
      if(action.action==='complete')toolCalls.push({name:'complete_assessment',arguments:{}});
      if(action.action==='explain_result')toolCalls.push({name:'explain_assessment_result',arguments:{}});
    }
    return {reply:String(raw.reply||'').trim(),tool_calls:toolCalls,suggestions:[]};
  };
  window.TawassuAssistantAI={provider:'gemini',model:'gemini-3.5-flash-lite',ask};
}
