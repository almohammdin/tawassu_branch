const QUESTION_IDS=[
  'activityType','serviceChannels','primaryChannel','locationType','parking','pickupAccess','driveThruFlow',
  'courierAccess','deliveryCoverage','visibility','areaActivity','competition','cannibalization','anchorTenant',
  'activityPermission','rentSense','gracePeriod','annualIncrease','contractFlex','infraReadiness','fitoutSupport','downside'
];

const ANSWER_VALUES={
  activityType:['restaurant','cafe','kiosk','retail'],
  serviceChannels:['dineIn','pickupInside','driveThru','delivery'],
  primaryChannel:['dineIn','pickupInside','driveThru','delivery','balanced'],
  locationType:['street','mall','fuelStation','neighborhood','destination'],
  parking:['strong','fair','weak','unknown'],pickupAccess:['easy','fair','difficult','unknown'],
  driveThruFlow:['strong','fair','reorganize','disruptive','unknown'],courierAccess:['easy','fair','difficult','unknown'],
  deliveryCoverage:['strong','fair','weak'],visibility:['strong','fair','weak'],areaActivity:['high','mid','low','unknown'],
  competition:['low','mid','high'],cannibalization:['low','mid','high','unknown'],anchorTenant:['strong','fair','weak'],
  activityPermission:['confirmed','pending','blocked'],rentSense:['comfortable','fair','high','unknown'],
  gracePeriod:['good','limited','none','unknown'],annualIncrease:['reasonable','noticeable','aggressive','unknown'],
  contractFlex:['balanced','tight','rigid','unknown'],infraReadiness:['ready','minor','major','unknown'],
  fitoutSupport:['good','partial','none','unknown'],downside:['resilient','manageable','fragile','unknown']
};

const QUESTION_SCHEMA={type:'string',enum:QUESTION_IDS};
const VALUES_SCHEMA={type:'array',items:{type:'string'},minItems:1};

export const TAWASSU_TOOL_DECLARATIONS=[
  {name:'get_assessment_context',description:'اقرأ أحدث حالة لتقييم توسع قبل أي سؤال أو اقتراح أو شرح. يعيد الإجابات والتقدم والسؤال الحالي والنواقص والنتيجة.',parametersJsonSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'focus_assessment_question',description:'انتقل فعليا إلى سؤال في نموذج توسع وميزه أمام المستخدم.',parametersJsonSchema:{type:'object',properties:{question_id:QUESTION_SCHEMA,message:{type:'string'}},required:['question_id','message'],additionalProperties:false}},
  {name:'explain_assessment_question',description:'اقرأ تعليمات السؤال من محرك توسع واشرح المقصود باختصار وبمثال مرتبط بالنشاط.',parametersJsonSchema:{type:'object',properties:{question_id:QUESTION_SCHEMA},required:['question_id'],additionalProperties:false}},
  {name:'propose_assessment_answer',description:'اعرض فهمك لإجابة المستخدم دون تسجيلها. استخدمه عندما تحتاج الإجابة إلى تأكيد.',parametersJsonSchema:{type:'object',properties:{question_id:QUESTION_SCHEMA,answer_values:VALUES_SCHEMA,interpretation:{type:'string'},certainty:{type:'string',enum:['confirmed','estimated','unknown']}},required:['question_id','answer_values','interpretation','certainty'],additionalProperties:false}},
  {name:'set_assessment_answer',description:'سجل الإجابة فعليا بعد اعتماد المستخدم، ثم اعرض السؤال التالي تلقائيا. إذا سألت هل أعتمد فلا تستخدم هذه الأداة حتى يوافق في دور لاحق، ولا تستدع go_to_next_question بعدها.',parametersJsonSchema:{type:'object',properties:{question_id:QUESTION_SCHEMA,answer_values:VALUES_SCHEMA,confirmed:{type:'boolean'},certainty:{type:'string',enum:['confirmed','estimated']}},required:['question_id','answer_values','confirmed','certainty'],additionalProperties:false}},
  {name:'go_to_next_question',description:'انتقل إلى السؤال التالي الناقص بعد قراءة حالة التقييم.',parametersJsonSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'go_to_previous_question',description:'انتقل فعليا إلى السؤال السابق الظاهر.',parametersJsonSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'get_missing_answers',description:'اعرض الأسئلة الناقصة حاليا مع أقسامها وخياراتها.',parametersJsonSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'validate_assessment',description:'افحص النواقص والتعارضات قبل إظهار النتيجة.',parametersJsonSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'complete_assessment',description:'شغل محرك نتيجة توسع الحالي بعد اكتمال جميع الأسئلة. لا تحسب درجة جديدة.',parametersJsonSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'explain_assessment_result',description:'اقرأ نتيجة محرك توسع واشرح الدرجة ونقاط القوة والمخاطر وشروط المضي دون إعادة احتسابها.',parametersJsonSchema:{type:'object',properties:{},additionalProperties:false}}
];

function validValues(questionId,values){
  const allowed=new Set(ANSWER_VALUES[questionId]||[]);
  return (Array.isArray(values)?values:[]).filter(value=>allowed.has(String(value))).map(String);
}

export async function executeTawassuTool(name,args={}){
  const bridge=window.TawassuAssistantBridge;
  if(!bridge)return {ok:false,error:'tawassu-bridge-unavailable'};
  if(name==='get_assessment_context')return {ok:true,context:bridge.getAssessmentContext()};
  if(name==='focus_assessment_question')return bridge.focusAssessmentQuestion(args.question_id,args.message);
  if(name==='explain_assessment_question')return bridge.explainAssessmentQuestion(args.question_id);
  if(name==='propose_assessment_answer')return bridge.proposeAssessmentAnswer(args.question_id,validValues(args.question_id,args.answer_values),args.interpretation,args.certainty);
  if(name==='set_assessment_answer'){
    if(args.confirmed!==true)return {ok:false,error:'explicit-confirmation-required'};
    const result=bridge.setAssessmentAnswer(args.question_id,validValues(args.question_id,args.answer_values),{confirmed:true,certainty:args.certainty||'confirmed',source:'assistant'});
    if(!result?.ok)return result;
    return {...result,navigation:bridge.goToNextQuestion()};
  }
  if(name==='go_to_next_question')return bridge.goToNextQuestion();
  if(name==='go_to_previous_question')return bridge.goToPreviousQuestion();
  if(name==='get_missing_answers')return bridge.getMissingAnswers();
  if(name==='validate_assessment')return bridge.validateAssessment();
  if(name==='complete_assessment')return bridge.completeAssessment();
  if(name==='explain_assessment_result')return bridge.explainAssessmentResult();
  return {ok:false,error:'unknown-tool'};
}

window.TawassuExecuteTool=executeTawassuTool;
