# 🧠 PsicoPlan - Asistente de IA para Estudiantes de Psicología

PsicoPlan es una aplicación web progresiva (**PWA**), multiplataforma y 100% gratuita para organizar tareas académicas complejas de psicología en pequeños pasos realistas, acompañada de una **mascota virtual que cuidas al estudiar** y **minijuegos de pausa activa**.

---

## 🚀 Nuevas Funcionalidades Implementadas

### 1. 🕊️ Login con Colores Neutros y Selector de Temas
- Pantalla de bienvenida limpia, sobria y elegante con tonos cálidos y grises neutros.
- Pestañas para **Iniciar Sesión**, **Crear Cuenta** o **Ingresar como Invitado** (acceso instantáneo con 1 solo clic).
- Selector de temas visuales para elegir tu vibra favorita:
  - 🕊️ **Neutro Calmo**: Slate, warm gray y grafito minimalista.
  - 🎨 **Pastel Clásico**: Lila, celeste y menta relajante.
  - 🌿 **Bosque Sereno**: Verde salvia y eucalipto.
  - 🌊 **Océano Profundo**: Azul índigo y glacial.
  - 🌸 **Atardecer**: Rosa cuarzo y durazno suave.
  - 🌙 **Noche**: Tema oscuro de bajo estímulo visual.

### 2. 🐾 Mascota Virtual Interactiva (Tu Compañero de Estudio)
- Al crear tu cuenta o entrar, el sistema **genera una mascota aleatoria única**:
  - 🐱 **Gatito Zen**
  - 🐶 **Perrito Guía**
  - 🦉 **Búho Sabio**
  - 🐰 **Conejita Ágil**
  - 🐻 **Osito Calma**
- **Alimentación de la mascota**:
  - Cada subtarea completada en tu plan te otorga **+1 Bocadito Nutritivo 🍪**.
  - Al alimentar a tu mascota, su barra de satisfacción se llena, salta de alegría y te da frases motivadoras y datos curiosos de psicología.
- **Estados de Ánimo Dinámicos**:
  - 🥺 *Hambriento*: Si descuidas tus tareas y no tiene comida.
  - 😴 *Somnoliento*: Cuando necesita recargar energía o tomar una pausa.
  - 😊 *Feliz*: Con buena energía y satisfecho.
  - 🥳 *Extasiado*: ¡Cuando terminas tareas completas y subes de nivel!
  - 🧘 *Zen*: Modo meditación en las pausas activas.
- **Personalización Completa**:
  - Puedes cambiar el nombre, el color de pelaje (Nieve, Dorado, Gris, Lavanda, Menta, Café) y vestirla con accesorios:
    - 👓 Gafas de Psicólogo
    - 🧣 Bufanda Abrigadora
    - 🎓 Birrete Universitario
    - 🎀 Moño Elegante
    - 🌸 Flor Zen
    - 🦸 Capa de Superestudiante

### 3. 🎮 Minijuego Dinámico: Flappy Pet (Vuelo Académico) 🦅📚
- **Estilo Flappy Bird con física y control perfecto:**
  - **Modo Levitación Pre-Vuelo:** Al darle a *"¡Comenzar Vuelo!"*, la mascota se mantiene **flotando suavemente en el centro** y no cae de golpe. Tienes todo el tiempo que quieras para prepararte; el juego y los obstáculos arrancan solo cuando das tu primer toque en la pantalla o presionas Espacio.
  - Gravedad balanceada y suave para un control responsivo y divertido tanto en celular como en computadora.
  - Tu mascota vuela a través de columnas de libros y manuales de psicología (DSM-5, Freud, Piaget, APA 7) que aparecen a diferentes alturas.
  - Recolecta galletitas flotantes 🍪 en el aire y gana puntos al cruzar cada columna de libros.
  - Efectos de sonido sintetizados por Web Audio API: aleteo, campana de punto, mordisco de galleta y choque.
  - **Recompensa para tu mascota:** ¡Cada 4 columnas de libros cruzadas o galletas recogidas en vuelo te dan galletas reales para alimentar a tu mascota!
  - Récord guardado (High Score) para superar tu propia marca.

### 4. 💬 Mascota Parlante & Proactiva (Consejos de Psicología y Emociones)
- **Consejos y motivación en tiempo real:**
  - Botón interactivo **"💡 Pedir Consejo"** junto a la mascota para recibir tips científicos de estudio (Efecto Zeigarnik, Pomodoro, Repetición Espaciada, Desensibilización Sistemática).
  - La mascota habla periódicamente en la pantalla principal sin emitir ruidos molestos en segundo plano.
- **Avisos de Hambre:**
  - Si la barra de nutrición baja de 40%, la mascota te avisará con ruegos tiernos: *"¡Tengo mucha hambre! 🥺 Termina una tarea para darme una galletita"*.
- **Tristeza por Tareas Pendientes o Atrasadas:**
  - Si tienes tareas sin avanzar o la fecha de entrega está cerca, la mascota cambiará sus ojitos a carita triste con lágrimas y te dirá: *"Estoy un poco triste... tenemos tareas pendientes esperándonos 🥺"* o *"¡Ánimo! Aunque cueste empezar, el primer paso es el más valioso"*.

### 5. ☁️ Base de Datos Gratuita en la Nube & Autenticación (Firebase + Firestore)
- **Inicio de Sesión con 1 Clic**:
  - 🔵 **Google Sign-In** (con tu cuenta de Google o Gmail).
  - 🔷 **Facebook Login** (con tu perfil de Facebook).
- **Registro con Verificación de Correo Real**:
  - Al registrarse con correo y contraseña, Firebase comprueba que el correo sea válido y **envía automáticamente un enlace de confirmación al buzón del usuario**.
  - Si el usuario no confirma su correo, el sistema no le permite ingresar y muestra un aviso para reenviar el correo de verificación.
- **Base de Datos en la Nube (Cloud Firestore)**:
  - Guarda tareas, nivel, puntos, mascota y temas en la nube bajo el usuario autenticado para que acceda desde su celular, tablet o computador y mantenga siempre sus datos sincronizados.
  - **Modo Demo / Offline**: Si no se configuran las llaves de Firebase, la app funciona de inmediato guardando todo en el navegador con `localStorage`.

---

## 🔑 Cómo Configurar Firebase Gratis (Paso a Paso)

1. Entra a [console.firebase.google.com](https://console.firebase.google.com/) con tu cuenta de Google.
2. Haz clic en **"Crear un proyecto"** (nómbralo `PsicoPlan` y continúa; no requieres Google Analytics).
3. En el menú izquierdo ve a **Compilación (Build)** ➔ **Authentication**:
   - Haz clic en **Comenzar**.
   - En *Proveedores nativos*, activa **Correo electrónico/Contraseña** y guarda.
   - Activa **Google** (elige tu correo de soporte) y guarda.
   - (Opcional) Activa **Facebook** si tienes una App ID de Meta Developers.
4. En el menú izquierdo ve a **Firestore Database**:
   - Haz clic en **Crear base de datos**, elige una ubicación cercana y selecciona **Modo de prueba** (permite lectura/escritura).
5. Ve al engranaje de **Configuración del proyecto ⚙️** (arriba a la izquierda):
   - En *Tus apps*, haz clic en el ícono web **`</>`**.
   - Registra el nombre `psicoplan-web` y copia el bloque `firebaseConfig`.
6. Pega esos valores en tu archivo `config.js` dentro de `FIREBASE_CONFIG`. ¡Y listo!

---

## 🛠️ Cómo Probar Localmente

Haz doble clic en el archivo `index.html` para abrirlo en cualquier navegador (Chrome, Safari, Firefox o Edge). No requiere instalaciones ni servidores de pago.
