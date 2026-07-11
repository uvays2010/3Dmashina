/* =====================================================
   TURBO DRIFT — 3D shahar ichida mashina haydash o'yini
   Three.js (r128) asosida yozilgan
   ===================================================== */

/* ---------------- Global sozlamalar ---------------- */
const WORLD = {
  gridCount: 7,          // shahar blocklari soni (gridCount x gridCount)
  blockSize: 34,         // har bir bino maydonchasining o'lchami
  roadWidth: 16,         // ko'chalar kengligi
};
WORLD.cell = WORLD.blockSize + WORLD.roadWidth;
WORLD.half = (WORLD.gridCount * WORLD.cell) / 2;

const CAR_SPEC = {
  maxSpeed: 34,          // oddiy maksimal tezlik (m/s taxminiy)
  maxSpeedNitro: 56,
  maxReverse: -12,
  accel: 22,
  brakeAccel: 34,
  friction: 0.985,
  handbrakeFriction: 0.90,
  turnRate: 2.3,         // radian/soniya
};

const TOTAL_COINS = 26;

/* ---------------- Sahna asoslari ---------------- */
let scene, camera, renderer, clock;
let car, carGroup, wheelFL, wheelFR, wheelRL, wheelRR;
let buildings = [];       // {mesh, minX,maxX,minZ,maxZ}
let coins = [];            // {mesh, x, z, collected}
let minimapCtx;
let gameStarted = false;
let elapsedTime = 0;
let coinsCollected = 0;

const carState = {
  x: 0, z: 0,
  angle: 0,
  speed: 0,
  nitro: 100,
};

const keys = {
  forward: false, backward: false, left: false, right: false,
  brake: false, nitro: false,
};

let cameraMode = 0; // 0 = chase, 1 = close top-down-ish

/* ---------------- Ishga tushirish ---------------- */
function init() {
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 90, 260);

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 14, -20);

  clock = new THREE.Clock();

  addLights();
  addGround();
  buildCity();
  buildCar();
  scatterCoins();

  minimapCtx = document.getElementById('minimap').getContext('2d');

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  bindTouchControls();

  document.getElementById('coin-total').textContent = '/' + TOTAL_COINS;

  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('start-btn').addEventListener('click', startGame);

  animate();
}

function startGame() {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  gameStarted = true;
  elapsedTime = 0;
}

function onResize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  // tor (mobil) ekranlarda FOVni kengaytiramiz, moslashuvchan ko'rinish uchun
  camera.fov = aspect < 1 ? 78 : (aspect < 1.4 ? 70 : 62);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* Mobil brauzerlarda tasodifiy pinch-zoom / scroll bo'lishini oldini olish */
document.addEventListener('touchmove', e => { if (e.scale !== 1) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

/* ---------------- Yorug'lik ---------------- */
function addLights() {
  const ambient = new THREE.AmbientLight(0xbfd9ff, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff2d6, 1.05);
  sun.position.set(80, 120, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 400;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xaee0ff, 0x22331a, 0.5);
  scene.add(hemi);
}

/* ---------------- Yer va yo'llar ---------------- */
function makeGroundTexture() {
  const size = 1024;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d');

  ctx.fillStyle = '#3a3f47';
  ctx.fillRect(0, 0, size, size);

  const worldSize = WORLD.gridCount * WORLD.cell;
  const scale = size / worldSize;

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.setLineDash([14, 14]);
  ctx.lineWidth = 2;

  for (let i = 0; i <= WORLD.gridCount; i++) {
    const pos = (i * WORLD.cell) * scale;
    // gorizontal yo'l
    ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(size, pos); ctx.stroke();
    // vertikal yo'l
    ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, size); ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,220,80,0.5)';
  ctx.lineWidth = 4;
  for (let i = 0; i <= WORLD.gridCount; i++) {
    const pos = (i * WORLD.cell) * scale;
    ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(size, pos); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, size); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.anisotropy = 4;
  return tex;
}

function addGround() {
  const worldSize = WORLD.gridCount * WORLD.cell + 40;
  const geo = new THREE.PlaneGeometry(worldSize, worldSize);
  const tex = makeGroundTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

/* ---------------- Shahar (binolar) ---------------- */
function buildCity() {
  const palette = [0x9aa5b1, 0xc9b18b, 0x8bb3c9, 0xb18bc9, 0xe0dccB, 0x7d8f99, 0xd68a5a];

  for (let i = 0; i < WORLD.gridCount; i++) {
    for (let j = 0; j < WORLD.gridCount; j++) {
      const cx = (i - WORLD.gridCount / 2) * WORLD.cell + WORLD.cell / 2;
      const cz = (j - WORLD.gridCount / 2) * WORLD.cell + WORLD.cell / 2;

      // markazni ochiq maydon sifatida qoldiramiz (start joyi)
      if (Math.abs(cx) < WORLD.cell && Math.abs(cz) < WORLD.cell) continue;

      const numBuildings = 1 + Math.floor(Math.random() * 3);
      for (let b = 0; b < numBuildings; b++) {
        const w = 6 + Math.random() * 10;
        const d = 6 + Math.random() * 10;
        const h = 8 + Math.random() * 38;

        const margin = WORLD.blockSize / 2 - Math.max(w, d) / 2 - 1;
        const bx = cx + (Math.random() * 2 - 1) * margin * 0.6;
        const bz = cz + (Math.random() * 2 - 1) * margin * 0.6;

        const color = palette[Math.floor(Math.random() * palette.length)];
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(bx, h / 2, bz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        // tepasida kichik "antenna/tank" detali - vizual boyitish
        if (Math.random() < 0.4) {
          const capGeo = new THREE.BoxGeometry(w * 0.4, 2, d * 0.4);
          const capMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
          const cap = new THREE.Mesh(capGeo, capMat);
          cap.position.set(bx, h + 1, bz);
          cap.castShadow = true;
          scene.add(cap);
        }

        buildings.push({
          minX: bx - w / 2, maxX: bx + w / 2,
          minZ: bz - d / 2, maxZ: bz + d / 2,
        });
      }
    }
  }
}

/* ---------------- Mashina modeli ---------------- */
function buildCar() {
  carGroup = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8342c, roughness: 0.35, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 4.2), bodyMat);
  body.position.y = 0.65;
  body.castShadow = true;
  carGroup.add(body);

  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.2, metalness: 0.6 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.0), cabinMat);
  cabin.position.set(0, 1.25, -0.2);
  cabin.castShadow = true;
  carGroup.add(cabin);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.15, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x111111 }));
  spoiler.position.set(0, 1.15, -2.0);
  carGroup.add(spoiler);

  // faralar
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffee88, emissiveIntensity: 0.8 });
  [-0.75, 0.75].forEach(x => {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), headMat);
    head.position.set(x, 0.7, 2.05);
    carGroup.add(head);
  });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.6 });
  [-0.75, 0.75].forEach(x => {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), tailMat);
    tail.position.set(x, 0.7, -2.05);
    carGroup.add(tail);
  });

  // g'ildiraklar
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });

  function makeWheel(x, z) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.45, z);
    w.castShadow = true;
    carGroup.add(w);
    return w;
  }
  wheelFL = makeWheel(-1.15, 1.4);
  wheelFR = makeWheel(1.15, 1.4);
  wheelRL = makeWheel(-1.15, -1.4);
  wheelRR = makeWheel(1.15, -1.4);

  carGroup.position.set(0, 0, 0);
  scene.add(carGroup);
  car = carGroup;
}

/* ---------------- Tangalar ---------------- */
function scatterCoins() {
  const coinGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.15, 20);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x554400, metalness: 0.7, roughness: 0.25 });

  let placed = 0;
  let attempts = 0;
  while (placed < TOTAL_COINS && attempts < 800) {
    attempts++;
    // ko'cha kesishmalari yaqinida joylashtiramiz (ochiq joy)
    const i = Math.floor(Math.random() * (WORLD.gridCount + 1));
    const j = Math.floor(Math.random() * (WORLD.gridCount + 1));
    const x = (i - WORLD.gridCount / 2) * WORLD.cell + (Math.random() * 10 - 5);
    const z = (j - WORLD.gridCount / 2) * WORLD.cell + (Math.random() * 10 - 5);

    if (isInsideAnyBuilding(x, z, 1.5)) continue;

    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, 1.1, z);
    mesh.castShadow = true;
    scene.add(mesh);

    coins.push({ mesh, x, z, collected: false, bobOffset: Math.random() * Math.PI * 2 });
    placed++;
  }
}

function isInsideAnyBuilding(x, z, pad) {
  for (const b of buildings) {
    if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
  }
  return false;
}

/* ---------------- Klaviatura boshqaruvi ---------------- */
function onKeyDown(e) {
  setKey(e.code, true);
  if (e.code === 'KeyC') cameraMode = (cameraMode + 1) % 2;
}
function onKeyUp(e) { setKey(e.code, false); }

function setKey(code, val) {
  switch (code) {
    case 'KeyW': case 'ArrowUp': keys.forward = val; break;
    case 'KeyS': case 'ArrowDown': keys.backward = val; break;
    case 'KeyA': case 'ArrowLeft': keys.left = val; break;
    case 'KeyD': case 'ArrowRight': keys.right = val; break;
    case 'Space': keys.brake = val; break;
    case 'ShiftLeft': case 'ShiftRight': keys.nitro = val; break;
  }
}

/* Sensorli boshqaruv tugmalarini bog'lash */
function bindTouchControls() {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouch) return;

  const bind = (id, k) => {
    const el = document.getElementById(id);
    if (!el) return;
    const on = ev => { ev.preventDefault(); keys[k] = true; };
    const off = ev => { ev.preventDefault(); keys[k] = false; };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
  };

  bind('tb-left', 'left');
  bind('tb-right', 'right');
  bind('tb-brake', 'brake');
  bind('tb-gas', 'forward');
  bind('tb-nitro', 'nitro');

  const camBtn = document.getElementById('tb-cam');
  if (camBtn) {
    camBtn.addEventListener('touchstart', ev => {
      ev.preventDefault();
      cameraMode = (cameraMode + 1) % 2;
    }, { passive: false });
  }

  handleOrientation();
  window.addEventListener('resize', handleOrientation);
  window.addEventListener('orientationchange', handleOrientation);
}

function handleOrientation() {
  const overlay = document.getElementById('rotate-overlay');
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouch || !overlay) return;
  const portrait = window.innerHeight > window.innerWidth;
  overlay.classList.toggle('hidden', !portrait);
  onResize();
}

/* ---------------- Fizika yangilanishi ---------------- */
function updateCar(dt) {
  const maxSpeed = keys.nitro && carState.nitro > 0 ? CAR_SPEC.maxSpeedNitro : CAR_SPEC.maxSpeed;

  if (keys.forward) carState.speed += CAR_SPEC.accel * dt;
  if (keys.backward) carState.speed -= CAR_SPEC.brakeAccel * dt;

  const friction = keys.brake ? CAR_SPEC.handbrakeFriction : CAR_SPEC.friction;
  carState.speed *= friction;

  carState.speed = THREE.MathUtils.clamp(carState.speed, CAR_SPEC.maxReverse, maxSpeed);

  // nitro
  if (keys.nitro && carState.nitro > 0 && Math.abs(carState.speed) > 1) {
    carState.nitro = Math.max(0, carState.nitro - dt * 35);
  } else {
    carState.nitro = Math.min(100, carState.nitro + dt * 12);
  }

  // burilish - faqat harakatda bo'lganda sezilarli
  const speedFactor = THREE.MathUtils.clamp(Math.abs(carState.speed) / 8, 0, 1);
  const dir = carState.speed >= 0 ? 1 : -1;
  let steer = 0;
  if (keys.left) steer += 1;
  if (keys.right) steer -= 1;
  carState.angle += steer * CAR_SPEC.turnRate * speedFactor * dir * dt;

  const nx = carState.x + Math.sin(carState.angle) * carState.speed * dt;
  const nz = carState.z + Math.cos(carState.angle) * carState.speed * dt;

  // to'qnashuv tekshiruvi (soddalashtirilgan AABB)
  const pad = 1.3;
  let blocked = false;
  for (const b of buildings) {
    if (nx > b.minX - pad && nx < b.maxX + pad && nz > b.minZ - pad && nz < b.maxZ + pad) {
      blocked = true;
      break;
    }
  }

  if (!blocked) {
    carState.x = nx;
    carState.z = nz;
  } else {
    carState.speed *= -0.35; // sekin sakrab qaytadi
  }

  // dunyo chegarasidan chiqmaslik
  const limit = WORLD.half - 4;
  carState.x = THREE.MathUtils.clamp(carState.x, -limit, limit);
  carState.z = THREE.MathUtils.clamp(carState.z, -limit, limit);

  car.position.set(carState.x, 0, carState.z);
  car.rotation.y = carState.angle;

  // g'ildiraklarni aylantirish
  const wheelSpin = carState.speed * dt * 2.2;
  [wheelFL, wheelFR, wheelRL, wheelRR].forEach(w => { w.rotation.x -= wheelSpin; });
  const steerAngle = steer * 0.45;
  wheelFL.rotation.y = steerAngle;
  wheelFR.rotation.y = steerAngle;
}

/* ---------------- Kamera ---------------- */
function updateCamera(dt) {
  const forward = new THREE.Vector3(Math.sin(carState.angle), 0, Math.cos(carState.angle));

  let desired;
  if (cameraMode === 0) {
    desired = new THREE.Vector3(
      carState.x - forward.x * 9,
      6.5,
      carState.z - forward.z * 9
    );
  } else {
    desired = new THREE.Vector3(
      carState.x - forward.x * 4,
      10,
      carState.z - forward.z * 4
    );
  }

  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  const lookAt = new THREE.Vector3(
    carState.x + forward.x * 4,
    1.2,
    carState.z + forward.z * 4
  );
  camera.lookAt(lookAt);
}

/* ---------------- Tangalarni tekshirish ---------------- */
function updateCoins(dt, t) {
  for (const c of coins) {
    if (c.collected) continue;
    c.mesh.rotation.z += dt * 2.5;
    c.mesh.position.y = 1.1 + Math.sin(t * 2 + c.bobOffset) * 0.15;

    const dx = c.x - carState.x;
    const dz = c.z - carState.z;
    if (dx * dx + dz * dz < 3.2 * 3.2) {
      c.collected = true;
      c.mesh.visible = false;
      coinsCollected++;
      document.getElementById('coin-value').firstChild.textContent = coinsCollected;
      showMessage('+1 tanga!');
      if (coinsCollected === TOTAL_COINS) {
        showMessage('BARCHA TANGALAR YIG\'ILDI! 🏆', 3200);
      }
    }
  }
}

let messageTimeout = null;
function showMessage(text, duration = 1100) {
  const el = document.getElementById('message-banner');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(messageTimeout);
  messageTimeout = setTimeout(() => el.classList.add('hidden'), duration);
}

/* ---------------- HUD yangilash ---------------- */
function updateHUD(dt) {
  const kmh = Math.abs(carState.speed) * 3.2;
  document.getElementById('speed-value').textContent = Math.round(kmh);

  elapsedTime += dt;
  const mm = String(Math.floor(elapsedTime / 60)).padStart(2, '0');
  const ss = String(Math.floor(elapsedTime % 60)).padStart(2, '0');
  document.getElementById('time-value').textContent = `${mm}:${ss}`;

  document.getElementById('nitro-bar-fill').style.width = carState.nitro + '%';
}

/* ---------------- Minixarita ---------------- */
function drawMinimap() {
  const ctx = minimapCtx;
  const size = 160;
  ctx.clearRect(0, 0, size, size);

  const worldSize = WORLD.gridCount * WORLD.cell + 20;
  const scale = size / worldSize;
  const toMap = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];

  ctx.fillStyle = 'rgba(50,60,75,0.6)';
  buildings.forEach(b => {
    const [x1, z1] = toMap(b.minX, b.minZ);
    const [x2, z2] = toMap(b.maxX, b.maxZ);
    ctx.fillRect(x1, z1, x2 - x1, z2 - z1);
  });

  ctx.fillStyle = '#ffd23f';
  coins.forEach(c => {
    if (c.collected) return;
    const [x, z] = toMap(c.x, c.z);
    ctx.beginPath();
    ctx.arc(x, z, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });

  const [cx, cz] = toMap(carState.x, carState.z);
  ctx.save();
  ctx.translate(cx, cz);
  ctx.rotate(carState.angle);
  ctx.fillStyle = '#00e5ff';
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(4, 5);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ---------------- Asosiy tsikl ---------------- */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

  if (gameStarted) {
    updateCar(dt);
    updateCamera(dt);
    updateCoins(dt, t);
    updateHUD(dt);
    drawMinimap();
  }

  renderer.render(scene, camera);
}

init();