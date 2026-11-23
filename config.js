/**
 * Configuración de PsicoPlan
 * Funciona de forma 100% autónoma sin backend de pago:
 * - Modo IA Demo (respuestas inteligentes simuladas y precisas para psicología)
 * - Persistencia local con localStorage
 * - Opcional: Clave Gemini y Firebase
 */
const PSICOPLAN_CONFIG = {
  // Clave de la API de Google Gemini (Obtén una gratis en https://aistudio.google.com/)
  // También puedes ingresarla en la aplicación desde el botón ⚙️
  GEMINI_API_KEY: "",
  GEMINI_MODEL: "gemini-1.5-flash",

  // Configuración de Firebase (Opcional - https://console.firebase.google.com/)
  // Si dejas apiKey vacía, PsicoPlan usará localStorage automáticamente como respaldo.
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyD5EsDPCGnrrGNoFTlaJmNGPtw8Vb0E2bw",
    authDomain: "psicoplan-c57f1.firebaseapp.com",
    projectId: "psicoplan-c57f1",
    storageBucket: "psicoplan-c57f1.firebasestorage.app",
    messagingSenderId: "718056628549",
    appId: "1:718056628549:web:6e13ecade39663c4ea5e2c"
  }
};
