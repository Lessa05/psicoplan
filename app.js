/**
 * PSICOPLAN - LÓGICA COMPLETA DE LA APLICACIÓN
 * - Sistema de Autenticación Neutra & Gestión de Temas
 * - Mascota Virtual Interactiva (Generación Aleatoria, Personalización, Ánimo y Alimentación)
 * - Wizard de 4 Pasos con Asistente de IA (Gemini API + Generador Offline)
 * - Minijuego de Pausa Activa (Burbujas Antiestrés Canvas & Respiración 4-7-8)
 * - Gamificación (Puntos, Racha, Niveles, Canvas Semanal e Insignias)
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. ESTADO GLOBAL
  // =========================================================================
  const FUR_COLORS = [
    { id: '#F7FAFC', name: 'Nieve' },
    { id: '#ECC94B', name: 'Dorado' },
    { id: '#A0AEC0', name: 'Gris' },
    { id: '#CBD5E0', name: 'Lavanda' },
    { id: '#B2DFDB', name: 'Menta' },
    { id: '#8D6E63', name: 'Café' }
  ];

  const PET_NAMES_BY_SPECIES = {
    cat: ['Mimi', 'Freudito', 'Luna', 'Félix'],
    dog: ['Toby', 'Pavlov', 'Bobby', 'Coco'],
    owl: ['Platón', 'Atenea', 'Sabio', 'Pallas'],
    bunny: ['Lola', 'Copito', 'Bambi', 'Piaget'],
    bear: ['Bruno', 'Baloo', 'Teddy', 'Zen']
  };

  const DEFAULT_STATE = {
    user: {
      isLoggedIn: false,
      name: 'Estudiante',
      email: '',
      points: 0,
      streak: 1,
      lastActiveDate: new Date().toISOString().split('T')[0],
      badges: ['primer_paso'],
      mealsGiven: 0
    },
    pet: null, // Se genera aleatoriamente al registrarse/ingresar
    tasks: [],
    weeklyActivity: {
      'Lun': 1, 'Mar': 2, 'Mié': 3, 'Jue': 1, 'Vie': 2, 'Sáb': 0, 'Dom': 1
    },
    settings: {
      theme: 'pastel',
      geminiApiKey: ''
    }
  };

  let appState = loadState();
  let currentWizardData = null;
  let currentViewingTask = null;

  // Variables de Firebase & Firestore
  let firebaseAuth = null;
  let firestoreDb = null;
  let isFirebaseReady = false;
  let pendingVerificationUser = null;

  // Variables del Minijuego
  let gameMode = 'arcade'; // 'arcade' o 'breathing'
  let zenPoints = 0;
  let bubbles = [];
  let bubbleAnimId = null;
  let breathingInterval = null;

  function loadState() {
    try {
      const saved = localStorage.getItem('psicoplan_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        checkDailyStreak(parsed);
        return parsed;
      }
    } catch (e) {
      console.warn('Error al leer de localStorage', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  function saveState() {
    try {
      localStorage.setItem('psicoplan_state', JSON.stringify(appState));
      renderUI();
      syncStateToFirestore();
    } catch (e) {
      console.warn('Error al guardar en localStorage', e);
    }
  }

  // =========================================================================
  // SERVICIOS FIREBASE (AUTH GOOGLE/FACEBOOK, VERIFICACIÓN Y CLOUD FIRESTORE)
  // =========================================================================
  function initFirebaseServices() {
    try {
      if (typeof firebase !== 'undefined' && typeof PSICOPLAN_CONFIG !== 'undefined' && PSICOPLAN_CONFIG.FIREBASE_CONFIG && PSICOPLAN_CONFIG.FIREBASE_CONFIG.apiKey) {
        if (!firebase.apps.length) {
          firebase.initializeApp(PSICOPLAN_CONFIG.FIREBASE_CONFIG);
        }
        firebaseAuth = firebase.auth();
        firestoreDb = firebase.firestore();
        isFirebaseReady = true;

        firebaseAuth.onAuthStateChanged(async (user) => {
          if (user) {
            const isSocial = user.providerData && user.providerData.some(p => p.providerId === 'google.com' || p.providerId === 'facebook.com');
            if (user.emailVerified || isSocial) {
              appState.user.isLoggedIn = true;
              appState.user.uid = user.uid;
              appState.user.email = user.email || '';
              appState.user.name = user.displayName || (user.email ? user.email.split('@')[0] : 'Estudiante');

              await loadUserFromFirestore(user.uid);
              saveState();
              switchView('inicio');
            } else {
              showEmailVerificationPrompt(user, false);
              await firebaseAuth.signOut();
            }
          }
        });
      }
    } catch (e) {
      console.warn('Firebase en modo local / offline:', e);
    }
  }

  function showEmailVerificationPrompt(user, isNew = false) {
    pendingVerificationUser = user;
    const alertBox = document.getElementById('email-verification-alert');
    const titleEl = document.getElementById('verif-title');
    const descEl = document.getElementById('verif-desc');
    if (!alertBox) return;

    if (isNew) {
      if (titleEl) titleEl.innerText = '✉️ ¡Cuenta creada! Confirma tu correo';
      if (descEl) descEl.innerText = `Enviamos un enlace de verificación a ${user.email}. Por favor haz clic en él para validar que el correo existe y poder entrar.`;
    } else {
      if (titleEl) titleEl.innerText = '⚠️ Correo pendiente de verificación';
      if (descEl) descEl.innerText = `El correo ${user.email} aún no ha sido confirmado. Revisa tu bandeja de entrada o spam para activar tu cuenta.`;
    }
    alertBox.style.display = 'flex';
  }

  async function resendEmailVerification() {
    if (!pendingVerificationUser) {
      showToast('Ingresa tu correo para reenviar la verificación');
      return;
    }
    try {
      if (pendingVerificationUser.sendEmailVerification) {
        await pendingVerificationUser.sendEmailVerification();
        showToast('✉️ Correo de verificación reenviado con éxito');
      } else {
        showToast('Inicia sesión para reenviar el enlace');
      }
    } catch (err) {
      showToast('Espera unos instantes antes de reenviar otro correo');
    }
  }

  async function loginWithGoogle() {
    if (!isFirebaseReady || !firebaseAuth) {
      showToast('⚙️ Agrega tus credenciales de Firebase en config.js para usar Google');
      return;
    }
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      const result = await firebaseAuth.signInWithPopup(provider);
      showToast(`¡Bienvenido/a, ${result.user.displayName || 'Estudiante'}!`);
    } catch (err) {
      console.error('Google Auth Error:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        showToast('Error con Google: ' + (err.message || 'Intenta de nuevo'));
      }
    }
  }

  async function loginWithFacebook() {
    if (!isFirebaseReady || !firebaseAuth) {
      showToast('⚙️ Agrega tus credenciales de Firebase en config.js para usar Facebook');
      return;
    }
    try {
      const provider = new firebase.auth.FacebookAuthProvider();
      provider.addScope('email');
      const result = await firebaseAuth.signInWithPopup(provider);
      showToast(`¡Bienvenido/a, ${result.user.displayName || 'Estudiante'}!`);
    } catch (err) {
      console.error('Facebook Auth Error:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        showToast('Error con Facebook: ' + (err.message || 'Intenta de nuevo'));
      }
    }
  }

  async function loadUserFromFirestore(uid) {
    if (!firestoreDb) return;
    try {
      const docRef = firestoreDb.collection('users').doc(uid);
      const snap = await docRef.get();
      if (snap.exists) {
        const data = snap.data();
        if (data.pet) appState.pet = data.pet;
        if (data.tasks) appState.tasks = data.tasks;
        if (data.points !== undefined) appState.user.points = data.points;
        if (data.streak !== undefined) appState.user.streak = data.streak;
        if (data.settings) appState.settings = data.settings;
      } else {
        if (!appState.pet) appState.pet = createRandomPet();
        await docRef.set({
          name: appState.user.name,
          email: appState.user.email,
          pet: appState.pet,
          tasks: appState.tasks,
          points: appState.user.points || 0,
          streak: appState.user.streak || 1,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.warn('Error leyendo Firestore:', e);
    }
  }

  async function syncStateToFirestore() {
    if (!firestoreDb || !appState.user.uid) return;
    try {
      await firestoreDb.collection('users').doc(appState.user.uid).set({
        name: appState.user.name,
        email: appState.user.email,
        pet: appState.pet,
        tasks: appState.tasks,
        points: appState.user.points,
        streak: appState.user.streak,
        settings: appState.settings,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn('Error sincronizando Firestore:', e);
    }
  }

  function checkDailyStreak(state) {
    const today = new Date().toISOString().split('T')[0];
    const lastActive = state.user.lastActiveDate;
    if (lastActive !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (lastActive === yesterdayStr) {
        state.user.streak = (state.user.streak || 1) + 1;
      } else {
        state.user.streak = 1;
      }
      state.user.lastActiveDate = today;
    }
  }

  // =========================================================================
  // 2. SISTEMA DE GENERACIÓN Y GESTIÓN DE MASCOTA
  // =========================================================================
  function createRandomPet() {
    const speciesList = ['cat', 'dog', 'owl', 'bunny', 'bear'];
    const randomSpecies = speciesList[Math.floor(Math.random() * speciesList.length)];
    const names = PET_NAMES_BY_SPECIES[randomSpecies];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const randomColor = FUR_COLORS[Math.floor(Math.random() * FUR_COLORS.length)].id;
    const outfits = ['none', 'glasses', 'scarf', 'bowtie', 'flower'];
    const randomOutfit = outfits[Math.floor(Math.random() * outfits.length)];

    return {
      species: randomSpecies,
      name: randomName,
      furColor: randomColor,
      outfit: randomOutfit,
      hunger: 75,
      foodStock: 2,
      mood: 'happy'
    };
  }

  function getPetMood(pet) {
    if (!pet) return 'happy';
    // 1. Si tiene hambre (< 40%)
    if (pet.hunger < 40) return 'starving';

    // 2. Si hay tareas activas rezagadas o abandonadas
    const hasPendingTasks = appState.tasks && appState.tasks.some(t => t.subtasks && t.subtasks.some(s => !s.completed));
    if (hasPendingTasks) {
      const todayStr = new Date().toISOString().split('T')[0];
      const hasStalledTask = appState.tasks.some(t => {
        const isPending = t.subtasks.some(s => !s.completed);
        const deadline = new Date(t.deadline);
        const diffDays = (deadline - new Date()) / (1000 * 60 * 60 * 24);
        return isPending && (diffDays <= 2 || t.createdAt.split('T')[0] !== todayStr);
      });
      // Si la satisfacción no está al tope y las tareas están pendientes: se pone triste
      if (hasStalledTask && pet.hunger < 80) {
        return 'sad';
      }
    }

    if (pet.hunger >= 85) return 'ecstatic';
    if (pet.hunger < 55) return 'sleepy';
    return 'happy';
  }

  const PET_PHRASES = {
    starving: [
      "¡Tengo mucha hambre! 🥺 ¿Hacemos una subtarea para ganar un rico bocadito?",
      "Mi pancita hace ruidos... ¡termina un paso de tu plan y dame de comer! 🍪",
      "Necesito nutrientes para seguir acompañándote a estudiar 🥺"
    ],
    sad: [
      "Veo que dejamos pausada la tarea... me da un poquito de tristeza 😢 ¡Hagamos aunque sea un pasito hoy!",
      "¡No procrastines! Recuerda que tu yo del futuro te agradecerá avanzar hoy.",
      "Extraño verte tachar tareas en tu checklist... ¡yo sé que eres muy capaz! 💔",
      "A veces empezar es lo más difícil. Comprométete solo con 5 minutos hoy, ¡hazlo por mí! 🥺"
    ],
    sleepy: [
      "Un bostezo... ¿Será hora de una pausa activa de 5 minutos? 😴",
      "Descansar la mente también forma parte del aprendizaje según la neurociencia."
    ],
    happy: [
      "¡Me siento genial! Listo para ayudarte a enfocar tus lecturas de psicología 📖",
      "Cada paso que das fortalece tus hábitos de estudio ✨",
      "Recuerda hidratarte y mantener una postura cómoda ♥"
    ],
    ecstatic: [
      "¡Estoy súper feliz y motivado! 🥳 ¡Vamos a conquistar este semestre!",
      "¡Qué orgullo! Tu corteza prefrontal está trabajando a toda máquina 🧠✨"
    ],
    zen: [
      "Inhala profundamente... siente cómo tu cuerpo se relaja 🧘",
      "La atención plena en el presente disipa la ansiedad del futuro."
    ],
    advice: [
      "💡 Tip de psicología: La técnica de los 2 minutos dice que si empezar te cuesta, haz solo 2 minutos. ¡Casi siempre continúas!",
      "🧠 Neurociencia: Tu memoria de trabajo rinde mucho mejor si alejas el celular de tu campo visual.",
      "✨ Psicología de hábitos: No esperes a tener motivación para empezar; la acción precede a la motivación.",
      "📚 Ley de Yerkes-Dodson: Un nivel moderado de activación es óptimo; respira hondo si sientes nervios.",
      "♥ ¡Cada autor que citas y cada página que redactas te acerca a tu título de psicólogo/a!",
      "🌱 El descanso es productivo: 5 minutos de pausa cada 25 minutos restauran tu dopamina y concentración.",
      "📖 Efecto Zeigárnik: Las tareas incompletas ocupan espacio mental. ¡Terminar un paso pequeño te dará paz mental inmediata!"
    ]
  };

  /**
   * Generador de SVG vectorial para mascotas personalizadas
   */
  function renderPetSVG(pet, moodOverride = null, size = 90) {
    const mood = moodOverride || getPetMood(pet);
    const color = pet.furColor || '#ECC94B';
    const outfit = pet.outfit || 'none';
    const species = pet.species || 'cat';

    // Ojitos según estado de ánimo
    let eyesSvg = '';
    let mouthSvg = '';

    if (mood === 'sleepy') {
      eyesSvg = `
        <path d="M32 44 Q38 40 44 44" stroke="#2D3748" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M56 44 Q62 40 68 44" stroke="#2D3748" stroke-width="3" stroke-linecap="round" fill="none"/>
      `;
      mouthSvg = `<ellipse cx="50" cy="56" rx="3" ry="2" fill="#2D3748"/>`;
    } else if (mood === 'starving') {
      eyesSvg = `
        <circle cx="38" cy="42" r="5" fill="#2D3748"/>
        <circle cx="62" cy="42" r="5" fill="#2D3748"/>
        <circle cx="36" cy="40" r="2" fill="#FFFFFF"/>
        <circle cx="60" cy="40" r="2" fill="#FFFFFF"/>
      `;
      mouthSvg = `<path d="M46 56 Q50 52 54 56" stroke="#2D3748" stroke-width="2.5" stroke-linecap="round" fill="none"/>`;
    } else if (mood === 'sad') {
      eyesSvg = `
        <path d="M33 40 Q39 45 44 41" stroke="#2D3748" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M56 41 Q61 45 67 40" stroke="#2D3748" stroke-width="3" stroke-linecap="round" fill="none"/>
        <!-- Lagrimita tierna -->
        <circle cx="34" cy="48" r="2.5" fill="#54B4D3"/>
      `;
      mouthSvg = `<path d="M44 56 Q50 50 56 56" stroke="#2D3748" stroke-width="2.5" stroke-linecap="round" fill="none"/>`;
    } else if (mood === 'ecstatic' || mood === 'zen') {
      eyesSvg = `
        <path d="M32 42 Q38 34 44 42" stroke="#2D3748" stroke-width="3.5" stroke-linecap="round" fill="none"/>
        <path d="M56 42 Q62 34 68 42" stroke="#2D3748" stroke-width="3.5" stroke-linecap="round" fill="none"/>
      `;
      mouthSvg = `<path d="M44 52 Q50 60 56 52" stroke="#2D3748" stroke-width="3" stroke-linecap="round" fill="none"/>`;
    } else { // happy
      eyesSvg = `
        <circle cx="38" cy="42" r="4.5" fill="#2D3748"/>
        <circle cx="62" cy="42" r="4.5" fill="#2D3748"/>
        <circle cx="36.5" cy="40.5" r="1.5" fill="#FFFFFF"/>
        <circle cx="60.5" cy="40.5" r="1.5" fill="#FFFFFF"/>
      `;
      mouthSvg = `<path d="M45 52 Q50 58 55 52" stroke="#2D3748" stroke-width="2.5" stroke-linecap="round" fill="none"/>`;
    }

    // Orejas y rasgos por especie
    let earsAndBody = '';
    if (species === 'cat') {
      earsAndBody = `
        <polygon points="26,18 40,32 20,36" fill="${color}" stroke="#2D3748" stroke-width="2"/>
        <polygon points="74,18 60,32 80,36" fill="${color}" stroke="#2D3748" stroke-width="2"/>
        <polygon points="28,24 38,33 24,35" fill="#FFCDD2"/>
        <polygon points="72,24 62,33 76,35" fill="#FFCDD2"/>
        <circle cx="50" cy="50" r="34" fill="${color}" stroke="#2D3748" stroke-width="2.5"/>
        <!-- Bigotes -->
        <line x1="20" y1="48" x2="32" y2="49" stroke="#718096" stroke-width="1.5"/>
        <line x1="20" y1="53" x2="32" y2="52" stroke="#718096" stroke-width="1.5"/>
        <line x1="68" y1="49" x2="80" y2="48" stroke="#718096" stroke-width="1.5"/>
        <line x1="68" y1="52" x2="80" y2="53" stroke="#718096" stroke-width="1.5"/>
      `;
    } else if (species === 'dog') {
      earsAndBody = `
        <ellipse cx="20" cy="46" rx="9" ry="18" fill="#A0AEC0" stroke="#2D3748" stroke-width="2" transform="rotate(-15 20 46)"/>
        <ellipse cx="80" cy="46" rx="9" ry="18" fill="#A0AEC0" stroke="#2D3748" stroke-width="2" transform="rotate(15 80 46)"/>
        <circle cx="50" cy="50" r="34" fill="${color}" stroke="#2D3748" stroke-width="2.5"/>
        <ellipse cx="50" cy="48" rx="5" ry="3.5" fill="#2D3748"/>
      `;
    } else if (species === 'owl') {
      earsAndBody = `
        <polygon points="32,20 40,30 24,32" fill="${color}" stroke="#2D3748" stroke-width="2"/>
        <polygon points="68,20 60,30 76,32" fill="${color}" stroke="#2D3748" stroke-width="2"/>
        <circle cx="50" cy="50" r="34" fill="${color}" stroke="#2D3748" stroke-width="2.5"/>
        <circle cx="38" cy="42" r="14" fill="#FFFFFF" opacity="0.6"/>
        <circle cx="62" cy="42" r="14" fill="#FFFFFF" opacity="0.6"/>
        <!-- Pico sabio -->
        <polygon points="50,47 46,54 54,54" fill="#ED8936"/>
      `;
    } else if (species === 'bunny') {
      earsAndBody = `
        <ellipse cx="36" cy="18" rx="8" ry="22" fill="${color}" stroke="#2D3748" stroke-width="2"/>
        <ellipse cx="64" cy="18" rx="8" ry="22" fill="${color}" stroke="#2D3748" stroke-width="2"/>
        <ellipse cx="36" cy="18" rx="4" ry="15" fill="#FFCDD2"/>
        <ellipse cx="64" cy="18" rx="4" ry="15" fill="#FFCDD2"/>
        <circle cx="50" cy="54" r="32" fill="${color}" stroke="#2D3748" stroke-width="2.5"/>
        <polygon points="50,50 47,47 53,47" fill="#F687B3"/>
      `;
    } else { // bear
      earsAndBody = `
        <circle cx="25" cy="25" r="13" fill="${color}" stroke="#2D3748" stroke-width="2"/>
        <circle cx="75" cy="25" r="13" fill="${color}" stroke="#2D3748" stroke-width="2"/>
        <circle cx="25" cy="25" r="6" fill="#FFCDD2"/>
        <circle cx="75" cy="25" r="6" fill="#FFCDD2"/>
        <circle cx="50" cy="52" r="34" fill="${color}" stroke="#2D3748" stroke-width="2.5"/>
        <ellipse cx="50" cy="54" rx="14" ry="10" fill="#FFF5F5" opacity="0.8"/>
        <ellipse cx="50" cy="49" rx="4.5" ry="3" fill="#2D3748"/>
      `;
    }

    // Mejillas rosadas
    const cheeksSvg = `
      <circle cx="30" cy="49" r="5" fill="#FFCDD2" opacity="0.85"/>
      <circle cx="70" cy="49" r="5" fill="#FFCDD2" opacity="0.85"/>
    `;

    // Vestimenta / Accesorio
    let outfitSvg = '';
    if (outfit === 'glasses') {
      outfitSvg = `
        <circle cx="38" cy="42" r="9" fill="none" stroke="#2B6CB0" stroke-width="2.5"/>
        <circle cx="62" cy="42" r="9" fill="none" stroke="#2B6CB0" stroke-width="2.5"/>
        <line x1="47" y1="42" x2="53" y2="42" stroke="#2B6CB0" stroke-width="2.5"/>
        <line x1="29" y1="40" x2="21" y2="36" stroke="#2B6CB0" stroke-width="2"/>
        <line x1="71" y1="40" x2="79" y2="36" stroke="#2B6CB0" stroke-width="2"/>
      `;
    } else if (outfit === 'scarf') {
      outfitSvg = `
        <path d="M26 72 Q50 82 74 72 Q78 84 50 86 Q22 84 26 72 Z" fill="#E53E3E" stroke="#2D3748" stroke-width="2"/>
        <rect x="56" y="76" width="12" height="18" rx="3" fill="#C53030" stroke="#2D3748" stroke-width="1.5"/>
      `;
    } else if (outfit === 'hat') { // Birrete
      outfitSvg = `
        <polygon points="50,10 80,18 50,26 20,18" fill="#1A202C" stroke="#2D3748" stroke-width="1.5"/>
        <rect x="36" y="22" width="28" height="8" rx="2" fill="#2D3748"/>
        <circle cx="50" cy="18" r="2.5" fill="#ECC94B"/>
        <line x1="50" y1="18" x2="68" y2="28" stroke="#ECC94B" stroke-width="2"/>
      `;
    } else if (outfit === 'bowtie') {
      outfitSvg = `
        <polygon points="40,74 50,78 40,82" fill="#805AD5" stroke="#2D3748" stroke-width="1.5"/>
        <polygon points="60,74 50,78 60,82" fill="#805AD5" stroke="#2D3748" stroke-width="1.5"/>
        <circle cx="50" cy="78" r="3" fill="#D6BCFA"/>
      `;
    } else if (outfit === 'flower') {
      outfitSvg = `
        <circle cx="30" cy="25" r="4" fill="#F687B3"/>
        <circle cx="36" cy="28" r="4" fill="#F687B3"/>
        <circle cx="33" cy="34" r="4" fill="#F687B3"/>
        <circle cx="26" cy="33" r="4" fill="#F687B3"/>
        <circle cx="24" cy="27" r="4" fill="#F687B3"/>
        <circle cx="30" cy="29" r="3" fill="#ECC94B"/>
      `;
    } else if (outfit === 'cape') {
      outfitSvg = `
        <path d="M22 68 Q50 62 78 68 L84 88 Q50 82 16 88 Z" fill="#3182CE" stroke="#2D3748" stroke-width="2" opacity="0.9"/>
      `;
    }

    return `
      <svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        ${earsAndBody}
        ${eyesSvg}
        ${mouthSvg}
        ${cheeksSvg}
        ${outfitSvg}
      </svg>
    `;
  }

  // =========================================================================
  // 3. EFECTOS MULTIMEDIA: AUDIO NATIVO Y CONFETI
  // =========================================================================
  function playSweetChime() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {}
  }

  function playPopSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {}
  }

  function launchConfetti(isGrand = false) {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: isGrand ? 90 : 35,
        spread: isGrand ? 70 : 45,
        origin: { y: 0.65 },
        colors: ['#8B7CE6', '#54B4D3', '#48BB78', '#F687B3', '#ECC94B']
      });
    }
  }

  let toastTimeout = null;
  function showToast(message) {
    const toast = document.getElementById('toast-element');
    const text = document.getElementById('toast-text');
    if (toast && text) {
      text.innerText = message;
      toast.classList.add('show');
      if (toastTimeout) clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
      }, 2600);
    }
  }

  // =========================================================================
  // 4. ALIMENTAR MASCOTA
  // =========================================================================
  function feedPet() {
    if (!appState.pet) return;
    if (appState.pet.foodStock <= 0) {
      showToast('⚠️ No tienes bocaditos. ¡Completa subtareas para ganar más!');
      return;
    }

    appState.pet.foodStock -= 1;
    appState.pet.hunger = Math.min(100, appState.pet.hunger + 25);
    appState.user.mealsGiven = (appState.user.mealsGiven || 0) + 1;
    appState.pet.mood = getPetMood(appState.pet);

    // Animación de rebote
    const avatarWrapper = document.getElementById('btn-pet-avatar');
    if (avatarWrapper) {
      avatarWrapper.classList.remove('pet-bounce');
      void avatarWrapper.offsetWidth; // Forzar reflujo
      avatarWrapper.classList.add('pet-bounce');

      // Crear corazoncito flotante
      const heart = document.createElement('div');
      heart.className = 'floating-heart';
      heart.innerText = '💖';
      heart.style.left = '45%';
      heart.style.top = '10%';
      avatarWrapper.appendChild(heart);
      setTimeout(() => heart.remove(), 1000);
    }

    playSweetChime();
    saveState();
    showToast(`😋 ¡Le diste un rico bocadito a ${appState.pet.name}!`);
  }

  // =========================================================================
  // 5. GAMIFICACIÓN: PUNTOS, NIVELES E INSIGNIAS
  // =========================================================================
  function calculateLevel(points) {
    if (points >= 500) return { name: 'Maestro 🧠', min: 500, next: 1000 };
    if (points >= 300) return { name: 'Experto 🎓', min: 300, next: 500 };
    if (points >= 150) return { name: 'Estudioso 📚', min: 150, next: 300 };
    if (points >= 50) return { name: 'Aprendiz 🌱', min: 50, next: 150 };
    return { name: 'Novato ✨', min: 0, next: 50 };
  }

  function addPoints(amount, snackBonus = 0) {
    const prevLevel = calculateLevel(appState.user.points);
    appState.user.points += amount;
    const newLevel = calculateLevel(appState.user.points);

    if (snackBonus > 0 && appState.pet) {
      appState.pet.foodStock += snackBonus;
    }

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const currentDay = dayNames[new Date().getDay()];
    appState.weeklyActivity[currentDay] = (appState.weeklyActivity[currentDay] || 0) + 1;

    if (appState.user.points >= 50 && !appState.user.badges.includes('nivel_aprendiz')) {
      appState.user.badges.push('nivel_aprendiz');
      showToast('🎉 ¡Insignia desbloqueada: Nivel Aprendiz!');
    }
    if (appState.user.streak >= 3 && !appState.user.badges.includes('racha_3')) {
      appState.user.badges.push('racha_3');
      showToast('🔥 ¡Insignia desbloqueada: Racha de 3 Días!');
    }

    if (newLevel.name !== prevLevel.name) {
      launchConfetti(true);
      showToast(`⭐ ¡Subiste de Nivel a ${newLevel.name}!`);
    }

    playSweetChime();
    saveState();
  }

  // =========================================================================
  // 6. ASISTENTE DE IA PARA PSICOLOGÍA (GEMINI + OFFLINE)
  // =========================================================================
  async function generatePlanWithAI(taskData) {
    const apiKey = appState.settings.geminiApiKey || (typeof PSICOPLAN_CONFIG !== 'undefined' ? PSICOPLAN_CONFIG.GEMINI_API_KEY : '');

    if (!apiKey) {
      return generateSimulatedPsychologyPlan(taskData);
    }

    const systemPrompt = `Eres un tutor amable y motivador para estudiantes de psicología. Divide la tarea en pasos pequeños, realistas y ordenados según la fecha límite. Responde solo en JSON con: subtareas [{titulo, descripcion, fecha_sugerida, minutos_estimados}] y herramientas_recomendadas [{nombre, para_que_sirve, enlace}].`;
    const userPrompt = `
      Tarea: "${taskData.title}"
      Curso: "${taskData.course}"
      Fecha de entrega: "${taskData.deadline}"
      Paso inicial: "${taskData.q1 || 'Inicio'}"
      Recursos: "${taskData.q2 || 'Apuntes'}"
      Tiempo: "${taskData.q3 || 'Moderado'}"
    `;

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const json = await response.json();
      const content = json.candidates[0].content.parts[0].text;
      return JSON.parse(content);
    } catch (err) {
      console.warn('Usando generador offline de psicología:', err);
      return generateSimulatedPsychologyPlan(taskData);
    }
  }

  function generateSimulatedPsychologyPlan(taskData) {
    const today = new Date();
    const deadline = new Date(taskData.deadline);
    const diffDays = Math.max(1, Math.ceil((deadline - today) / (1000 * 60 * 60 * 24)));

    function getOffsetDateStr(fraction) {
      const target = new Date(today.getTime() + (deadline.getTime() - today.getTime()) * fraction);
      return target.toISOString().split('T')[0];
    }

    const subtasks = [
      {
        titulo: "Delimitar tema y revisar consigna docente",
        descripcion: `Analizar los requisitos específicos de ${taskData.course} y formular la pregunta central o marco teórico.`,
        fecha_sugerida: getOffsetDateStr(0.15),
        minutos_estimados: 35
      },
      {
        titulo: "Búsqueda bibliográfica en fuentes científicas",
        descripcion: "Recopilar de 3 a 5 artículos clave en SciELO, Dialnet o Google Académico.",
        fecha_sugerida: getOffsetDateStr(0.35),
        minutos_estimados: 50
      },
      {
        titulo: "Lectura crítica y matriz de conceptos",
        descripcion: "Sintetizar autores, teorías y hallazgos empíricos organizadamente.",
        fecha_sugerida: getOffsetDateStr(0.55),
        minutos_estimados: 60
      },
      {
        titulo: "Redacción del cuerpo con formato APA 7",
        descripcion: "Desarrollar introducción, análisis psicológico articulado y conclusiones.",
        fecha_sugerida: getOffsetDateStr(0.75),
        minutos_estimados: 90
      },
      {
        titulo: "Revisión final de citas, estilo y entrega",
        descripcion: "Verificar coherencia, ortografía y referencias en estilo APA 7ma edición.",
        fecha_sugerida: getOffsetDateStr(0.95),
        minutos_estimados: 40
      }
    ];

    if (diffDays <= 3) {
      subtasks.forEach(s => s.minutos_estimados = Math.round(s.minutos_estimados * 0.7));
    }

    const herramientas_recomendadas = [
      {
        nombre: "Google Académico",
        para_que_sirve: "Artículos científicos y tesis revisadas por pares.",
        enlace: `https://scholar.google.com/scholar?q=${encodeURIComponent(taskData.course + ' ' + taskData.title)}`
      },
      {
        nombre: "SciELO Psicología",
        para_que_sirve: "Revistas de acceso abierto iberoamericanas.",
        enlace: "https://scielo.org"
      },
      {
        nombre: "Normas APA 7ma Edición",
        para_que_sirve: "Guía oficial de citación bibliográfica.",
        enlace: "https://apastyle.apa.org"
      },
      {
        nombre: "Pomofocus",
        para_que_sirve: "Temporizador Pomodoro para regular el cansancio mental.",
        enlace: "https://pomofocus.io"
      }
    ];

    return { subtareas: subtasks, herramientas_recomendadas };
  }

  // =========================================================================
  // 7. MINIJUEGO: FLAPPY PET (VUELO ACADÉMICO CON OBSTÁCULOS) 🚀📚
  // =========================================================================
  let flappyState = {
    running: false,
    hasStartedFlight: false, // Levita plácidamente en el centro hasta que el usuario dé el primer toque
    score: 0,
    cookiesCollected: 0,
    highScore: parseInt(localStorage.getItem('psicoplan_flappy_high') || '0', 10),
    bird: {
      x: 75,
      y: 200,
      vy: 0,
      radius: 20,
      gravity: 0.27, // Gravedad suave para dar tiempo de reacción perfecto
      jump: -5.6,    // Impulso balanceado y agradable
      rotation: 0
    },
    pipes: [],
    particles: [],
    floatingTexts: [],
    spawnTimer: 0,
    bgClouds: [
      { x: 30, y: 50, s: 0.6 },
      { x: 180, y: 80, s: 0.8 },
      { x: 320, y: 40, s: 0.5 }
    ]
  };

  let flappyAnimId = null;
  let sharedAudioCtx = null;

  function getAudioContext() {
    try {
      if (!sharedAudioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) sharedAudioCtx = new AudioCtx();
      }
      if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
      }
      return sharedAudioCtx;
    } catch (e) {
      return null;
    }
  }

  function playFlapSound() {
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(560, audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {}
  }

  function playPointSound() {
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch (e) {}
  }

  function playCrashSound() {
    try {
      const audioCtx = getAudioContext();
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) {}
  }

  function spawnParticles(x, y, color = '#ECC94B', count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      flappyState.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: color,
        size: 3 + Math.random() * 3,
        life: 0.45 + Math.random() * 0.3
      });
    }
  }

  function showFloatingText(x, y, text, color = '#48BB78', size = 18) {
    flappyState.floatingTexts.push({
      x: x,
      y: y,
      text: text,
      color: color,
      size: size,
      alpha: 1.0
    });
  }

  function safeRoundRect(ctx, x, y, w, h, radii) {
    if (w <= 0 || h <= 0) return;
    if (typeof ctx.roundRect === 'function') {
      try {
        ctx.roundRect(x, y, w, h, radii);
        return;
      } catch (e) {}
    }
    ctx.rect(x, y, w, h);
  }

  function initFlappyGame() {
    const canvas = document.getElementById('flappy-pet-canvas');
    if (!canvas) return;

    const wrapper = canvas.parentElement;
    if (wrapper) {
      canvas.width = wrapper.clientWidth || 360;
      canvas.height = wrapper.clientHeight || 450;
    }

    const highDisplay = document.getElementById('game-high-score-display');
    if (highDisplay) highDisplay.innerText = `${flappyState.highScore}`;

    // Listener de aleteo (salto) con un toque o clic en la pantalla
    const jumpHandler = (e) => {
      // Ignorar si el clic fue en un botón de overlay
      if (e.target && (e.target.closest('#game-start-overlay') || e.target.closest('#game-over-overlay'))) return;
      if (!flappyState.running) return;
      e.preventDefault();
      flappyJump();
    };

    if (wrapper) {
      wrapper.onpointerdown = jumpHandler;
    } else {
      canvas.onpointerdown = jumpHandler;
    }

    window.onkeydown = (e) => {
      const minijuegoView = document.getElementById('view-minijuego');
      if (!minijuegoView || minijuegoView.style.display === 'none') return;
      if (!flappyState.running) return;
      if (e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        flappyJump();
      }
    };
  }

  function flappyJump() {
    if (!flappyState.running) return;
    flappyState.hasStartedFlight = true; // Activa el vuelo al primer toque del jugador
    const b = flappyState.bird;
    b.vy = b.jump;
    playFlapSound();

    // Partículas de aleteo detrás de la mascota
    for (let i = 0; i < 4; i++) {
      flappyState.particles.push({
        x: b.x - 12,
        y: b.y + 10,
        vx: -30 - Math.random() * 30,
        vy: (Math.random() - 0.5) * 40,
        color: 'rgba(255, 255, 255, 0.7)',
        size: 3 + Math.random() * 3,
        life: 0.3
      });
    }
  }

  function startFlappyGame() {
    const canvas = document.getElementById('flappy-pet-canvas');
    if (!canvas) return;

    const wrapper = canvas.parentElement;
    if (wrapper) {
      canvas.width = wrapper.clientWidth || 360;
      canvas.height = wrapper.clientHeight || 450;
    }

    flappyState.running = true;
    flappyState.hasStartedFlight = false; // ¡Mascota levitando pacíficamente hasta el primer toque!
    flappyState.score = 0;
    flappyState.cookiesCollected = 0;
    flappyState.bird.y = canvas.height * 0.42;
    flappyState.bird.vy = 0;
    flappyState.bird.rotation = 0;
    flappyState.pipes = [];
    flappyState.particles = [];
    flappyState.floatingTexts = [];
    flappyState.spawnTimer = 0;

    document.getElementById('game-start-overlay')?.classList.add('hidden');
    document.getElementById('game-over-overlay')?.classList.add('hidden');

    updateFlappyHUD();

    cancelAnimationFrame(flappyAnimId);
    let lastTime = performance.now();

    function flappyLoop(now) {
      const dt = Math.min(0.04, (now - lastTime) / 1000);
      lastTime = now;

      if (flappyState.running) {
        try {
          updateFlappyPhysics(dt, canvas);
          renderFlappyScene(canvas);
        } catch (err) {
          console.error('Flappy error:', err);
        }
        flappyAnimId = requestAnimationFrame(flappyLoop);
      }
    }

    flappyAnimId = requestAnimationFrame(flappyLoop);
  }

  function updateFlappyPhysics(dt, canvas) {
    const b = flappyState.bird;

    // Nubes de fondo deslizándose suavemente
    flappyState.bgClouds.forEach(c => {
      c.x -= 15 * dt * c.s;
      if (c.x < -60) c.x = canvas.width + 50;
    });

    // MODO LEVITACIÓN PRE-VUELO: Si el jugador no ha tocado la pantalla, la mascota flota en el centro
    if (!flappyState.hasStartedFlight) {
      b.y = canvas.height * 0.42 + Math.sin(Date.now() * 0.005) * 6;
      b.vy = 0;
      b.rotation = Math.sin(Date.now() * 0.004) * 0.05;
      return;
    }

    // Física de caída y gravedad
    b.vy += b.gravity;
    b.y += b.vy;
    b.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, b.vy * 0.08));

    // Colisión con suelo o techo
    if (b.y + b.radius >= canvas.height - 18) {
      b.y = canvas.height - 18 - b.radius;
      endFlappyGame();
      return;
    }
    if (b.y - b.radius <= 0) {
      b.y = b.radius;
      b.vy = 0;
    }

    // Spawn de columnas de libros (obstáculos) solo tras haber iniciado el vuelo
    flappyState.spawnTimer += dt;
    const spawnRate = Math.max(1.6, 2.4 - Math.min(0.6, flappyState.score * 0.03));

    if (flappyState.spawnTimer >= spawnRate) {
      flappyState.spawnTimer = 0;
      spawnFlappyPillars(canvas);
    }

    // Velocidad de avance de las columnas
    const speed = 120 + Math.min(70, flappyState.score * 3.5);

    // Mover y verificar columnas
    for (let i = flappyState.pipes.length - 1; i >= 0; i--) {
      const p = flappyState.pipes[i];
      p.x -= speed * dt;

      // Colisión con la columna superior o inferior
      if (b.x + b.radius > p.x && b.x - b.radius < p.x + p.width) {
        if (b.y - b.radius < p.topHeight || b.y + b.radius > p.bottomY) {
          endFlappyGame();
          return;
        }
      }

      // Recolectar bocadito flotante entre las columnas
      if (p.hasCookie && !p.cookieCollected) {
        const distCookie = Math.hypot(b.x - (p.x + p.width / 2), b.y - p.cookieY);
        if (distCookie < b.radius + 16) {
          p.cookieCollected = true;
          flappyState.cookiesCollected += 1;
          playPointSound();
          spawnParticles(b.x, b.y, '#48BB78', 12);
          showFloatingText(b.x, b.y - 15, '+1 🍪', '#48BB78', 18);
          updateFlappyHUD();
        }
      }

      // Superar la columna con éxito
      if (p.x + p.width < b.x && !p.passed) {
        p.passed = true;
        flappyState.score += 1;
        playPointSound();
        spawnParticles(p.x + p.width, canvas.height / 2, '#ECC94B', 8);
        updateFlappyHUD();
      }

      // Eliminar columnas fuera de pantalla
      if (p.x + p.width < -20) {
        flappyState.pipes.splice(i, 1);
      }
    }

    // Actualizar partículas
    for (let i = flappyState.particles.length - 1; i >= 0; i--) {
      const pt = flappyState.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) flappyState.particles.splice(i, 1);
    }

    // Actualizar textos flotantes
    for (let i = flappyState.floatingTexts.length - 1; i >= 0; i--) {
      const ft = flappyState.floatingTexts[i];
      ft.y -= 35 * dt;
      ft.alpha -= dt * 1.2;
      if (ft.alpha <= 0) flappyState.floatingTexts.splice(i, 1);
    }
  }

  function spawnFlappyPillars(canvas) {
    const gap = Math.max(105, 128 - Math.min(20, flappyState.score * 0.8));
    const minTop = 45;
    const maxTop = canvas.height - gap - 65;
    const topHeight = minTop + Math.random() * (maxTop - minTop);
    const bottomY = topHeight + gap;
    const width = 54;

    const hasCookie = Math.random() < 0.45; // 45% de columnas tienen un bocadito flotante
    const cookieY = topHeight + gap / 2;

    flappyState.pipes.push({
      x: canvas.width + 10,
      width,
      topHeight,
      bottomY,
      passed: false,
      hasCookie,
      cookieCollected: false,
      cookieY
    });
  }

  function updateFlappyHUD() {
    const scoreEl = document.getElementById('game-score-display');
    const cookiesEl = document.getElementById('flappy-cookies-display');

    if (scoreEl) scoreEl.innerText = flappyState.score;
    if (cookiesEl) cookiesEl.innerText = `🍪 ${flappyState.cookiesCollected}`;
  }

  function renderFlappyScene(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Cielo Pastel
    const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGrad.addColorStop(0, '#EBF4FF');
    skyGrad.addColorStop(1, '#F7FAFC');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Nubes flotantes de fondo
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    flappyState.bgClouds.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 25 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x + 20 * c.s, c.y - 10 * c.s, 30 * c.s, 0, Math.PI * 2);
      ctx.arc(c.x + 45 * c.s, c.y, 22 * c.s, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. Columnas de Libros y Pilares Académicos (Obstáculos)
    flappyState.pipes.forEach((p, idx) => {
      const isAlt = idx % 2 === 0;
      const pipeColor = isAlt ? '#8B7CE6' : '#54B4D3';
      const capColor = isAlt ? '#7665DE' : '#3E9FB8';

      // Columna superior (Libros cayendo)
      ctx.fillStyle = pipeColor;
      ctx.beginPath();
      safeRoundRect(ctx, p.x, 0, p.width, p.topHeight, [0, 0, 6, 6]);
      ctx.fill();
      // Borde de libro
      ctx.fillStyle = capColor;
      ctx.fillRect(p.x - 3, Math.max(0, p.topHeight - 16), p.width + 6, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(p.x + 8, Math.max(0, p.topHeight - 12), p.width - 16, 2);

      // Columna inferior (Pila de libros)
      const bHeight = Math.max(0, canvas.height - p.bottomY);
      ctx.fillStyle = pipeColor;
      ctx.beginPath();
      safeRoundRect(ctx, p.x, p.bottomY, p.width, bHeight, [6, 6, 0, 0]);
      ctx.fill();
      // Borde de libro inferior
      ctx.fillStyle = capColor;
      ctx.fillRect(p.x - 3, p.bottomY, p.width + 6, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(p.x + 8, p.bottomY + 10, p.width - 16, 2);

      // Bocadito flotante 🍪
      if (p.hasCookie && !p.cookieCollected) {
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🍪', p.x + p.width / 2, p.cookieY);
      }
    });

    // 4. Suelo de césped suave
    ctx.fillStyle = '#48BB78';
    ctx.fillRect(0, canvas.height - 16, canvas.width, 16);
    ctx.fillStyle = '#38A169';
    ctx.fillRect(0, canvas.height - 16, canvas.width, 3);

    // 5. Partículas
    flappyState.particles.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // 6. Mascota Voladora (Personaje con inclinación y alas)
    const b = flappyState.bird;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rotation);

    // Sombra suave
    ctx.beginPath();
    ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
    ctx.fillStyle = appState.pet?.furColor || '#ECC94B';
    ctx.fill();
    ctx.strokeStyle = '#2D3748';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Alita aleteando
    const wingY = Math.sin(Date.now() * 0.02) * 5;
    ctx.beginPath();
    ctx.ellipse(-8, wingY, 9, 6, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fill();
    ctx.strokeStyle = '#2D3748';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Emoji de la especie
    const petEmoji = appState.pet?.species === 'cat' ? '🐱' :
                     appState.pet?.species === 'dog' ? '🐶' :
                     appState.pet?.species === 'owl' ? '🦉' :
                     appState.pet?.species === 'bunny' ? '🐰' : '🐻';

    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(petEmoji, 2, -2);
    ctx.restore();

    // 7. Textos flotantes
    flappyState.floatingTexts.forEach(ft => {
      ctx.save();
      ctx.font = `bold ${ft.size}px Nunito, sans-serif`;
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    // 8. Aviso flotante de inicio esperando el primer toque
    if (!flappyState.hasStartedFlight) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      safeRoundRect(ctx, canvas.width / 2 - 135, canvas.height * 0.42 + 45, 270, 36, [18, 18, 18, 18]);
      ctx.fill();
      ctx.strokeStyle = '#8B7CE6';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#2D3748';
      ctx.font = 'bold 13px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👆 ¡Toca la pantalla o Espacio para volar!', canvas.width / 2, canvas.height * 0.42 + 63);
      ctx.restore();
    }
  }

  function endFlappyGame() {
    flappyState.running = false;
    cancelAnimationFrame(flappyAnimId);
    playCrashSound();

    // Recompensa real: 1 bocadito cada 4 obstáculos + los bocaditos atrapados en el vuelo
    const snacksEarned = Math.floor(flappyState.score / 4) + flappyState.cookiesCollected;
    if (snacksEarned > 0 && appState.pet) {
      appState.pet.foodStock = (appState.pet.foodStock || 0) + snacksEarned;
      saveState();
      renderPetDisplay();
    }

    // Guardar récord si superó el anterior
    if (flappyState.score > flappyState.highScore) {
      flappyState.highScore = flappyState.score;
      localStorage.setItem('psicoplan_flappy_high', flappyState.score.toString());
      launchConfetti(true);
      showToast('🏆 ¡NUEVO RÉCORD DE VUELO ACADÉMICO!');
    }

    const finalScoreEl = document.getElementById('game-final-score');
    const finalSnacksEl = document.getElementById('game-final-snacks');
    const feedbackEl = document.getElementById('game-over-feedback');

    if (finalScoreEl) finalScoreEl.innerText = flappyState.score;
    if (finalSnacksEl) finalSnacksEl.innerText = `🍪 +${snacksEarned}`;

    if (feedbackEl) {
      if (flappyState.score >= 15) {
        feedbackEl.innerText = `¡Maestría en concentración! Tu mascota ${appState.pet?.name || ''} voló como profesional.`;
      } else if (flappyState.score >= 6) {
        feedbackEl.innerText = `¡Gran ritmo y control de reflejos! Esquivaste los distractores con soltura.`;
      } else {
        feedbackEl.innerText = `¡Buen vuelo! Con cada intento mejorarás tu ritmo y coordinación.`;
      }
    }

    const highDisplay = document.getElementById('game-high-score-display');
    if (highDisplay) highDisplay.innerText = `${flappyState.highScore}`;

    document.getElementById('game-over-overlay')?.classList.remove('hidden');
  }

  function startBreathingSession() {
    const actionText = document.getElementById('breath-action-text');
    const timerText = document.getElementById('breath-timer-text');
    const circle = document.getElementById('breath-circle-anim');
    const btn = document.getElementById('btn-start-breathing');

    if (breathingInterval) {
      clearInterval(breathingInterval);
      breathingInterval = null;
      btn.innerText = 'Iniciar Sesión';
      actionText.innerText = 'Listo';
      timerText.innerText = '';
      circle.className = 'breathing-circle-outer';
      return;
    }

    btn.innerText = 'Detener Pausa';
    let phase = 'inhale'; // inhale (4s), hold (7s), exhale (8s)
    let count = 4;

    actionText.innerText = 'Inhala';
    timerText.innerText = count;
    circle.classList.add('breathing-expand');

    breathingInterval = setInterval(() => {
      count--;
      timerText.innerText = count;

      if (count <= 0) {
        if (phase === 'inhale') {
          phase = 'hold';
          count = 7;
          actionText.innerText = 'Mantén';
          circle.classList.remove('breathing-expand');
        } else if (phase === 'hold') {
          phase = 'exhale';
          count = 8;
          actionText.innerText = 'Exhala';
          circle.classList.add('breathing-contract');
        } else {
          phase = 'inhale';
          count = 4;
          actionText.innerText = 'Inhala';
          circle.classList.remove('breathing-contract');
          circle.classList.add('breathing-expand');
        }
      }
    }, 1000);
  }

  // =========================================================================
  // 8. GESTIÓN DE TEMAS
  // =========================================================================
  function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    appState.settings.theme = themeName;

    // Sincronizar botones de tema
    document.querySelectorAll('[data-set-theme]').forEach(btn => {
      if (btn.getAttribute('data-set-theme') === themeName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    saveState();
  }

  // =========================================================================
  // 9. NAVEGACIÓN Y VISTAS
  // =========================================================================
  function switchView(viewName) {
    const views = ['inicio', 'wizard', 'minijuego', 'desempeno'];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.style.display = (v === viewName) ? 'block' : 'none';
    });

    document.querySelectorAll('[data-view]').forEach(btn => {
      if (btn.getAttribute('data-view') === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (viewName === 'minijuego') {
      setTimeout(initFlappyGame, 100);
    } else {
      flappyState.running = false;
      cancelAnimationFrame(flappyAnimId);
    }

    if (viewName === 'desempeno') {
      renderWeeklyChart();
    }
  }

  function setupWizardSteps() {
    const btnToStep3 = document.getElementById('btn-to-step-3');
    const btnBackTo2 = document.getElementById('btn-back-to-step-2');
    const btnGenerate = document.getElementById('btn-generate-plan');
    const btnCancel = document.getElementById('btn-cancel-wizard');
    const btnFinish = document.getElementById('btn-finish-plan');
    const btnScholar = document.getElementById('btn-scholar-search');

    const deadlineInput = document.getElementById('task-deadline-input');
    if (deadlineInput) {
      deadlineInput.min = new Date().toISOString().split('T')[0];
    }

    btnToStep3?.addEventListener('click', () => {
      const title = document.getElementById('task-title-input').value.trim();
      const course = document.getElementById('task-course-select').value;
      const deadline = document.getElementById('task-deadline-input').value;

      if (!title || !course || !deadline) {
        alert('Por favor completa todos los campos requeridos (*)');
        return;
      }

      currentWizardData = { title, course, deadline };
      document.getElementById('wizard-step-2').style.display = 'none';
      document.getElementById('wizard-step-3').style.display = 'block';
      updateStepperIndicator(3);
    });

    btnBackTo2?.addEventListener('click', () => {
      document.getElementById('wizard-step-3').style.display = 'none';
      document.getElementById('wizard-step-2').style.display = 'block';
      updateStepperIndicator(2);
    });

    btnGenerate?.addEventListener('click', async () => {
      currentWizardData.q1 = document.getElementById('q1-input').value.trim();
      currentWizardData.q2 = document.getElementById('q2-input').value.trim();
      currentWizardData.q3 = document.getElementById('q3-input').value.trim();

      document.getElementById('wizard-step-3').style.display = 'none';
      document.getElementById('ai-loading-box').style.display = 'block';

      const planResult = await generatePlanWithAI(currentWizardData);

      document.getElementById('ai-loading-box').style.display = 'none';
      document.getElementById('wizard-step-4').style.display = 'block';
      updateStepperIndicator(4);

      const newTask = {
        id: 'task_' + Date.now(),
        title: currentWizardData.title,
        course: currentWizardData.course,
        deadline: currentWizardData.deadline,
        createdAt: new Date().toISOString(),
        subtasks: planResult.subtareas.map((st, idx) => ({
          id: 'sub_' + idx,
          titulo: st.titulo,
          descripcion: st.descripcion,
          fecha_sugerida: st.fecha_sugerida,
          minutos_estimados: st.minutos_estimados || 30,
          completed: false
        })),
        tools: planResult.herramientas_recomendadas || []
      };

      appState.tasks.unshift(newTask);
      currentViewingTask = newTask;
      saveState();

      renderStep4Plan(newTask);
      launchConfetti();
    });

    btnCancel?.addEventListener('click', () => {
      resetWizard();
      switchView('inicio');
    });

    btnFinish?.addEventListener('click', () => {
      resetWizard();
      switchView('inicio');
    });

    btnScholar?.addEventListener('click', () => {
      if (currentViewingTask) {
        const query = encodeURIComponent(`${currentViewingTask.course} ${currentViewingTask.title}`);
        window.open(`https://scholar.google.com/scholar?q=${query}`, '_blank');
      }
    });
  }

  function updateStepperIndicator(stepNum) {
    const node2 = document.getElementById('step-node-2');
    const node3 = document.getElementById('step-node-3');
    const node4 = document.getElementById('step-node-4');

    [node2, node3, node4].forEach(n => n.classList.remove('active', 'completed'));

    if (stepNum === 2) {
      node2.classList.add('active');
    } else if (stepNum === 3) {
      node2.classList.add('completed');
      node3.classList.add('active');
    } else if (stepNum === 4) {
      node2.classList.add('completed');
      node3.classList.add('completed');
      node4.classList.add('active');
    }
  }

  function resetWizard() {
    document.getElementById('form-step-2')?.reset();
    document.getElementById('q1-input').value = '';
    document.getElementById('q2-input').value = '';
    document.getElementById('q3-input').value = '';
    document.getElementById('wizard-step-2').style.display = 'block';
    document.getElementById('wizard-step-3').style.display = 'none';
    document.getElementById('wizard-step-4').style.display = 'none';
    document.getElementById('ai-loading-box').style.display = 'none';
    updateStepperIndicator(2);
    currentWizardData = null;
  }

  function renderStep4Plan(task) {
    const listContainer = document.getElementById('subtasks-checklist-container');
    const toolsContainer = document.getElementById('tools-list-container');
    const progressBar = document.getElementById('plan-progress-bar');
    const progressPercent = document.getElementById('plan-progress-percent');

    if (!listContainer) return;
    listContainer.innerHTML = '';

    const completedCount = task.subtasks.filter(s => s.completed).length;
    const totalCount = task.subtasks.length;
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressPercent) progressPercent.innerText = `${pct}%`;

    task.subtasks.forEach((subtask) => {
      const item = document.createElement('div');
      item.className = `subtask-item ${subtask.completed ? 'completed' : ''}`;
      item.innerHTML = `
        <input type="checkbox" class="custom-checkbox" id="check-${subtask.id}" ${subtask.completed ? 'checked' : ''} aria-label="Marcar ${subtask.titulo}">
        <div style="flex: 1;">
          <label for="check-${subtask.id}" class="subtask-title" style="font-weight: 700; cursor: pointer; display: block;">
            ${subtask.titulo}
          </label>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0.2rem 0;">
            ${subtask.descripcion}
          </p>
          <div style="font-size: 0.75rem; color: var(--text-light); display: flex; gap: 0.75rem;">
            <span>📅 Sugerido: ${subtask.fecha_sugerida}</span>
            <span>⏱️ ~${subtask.minutos_estimados} min</span>
            <span style="color: var(--accent-green); font-weight: 700;">+1 Bocadito 🍪</span>
          </div>
        </div>
      `;

      const checkbox = item.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', () => {
        subtask.completed = checkbox.checked;
        if (subtask.completed) {
          addPoints(10, 1); // +10 puntos y +1 bocadito para la mascota
          launchConfetti();
          showToast('✨ ¡Paso terminado! +10 pts y +1 Bocadito 🍪 para tu mascota.');
        }
        if (task.subtasks.every(s => s.completed)) {
          addPoints(50, 3); // +50 puntos y +3 bocaditos
          launchConfetti(true);
          showToast('🏆 ¡Completaste toda la tarea! +50 pts y +3 Bocaditos 🍪.');
        }
        saveState();
        renderStep4Plan(task);
      });

      listContainer.appendChild(item);
    });

    if (toolsContainer) {
      toolsContainer.innerHTML = '';
      task.tools.forEach(tool => {
        const link = document.createElement('a');
        link.href = tool.enlace;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'tool-badge-link';
        link.innerHTML = `<span>🔗</span> <strong>${tool.nombre}:</strong> ${tool.para_que_sirve}`;
        toolsContainer.appendChild(link);
      });
    }
  }

  // =========================================================================
  // 10. RENDERIZADO DE INTERFAZ Y MASCOTA
  // =========================================================================
  function renderUI() {
    // Si no ha iniciado sesión, mostrar login neutro
    const loginView = document.getElementById('view-login');
    const appHeader = document.getElementById('app-header');
    const appBody = document.getElementById('app-body');
    const appNav = document.getElementById('app-bottom-nav');

    if (!appState.user.isLoggedIn) {
      if (loginView) loginView.style.display = 'flex';
      if (appHeader) appHeader.style.display = 'none';
      if (appBody) appBody.style.display = 'none';
      if (appNav) appNav.style.display = 'none';
      return;
    } else {
      if (loginView) loginView.style.display = 'none';
      if (appHeader) appHeader.style.display = 'flex';
      if (appBody) appBody.style.display = 'flex';
      if (appNav) appNav.style.display = 'flex';
    }

    // Si aún no tiene mascota, crear una
    if (!appState.pet) {
      appState.pet = createRandomPet();
    }

    const studentName = appState.user.name || 'Estudiante';
    const userLevel = calculateLevel(appState.user.points);

    // Actualizar datos de usuario
    const sideAvatar = document.getElementById('sidebar-user-avatar');
    if (sideAvatar) sideAvatar.innerText = studentName.charAt(0).toUpperCase();

    const sideName = document.getElementById('sidebar-user-name');
    if (sideName) sideName.innerText = studentName;

    const sideLvl = document.getElementById('sidebar-user-level');
    if (sideLvl) sideLvl.innerText = `Nivel: ${userLevel.name}`;

    const streakDays = document.getElementById('streak-days-count');
    if (streakDays) streakDays.innerText = appState.user.streak;

    const ptsBadge = document.getElementById('points-badge-quick');
    if (ptsBadge) ptsBadge.innerText = `✨ ${appState.user.points} pts`;

    // Panel Derecho
    const rightLvl = document.getElementById('right-panel-level');
    if (rightLvl) rightLvl.innerText = `Nivel: ${userLevel.name}`;

    const rightPts = document.getElementById('right-panel-points');
    if (rightPts) rightPts.innerText = `${appState.user.points} pts`;

    const xpPercent = Math.min(100, Math.round(((appState.user.points - userLevel.min) / (userLevel.next - userLevel.min)) * 100));
    const xpBar = document.getElementById('right-panel-xp-bar');
    if (xpBar) xpBar.style.width = `${Math.max(8, xpPercent)}%`;

    const nextLvlText = document.getElementById('right-panel-next-level');
    if (nextLvlText) {
      const remaining = Math.max(0, userLevel.next - appState.user.points);
      nextLvlText.innerText = `Faltan ${remaining} pts para el siguiente nivel`;
    }

    // Desempeño
    const statPts = document.getElementById('stats-total-points');
    if (statPts) statPts.innerText = appState.user.points;

    const statLvl = document.getElementById('stats-level-name');
    if (statLvl) statLvl.innerText = userLevel.name;

    const statMeals = document.getElementById('stats-meals-count');
    if (statMeals) statMeals.innerText = appState.user.mealsGiven || 0;

    // Renderizar Mascota
    renderPetDisplay();

    // Renderizar tareas activas
    renderTasksList();

    // Insignias
    renderBadges();

    // Alertas
    checkDeadlineAlerts();
  }

  function renderPetDisplay() {
    const pet = appState.pet;
    if (!pet) return;

    pet.mood = getPetMood(pet);

    // Nombres y especies
    const speciesLabels = {
      cat: 'Gatito Zen 🐱',
      dog: 'Perrito Guía 🐶',
      owl: 'Búho Sabio 🦉',
      bunny: 'Conejita Ágil 🐰',
      bear: 'Osito Calma 🐻'
    };

    const petNameEl = document.getElementById('pet-display-name');
    if (petNameEl) petNameEl.innerText = pet.name;

    const petSpeciesEl = document.getElementById('pet-species-name');
    if (petSpeciesEl) petSpeciesEl.innerText = `(${speciesLabels[pet.species] || 'Compañero'})`;

    // Render SVG
    const svgContainer = document.getElementById('pet-svg-display');
    if (svgContainer) {
      svgContainer.innerHTML = renderPetSVG(pet, null, 90);
    }

    // Miniatura en panel derecho
    const rightThumb = document.getElementById('right-panel-pet-thumb');
    if (rightThumb) {
      rightThumb.innerHTML = renderPetSVG(pet, null, 48);
    }

    const rightName = document.getElementById('right-pet-name');
    if (rightName) rightName.innerText = pet.name;

    const rightSnacks = document.getElementById('right-pet-snacks-count');
    if (rightSnacks) rightSnacks.innerText = `🍪 ${pet.foodStock} bocadito${pet.foodStock === 1 ? '' : 's'}`;

    const rightHunger = document.getElementById('right-pet-hunger-bar');
    if (rightHunger) rightHunger.style.width = `${pet.hunger}%`;

    // Badge de ánimo
    const moodEmojis = {
      starving: '🥺',
      sad: '😢',
      sleepy: '😴',
      happy: '😊',
      ecstatic: '🥳',
      zen: '🧘'
    };
    const moodBadge = document.getElementById('pet-mood-badge-icon');
    if (moodBadge) moodBadge.innerText = moodEmojis[pet.mood] || '😊';

    const rightMoodText = document.getElementById('right-pet-mood-text');
    if (rightMoodText) {
      const moodLabels = {
        starving: 'Hambriento 🥺',
        sad: 'Triste 😢',
        sleepy: 'Somnoliento 😴',
        happy: 'Feliz 😊',
        ecstatic: '¡Eufórico! 🥳',
        zen: 'Zen 🧘'
      };
      rightMoodText.innerText = moodLabels[pet.mood] || 'Feliz 😊';
    }

    // Barra de satisfacción
    const hungerPercent = document.getElementById('pet-hunger-percent');
    if (hungerPercent) hungerPercent.innerText = `${pet.hunger}%`;

    const hungerBar = document.getElementById('pet-hunger-bar');
    if (hungerBar) hungerBar.style.width = `${pet.hunger}%`;

    // Botón de comida y stock
    const stockBadge = document.getElementById('pet-food-stock-badge');
    if (stockBadge) stockBadge.innerText = `🍪 ${pet.foodStock}`;

    const feedBtn = document.getElementById('btn-feed-action');
    if (feedBtn) {
      feedBtn.disabled = (pet.foodStock <= 0);
    }

    // Frase de diálogo aleatoria
    const dialogueEl = document.getElementById('pet-dialogue-text');
    if (dialogueEl) {
      const phrases = PET_PHRASES[pet.mood] || PET_PHRASES.happy;
      dialogueEl.innerText = `"${phrases[Math.floor(Math.random() * phrases.length)]}"`;
    }
  }

  function givePetAdvice(forceAdvice = false) {
    if (!appState.pet) return;
    const dialogueEl = document.getElementById('pet-dialogue-text');
    if (!dialogueEl) return;

    let phrases = [];
    const mood = getPetMood(appState.pet);

    if (forceAdvice) {
      phrases = PET_PHRASES.advice;
    } else {
      if (mood === 'starving') {
        phrases = PET_PHRASES.starving;
      } else if (mood === 'sad') {
        phrases = PET_PHRASES.sad;
      } else {
        phrases = Math.random() < 0.4 ? PET_PHRASES.advice : (PET_PHRASES[mood] || PET_PHRASES.happy);
      }
    }

    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    dialogueEl.innerText = `"${randomPhrase}"`;

    const avatarWrapper = document.getElementById('btn-pet-avatar');
    if (avatarWrapper) {
      avatarWrapper.classList.remove('pet-bounce');
      void avatarWrapper.offsetWidth;
      avatarWrapper.classList.add('pet-bounce');
    }

    // Solo sonar si el usuario pidió el consejo manualmente con el botón
    if (forceAdvice) {
      playSweetChime();
    }
  }

  function renderTasksList() {
    const container = document.getElementById('tasks-list-container');
    const counter = document.getElementById('active-tasks-count');
    if (!container) return;

    container.innerHTML = '';
    const tasks = appState.tasks;

    if (counter) counter.innerText = `${tasks.length} tarea${tasks.length === 1 ? '' : 's'}`;

    if (tasks.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">🌱</span>
          <p style="font-weight: 700;">No tienes tareas pendientes todavía</p>
          <p style="font-size: 0.85rem; margin-top: 0.25rem;">Toca en <strong>Agregar tarea +</strong> para que la IA diseñe tu plan.</p>
        </div>
      `;
      return;
    }

    tasks.forEach(task => {
      const completedCount = task.subtasks.filter(s => s.completed).length;
      const totalCount = task.subtasks.length;
      const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      const card = document.createElement('div');
      card.className = 'task-item-card';
      card.innerHTML = `
        <div class="task-item-header">
          <span class="task-tag">${task.course}</span>
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">Entrega: ${task.deadline}</span>
        </div>
        <h4 style="font-size: 1.05rem; margin-bottom: 0.35rem;">${task.title}</h4>
        <div class="progress-container">
          <div class="progress-fill" style="width: ${pct}%;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
          <span style="font-size: 0.8rem; color: var(--text-muted);">${completedCount} de ${totalCount} pasos (${pct}%)</span>
          <button class="btn-secondary" style="padding: 0.4rem 0.85rem; font-size: 0.8rem; min-height: 36px;" data-open-task="${task.id}">
            Ver Plan →
          </button>
        </div>
      `;

      card.querySelector('[data-open-task]').addEventListener('click', () => {
        currentViewingTask = task;
        switchView('wizard');
        document.getElementById('wizard-step-2').style.display = 'none';
        document.getElementById('wizard-step-3').style.display = 'none';
        document.getElementById('wizard-step-4').style.display = 'block';
        updateStepperIndicator(4);
        renderStep4Plan(task);
      });

      container.appendChild(card);
    });
  }

  function renderBadges() {
    const container = document.getElementById('badges-container');
    if (!container) return;
    container.innerHTML = '';

    const allBadges = [
      { id: 'primer_paso', icon: '🌱', title: 'Primer Paso', desc: 'Iniciaste tu camino' },
      { id: 'nivel_aprendiz', icon: '📚', title: 'Aprendiz', desc: 'Alcanzaste 50 pts' },
      { id: 'racha_3', icon: '🔥', title: 'Racha 3 Días', desc: 'Consistencia activa' },
      { id: 'pet_friend', icon: '🐾', title: 'Amigo Fiel', desc: 'Alimentaste a tu mascota' }
    ];

    allBadges.forEach(b => {
      const unlocked = appState.user.badges.includes(b.id);
      const badgeDiv = document.createElement('div');
      badgeDiv.style.textAlign = 'center';
      badgeDiv.style.padding = '0.75rem';
      badgeDiv.style.borderRadius = 'var(--radius-md)';
      badgeDiv.style.background = unlocked ? 'var(--primary-light)' : 'var(--bg-subtle)';
      badgeDiv.style.opacity = unlocked ? '1' : '0.45';

      badgeDiv.innerHTML = `
        <span style="font-size: 1.8rem; display: block;">${b.icon}</span>
        <strong style="font-size: 0.75rem; display: block; margin-top: 0.25rem;">${b.title}</strong>
        <span style="font-size: 0.7rem; color: var(--text-muted);">${b.desc}</span>
      `;
      container.appendChild(badgeDiv);
    });
  }

  function renderWeeklyChart() {
    const canvas = document.getElementById('weekly-chart-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const values = days.map(d => appState.weeklyActivity[d] || 0);
    const maxValue = Math.max(5, ...values);

    const padding = 35;
    const chartHeight = height - padding * 2;
    const barWidth = 32;
    const gap = (width - padding * 2 - (barWidth * days.length)) / (days.length - 1);

    days.forEach((day, i) => {
      const val = values[i];
      const barH = (val / maxValue) * chartHeight;
      const x = padding + i * (barWidth + gap);
      const y = height - padding - barH;

      ctx.fillStyle = '#8B7CE6';
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [6, 6, 0, 0]);
      ctx.fill();

      ctx.fillStyle = '#718096';
      ctx.font = '12px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(day, x + barWidth / 2, height - 12);

      if (val > 0) {
        ctx.fillStyle = '#2D3748';
        ctx.font = 'bold 11px Nunito, sans-serif';
        ctx.fillText(val, x + barWidth / 2, y - 6);
      }
    });
  }

  function checkDeadlineAlerts() {
    const today = new Date();
    const urgentTasks = appState.tasks.filter(t => {
      const deadline = new Date(t.deadline);
      const diffHours = (deadline - today) / (1000 * 60 * 60);
      const isPending = t.subtasks.some(s => !s.completed);
      return diffHours > 0 && diffHours <= 48 && isPending;
    });

    const notifBadge = document.getElementById('notif-badge');
    const notifList = document.getElementById('notif-list-container');

    if (notifBadge) {
      notifBadge.style.display = urgentTasks.length > 0 ? 'block' : 'none';
    }

    if (notifList) {
      if (urgentTasks.length === 0) {
        notifList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">No tienes entregas urgentes en las próximas 48 horas. ¡Vas al día! 🌸</p>`;
      } else {
        notifList.innerHTML = urgentTasks.map(t => `
          <div style="background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem; margin-bottom: 0.65rem;">
            <strong style="display: block;">⚠️ Entrega próxima: ${t.title}</strong>
            <span style="font-size: 0.8rem; color: var(--text-muted);">Fecha límite: ${t.deadline} (${t.course})</span>
          </div>
        `).join('');
      }
    }
  }

  // =========================================================================
  // 11. MODAL DE PERSONALIZACIÓN DE MASCOTA
  // =========================================================================
  let petCustomTemp = null;

  function openCustomizePetModal() {
    if (!appState.pet) return;
    petCustomTemp = JSON.parse(JSON.stringify(appState.pet));

    const nameInput = document.getElementById('custom-pet-name-input');
    const speciesSelect = document.getElementById('custom-pet-species-select');
    const outfitSelect = document.getElementById('custom-pet-outfit-select');
    const paletteContainer = document.getElementById('fur-color-palette');

    if (nameInput) nameInput.value = petCustomTemp.name;
    if (speciesSelect) speciesSelect.value = petCustomTemp.species;
    if (outfitSelect) outfitSelect.value = petCustomTemp.outfit;

    // Paleta de colores
    if (paletteContainer) {
      paletteContainer.innerHTML = '';
      FUR_COLORS.forEach(c => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.width = '36px';
        btn.style.height = '36px';
        btn.style.borderRadius = '50%';
        btn.style.backgroundColor = c.id;
        btn.style.border = (c.id === petCustomTemp.furColor) ? '3px solid #2D3748' : '1.5px solid #CBD5E0';
        btn.style.cursor = 'pointer';
        btn.title = c.name;

        btn.onclick = () => {
          petCustomTemp.furColor = c.id;
          paletteContainer.querySelectorAll('button').forEach(b => b.style.border = '1.5px solid #CBD5E0');
          btn.style.border = '3px solid #2D3748';
          updateCustomPetPreview();
        };

        paletteContainer.appendChild(btn);
      });
    }

    updateCustomPetPreview();
    document.getElementById('customize-pet-modal')?.classList.add('active');
  }

  function updateCustomPetPreview() {
    const previewBox = document.getElementById('custom-pet-preview-box');
    if (!previewBox || !petCustomTemp) return;
    previewBox.innerHTML = renderPetSVG(petCustomTemp, 'happy', 100);
  }

  // =========================================================================
  // 12. CONFIGURACIÓN DE EVENTOS
  // =========================================================================
  function setupEvents() {
    // 1. Navegación
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-view');
        if (targetView === 'wizard') resetWizard();
        switchView(targetView);
      });
    });

    document.getElementById('btn-start-wizard')?.addEventListener('click', () => {
      resetWizard();
      switchView('wizard');
    });

    // 2. Login Tabs y Envío
    const tabLogin = document.getElementById('tab-login-btn');
    const tabRegister = document.getElementById('tab-register-btn');
    const groupName = document.getElementById('group-name');
    let isRegisterMode = false;

    tabLogin?.addEventListener('click', () => {
      isRegisterMode = false;
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      groupName.style.display = 'none';
      document.getElementById('btn-submit-auth').innerText = 'Entrar a PsicoPlan →';
    });

    tabRegister?.addEventListener('click', () => {
      isRegisterMode = true;
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      groupName.style.display = 'block';
      document.getElementById('btn-submit-auth').innerText = 'Crear Cuenta y Mascota →';
    });

    // Tema en login
    document.querySelectorAll('#login-theme-picker [data-set-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.getAttribute('data-set-theme'));
      });
    });

    // Enviar Login/Registro con Correo y Contraseña
    document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email-input').value.trim();
      const password = document.getElementById('login-password-input').value;
      const name = isRegisterMode ? (document.getElementById('login-name-input').value.trim() || email.split('@')[0]) : (email.split('@')[0] || 'Estudiante');

      if (!email || !password) {
        showToast('Por favor completa tu correo y contraseña');
        return;
      }

      if (isFirebaseReady && firebaseAuth) {
        if (isRegisterMode) {
          try {
            const userCred = await firebaseAuth.createUserWithEmailAndPassword(email, password);
            if (name) {
              await userCred.user.updateProfile({ displayName: name });
            }
            // Enviar verificación de correo obligatoria
            await userCred.user.sendEmailVerification();
            showEmailVerificationPrompt({ email }, true);
            // Salir de sesión inmediatamente hasta que el usuario confirme su correo
            await firebaseAuth.signOut();
            showToast('✉️ Correo de verificación enviado');
            tabLogin?.click();
          } catch (err) {
            console.error('Error Registro Firebase:', err);
            if (err.code === 'auth/email-already-in-use') {
              showToast('Este correo ya está registrado. Inicia sesión.');
            } else if (err.code === 'auth/weak-password') {
              showToast('La contraseña debe tener al menos 6 caracteres');
            } else if (err.code === 'auth/invalid-email') {
              showToast('El formato del correo es inválido');
            } else {
              showToast('Error: ' + (err.message || 'Verifica los datos'));
            }
          }
        } else {
          try {
            const userCred = await firebaseAuth.signInWithEmailAndPassword(email, password);
            if (!userCred.user.emailVerified) {
              showEmailVerificationPrompt(userCred.user, false);
              await firebaseAuth.signOut();
            } else {
              appState.user.isLoggedIn = true;
              appState.user.uid = userCred.user.uid;
              appState.user.email = userCred.user.email;
              appState.user.name = userCred.user.displayName || email.split('@')[0] || 'Estudiante';
              await loadUserFromFirestore(userCred.user.uid);
              saveState();
              showToast(`¡Bienvenido/a, ${appState.user.name}!`);
              switchView('inicio');
            }
          } catch (err) {
            console.error('Error Login Firebase:', err);
            showToast('Correo o contraseña incorrectos');
          }
        }
      } else {
        // Modo demo local sin backend
        appState.user.isLoggedIn = true;
        appState.user.email = email;
        appState.user.name = name || 'Estudiante';
        if (!appState.pet) {
          appState.pet = createRandomPet();
        }
        saveState();
        showToast(`¡Bienvenido/a, ${appState.user.name}!`);
        switchView('inicio');
      }
    });

    // Botones de autenticación con Google y Facebook
    document.getElementById('btn-auth-google')?.addEventListener('click', loginWithGoogle);
    document.getElementById('btn-auth-facebook')?.addEventListener('click', loginWithFacebook);

    // Botones de alerta de verificación de correo
    document.getElementById('btn-resend-verif')?.addEventListener('click', resendEmailVerification);
    document.getElementById('btn-dismiss-verif')?.addEventListener('click', () => {
      const box = document.getElementById('email-verification-alert');
      if (box) box.style.display = 'none';
    });

    // 3. Mascota: Alimentar, Personalizar y Pedir Consejos
    document.getElementById('btn-feed-action')?.addEventListener('click', feedPet);
    document.getElementById('btn-pet-avatar')?.addEventListener('click', () => {
      // Si tiene hambre lo alimenta, si no le da un consejo motivador
      if (appState.pet && appState.pet.hunger < 40 && appState.pet.foodStock > 0) {
        feedPet();
      } else {
        givePetAdvice(false);
      }
    });

    document.getElementById('btn-pet-advice')?.addEventListener('click', () => givePetAdvice(true));
    document.getElementById('pet-dialogue-text')?.addEventListener('click', () => givePetAdvice(false));

    document.getElementById('btn-open-customize-pet')?.addEventListener('click', openCustomizePetModal);
    document.getElementById('btn-close-custom-pet')?.addEventListener('click', () => {
      document.getElementById('customize-pet-modal')?.classList.remove('active');
    });

    document.getElementById('custom-pet-name-input')?.addEventListener('input', (e) => {
      if (petCustomTemp) {
        petCustomTemp.name = e.target.value.trim() || 'Mascota';
        updateCustomPetPreview();
      }
    });

    document.getElementById('custom-pet-species-select')?.addEventListener('change', (e) => {
      if (petCustomTemp) {
        petCustomTemp.species = e.target.value;
        updateCustomPetPreview();
      }
    });

    document.getElementById('custom-pet-outfit-select')?.addEventListener('change', (e) => {
      if (petCustomTemp) {
        petCustomTemp.outfit = e.target.value;
        updateCustomPetPreview();
      }
    });

    document.getElementById('btn-save-custom-pet')?.addEventListener('click', () => {
      if (petCustomTemp) {
        appState.pet = JSON.parse(JSON.stringify(petCustomTemp));
        saveState();
        document.getElementById('customize-pet-modal')?.classList.remove('active');
        showToast('🎨 ¡Mascota actualizada con éxito!');
      }
    });

    // 4. Minijuego: Flappy Pet y Respiración
    document.getElementById('btn-start-arcade')?.addEventListener('click', startFlappyGame);
    document.getElementById('btn-restart-arcade')?.addEventListener('click', startFlappyGame);

    document.getElementById('btn-toggle-game-mode')?.addEventListener('click', () => {
      const modeArcade = document.getElementById('mode-arcade-game');
      const modeBreathing = document.getElementById('mode-breathing-478');
      const btn = document.getElementById('btn-toggle-game-mode');

      if (gameMode === 'arcade') {
        gameMode = 'breathing';
        flappyState.running = false;
        cancelAnimationFrame(flappyAnimId);
        if (modeArcade) modeArcade.style.display = 'none';
        if (modeBreathing) modeBreathing.style.display = 'block';
        btn.innerText = 'Flappy Pet 🚀';
      } else {
        gameMode = 'arcade';
        if (modeArcade) modeArcade.style.display = 'block';
        if (modeBreathing) modeBreathing.style.display = 'none';
        btn.innerText = 'Modo Respiración 🧘';
        setTimeout(initFlappyGame, 50);
      }
    });

    document.getElementById('btn-start-breathing')?.addEventListener('click', startBreathingSession);

    // 5. Selector de temas
    const themeModal = document.getElementById('theme-modal');
    document.getElementById('theme-selector-btn')?.addEventListener('click', () => {
      themeModal?.classList.add('active');
    });
    document.getElementById('btn-close-theme-modal')?.addEventListener('click', () => {
      themeModal?.classList.remove('active');
    });

    document.querySelectorAll('#in-app-theme-picker [data-set-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.getAttribute('data-set-theme'));
        themeModal?.classList.remove('active');
        showToast('Tema visual actualizado');
      });
    });

    // 6. Configuración y Perfil
    const settingsModal = document.getElementById('settings-modal');
    const apiInput = document.getElementById('gemini-api-input');

    document.getElementById('settings-btn')?.addEventListener('click', () => {
      if (apiInput) apiInput.value = appState.settings.geminiApiKey || '';
      settingsModal?.classList.add('active');
    });
    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      settingsModal?.classList.remove('active');
    });
    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
      appState.settings.geminiApiKey = apiInput.value.trim();
      saveState();
      settingsModal?.classList.remove('active');
      showToast('Configuración guardada exitosamente');
    });

    // Modal Perfil y Logout
    const profileModal = document.getElementById('profile-modal');
    const profileName = document.getElementById('profile-name-input');
    const profileEmail = document.getElementById('profile-email-input');

    document.getElementById('user-menu-btn')?.addEventListener('click', () => {
      if (profileName) profileName.value = appState.user.name || '';
      if (profileEmail) profileEmail.value = appState.user.email || '';
      profileModal?.classList.add('active');
    });
    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
      profileModal?.classList.remove('active');
    });
    document.getElementById('btn-save-profile')?.addEventListener('click', () => {
      if (profileName.value.trim()) appState.user.name = profileName.value.trim();
      appState.user.email = profileEmail.value.trim();
      saveState();
      profileModal?.classList.remove('active');
      showToast('Perfil actualizado');
    });

    // Cerrar sesión
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      profileModal?.classList.remove('active');
      if (isFirebaseReady && firebaseAuth) {
        await firebaseAuth.signOut();
      }
      appState.user.isLoggedIn = false;
      saveState();
      showToast('Has cerrado sesión');
    });

    // Notificaciones
    const notifModal = document.getElementById('notif-modal');
    document.getElementById('notif-bell-btn')?.addEventListener('click', () => {
      checkDeadlineAlerts();
      notifModal?.classList.add('active');
    });
    document.getElementById('btn-close-notif')?.addEventListener('click', () => {
      notifModal?.classList.remove('active');
    });
  }

  // Inicialización
  document.addEventListener('DOMContentLoaded', () => {
    // Aplicar tema guardado
    if (appState.settings && appState.settings.theme) {
      document.documentElement.setAttribute('data-theme', appState.settings.theme);
    }

    setupEvents();
    setupWizardSteps();
    initFirebaseServices();
    renderUI();

    // La mascota habla periódicamente (cada 40s) para dar consejos, avisar hambre o tristeza por tareas pausadas
    setInterval(() => {
      if (appState.user.isLoggedIn && appState.pet) {
        givePetAdvice(false);
      }
    }, 40000);
  });

})();
