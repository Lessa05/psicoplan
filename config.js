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
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  }
};
