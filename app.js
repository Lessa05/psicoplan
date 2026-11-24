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

  function getDefaultState(uid = '') {
    return {
      user: {
        isLoggedIn: false,
        uid: uid,
        name: 'Estudiante',
        email: '',
        points: 0,
        streak: 1,
        lastActiveDate: new Date().toISOString().split('T')[0],
        badges: ['primer_paso'],
        mealsGiven: 0,
        hasSeenTutorial: false,
        hasAdoptedPet: false
      },
      pet: null,
      tasks: [],
      weeklyActivity: {
        'Lun': 0, 'Mar': 0, 'Mié': 0, 'Jue': 0, 'Vie': 0, 'Sáb': 0, 'Dom': 0
      },
      settings: {
        theme: 'pastel',
        geminiApiKey: ''
      }
    };
  }

  function getStorageKey(uid) {
    return uid ? `psicoplan_state_${uid}` : 'psicoplan_state_guest';
  }

  function loadState(uid = '') {
    try {
      const activeUid = uid || '';
      const key = getStorageKey(activeUid);
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        checkDailyStreak(parsed);
        return parsed;
      }
    } catch (e) {
      console.warn('Error al leer de localStorage', e);
    }
    return getDefaultState(uid);
  }

  let appState = loadState();
  let currentWizardData = null;
  let currentViewingTask = null;

  // Variables de Firebase & Firestore
  let firebaseAuth = null;
  let firestoreDb = null;
  let isFirebaseReady = false;
  let pendingVerificationUser = null;

  // Variables de Gestión de Tareas y Adjuntos
  let editingTaskId = null;
  let editingAttachments = [];
  let wizardAttachments = [];

  // Variables del Tutorial
  let currentTutorialStep = 0;

  // Variables de Adopción de Mascota
  let selectedSpecies = 'bear';
  let selectedFurColor = '#ECC94B';

  // Variables del Minijuego
  let gameMode = 'arcade'; // 'arcade' o 'breathing'
  let zenPoints = 0;
  let bubbles = [];
  let bubbleAnimId = null;
  let breathingInterval = null;

  function saveState() {
    try {
      const key = getStorageKey(appState?.user?.uid);
      localStorage.setItem(key, JSON.stringify(appState));
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
              const alertBox = document.getElementById('email-verification-alert');
              if (alertBox) alertBox.style.display = 'none';

              // Cargar estado aislado para este usuario específico
              appState = loadState(user.uid);
              appState.user.isLoggedIn = true;
              appState.user.uid = user.uid;
              appState.user.email = user.email || '';
              if (!appState.user.name || appState.user.name === 'Estudiante') {
                appState.user.name = user.displayName || (user.email ? user.email.split('@')[0] : 'Estudiante');
              }

              await loadUserFromFirestore(user.uid);
              saveState();
              switchView('inicio');

              // Flujo inicial para usuarios nuevos
              checkFirstTimeUserFlow();
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
      if (titleEl) titleEl.innerText = '¡Cuenta creada! Confirma tu correo';
      if (descEl) descEl.innerText = `Enviamos un enlace de verificación a ${user.email}. Por favor haz clic en él para validar que el correo existe y poder entrar.`;
    } else {
      if (titleEl) titleEl.innerText = 'Correo pendiente de verificación';
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
        showToast('Correo de verificación reenviado con éxito');
      } else {
        showToast('Inicia sesión para reenviar el enlace');
      }
    } catch (err) {
      showToast('Espera unos instantes antes de reenviar otro correo');
    }
  }

  async function loginWithGoogle() {
    if (!isFirebaseReady || !firebaseAuth) {
      showToast('Configura tus credenciales de Firebase en config.js para usar Google');
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
      showToast('Configura tus credenciales de Firebase en config.js para usar Facebook');
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
        if (data.hasSeenTutorial !== undefined) appState.user.hasSeenTutorial = data.hasSeenTutorial;
        if (data.hasAdoptedPet !== undefined) appState.user.hasAdoptedPet = data.hasAdoptedPet;
      } else {
        // Nuevo usuario limpio: NO hereda puntos ni comida de sesiones previas
        if (!appState.pet) {
          appState.pet = createRandomPet();
        }
        await docRef.set({
          name: appState.user.name,
          email: appState.user.email,
          pet: appState.pet,
          tasks: [],
          points: 0,
          streak: 1,
          hasSeenTutorial: false,
          hasAdoptedPet: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.warn('Error leyendo Firestore:', e);
    }
  }

  async function syncStateToFirestore() {
    if (!firestoreDb || !appState.user.uid || !appState.user.isLoggedIn) return;
    try {
      await firestoreDb.collection('users').doc(appState.user.uid).set({
        name: appState.user.name,
        email: appState.user.email,
        pet: appState.pet,
        tasks: appState.tasks,
        points: appState.user.points,
        streak: appState.user.streak,
        settings: appState.settings,
        hasSeenTutorial: appState.user.hasSeenTutorial || false,
        hasAdoptedPet: appState.user.hasAdoptedPet || false,
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
      hunger: 100, // Comienza 100% satisfecho para cada usuario nuevo
      foodStock: 0, // Inicia con 0 galletitas para ganarlas con esfuerzo real
      mood: 'happy',
      hungerAlertSent: false,
      lastFedTimestamp: Date.now()
    };
  }

  // Comprobación de flujo para usuarios que ingresan por primera vez
  function checkFirstTimeUserFlow() {
    if (!appState.user.hasAdoptedPet) {
      setTimeout(openPetAdoptionModal, 400);
    } else if (!appState.user.hasSeenTutorial) {
      setTimeout(openTutorialModal, 400);
    }
  }

  // Decremento gradual de satisfacción y guardia de notificaciones de hambre
  function checkPetHungerDecay() {
    if (!appState.user.isLoggedIn || !appState.pet) return;
    const now = Date.now();
    appState.pet.lastFedTimestamp = appState.pet.lastFedTimestamp || now;
    const elapsedMinutes = (now - appState.pet.lastFedTimestamp) / (1000 * 60);

    // Cada 40 minutos baja un 5% de satisfacción hasta un piso seguro de 25%
    if (elapsedMinutes >= 40) {
      const dropCount = Math.floor(elapsedMinutes / 40);
      appState.pet.hunger = Math.max(25, appState.pet.hunger - (dropCount * 5));
      appState.pet.lastFedTimestamp = now;
      appState.pet.mood = getPetMood(appState.pet);

      // Notificación de hambre sólo una vez cuando desciende a 40% o menos
      if (appState.pet.hunger <= 40 && !appState.pet.hungerAlertSent) {
        appState.pet.hungerAlertSent = true;
        showToast(`¡${appState.pet.name} tiene hambre! (Satisfacción al ${appState.pet.hunger}%). Dale un bocadito.`);
      }
      saveState();
    }
  }

  // =========================================================================
  // TUTORIAL DE BIENVENIDA (7 PASOS)
  // =========================================================================
  const TUTORIAL_SLIDES = [
    {
      icon: '<svg class="ui-icon ui-icon-xl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z"/></svg>',
      title: '¡Bienvenido/a a PsicoPlan!',
      desc: 'Tu plataforma de bienestar y organización universitaria para superar la procrastinación combinando psicología aplicada, inteligencia artificial y gamificación con tu mascota.'
    },
    {
      icon: '<svg class="ui-icon ui-icon-xl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      title: 'Registra tus Tareas Académicas',
      desc: 'Ingresa los temas de tus trabajos, asignaturas y fechas de entrega. Además, ahora puedes adjuntar documentos en PDF, Word o fotos con tus rúbricas y apuntes.'
    },
    {
      icon: '<svg class="ui-icon ui-icon-xl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><circle cx="15" cy="9" r="2"/><path d="m8 15 8 0"/></svg>',
      title: 'Asistente de Inteligencia Artificial',
      desc: 'Responde 3 preguntas sencillas y nuestra IA dividirá tu tarea en subtareas manejables, recomendando lecturas académicas, normas APA y herramientas de psicología.'
    },
    {
      icon: '<svg class="ui-icon ui-icon-xl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
      title: 'Tu Plan de Actividades a Medida',
      desc: 'Monitorea tu avance paso a paso con una barra de progreso en tiempo real. Cada paso te acerca a tu meta académica sin ansiedad ni bloqueos mentales.'
    },
    {
      icon: '<svg class="ui-icon ui-icon-xl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="4" cy="9" r="2"/><path d="M11.5 8a5.5 5.5 0 0 0-5.5 5.5c0 1.5.8 3 2.5 3.5 1.5.5 2 1.5 3 1.5s1.5-1 3-1.5c1.7-.5 2.5-2 2.5-3.5A5.5 5.5 0 0 0 11.5 8z"/></svg>',
      title: 'Tu Mascota y Compañero Emocional',
      desc: 'Tu compañero refleja tu ritmo de estudio. Si dejas tus actividades de lado, su satisfacción disminuye paulatinamente. ¡Cuídalo y mantenlo feliz!'
    },
    {
      icon: '<svg class="ui-icon ui-icon-xl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/><circle cx="12" cy="15" r="1" fill="currentColor"/></svg>',
      title: 'Galletas y Recompensas Equitativas',
      desc: 'Las galletas y puntos de experiencia se ganan completando subtareas según su esfuerzo y tiempo estimado, o jugando Neuro-Catch en la sección de pausa activa.'
    },
    {
      icon: '<svg class="ui-icon ui-icon-xl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
      title: 'Racha Diaria y Subida de Nivel',
      desc: 'Estudia día a día para acumular rachas de disciplina, desbloquear insignias y alcanzar el rango de Maestro Zen. ¡Comienza hoy tu semestre con éxito!'
    }
  ];

  function openTutorialModal() {
    currentTutorialStep = 0;
    renderTutorialSlide();
    document.getElementById('tutorial-modal')?.classList.add('active');
  }

  function closeTutorialModal() {
    document.getElementById('tutorial-modal')?.classList.remove('active');
    if (appState.user && !appState.user.hasSeenTutorial) {
      appState.user.hasSeenTutorial = true;
      saveState();
    }
  }

  function renderTutorialSlide() {
    const slide = TUTORIAL_SLIDES[currentTutorialStep];
    const total = TUTORIAL_SLIDES.length;
    const counterEl = document.getElementById('tutorial-step-counter');
    const fillEl = document.getElementById('tutorial-progress-fill');
    const contentEl = document.getElementById('tutorial-slide-content');
    const prevBtn = document.getElementById('btn-tutorial-prev');
    const nextBtn = document.getElementById('btn-tutorial-next');
    const dotsContainer = document.getElementById('tutorial-dots-container');

    if (counterEl) counterEl.innerText = `Paso ${currentTutorialStep + 1} de ${total}`;
    if (fillEl) fillEl.style.width = `${((currentTutorialStep + 1) / total) * 100}%`;

    if (contentEl && slide) {
      contentEl.innerHTML = `
        <div class="tutorial-slide-icon">${slide.icon}</div>
        <h3 class="tutorial-slide-title">${slide.title}</h3>
        <p class="tutorial-slide-desc">${slide.desc}</p>
      `;
    }

    if (prevBtn) {
      prevBtn.style.visibility = currentTutorialStep > 0 ? 'visible' : 'hidden';
    }

    if (nextBtn) {
      nextBtn.innerText = currentTutorialStep === total - 1 ? '¡Comenzar!' : 'Siguiente →';
    }

    if (dotsContainer) {
      dotsContainer.innerHTML = '';
      for (let i = 0; i < total; i++) {
        const dot = document.createElement('div');
        dot.className = `tutorial-dot ${i === currentTutorialStep ? 'active' : ''}`;
        dotsContainer.appendChild(dot);
      }
    }
  }

  // =========================================================================
  // ADOPCIÓN INICIAL DE MASCOTA
  // =========================================================================
  function openPetAdoptionModal() {
    selectedSpecies = 'bear';
    selectedFurColor = '#ECC94B';
    const inputName = document.getElementById('adoption-name-input');
    if (inputName) inputName.value = 'Mimi';
    updateAdoptionPreview();
    document.getElementById('pet-adoption-modal')?.classList.add('active');
  }

  function closePetAdoptionModal() {
    document.getElementById('pet-adoption-modal')?.classList.remove('active');
  }

  function updateAdoptionPreview() {
    const speciesNames = {
      bear: 'Osito Calma',
      cat: 'Gatito Enfoque',
      dog: 'Perrito Ánimo',
      owl: 'Búho Sabio',
      bunny: 'Conejito Paz'
    };
    const avatarEl = document.getElementById('adoption-preview-avatar');
    const emojiEl = document.getElementById('adoption-preview-emoji');
    const nameEl = document.getElementById('adoption-preview-name');
    const speciesEl = document.getElementById('adoption-preview-species');
    const inputName = document.getElementById('adoption-name-input');

    const petName = inputName?.value.trim() || 'Mimi';
    if (avatarEl) {
      avatarEl.style.backgroundColor = 'transparent';
      avatarEl.innerHTML = renderPetSVG({
        species: selectedSpecies,
        furColor: selectedFurColor,
        outfit: selectedOutfit,
        name: petName
      }, null, 72);
    }
    if (nameEl) nameEl.innerText = petName;
    if (speciesEl) speciesEl.innerText = `(${speciesNames[selectedSpecies] || 'Compañero'})`;
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
      "¡Tengo mucha hambre! ¿Hacemos una subtarea para ganar un rico bocadito?",
      "Mi pancita hace ruidos... ¡termina un paso de tu plan y dame de comer!",
      "Necesito nutrientes para seguir acompañándote a estudiar"
    ],
    sad: [
      "Veo que dejamos pausada la tarea... ¡Hagamos aunque sea un pasito hoy!",
      "¡No procrastines! Recuerda que tu yo del futuro te agradecerá avanzar hoy.",
      "Extraño verte tachar tareas en tu checklist... ¡yo sé que eres muy capaz!",
      "A veces empezar es lo más difícil. Comprométete solo con 5 minutos hoy, ¡hazlo por ti y por mí!"
    ],
    sleepy: [
      "Un bostezo... ¿Será hora de una pausa activa de 5 minutos?",
      "Descansar la mente también forma parte del aprendizaje según la neurociencia."
    ],
    happy: [
      "¡Me siento genial! Listo para ayudarte a enfocar tus lecturas de psicología.",
      "Cada paso que das fortalece tus hábitos de estudio.",
      "Recuerda hidratarte y mantener una postura cómoda."
    ],
    ecstatic: [
      "¡Estoy súper feliz y motivado! Vamos a conquistar este semestre.",
      "¡Qué orgullo! Tu mente está trabajando a toda máquina."
    ],
    zen: [
      "Inhala profundamente... siente cómo tu cuerpo se relaja.",
      "La atención plena en el presente disipa la ansiedad del futuro."
    ],
    advice: [
      "Tip de psicología: La técnica de los 2 minutos dice que si empezar te cuesta, haz solo 2 minutos. ¡Casi siempre continúas!",
      "Neurociencia: Tu memoria de trabajo rinde mucho mejor si alejas el celular de tu campo visual.",
      "Psicología de hábitos: No esperes a tener motivación para empezar; la acción precede a la motivación.",
      "Ley de Yerkes-Dodson: Un nivel moderado de activación es óptimo; respira hondo si sientes nervios.",
      "Cada autor que citas y cada página que redactas te acerca a tu título de psicólogo/a!",
      "El descanso es productivo: 5 minutos de pausa cada 25 minutos restauran tu dopamina y concentración.",
      "Efecto Zeigárnik: Las tareas incompletas ocupan espacio mental. ¡Terminar un paso pequeño te dará paz mental inmediata!"
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
      showToast('No tienes bocaditos. ¡Completa subtareas para ganar más!');
      return;
    }

    appState.pet.foodStock -= 1;
    appState.pet.hunger = Math.min(100, appState.pet.hunger + 25);
    if (appState.pet.hunger > 40) {
      appState.pet.hungerAlertSent = false;
    }
    appState.pet.lastFedTimestamp = Date.now();
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
      heart.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="#E53E3E" stroke="#E53E3E" stroke-width="1"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
      heart.style.left = '45%';
      heart.style.top = '10%';
      avatarWrapper.appendChild(heart);
      setTimeout(() => heart.remove(), 1000);
    }

    playSweetChime();
    saveState();
    showToast(`¡Le diste un rico bocadito a ${appState.pet.name}!`);
  }

  // =========================================================================
  // 5. GAMIFICACIÓN: PUNTOS, NIVELES E INSIGNIAS
  // =========================================================================
  function calculateLevel(points) {
    if (points >= 500) return { name: 'Maestro', min: 500, next: 1000 };
    if (points >= 300) return { name: 'Experto', min: 300, next: 500 };
    if (points >= 150) return { name: 'Estudioso', min: 150, next: 300 };
    if (points >= 50) return { name: 'Aprendiz', min: 50, next: 150 };
    return { name: 'Novato', min: 0, next: 50 };
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
      showToast('¡Insignia desbloqueada: Nivel Aprendiz!');
    }
    if (appState.user.streak >= 3 && !appState.user.badges.includes('racha_3')) {
      appState.user.badges.push('racha_3');
      showToast('¡Insignia desbloqueada: Racha de 3 Días!');
    }

    if (newLevel.name !== prevLevel.name) {
      launchConfetti(true);
      showToast(`¡Subiste de Nivel a ${newLevel.name}!`);
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
  // 7. MINIJUEGO DINÁMICO: NEURO-CATCH (REFLEJOS, ATENCIÓN Y PSICOLOGÍA)
  // =========================================================================
  let neuroState = {
    running: false,
    score: 0,
    cookiesCollected: 0,
    lives: 3,
    combo: 0,
    flowMode: false,
    flowTimer: 0,
    highScore: parseInt(localStorage.getItem('psicoplan_neuro_high') || '0', 10),
    pet: {
      x: 180,
      y: 0,
      targetX: 180,
      vx: 0,
      width: 52,
      height: 52,
      facing: 1,
      hopOffset: 0,
      hopTimer: 0
    },
    zenCooldown: 0,
    zenWaves: [],
    items: [],
    particles: [],
    floatingTexts: [],
    neuralNodes: [],
    spawnTimer: 0,
    keys: { left: false, right: false }
  };

  let neuroAnimId = null;
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

  function playNeuroTone(freq, type = 'sine', duration = 0.15, gainVal = 0.12) {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (err) {}
  }

  function playDopamineSound() {
    playNeuroTone(587.33, 'triangle', 0.1, 0.14); // D5
    setTimeout(() => playNeuroTone(880, 'sine', 0.16, 0.15), 60); // A5
  }

  function playSerotoninSound() {
    playNeuroTone(523.25, 'sine', 0.12, 0.12); // C5
    setTimeout(() => playNeuroTone(659.25, 'sine', 0.14, 0.13), 80); // E5
    setTimeout(() => playNeuroTone(783.99, 'triangle', 0.22, 0.16), 160); // G5 (Galleta)
  }

  function playBookSound() {
    playNeuroTone(440, 'triangle', 0.1, 0.13);
    setTimeout(() => playNeuroTone(659.25, 'triangle', 0.18, 0.15), 70);
  }

  function playZenSound() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      [329.63, 440, 523.25, 659.25].forEach((freq, idx) => {
        setTimeout(() => playNeuroTone(freq, 'sine', 0.5, 0.08), idx * 80);
      });
    } catch (e) {}
  }

  function playStressHitSound() {
    playNeuroTone(146.83, 'sawtooth', 0.22, 0.18); // D3
  }

  function spawnParticles(x, y, color, count = 8, speedMult = 1) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5);
      const spd = (2 + Math.random() * 4) * speedMult;
      neuroState.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color,
        size: 3 + Math.random() * 3,
        alpha: 1,
        life: 0.6 + Math.random() * 0.4
      });
    }
  }

  function showFloatingText(x, y, text, color = '#FFFFFF', size = 15) {
    neuroState.floatingTexts.push({
      x,
      y,
      text,
      color,
      size,
      alpha: 1,
      vy: -1.4
    });
  }

  function initNeuralNodes(w, h) {
    neuroState.neuralNodes = [];
    const count = Math.min(24, Math.floor((w * h) / 14000));
    for (let i = 0; i < count; i++) {
      neuroState.neuralNodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: 2 + Math.random() * 2
      });
    }
  }

  function initFlappyGame() {
    // Reutiliza el canvas del minijuego para Neuro-Catch
    const canvas = document.getElementById('flappy-pet-canvas');
    if (!canvas) return;

    const wrapper = canvas.parentElement;
    if (wrapper) {
      canvas.width = wrapper.clientWidth || 360;
      canvas.height = wrapper.clientHeight || 450;
    }

    const highDisplay = document.getElementById('game-high-score-display');
    if (highDisplay) highDisplay.innerText = `${neuroState.highScore}`;

    initNeuralNodes(canvas.width, canvas.height);
    neuroState.pet.x = canvas.width / 2;
    neuroState.pet.targetX = canvas.width / 2;

    // Control táctil suave en celular
    const handleTouchMove = (e) => {
      if (!neuroState.running) return;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0] || e.changedTouches[0];
      if (touch) {
        const clientX = touch.clientX - rect.left;
        const scaleX = canvas.width / rect.width;
        neuroState.pet.targetX = Math.max(30, Math.min(canvas.width - 30, clientX * scaleX));
      }
    };

    canvas.addEventListener('touchstart', (e) => {
      if (e.target && e.target.closest('#game-start-overlay')) return;
      handleTouchMove(e);
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (!neuroState.running) return;
      handleTouchMove(e);
    }, { passive: true });

    // Control de mouse en PC
    canvas.addEventListener('mousemove', (e) => {
      if (!neuroState.running) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const clientX = (e.clientX - rect.left) * scaleX;
      neuroState.pet.targetX = Math.max(30, Math.min(canvas.width - 30, clientX));
    });

    // Clic o doble toque para activar la Onda Zen
    canvas.addEventListener('click', (e) => {
      if (e.target && e.target.closest('#game-start-overlay')) return;
      if (!neuroState.running) return;
      activateZenWave();
    });

    // Botón flotante móvil para la Onda Zen
    const zenBtn = document.getElementById('btn-touch-zen');
    if (zenBtn) {
      zenBtn.onclick = (e) => {
        e.stopPropagation();
        activateZenWave();
      };
    }

    // Teclado en PC: Flechas o A/D, y Espacio para Onda Zen
    window.onkeydown = (e) => {
      const minijuegoView = document.getElementById('view-minijuego');
      if (!minijuegoView || minijuegoView.style.display === 'none') return;
      if (!neuroState.running) return;

      if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        neuroState.keys.left = true;
      }
      if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        neuroState.keys.right = true;
      }
      if (e.code === 'Space' || e.key === ' ' || e.code === 'ArrowUp') {
        e.preventDefault();
        activateZenWave();
      }
    };

    window.onkeyup = (e) => {
      if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        neuroState.keys.left = false;
      }
      if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        neuroState.keys.right = false;
      }
    };
  }

  function activateZenWave() {
    if (!neuroState.running) return;
    if (neuroState.zenCooldown > 0) {
      showFloatingText(neuroState.pet.x, canvasHeight() - 75, 'Recargando...', '#A0AEC0', 12);
      return;
    }

    neuroState.zenCooldown = 180; // ~3 segundos de cooldown
    playZenSound();

    // Pulso expansivo
    neuroState.zenWaves.push({
      x: neuroState.pet.x,
      y: canvasHeight() - 40,
      radius: 20,
      maxRadius: 220,
      alpha: 1
    });

    // Pequeño salto feliz de la mascota
    neuroState.pet.hopOffset = 18;
    spawnParticles(neuroState.pet.x, canvasHeight() - 40, '#48BB78', 12, 1.2);
    showFloatingText(neuroState.pet.x, canvasHeight() - 80, '¡Onda Zen Activada! (-Estrés)', '#48BB78', 15);
  }

  function canvasHeight() {
    const c = document.getElementById('flappy-pet-canvas');
    return c ? c.height : 450;
  }

  function startFlappyGame() {
    getAudioContext();
    const canvas = document.getElementById('flappy-pet-canvas');
    if (!canvas) return;

    initFlappyGame();

    document.getElementById('game-start-overlay')?.classList.add('hidden');
    document.getElementById('game-over-overlay')?.classList.add('hidden');

    neuroState.running = true;
    neuroState.score = 0;
    neuroState.cookiesCollected = 0;
    neuroState.lives = 3;
    neuroState.combo = 0;
    neuroState.flowMode = false;
    neuroState.flowTimer = 0;
    neuroState.zenCooldown = 0;
    neuroState.zenWaves = [];
    neuroState.items = [];
    neuroState.particles = [];
    neuroState.floatingTexts = [];
    neuroState.spawnTimer = 0;
    neuroState.pet.x = canvas.width / 2;
    neuroState.pet.targetX = canvas.width / 2;
    neuroState.pet.hopOffset = 0;

    updateNeuroHUD();

    cancelAnimationFrame(neuroAnimId);
    let lastTime = performance.now();

    function neuroLoop(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (neuroState.running) {
        updateNeuroGame(dt, canvas);
        drawNeuroGame(canvas);
        neuroAnimId = requestAnimationFrame(neuroLoop);
      }
    }

    neuroAnimId = requestAnimationFrame(neuroLoop);
  }

  function updateNeuroGame(dt, canvas) {
    const p = neuroState.pet;

    // 1. Movimiento por teclado si se presionan teclas
    if (neuroState.keys.left) {
      p.targetX = Math.max(30, p.targetX - 320 * dt);
    }
    if (neuroState.keys.right) {
      p.targetX = Math.min(canvas.width - 30, p.targetX + 320 * dt);
    }

    // Suavizado cinético hacia targetX
    const dx = p.targetX - p.x;
    p.vx = dx * 10;
    p.x += p.vx * dt;
    if (Math.abs(dx) > 2) {
      p.facing = dx > 0 ? 1 : -1;
      p.hopTimer += dt * 14;
      p.hopOffset = Math.abs(Math.sin(p.hopTimer)) * 6;
    } else {
      p.hopOffset = Math.max(0, p.hopOffset - dt * 20);
    }

    // 2. Cooldown de la Onda Zen
    if (neuroState.zenCooldown > 0) {
      neuroState.zenCooldown -= dt * 60;
    }

    // 3. Estado de Flow Cognitivo
    if (neuroState.flowMode) {
      neuroState.flowTimer -= dt;
      if (neuroState.flowTimer <= 0) {
        neuroState.flowMode = false;
        showFloatingText(p.x, canvas.height - 70, 'Fin del Flow', '#A0AEC0', 13);
      }
    }

    // 4. Ondas Zen activas (purifican Cortisol)
    for (let i = neuroState.zenWaves.length - 1; i >= 0; i--) {
      const wave = neuroState.zenWaves[i];
      wave.radius += 260 * dt;
      wave.alpha = Math.max(0, 1 - wave.radius / wave.maxRadius);

      // Colisión de onda zen con cortisol
      neuroState.items.forEach(item => {
        if (item.type === 'cortisol' && !item.dissolved) {
          const dist = Math.hypot(item.x - wave.x, item.y - wave.y);
          if (dist <= wave.radius) {
            item.dissolved = true;
            spawnParticles(item.x, item.y, '#48BB78', 8);
            showFloatingText(item.x, item.y, '¡Estrés Disuelto! +5', '#48BB78', 13);
            neuroState.score += 5;
            updateNeuroHUD();
          }
        }
      });

      if (wave.radius >= wave.maxRadius || wave.alpha <= 0) {
        neuroState.zenWaves.splice(i, 1);
      }
    }

    // 5. Generación de estímulos psicológicos
    neuroState.spawnTimer += dt;
    const spawnInterval = Math.max(0.65, 1.25 - Math.min(0.55, neuroState.score * 0.003));
    if (neuroState.spawnTimer >= spawnInterval) {
      neuroState.spawnTimer = 0;
      spawnNeuroItem(canvas);
    }

    // 6. Caída y captura de estímulos
    const petHitBox = {
      x: p.x - 24,
      y: canvas.height - 62,
      w: 48,
      h: 50
    };

    const speedBase = 110 + Math.min(100, neuroState.score * 1.5);

    for (let i = neuroState.items.length - 1; i >= 0; i--) {
      const it = neuroState.items[i];
      it.y += (speedBase * it.speedMult) * dt;
      it.rotation += (it.rotSpeed || 0) * dt;

      // Colisión con la mascota
      const collided = (
        it.x >= petHitBox.x &&
        it.x <= petHitBox.x + petHitBox.w &&
        it.y >= petHitBox.y &&
        it.y <= petHitBox.y + petHitBox.h
      );

      if (collided && !it.dissolved) {
        handleItemCatch(it, p.x, petHitBox.y);
        neuroState.items.splice(i, 1);
        continue;
      }

      // Caída al fondo
      if (it.y > canvas.height - 20) {
        if (it.type !== 'cortisol' && !it.dissolved) {
          // Perder combo si se deja caer un estímulo positivo
          neuroState.combo = 0;
        }
        neuroState.items.splice(i, 1);
      }
    }

    // 7. Actualización de partículas y textos
    for (let i = neuroState.particles.length - 1; i >= 0; i--) {
      const pt = neuroState.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.life -= dt;
      if (pt.life <= 0) neuroState.particles.splice(i, 1);
    }

    for (let i = neuroState.floatingTexts.length - 1; i >= 0; i--) {
      const ft = neuroState.floatingTexts[i];
      ft.y += ft.vy;
      ft.alpha -= dt * 0.85;
      if (ft.alpha <= 0) neuroState.floatingTexts.splice(i, 1);
    }

    // 8. Nodos sinápticos en el fondo
    neuroState.neuralNodes.forEach(node => {
      node.x += node.vx;
      node.y += node.vy;
      if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
      if (node.y < 0 || node.y > canvas.height) node.vy *= -1;
    });
  }

  function spawnNeuroItem(canvas) {
    const r = Math.random();
    let type = 'dopamine';
    let label = 'Dopamina';
    let color = '#ED8936';
    let speedMult = 1.0;
    let radius = 13;

    if (r < 0.40) {
      type = 'dopamine';
      label = 'Dopamina';
      color = '#ECC94B';
      speedMult = 1.0;
    } else if (r < 0.65) {
      type = 'serotonin';
      label = 'Serotonina';
      color = '#4299E1';
      speedMult = 1.05;
    } else if (r < 0.82) {
      type = 'book';
      const books = ['DSM-5', 'Piaget', 'Freud', 'Vygotsky', 'APA 7ma'];
      label = books[Math.floor(Math.random() * books.length)];
      color = '#8B7CE6';
      speedMult = 0.95;
      radius = 16;
    } else {
      type = 'cortisol';
      label = 'Cortisol';
      color = '#E53E3E';
      speedMult = 1.15;
      radius = 14;
    }

    neuroState.items.push({
      x: 35 + Math.random() * (canvas.width - 70),
      y: -20,
      type,
      label,
      color,
      radius,
      speedMult,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 2,
      pulse: 0,
      dissolved: false
    });
  }

  function handleItemCatch(item, petX, petY) {
    const mult = neuroState.flowMode ? 2 : 1;

    if (item.type === 'dopamine') {
      playDopamineSound();
      const pts = 10 * mult;
      neuroState.score += pts;
      neuroState.combo += 1;
      spawnParticles(item.x, petY, '#ECC94B', 10);
      showFloatingText(item.x, petY - 15, `+${pts} Dopamina`, '#ECC94B', 14);
      checkFlowActivation();
    } else if (item.type === 'serotonin') {
      playSerotoninSound();
      const pts = 15 * mult;
      neuroState.score += pts;
      neuroState.cookiesCollected += 1;
      neuroState.combo += 1;
      spawnParticles(item.x, petY, '#4299E1', 12);
      showFloatingText(item.x, petY - 15, `+${pts} Serotonina (+1 Galleta)`, '#4299E1', 14);
      checkFlowActivation();
    } else if (item.type === 'book') {
      playBookSound();
      const pts = 25 * mult;
      neuroState.score += pts;
      neuroState.combo += 1;
      spawnParticles(item.x, petY, '#8B7CE6', 14);
      showFloatingText(item.x, petY - 15, `+${pts} ${item.label}`, '#8B7CE6', 15);
      checkFlowActivation();
    } else if (item.type === 'cortisol') {
      playStressHitSound();
      neuroState.lives -= 1;
      neuroState.combo = 0;
      neuroState.flowMode = false;
      spawnParticles(item.x, petY, '#E53E3E', 15, 1.3);
      showFloatingText(item.x, petY - 15, '¡Cortisol! -1 Atención', '#E53E3E', 15);

      if (neuroState.lives <= 0) {
        endFlappyGame();
      }
    }

    updateNeuroHUD();
  }

  function checkFlowActivation() {
    if (neuroState.combo >= 4 && !neuroState.flowMode) {
      neuroState.flowMode = true;
      neuroState.flowTimer = 7.0; // 7 segundos de Estado de Flow
      playZenSound();
      showFloatingText(neuroState.pet.x, canvasHeight() - 95, '¡ESTADO DE FLOW! (Puntos x2)', '#ECC94B', 17);
      spawnParticles(neuroState.pet.x, canvasHeight() - 50, '#ECC94B', 20, 1.5);
    }
  }

  function updateNeuroHUD() {
    const scoreEl = document.getElementById('game-score-display');
    const cookiesEl = document.getElementById('flappy-cookies-num');
    const livesEl = document.getElementById('game-lives-display');

    if (scoreEl) scoreEl.innerText = neuroState.score;
    if (cookiesEl) cookiesEl.innerText = neuroState.cookiesCollected;
    if (livesEl) {
      const dots = '● '.repeat(Math.max(0, neuroState.lives)).trim();
      livesEl.innerText = `${neuroState.lives}/3 ${dots}`;
      livesEl.style.color = neuroState.lives === 1 ? '#E53E3E' : (neuroState.lives === 2 ? '#DD6B20' : '#38A169');
    }
  }

  function drawNeuroGame(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Fondo dinámico de red neuronal cognitiva
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#1A202C');
    bgGrad.addColorStop(0.7, '#2D3748');
    bgGrad.addColorStop(1, '#171923');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Conexiones sinápticas sutiles
    ctx.lineWidth = 1;
    for (let i = 0; i < neuroState.neuralNodes.length; i++) {
      for (let j = i + 1; j < neuroState.neuralNodes.length; j++) {
        const n1 = neuroState.neuralNodes[i];
        const n2 = neuroState.neuralNodes[j];
        const dist = Math.hypot(n1.x - n2.x, n1.y - n2.y);
        if (dist < 90) {
          const alpha = (1 - dist / 90) * 0.18;
          ctx.strokeStyle = `rgba(139, 124, 230, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);
          ctx.stroke();
        }
      }
    }

    // Puntos de neuronas
    neuroState.neuralNodes.forEach(n => {
      ctx.fillStyle = 'rgba(237, 242, 247, 0.25)';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // 2. Ondas Zen expansivas (Mindfulness)
    neuroState.zenWaves.forEach(w => {
      ctx.save();
      ctx.strokeStyle = `rgba(72, 187, 120, ${w.alpha})`;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    // 3. Estímulos cayendo
    neuroState.items.forEach(it => {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rotation);

      if (it.type === 'book') {
        // Cuaderno / Libro académico
        ctx.fillStyle = it.color;
        ctx.fillRect(-15, -12, 30, 24);
        // Lomo y borde de páginas
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-13, -10, 26, 4);
        ctx.fillStyle = '#4A5568';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(it.label, 0, 7);
      } else if (it.type === 'cortisol') {
        // Nube de estrés espinosa
        ctx.fillStyle = '#E53E3E';
        ctx.beginPath();
        for (let a = 0; a < 8; a++) {
          const ang = (Math.PI / 4) * a;
          const rad = a % 2 === 0 ? it.radius : it.radius * 0.65;
          const px = Math.cos(ang) * rad;
          const py = Math.sin(ang) * rad;
          if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#9B2C2C';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Dopamina o Serotonina (Esfera brillante)
        const radGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, it.radius);
        radGrad.addColorStop(0, '#FFFFFF');
        radGrad.addColorStop(0.4, it.color);
        radGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(0, 0, it.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = it.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(it.type === 'dopamine' ? 'DA' : '5-HT', 0, 3);
      }

      ctx.restore();
    });

    // 4. Suelo de concentración
    const floorY = canvas.height - 24;
    ctx.fillStyle = '#2D3748';
    ctx.fillRect(0, floorY, canvas.width, 24);
    ctx.fillStyle = neuroState.flowMode ? '#ECC94B' : '#8B7CE6';
    ctx.fillRect(0, floorY, canvas.width, 2.5);

    // 5. Partículas
    neuroState.particles.forEach(pt => {
      ctx.save();
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 6. Mascota del Usuario en Acción
    const p = neuroState.pet;
    const petDrawY = floorY - 26 - p.hopOffset;

    ctx.save();
    ctx.translate(p.x, petDrawY);
    ctx.scale(p.facing, 1);

    // Aura dorada si está en Estado de Flow
    if (neuroState.flowMode) {
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#ECC94B';
      ctx.strokeStyle = '#ECC94B';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Cuerpo base
    const fur = appState.pet?.furColor || '#ECC94B';
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2D3748';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Orejitas según especie
    const sp = appState.pet?.species || 'bear';
    if (sp === 'cat') {
      ctx.fillStyle = fur;
      ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(-7, -24); ctx.lineTo(-2, -15); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, -14); ctx.lineTo(7, -24); ctx.lineTo(2, -15); ctx.fill(); ctx.stroke();
    } else if (sp === 'bunny') {
      ctx.fillStyle = fur;
      ctx.beginPath(); ctx.ellipse(-6, -26, 4, 12, -0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(6, -26, 4, 12, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (sp === 'owl') {
      ctx.fillStyle = '#ED8936';
      ctx.beginPath(); ctx.moveTo(-10, -16); ctx.lineTo(-6, -23); ctx.lineTo(-2, -16); ctx.fill();
      ctx.beginPath(); ctx.moveTo(10, -16); ctx.lineTo(6, -23); ctx.lineTo(2, -16); ctx.fill();
    } else {
      // Oso / Perro
      ctx.fillStyle = fur;
      ctx.beginPath(); ctx.arc(-13, -15, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(13, -15, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // Ojos curiosos
    ctx.fillStyle = '#2D3748';
    ctx.beginPath(); ctx.arc(-5, -2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(5, -2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(-6, -3, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -3, 1, 0, Math.PI * 2); ctx.fill();

    // Hocico o pico
    if (sp === 'owl') {
      ctx.fillStyle = '#ED8936';
      ctx.beginPath(); ctx.moveTo(-3, 2); ctx.lineTo(3, 2); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#2D3748';
      ctx.beginPath(); ctx.ellipse(0, 2, 2.5, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2D3748'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 3, 3, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    }

    // Patitas corriendo
    ctx.fillStyle = '#2D3748';
    ctx.beginPath(); ctx.arc(-8, 18, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, 18, 3, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    // 7. Textos flotantes psicológicos
    neuroState.floatingTexts.forEach(ft => {
      ctx.save();
      ctx.font = `bold ${ft.size}px Nunito, sans-serif`;
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    // 8. Barra de Cooldown de la Onda Zen
    if (neuroState.zenCooldown > 0) {
      const barW = 80;
      const pct = Math.max(0, 1 - neuroState.zenCooldown / 180);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(p.x - barW / 2, petDrawY - 32, barW, 4);
      ctx.fillStyle = '#48BB78';
      ctx.fillRect(p.x - barW / 2, petDrawY - 32, barW * pct, 4);
    }
  }

  function endFlappyGame() {
    neuroState.running = false;
    cancelAnimationFrame(neuroAnimId);

    // Recompensas reales directas a la mascota
    const snacksEarned = neuroState.cookiesCollected;
    const pointsEarned = Math.round(neuroState.score * 0.5);

    if (snacksEarned > 0) {
      appState.pet.foodStock = (appState.pet.foodStock || 0) + snacksEarned;
    }
    if (pointsEarned > 0) {
      appState.user.points = (appState.user.points || 0) + pointsEarned;
    }
    saveAppState(true);

    if (neuroState.score > neuroState.highScore) {
      neuroState.highScore = neuroState.score;
      localStorage.setItem('psicoplan_neuro_high', neuroState.score.toString());
      if (typeof confetti === 'function') {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      }
      showToast('¡NUEVO RÉCORD DE ENFOQUE NEUROCOGNITIVO!');
    }

    const finalScoreEl = document.getElementById('game-final-score');
    const finalSnacksEl = document.getElementById('game-final-snacks-num');
    const feedbackEl = document.getElementById('game-over-feedback');

    if (finalScoreEl) finalScoreEl.innerText = neuroState.score;
    if (finalSnacksEl) finalSnacksEl.innerText = `+${snacksEarned}`;

    if (feedbackEl) {
      if (neuroState.score >= 120) {
        feedbackEl.innerText = '¡Fascinante! Tu circuito dopaminérgico y atención ejecutiva están en su punto óptimo para estudiar.';
      } else if (neuroState.score >= 60) {
        feedbackEl.innerText = '¡Gran sesión de enfoque! Lograste una regulación efectiva del cortisol con tu mascota.';
      } else {
        feedbackEl.innerText = '¡Buen intento! Cada ronda entrena tu inhibición de distractores y tiempo de reacción.';
      }
    }

    const highDisplay = document.getElementById('game-high-score-display');
    if (highDisplay) highDisplay.innerText = `${neuroState.highScore}`;

    document.getElementById('game-over-overlay')?.classList.remove('hidden');
    renderUI();
  }
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
      neuroState.running = false;
      cancelAnimationFrame(neuroAnimId);
    }

    if (viewName === 'desempeno') {
      renderWeeklyChart();
    }
  }

  // =========================================================================
  // GESTIÓN DE ARCHIVOS ADJUNTOS EN TAREAS (PDF, DOCX, JPG, PNG < 5MB)
  // =========================================================================
  function initTaskAttachmentsHandler() {
    // 1. Adjuntos en Wizard Paso 2
    const wizardDropzone = document.getElementById('task-file-dropzone');
    const wizardInput = document.getElementById('task-attachments-input');
    const btnBrowseWizard = document.getElementById('btn-browse-files');
    const wizardList = document.getElementById('task-attachments-list');

    btnBrowseWizard?.addEventListener('click', (e) => {
      e.stopPropagation();
      wizardInput?.click();
    });

    wizardDropzone?.addEventListener('click', () => {
      wizardInput?.click();
    });

    wizardDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      wizardDropzone.classList.add('dragover');
    });

    wizardDropzone?.addEventListener('dragleave', () => {
      wizardDropzone.classList.remove('dragover');
    });

    wizardDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      wizardDropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files) {
        processUploadedFiles(Array.from(e.dataTransfer.files), wizardAttachments, wizardList);
      }
    });

    wizardInput?.addEventListener('change', (e) => {
      if (e.target.files) {
        processUploadedFiles(Array.from(e.target.files), wizardAttachments, wizardList);
      }
    });

    // 2. Adjuntos en Modal de Edición
    const editDropzone = document.getElementById('edit-task-dropzone');
    const editInput = document.getElementById('edit-task-attachments-input');
    const btnBrowseEdit = document.getElementById('btn-browse-edit-files');
    const editList = document.getElementById('edit-task-attachments-list');

    btnBrowseEdit?.addEventListener('click', (e) => {
      e.stopPropagation();
      editInput?.click();
    });

    editDropzone?.addEventListener('click', () => {
      editInput?.click();
    });

    editDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      editDropzone.classList.add('dragover');
    });

    editDropzone?.addEventListener('dragleave', () => {
      editDropzone.classList.remove('dragover');
    });

    editDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      editDropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files) {
        processUploadedFiles(Array.from(e.dataTransfer.files), editingAttachments, editList);
      }
    });

    editInput?.addEventListener('change', (e) => {
      if (e.target.files) {
        processUploadedFiles(Array.from(e.target.files), editingAttachments, editList);
      }
    });
  }

  function processUploadedFiles(files, targetArray, listContainer) {
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB límite
    const ALLOWED_EXT = /\.(pdf|docx|doc|jpg|jpeg|png)$/i;

    files.forEach(file => {
      if (file.size > MAX_SIZE) {
        showToast(`"${file.name}" supera el límite de 5MB`);
        return;
      }
      if (!ALLOWED_EXT.test(file.name)) {
        showToast(`"${file.name}" formato no permitido. Usa PDF, Word o fotos.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        targetArray.push({
          id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: evt.target.result
        });
        renderAttachmentsChips(targetArray, listContainer, false);
      };
      reader.readAsDataURL(file);
    });
  }

  function renderAttachmentsChips(attachments, container, isReadOnly = false) {
    if (!container) return;
    container.innerHTML = '';
    if (!attachments || attachments.length === 0) return;

    attachments.forEach((att, idx) => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';
      const isImg = att.type?.startsWith('image/') || /\.(jpg|jpeg|png)$/i.test(att.name);
      const icon = isImg ?
        '<svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>' :
        '<svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>';
      const sizeStr = att.size ? (att.size > 1048576 ? (att.size / 1048576).toFixed(1) + ' MB' : Math.round(att.size / 1024) + ' KB') : '';

      chip.innerHTML = `
        <div class="attachment-meta">
          <span class="attachment-icon">${icon}</span>
          <span class="attachment-name" title="${att.name}">${att.name}</span>
          <span class="attachment-size">${sizeStr}</span>
        </div>
        <div class="attachment-actions">
          <a class="attachment-btn" href="${att.dataUrl}" download="${att.name}" title="Descargar archivo" target="_blank"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a>
          ${!isReadOnly ? `<button type="button" class="attachment-btn btn-del" data-idx="${idx}" title="Eliminar adjunto"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
        </div>
      `;

      if (!isReadOnly) {
        chip.querySelector('.btn-del')?.addEventListener('click', (e) => {
          e.stopPropagation();
          attachments.splice(idx, 1);
          renderAttachmentsChips(attachments, container, isReadOnly);
        });
      }

      container.appendChild(chip);
    });
  }

  // =========================================================================
  // GESTIÓN DE EDICIÓN Y ELIMINACIÓN DE TAREAS
  // =========================================================================
  function openEditTaskModal(taskId) {
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) return;
    editingTaskId = taskId;

    const idInput = document.getElementById('edit-task-id');
    const titleInput = document.getElementById('edit-task-title-input');
    const courseInput = document.getElementById('edit-task-course-input');
    const deadlineInput = document.getElementById('edit-task-deadline-input');
    const notesInput = document.getElementById('edit-task-notes-input');

    if (idInput) idInput.value = task.id;
    if (titleInput) titleInput.value = task.title || '';
    if (courseInput) courseInput.value = task.course || '';
    if (deadlineInput) deadlineInput.value = task.deadline || '';
    if (notesInput) notesInput.value = task.notes || '';

    editingAttachments = Array.isArray(task.attachments) ? JSON.parse(JSON.stringify(task.attachments)) : [];
    renderAttachmentsChips(editingAttachments, document.getElementById('edit-task-attachments-list'), false);

    document.getElementById('edit-task-modal')?.classList.add('active');
  }

  function closeEditTaskModal() {
    editingTaskId = null;
    editingAttachments = [];
    document.getElementById('edit-task-modal')?.classList.remove('active');
  }

  function saveEditedTask(e) {
    e.preventDefault();
    if (!editingTaskId) return;
    const task = appState.tasks.find(t => t.id === editingTaskId);
    if (!task) return;

    task.title = document.getElementById('edit-task-title-input').value.trim();
    task.course = document.getElementById('edit-task-course-input').value.trim();
    task.deadline = document.getElementById('edit-task-deadline-input').value;
    task.notes = document.getElementById('edit-task-notes-input').value.trim();
    task.attachments = [...editingAttachments];

    saveState();
    closeEditTaskModal();
    renderTasksList();

    if (currentViewingTask && currentViewingTask.id === task.id) {
      currentViewingTask = task;
      renderStep4Plan(task);
    }

    showToast('Tarea actualizada correctamente');
  }

  function confirmDeleteTask(taskId) {
    const task = appState.tasks.find(t => t.id === taskId);
    if (!task) return;
    const hiddenId = document.getElementById('delete-task-id-hidden');
    const titleEl = document.getElementById('delete-task-title');

    if (hiddenId) hiddenId.value = taskId;
    if (titleEl) titleEl.innerText = `¿Eliminar "${task.title}"?`;
    document.getElementById('delete-task-modal')?.classList.add('active');
  }

  function executeDeleteTask() {
    const hiddenId = document.getElementById('delete-task-id-hidden');
    const taskId = hiddenId ? hiddenId.value : null;
    if (!taskId) return;

    // Eliminar la tarea manteniendo íntegros los puntos, galletas y experiencia
    appState.tasks = appState.tasks.filter(t => t.id !== taskId);
    saveState();

    document.getElementById('delete-task-modal')?.classList.remove('active');
    renderTasksList();

    if (currentViewingTask && currentViewingTask.id === taskId) {
      currentViewingTask = null;
      switchView('inicio');
    }

    showToast('Tarea eliminada exitosamente');
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
        showToast('Por favor completa los campos requeridos (*)');
        return;
      }

      currentWizardData = {
        title,
        course,
        deadline,
        attachments: [...wizardAttachments]
      };
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

      // Crear tarea: NO otorga galletas automáticamente por registrarla
      const newTask = {
        id: 'task_' + Date.now(),
        title: currentWizardData.title,
        course: currentWizardData.course,
        deadline: currentWizardData.deadline,
        notes: '',
        attachments: currentWizardData.attachments || [],
        createdAt: new Date().toISOString(),
        subtasks: planResult.subtareas.map((st, idx) => ({
          id: 'sub_' + idx,
          titulo: st.titulo,
          descripcion: st.descripcion,
          fecha_sugerida: st.fecha_sugerida,
          minutos_estimados: st.minutos_estimados || 30,
          completed: false,
          rewardClaimed: false // Blindaje contra reclamo repetido
        })),
        tools: planResult.herramientas_recomendadas || [],
        fullRewardClaimed: false
      };

      appState.tasks.unshift(newTask);
      currentViewingTask = newTask;

      // Limpiar adjuntos del wizard
      wizardAttachments = [];
      renderAttachmentsChips(wizardAttachments, document.getElementById('task-attachments-list'), false);

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
    wizardAttachments = [];
    renderAttachmentsChips(wizardAttachments, document.getElementById('task-attachments-list'), false);
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

    // Metadatos y acciones en cabecera
    const titleEl = document.getElementById('plan-task-main-title');
    const courseEl = document.getElementById('plan-task-course-tag');
    const deadlineEl = document.getElementById('plan-task-deadline-pill');

    if (titleEl) titleEl.innerText = task.title;
    if (courseEl) courseEl.innerText = task.course;
    if (deadlineEl) deadlineEl.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 0.3rem;"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg> Entrega: ${task.deadline}</span>`;

    // Botones de editar y eliminar tarea en el plan
    const btnEdit = document.getElementById('btn-edit-current-task');
    const btnDelete = document.getElementById('btn-delete-current-task');

    if (btnEdit) {
      btnEdit.onclick = () => openEditTaskModal(task.id);
    }
    if (btnDelete) {
      btnDelete.onclick = () => confirmDeleteTask(task.id);
    }

    // Archivos adjuntos de la tarea
    const attachWrapper = document.getElementById('plan-attachments-wrapper');
    const attachContainer = document.getElementById('plan-attachments-container');
    if (attachWrapper && attachContainer) {
      if (task.attachments && task.attachments.length > 0) {
        attachWrapper.style.display = 'block';
        renderAttachmentsChips(task.attachments, attachContainer, true);
      } else {
        attachWrapper.style.display = 'none';
      }
    }

    if (!listContainer) return;
    listContainer.innerHTML = '';

    const completedCount = task.subtasks.filter(s => s.completed).length;
    const totalCount = task.subtasks.length;
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressPercent) progressPercent.innerText = `${pct}%`;

    task.subtasks.forEach((subtask) => {
      const minutes = subtask.minutos_estimados || 30;
      let snackBonus = 1;
      let xpBonus = 10;
      if (minutes > 60) {
        snackBonus = 2;
        xpBonus = 25;
      } else if (minutes > 30) {
        snackBonus = 1;
        xpBonus = 15;
      }

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
          <div style="font-size: 0.75rem; color: var(--text-light); display: flex; gap: 0.75rem; flex-wrap: wrap;">
            <span style="display: inline-flex; align-items: center; gap: 0.25rem;"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg> Sugerido: ${subtask.fecha_sugerida}</span>
            <span style="display: inline-flex; align-items: center; gap: 0.25rem;"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ~${minutes} min</span>
            <span style="color: var(--accent-green); font-weight: 700; display: inline-flex; align-items: center; gap: 0.25rem;"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/></svg> +${snackBonus} Bocadito${snackBonus > 1 ? 's' : ''}</span>
          </div>
        </div>
      `;

      const checkbox = item.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', () => {
        subtask.completed = checkbox.checked;

        if (subtask.completed) {
          // Recompensa balanceada: solo se entrega una vez por subtarea
          if (!subtask.rewardClaimed) {
            subtask.rewardClaimed = true;
            addPoints(xpBonus, snackBonus);
            launchConfetti();
            showToast(`¡Paso terminado! +${xpBonus} pts y +${snackBonus} Bocadito${snackBonus > 1 ? 's' : ''}`);
          } else {
            showToast('Paso completado');
          }
        }

        // Si se completaron todas las subtareas de la tarea
        if (task.subtasks.every(s => s.completed)) {
          if (!task.fullRewardClaimed) {
            task.fullRewardClaimed = true;
            const totalMins = task.subtasks.reduce((sum, s) => sum + (s.minutos_estimados || 30), 0);
            const taskBonusCookies = totalMins >= 120 ? 3 : 2;
            addPoints(50, taskBonusCookies);
            launchConfetti(true);
            showToast(`¡Completaste toda la tarea! +50 pts y +${taskBonusCookies} Bocaditos.`);
          }
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
        link.innerHTML = `<svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> <strong>${tool.nombre}:</strong> ${tool.para_que_sirve}`;
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
    if (ptsBadge) ptsBadge.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 0.25rem;"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> ${appState.user.points} pts</span>`;

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
      cat: 'Gatito Zen',
      dog: 'Perrito Guía',
      owl: 'Búho Sabio',
      bunny: 'Conejita Ágil',
      bear: 'Osito Calma'
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
    if (rightSnacks) rightSnacks.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 0.25rem;"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/></svg> ${pet.foodStock} bocadito${pet.foodStock === 1 ? '' : 's'}</span>`;

    const rightHunger = document.getElementById('right-pet-hunger-bar');
    if (rightHunger) rightHunger.style.width = `${pet.hunger}%`;

    // Estado de ánimo
    const moodBadge = document.getElementById('pet-mood-badge-icon');
    if (moodBadge) {
      moodBadge.innerHTML = '<svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
    }

    const rightMoodText = document.getElementById('right-pet-mood-text');
    if (rightMoodText) {
      const moodLabels = {
        starving: 'Hambriento',
        sad: 'Triste',
        sleepy: 'Somnoliento',
        happy: 'Feliz',
        ecstatic: '¡Eufórico!',
        zen: 'Zen'
      };
      rightMoodText.innerText = moodLabels[pet.mood] || 'Feliz';
    }

    // Barra de satisfacción
    const hungerPercent = document.getElementById('pet-hunger-percent');
    if (hungerPercent) hungerPercent.innerText = `${pet.hunger}%`;

    const hungerBar = document.getElementById('pet-hunger-bar');
    if (hungerBar) hungerBar.style.width = `${pet.hunger}%`;

    // Botón de comida y stock
    const stockBadge = document.getElementById('pet-food-stock-badge');
    if (stockBadge) stockBadge.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 0.2rem;"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/></svg> ${pet.foodStock}</span>`;

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
          <div style="display: flex; justify-content: center; margin-bottom: 0.5rem; color: var(--primary);"><svg class="ui-icon" style="width: 3rem; height: 3rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 10a6 6 0 0 0-6-6H3v2a6 6 0 0 0 6 6h3"/><path d="M12 14a6 6 0 0 1 6-6h3v2a6 6 0 0 1-6 6h-3"/><line x1="12" y1="10" x2="12" y2="22"/></svg></div>
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
      const attachCount = task.attachments ? task.attachments.length : 0;

      const card = document.createElement('div');
      card.className = 'task-item-card';
      card.innerHTML = `
        <div class="task-card-header">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span class="task-tag">${task.course}</span>
            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">Entrega: ${task.deadline}</span>
            ${attachCount > 0 ? `<span style="font-size: 0.75rem; background: var(--bg-subtle); padding: 0.15rem 0.45rem; border-radius: var(--radius-full); color: var(--text-muted); display: inline-flex; align-items: center; gap: 0.2rem;"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> ${attachCount}</span>` : ''}
          </div>
          <div class="task-card-menu-btns">
            <button type="button" class="task-mini-btn" data-edit-task="${task.id}" title="Editar tarea"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button type="button" class="task-mini-btn btn-mini-delete" data-delete-task="${task.id}" title="Eliminar tarea"><svg class="ui-icon ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
          </div>
        </div>
        <h4 style="font-size: 1.05rem; margin: 0.4rem 0 0.5rem 0;">${task.title}</h4>
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

      card.querySelector('[data-edit-task]').addEventListener('click', (e) => {
        e.stopPropagation();
        openEditTaskModal(task.id);
      });

      card.querySelector('[data-delete-task]').addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteTask(task.id);
      });

      container.appendChild(card);
    });
  }

  function renderBadges() {
    const container = document.getElementById('badges-container');
    if (!container) return;
    container.innerHTML = '';

    const allBadges = [
      { id: 'primer_paso', icon: '<svg class="ui-icon ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 10a6 6 0 0 0-6-6H3v2a6 6 0 0 0 6 6h3"/><path d="M12 14a6 6 0 0 1 6-6h3v2a6 6 0 0 1-6 6h-3"/><line x1="12" y1="10" x2="12" y2="22"/></svg>', title: 'Primer Paso', desc: 'Iniciaste tu camino' },
      { id: 'nivel_aprendiz', icon: '<svg class="ui-icon ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>', title: 'Aprendiz', desc: 'Alcanzaste 50 pts' },
      { id: 'racha_3', icon: '<svg class="ui-icon ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>', title: 'Racha 3 Días', desc: 'Consistencia activa' },
      { id: 'pet_friend', icon: '<svg class="ui-icon ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="4" cy="9" r="2"/><path d="M11.5 8a5.5 5.5 0 0 0-5.5 5.5c0 1.5.8 3 2.5 3.5 1.5.5 2 1.5 3 1.5s1.5-1 3-1.5c1.7-.5 2.5-2 2.5-3.5A5.5 5.5 0 0 0 11.5 8z"/></svg>', title: 'Amigo Fiel', desc: 'Alimentaste a tu mascota' }
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
        notifList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">No tienes entregas urgentes en las próximas 48 horas. ¡Vas al día!</p>`;
      } else {
        notifList.innerHTML = urgentTasks.map(t => `
          <div style="background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem; margin-bottom: 0.65rem;">
            <strong style="display: block; color: #D97706;">Entrega próxima: ${t.title}</strong>
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

  // =========================================================================
  // BREATHING SESSION (Técnica 4-7-8)
  // =========================================================================
  function startBreathingSession() {
    clearInterval(breathingInterval);

    const circle = document.getElementById('breath-circle-anim');
    const actionText = document.getElementById('breath-action-text');
    const timerText = document.getElementById('breath-timer-text');
    const startBtn = document.getElementById('btn-start-breathing');

    if (!circle || !actionText || !timerText) return;

    // Phases: [label, duration in seconds, animation class]
    const phases = [
      { label: 'Inhala', seconds: 4, cls: 'breath-inhale' },
      { label: 'Retén',  seconds: 7, cls: 'breath-hold'   },
      { label: 'Exhala', seconds: 8, cls: 'breath-exhale' }
    ];

    let phaseIdx = 0;
    let countdown = phases[0].seconds;

    if (startBtn) startBtn.disabled = true;

    function runPhase() {
      const phase = phases[phaseIdx];
      actionText.textContent = phase.label;
      timerText.textContent = countdown;
      circle.className = 'breathing-circle-outer ' + phase.cls;
    }

    runPhase();

    breathingInterval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        phaseIdx = (phaseIdx + 1) % phases.length;
        countdown = phases[phaseIdx].seconds;
      }
      runPhase();
    }, 1000);

    // Auto-stop after 3 full cycles (~57 seconds)
    setTimeout(() => {
      clearInterval(breathingInterval);
      if (actionText) actionText.textContent = 'Listo';
      if (timerText) timerText.textContent = '';
      if (circle) circle.className = 'breathing-circle-outer';
      if (startBtn) startBtn.disabled = false;
      showToast('Sesión de respiración completada');
    }, (4 + 7 + 8) * 3 * 1000);
  }

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
            showToast('Correo de verificación enviado');
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
        // Modo demo local sin backend: almacenamiento aislado por identificador de correo
        const simulatedUid = 'local_' + btoa(email).replace(/=/g, '');
        appState = loadState(simulatedUid);
        appState.user.isLoggedIn = true;
        appState.user.uid = simulatedUid;
        appState.user.email = email;
        appState.user.name = name || 'Estudiante';
        saveState();
        showToast(`¡Bienvenido/a, ${appState.user.name}!`);
        switchView('inicio');
        checkFirstTimeUserFlow();
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

    // Botón de información (i) de la mascota
    document.getElementById('btn-pet-info')?.addEventListener('click', () => {
      document.getElementById('pet-info-modal')?.classList.add('active');
    });
    document.getElementById('btn-close-pet-info')?.addEventListener('click', () => {
      document.getElementById('pet-info-modal')?.classList.remove('active');
    });
    document.getElementById('btn-pet-info-ok')?.addEventListener('click', () => {
      document.getElementById('pet-info-modal')?.classList.remove('active');
    });

    // Tutorial de bienvenida interactivo
    document.getElementById('tutorial-btn')?.addEventListener('click', openTutorialModal);
    document.getElementById('sidebar-tutorial-btn')?.addEventListener('click', openTutorialModal);
    document.getElementById('btn-tutorial-skip')?.addEventListener('click', closeTutorialModal);
    document.getElementById('btn-tutorial-prev')?.addEventListener('click', () => {
      if (currentTutorialStep > 0) {
        currentTutorialStep--;
        renderTutorialSlide();
      }
    });
    document.getElementById('btn-tutorial-next')?.addEventListener('click', () => {
      if (currentTutorialStep < TUTORIAL_SLIDES.length - 1) {
        currentTutorialStep++;
        renderTutorialSlide();
      } else {
        closeTutorialModal();
      }
    });

    // Adopción de mascota inicial
    document.querySelectorAll('#adoption-species-selector .species-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#adoption-species-selector .species-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedSpecies = btn.getAttribute('data-species') || 'bear';
        updateAdoptionPreview();
      });
    });

    document.querySelectorAll('#adoption-color-swatches .color-swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#adoption-color-swatches .color-swatch-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedFurColor = btn.getAttribute('data-color') || '#ECC94B';
        updateAdoptionPreview();
      });
    });

    document.getElementById('adoption-name-input')?.addEventListener('input', updateAdoptionPreview);
    document.getElementById('btn-confirm-adoption')?.addEventListener('click', () => {
      const chosenName = document.getElementById('adoption-name-input')?.value.trim() || 'Mimi';
      const chosenOutfit = document.getElementById('adoption-outfit-select')?.value || 'none';
      appState.pet = {
        species: selectedSpecies,
        name: chosenName,
        furColor: selectedFurColor,
        outfit: chosenOutfit,
        hunger: 100,
        foodStock: 0,
        mood: 'happy',
        hungerAlertSent: false,
        lastFedTimestamp: Date.now()
      };
      appState.user.hasAdoptedPet = true;
      saveState();
      closePetAdoptionModal();
      showToast(`¡Adoptaste a ${chosenName}!`);
      if (!appState.user.hasSeenTutorial) {
        setTimeout(openTutorialModal, 300);
      }
    });

    // Edición y eliminación de tareas
    document.getElementById('edit-task-form')?.addEventListener('submit', saveEditedTask);
    document.getElementById('btn-close-edit-task')?.addEventListener('click', closeEditTaskModal);
    document.getElementById('btn-cancel-edit-task')?.addEventListener('click', closeEditTaskModal);

    document.getElementById('btn-cancel-delete-task')?.addEventListener('click', () => {
      document.getElementById('delete-task-modal')?.classList.remove('active');
    });
    document.getElementById('btn-confirm-delete-task')?.addEventListener('click', executeDeleteTask);

    // Inicializar gestión de adjuntos
    initTaskAttachmentsHandler();

    // Personalización continua de la mascota
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
        showToast('¡Mascota personalizada con éxito!');
      }
    });

    // 4. Minijuego: Neuro-Catch y Respiración
    document.getElementById('btn-start-arcade')?.addEventListener('click', startFlappyGame);
    document.getElementById('btn-restart-arcade')?.addEventListener('click', startFlappyGame);

    document.getElementById('btn-toggle-game-mode')?.addEventListener('click', () => {
      const modeArcade = document.getElementById('mode-arcade-game');
      const modeBreathing = document.getElementById('mode-breathing-478');
      const btn = document.getElementById('btn-toggle-game-mode');

      if (gameMode === 'arcade') {
        gameMode = 'breathing';
        neuroState.running = false;
        cancelAnimationFrame(neuroAnimId);
        if (modeArcade) modeArcade.style.display = 'none';
        if (modeBreathing) modeBreathing.style.display = 'block';
        btn.innerText = 'Neuro-Catch';
      } else {
        gameMode = 'arcade';
        if (modeArcade) modeArcade.style.display = 'block';
        if (modeBreathing) modeBreathing.style.display = 'none';
        btn.innerText = 'Modo Respiración';
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

    // Cerrar sesión con reinicio de estado aislado
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      profileModal?.classList.remove('active');
      if (isFirebaseReady && firebaseAuth) {
        await firebaseAuth.signOut();
      }
      appState = getDefaultState('');
      saveState();
      switchView('inicio');
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

    // Chequeo periódico de hambre y frases motivadoras cada 40s
    setInterval(() => {
      if (appState.user.isLoggedIn && appState.pet) {
        checkPetHungerDecay();
        givePetAdvice(false);
      }
    }, 40000);
  });

})();
