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

  // Variables del Minijuego
  let gameMode = 'bubbles'; // 'bubbles' o 'breathing'
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
    } catch (e) {
      console.warn('Error al guardar en localStorage', e);
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
    if (pet.hunger < 25) return 'starving';
    if (pet.hunger < 50) return 'sleepy';
    if (pet.hunger >= 85) return 'ecstatic';
    return 'happy';
  }

  const PET_PHRASES = {
    starving: [
      "¡Tengo pancita vacía! 🥺 Completa una subtarea para darme un bocadito.",
      "Necesito energía nutritiva para acompañarte a estudiar..."
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

  function showToast(message) {
    const toast = document.getElementById('toast-element');
    const text = document.getElementById('toast-text');
    if (toast && text) {
      text.innerText = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
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
  // 7. MINIJUEGO: BURBUJAS ANTIESTRÉS Y RESPIRACIÓN 4-7-8
  // =========================================================================
  function initBubbleGame() {
    const canvas = document.getElementById('zen-bubbles-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth || 360;
    canvas.height = canvas.parentElement.clientHeight || 380;

    bubbles = [];
    const bubbleColors = [
      'rgba(139, 124, 230, 0.4)',
      'rgba(84, 180, 211, 0.4)',
      'rgba(72, 187, 120, 0.4)',
      'rgba(246, 135, 179, 0.4)',
      'rgba(236, 201, 75, 0.4)'
    ];

    for (let i = 0; i < 15; i++) {
      bubbles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: 18 + Math.random() * 22,
        color: bubbleColors[Math.floor(Math.random() * bubbleColors.length)],
        vx: (Math.random() - 0.5) * 0.7,
        vy: -0.4 - Math.random() * 0.6
      });
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      bubbles.forEach(b => {
        b.x += b.vx;
        b.y += b.vy;

        if (b.y + b.r < 0) {
          b.y = canvas.height + b.r;
          b.x = Math.random() * canvas.width;
        }
        if (b.x - b.r < 0 || b.x + b.r > canvas.width) {
          b.vx *= -1;
        }

        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Brillo de la burbuja
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fill();
      });

      bubbleAnimId = requestAnimationFrame(animate);
    }

    cancelAnimationFrame(bubbleAnimId);
    animate();

    // Evento de clic o toque en burbuja
    function handleBubblePop(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        const dist = Math.hypot(clickX - b.x, clickY - b.y);
        if (dist <= b.r + 5) {
          playPopSound();
          zenPoints += 1;
          document.getElementById('game-zen-points').innerText = zenPoints;

          // Reubicar burbuja
          b.y = canvas.height + b.r;
          b.x = Math.random() * canvas.width;

          // Recompensa de bocaditos para la mascota: cada 10 burbujas
          if (zenPoints % 10 === 0 && appState.pet) {
            appState.pet.foodStock += 1;
            document.getElementById('game-snacks-earned').innerText = `🍪 +${Math.floor(zenPoints / 10)}`;
            launchConfetti();
            showToast('🍪 ¡Ganaste 1 bocadito para tu mascota por relajarte!');
            saveState();
          }
          break;
        }
      }
    }

    canvas.onpointerdown = (e) => handleBubblePop(e.clientX, e.clientY);
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
      setTimeout(initBubbleGame, 100);
    } else {
      cancelAnimationFrame(bubbleAnimId);
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
      sleepy: '😴',
      happy: '😊',
      ecstatic: '🥳',
      zen: '🧘'
    };
    const moodBadge = document.getElementById('pet-mood-badge-icon');
    if (moodBadge) moodBadge.innerText = moodEmojis[pet.mood] || '😊';

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

    // Enviar Login/Registro
    document.getElementById('auth-form')?.addEventListener('submit', () => {
      const email = document.getElementById('login-email-input').value.trim();
      const name = isRegisterMode ? document.getElementById('login-name-input').value.trim() : (email.split('@')[0] || 'Estudiante');

      appState.user.isLoggedIn = true;
      appState.user.email = email;
      appState.user.name = name || 'Estudiante';

      if (!appState.pet) {
        appState.pet = createRandomPet();
      }

      saveState();
      showToast(`¡Bienvenido/a, ${appState.user.name}!`);
      switchView('inicio');
    });

    // Entrar como invitado
    document.getElementById('btn-login-guest')?.addEventListener('click', () => {
      appState.user.isLoggedIn = true;
      appState.user.name = 'Invitado';
      if (!appState.pet) {
        appState.pet = createRandomPet();
      }
      saveState();
      showToast('¡Has entrado como Estudiante Invitado!');
      switchView('inicio');
    });

    // 3. Mascota: Alimentar y Personalizar
    document.getElementById('btn-feed-action')?.addEventListener('click', feedPet);
    document.getElementById('btn-pet-avatar')?.addEventListener('click', () => {
      feedPet();
    });

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

    // 4. Minijuego: Cambio de modo y respiración
    document.getElementById('btn-toggle-game-mode')?.addEventListener('click', () => {
      const modeBubbles = document.getElementById('mode-bubble-pop');
      const modeBreathing = document.getElementById('mode-breathing-478');
      const btn = document.getElementById('btn-toggle-game-mode');

      if (gameMode === 'bubbles') {
        gameMode = 'breathing';
        modeBubbles.style.display = 'none';
        modeBreathing.style.display = 'block';
        btn.innerText = 'Ver Burbujas 🫧';
      } else {
        gameMode = 'bubbles';
        modeBubbles.style.display = 'block';
        modeBreathing.style.display = 'none';
        btn.innerText = 'Respiración 4-7-8 🧘';
        setTimeout(initBubbleGame, 50);
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
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      profileModal?.classList.remove('active');
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
    renderUI();
  });

})();
