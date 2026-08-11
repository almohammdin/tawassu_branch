import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {initializeAppCheck,ReCaptchaEnterpriseProvider,getToken} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js';
import {getAI,getGenerativeModel,GoogleAIBackend,Schema} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-ai.js';

const APP_NAME='tawassu-assistant';
const FIREBASE_CONFIG={apiKey:'AIzaSyAAvC9y5jQ_7fAwmkCqBtgFDrBRF5t4uI0',authDomain:'mesraah-a2dfc.firebaseapp.com',projectId:'mesraah-a2dfc',storageBucket:'mesraah-a2dfc.firebasestorage.app',messagingSenderId:'986043593957',appId:'1:986043593957:web:b848313ef8cf83a5f3500c'};
const RECAPTCHA_SITE_KEY='6LdgFnstAAAAAJod6T7NgPLzkfFkSYNbc4_q4rfe';
const ACTIONS=['none','set_answer','confirm_answer','focus_question','complete_assessment'];
const schema=Schema.object({
  properties:{
    reply:Schema.string(),
    action:Schema.enumString({enum:ACTIONS}),
    questionId:Schema.string(),
    answerValues:Schema.array({items:Schema.string()}),
    interpretation:Schema.string(),
    requiresConfirmation:Schema.boolean()
  },
  optionalProperties:['questionId','answerValues','interpretation','requiresConfirmation']
});

const firebaseApp=getApps().find(item=>item.name===APP_NAME)||initializeApp(FIREBASE_CONFIG,APP_NAME);
let appCheck=null;
try{appCheck=initializeAppCheck(firebaseApp,{provider:new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),isTokenAutoRefreshEnabled:true})}catch(error){if(!String(error?.code||'').includes('already-initialized'))console.warn('Tawassu App Check:',error)}
const ai=getAI(firebaseApp,{backend:new GoogleAIBackend()});
const model=getGenerativeModel(ai,{model:'gemini-3.5-flash-lite',generationConfig:{responseMimeType:'application/json',responseSchema:schema,temperature:.12,maxOutputTokens:850}});

const instructions=`أنت مساعد منصة توسع، وخبير عملي في تقييم فرص فتح الفروع والتوسع.

تخدم مختلف الأنشطة التجارية والخدمية، ولديك خبرة أعمق في المطاعم والمقاهي، وتشمل فهم الموقع والمبيعات والتشغيل والإيجار والتجهيز والتوصيل والطاقة التشغيلية وجاهزية الفريق وتكرار تجربة الفرع الناجح.

مهمتك مساعدة المستخدم على فهم فرصة الفرع وإكمال تقييم توسع بطريقة سهلة ودقيقة. تحدث بعربية سعودية سهلة ومهنية وطبيعية. استخدم جملا قصيرة واسأل سؤالا واحدا في كل مرة.

لديك خمسة إجراءات فقط:
1. set_answer لتسجيل إجابة واضحة مباشرة داخل النموذج.
2. confirm_answer عندما تحتمل الإجابة أكثر من خيار أو تتضمن رقما أو افتراضا يحتاج تأكيد المستخدم.
3. focus_question للانتقال إلى سؤال محدد وشرحه.
4. complete_assessment بعد اكتمال كل الإجابات.
5. none للنقاش أو الشرح دون تعديل.

استخدم questionId وanswerValues الموجودة حرفيا في حالة توسع. لا تخترع سؤالا أو قيمة. إذا كانت الإجابة غير كافية، اشرح المطلوب واسأل سؤالا واحدا دون تنفيذ. في السؤال متعدد الخيارات يمكن إرسال أكثر من قيمة.

في وضع guided ركز على السؤال الحالي وحول الإجابة الطبيعية إلى الخيار الأقرب. في وضع think ناقش الفرصة، وميز بين البيانات المؤكدة والتقديرات والافتراضات والمعلومات الناقصة، ثم اقترح تسجيل المعلومات التي تقابل أسئلة توسع. في وضع manual اشرح السؤال الحالي فقط ما لم يطلب المستخدم اعتماد الإجابة.

اعتمد محرك توسع الحالي في النتيجة. لا تحسب درجة ولا تغير وزنا ولا تخترع توصية غير مرتبطة بالإجابات أو بنتيجة المحرك. ذاكرتك محصورة في منصة توسع والتقييم الحالي، ولا تستخدم أي محادثة أو ملف أو ذاكرة من أي منصة أخرى.`;

async function ask(payload){
  if(appCheck)try{await getToken(appCheck,false)}catch(error){console.warn('Tawassu App Check token:',error)}
  const prompt=`${instructions}

حالة توسع الحالية:
${JSON.stringify(payload.context||{})}

آخر المحادثة داخل هذا التقييم فقط:
${JSON.stringify(payload.history||[])}

رسالة المستخدم:
${String(payload.message||'').slice(0,2000)}`;
  const response=await model.generateContent(prompt);
  const raw=JSON.parse(response?.response?.text?.()||'{}');
  const toolCalls=[];
  const args={question_id:String(raw.questionId||''),answer_values:Array.isArray(raw.answerValues)?raw.answerValues.map(String):[],interpretation:String(raw.interpretation||''),requires_confirmation:raw.requiresConfirmation===true};
  if(raw.action==='set_answer')toolCalls.push({name:'set_assessment_answer',arguments:args});
  if(raw.action==='confirm_answer')toolCalls.push({name:'request_answer_confirmation',arguments:{...args,requires_confirmation:true}});
  if(raw.action==='focus_question')toolCalls.push({name:'focus_assessment_question',arguments:{question_id:args.question_id}});
  if(raw.action==='complete_assessment')toolCalls.push({name:'complete_assessment',arguments:{}});
  return {reply:String(raw.reply||'').trim(),tool_calls:toolCalls,suggestions:[]};
}

window.TawassuAssistantAI={provider:'firebase-ai-logic',model:'gemini-3.5-flash-lite',platformId:'tawassu',ask};
