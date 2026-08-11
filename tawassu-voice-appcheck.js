import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {initializeAppCheck,ReCaptchaEnterpriseProvider,getToken} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js';

const APP_NAME='tawassu-voice';
const RECAPTCHA_SITE_KEY='6LdgFnstAAAAAJod6T7NgPLzkfFkSYNbc4_q4rfe';
const firebaseConfig={apiKey:'AIzaSyAAvC9y5jQ_7fAwmkCqBtgFDrBRF5t4uI0',authDomain:'mesraah-a2dfc.firebaseapp.com',projectId:'mesraah-a2dfc',storageBucket:'mesraah-a2dfc.firebasestorage.app',messagingSenderId:'986043593957',appId:'1:986043593957:web:b848313ef8cf83a5f3500c'};
const app=getApps().find(item=>item.name===APP_NAME)||initializeApp(firebaseConfig,APP_NAME);
window.TawassuVoiceFirebaseApp=app;
const appCheck=initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),isTokenAutoRefreshEnabled:true});
window.TawassuVoiceGetAppCheckToken=async({forceRefresh=false}={})=>{const result=await getToken(appCheck,forceRefresh);if(!result?.token)throw new Error('voice-app-check-token-missing');return result.token};
window.TAWASSU_VOICE_TOKEN_ENDPOINT='https://mesraah-live-token.naif123456.workers.dev/token';
