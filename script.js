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
let car, carGroup, wheelFL, wheelFR, wheelRL, wheelRR, brakeLightMat;
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
let clouds = [];
let exhaustParticles = [];
let dustParticles = [];
let burstParticles = [];
let windowTexBase = null;
let baseFov = 62;

/* ---------------- Ishga tushirish ---------------- */
function init() {
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  const skyTex = makeSkyTexture();
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xffb37a, 90, 260);

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 14, -20);

  clock = new THREE.Clock();

  addLights();
  addSun();
  addClouds();
  addGround();
  buildCity();
  buildCar();
  scatterCoins();
  buildBurstPool();
  addStartParticles();

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
  baseFov = aspect < 1 ? 78 : (aspect < 1.4 ? 70 : 62);
  if (!camera.fov || Math.abs(camera.fov - baseFov) > 20) camera.fov = baseFov;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* Mobil brauzerlarda tasodifiy pinch-zoom / scroll bo'lishini oldini olish */
document.addEventListener('touchmove', e => { if (e.scale !== 1) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

/* ---------------- Yorug'lik ---------------- */
function addLights() {
  const ambient = new THREE.AmbientLight(0xffd9b0, 0.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffdcae, 1.15);
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

  const hemi = new THREE.HemisphereLight(0xffcf9e, 0x2a2440, 0.55);
  scene.add(hemi);
}

/* ---------------- Kunbotar osmoni ---------------- */
function makeSkyTexture() {
  const cvs = document.createElement('canvas');
  cvs.width = 2; cvs.height = 512;
  const ctx = cvs.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#3a6fd8');
  grad.addColorStop(0.35, '#7fa6e8');
  grad.addColorStop(0.62, '#ffcf9e');
  grad.addColorStop(0.8, '#ff9b6a');
  grad.addColorStop(1, '#ffdca8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
  return tex;
}

function addSun() {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 256;
  const ctx = cvs.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,244,214,1)');
  g.addColorStop(0.25, 'rgba(255,220,150,0.9)');
  g.addColorStop(1, 'rgba(255,180,110,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cvs);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sun = new THREE.Sprite(mat);
  sun.scale.set(140, 140, 1);
  sun.position.set(240, 150, -260);
  scene.add(sun);
}

function makeCloudTexture() {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 256;
  const ctx = cvs.getContext('2d');
  ctx.filter = 'blur(6px)';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 6; i++) {
    const cx = 60 + Math.random() * 140;
    const cy = 110 + Math.random() * 50;
    const r = 30 + Math.random() * 40;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(cvs);
}

function addClouds() {
  const tex = makeCloudTexture();
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false });
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Sprite(mat);
    const scale = 40 + Math.random() * 50;
    cloud.scale.set(scale, scale * 0.5, 1);
    cloud.position.set(
      (Math.random() * 2 - 1) * WORLD.half * 1.6,
      55 + Math.random() * 45,
      (Math.random() * 2 - 1) * WORLD.half * 1.6
    );
    scene.add(cloud);
    clouds.push({ sprite: cloud, speed: 1.5 + Math.random() * 2.5 });
  }
}

/* ---------------- Boshlang'ich ekran zarrachalari (CSS particles) ---------------- */
function addStartParticles() {
  const wrap = document.getElementById('start-particles');
  if (!wrap) return;
  const colors = ['#00e5ff', '#ff3d5a', '#ffcc33', '#7fe0ff'];
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = 2 + Math.random() * 4;
    p.style.setProperty('--s', size + 'px');
    p.style.setProperty('--c', colors[Math.floor(Math.random() * colors.length)]);
    p.style.setProperty('--d', (7 + Math.random() * 9) + 's');
    p.style.setProperty('--delay', (Math.random() * 10) + 's');
    p.style.setProperty('--x', (Math.random() * 120 - 60) + 'px');
    p.style.left = Math.random() * 100 + '%';
    wrap.appendChild(p);
  }
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

/* ---------------- Deraza teksturasi ---------------- */
function makeWindowTexture() {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 256;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#14171c';
  ctx.fillRect(0, 0, 256, 256);
  const cols = 8, rows = 12;
  const cw = 256 / cols, rh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() < 0.4;
      ctx.fillStyle = lit ? (Math.random() < 0.7 ? '#ffe9a8' : '#bdeeff') : '#2a2f38';
      ctx.fillRect(c * cw + 3, r * rh + 3, cw - 6, rh - 6);
    }
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ---------------- Neon lavha teksturasi ---------------- */
function makeNeonTexture(word, hue) {
  const cvs = document.createElement('canvas');
  cvs.width = 256; cvs.height = 96;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, 256, 96);
  ctx.font = 'bold 46px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = hue;
  ctx.shadowBlur = 22;
  ctx.fillStyle = hue;
  ctx.fillText(word, 128, 48);
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(word, 128, 48);
  const tex = new THREE.CanvasTexture(cvs);
  tex.transparent = true;
  return tex;
}

/* ---------------- Shahar (binolar, neon, chiroqlar, daraxtlar) ---------------- */
function buildCity() {
  const palette = [0x9aa5b1, 0xc9b18b, 0x8bb3c9, 0xb18bc9, 0xe0dccb, 0x7d8f99, 0xd68a5a];
  const neonWords = ['TAXI', 'CLUB', 'HOTEL', 'CAFE', 'SUSHI', 'MOTOR', 'DRIFT', 'PIZZA'];
  const neonHues = ['#ff3d8a', '#00e5ff', '#ffcc33', '#7dff6e', '#ff5c3d'];
  windowTexBase = makeWindowTexture();

  for (let i = 0; i < WORLD.gridCount; i++) {
    for (let j = 0; j < WORLD.gridCount; j++) {
      const cx = (i - WORLD.gridCount / 2) * WORLD.cell + WORLD.cell / 2;
      const cz = (j - WORLD.gridCount / 2) * WORLD.cell + WORLD.cell / 2;

      // markazni ochiq maydon sifatida qoldiramiz (start joyi)
      if (Math.abs(cx) < WORLD.cell && Math.abs(cz) < WORLD.cell) continue;

      // har bir blok burchagiga ko'cha chirog'i
      if (Math.random() < 0.6) addStreetLamp(cx - WORLD.blockSize / 2 - 3, cz - WORLD.blockSize / 2 - 3);
      if (Math.random() < 0.35) addTree(cx + WORLD.blockSize / 2 + 3, cz - WORLD.blockSize / 2 - 3);

      const numBuildings = 1 + Math.floor(Math.random() * 3);
      for (let b = 0; b < numBuildings; b++) {
        const w = 6 + Math.random() * 10;
        const d = 6 + Math.random() * 10;
        const h = 8 + Math.random() * 38;

        const margin = WORLD.blockSize / 2 - Math.max(w, d) / 2 - 1;
        const bx = cx + (Math.random() * 2 - 1) * margin * 0.6;
        const bz = cz + (Math.random() * 2 - 1) * margin * 0.6;

        const color = palette[Math.floor(Math.random() * palette.length)];
        const winTex = windowTexBase.clone();
        winTex.needsUpdate = true;
        winTex.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)));

        const sideMat = new THREE.MeshStandardMaterial({
          color, map: winTex, emissiveMap: winTex,
          emissive: new THREE.Color(0xffdd99), emissiveIntensity: 0.55,
          roughness: 0.75, metalness: 0.1,
        });
        const capMat = new THREE.MeshStandardMaterial({ color: 0x555a63, roughness: 0.9 });
        const geo = new THREE.BoxGeometry(w, h, d);
        // BoxGeometry yuzlari tartibi: +x,-x,+y,-y,+z,-z
        const mesh = new THREE.Mesh(geo, [sideMat, sideMat, capMat, capMat, sideMat, sideMat]);
        mesh.position.set(bx, h / 2, bz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        // tepasida kichik "antenna/tank" detali - vizual boyitish
        if (Math.random() < 0.4) {
          const capGeo = new THREE.BoxGeometry(w * 0.4, 2, d * 0.4);
          const cap = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x333333 }));
          cap.position.set(bx, h + 1, bz);
          cap.castShadow = true;
          scene.add(cap);
          if (Math.random() < 0.5) {
            const antenna = new THREE.Mesh(
              new THREE.CylinderGeometry(0.06, 0.06, 4, 6),
              new THREE.MeshStandardMaterial({ color: 0x222222 })
            );
            antenna.position.set(bx, h + 4, bz);
            scene.add(antenna);
            const blink = new THREE.Mesh(
              new THREE.SphereGeometry(0.18, 8, 8),
              new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 })
            );
            blink.position.set(bx, h + 6, bz);
            scene.add(blink);
          }
        }

        // baland binolarga neon reklama lavhasi
        if (h > 24 && Math.random() < 0.45) {
          const word = neonWords[Math.floor(Math.random() * neonWords.length)];
          const hue = neonHues[Math.floor(Math.random() * neonHues.length)];
          const neonTex = makeNeonTexture(word, hue);
          const neonMat = new THREE.SpriteMaterial({ map: neonTex, transparent: true, depthWrite: false });
          const neon = new THREE.Sprite(neonMat);
          neon.scale.set(8, 3, 1);
          const faceOffset = d / 2 + 0.15;
          neon.position.set(bx, h * (0.4 + Math.random() * 0.4), bz + faceOffset);
          scene.add(neon);
        }

        buildings.push({
          minX: bx - w / 2, maxX: bx + w / 2,
          minZ: bz - d / 2, maxZ: bz + d / 2,
        });
      }
    }
  }
}

/* ---------------- Ko'cha chirog'i ---------------- */
function addStreetLamp(x, z) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 6, 8),
    new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6, metalness: 0.4 })
  );
  pole.position.y = 3;
  pole.castShadow = true;
  group.add(pole);

  const armGeo = new THREE.BoxGeometry(1.4, 0.1, 0.1);
  const arm = new THREE.Mesh(armGeo, pole.material);
  arm.position.set(0.6, 5.9, 0);
  group.add(arm);

  const lampGlowTex = (() => {
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = 64;
    const ctx = cvs.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,235,170,1)');
    g.addColorStop(1, 'rgba(255,235,170,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cvs);
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: lampGlowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.set(2.4, 2.4, 1);
  glow.position.set(1.1, 5.85, 0);
  group.add(glow);

  group.position.set(x, 0, z);
  scene.add(group);
}

/* ---------------- Daraxt ---------------- */
function addTree(x, z) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.3, 2.2, 7),
    new THREE.MeshStandardMaterial({ color: 0x5b3d24, roughness: 0.9 })
  );
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  group.add(trunk);

  const leafColors = [0x2f7d3e, 0x3f9950, 0x2a6b38];
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(1.1 - i * 0.15, 8, 8),
      new THREE.MeshStandardMaterial({ color: leafColors[i % leafColors.length], roughness: 0.85 })
    );
    leaf.position.set((Math.random() - 0.5) * 0.5, 2.4 + i * 0.7, (Math.random() - 0.5) * 0.5);
    leaf.castShadow = true;
    group.add(leaf);
  }
  group.position.set(x, 0, z);
  scene.add(group);
}

/* ---------------- Mashina modeli ---------------- */
function buildCar() {
  carGroup = new THREE.Group();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8342c, roughness: 0.25, metalness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.2,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 4.2), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  carGroup.add(body);

  // dvigatel qopqog'i (moyilgan old qism)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.28, 1.3), bodyMat);
  hood.position.set(0, 0.98, 1.55);
  hood.rotation.x = -0.09;
  hood.castShadow = true;
  carGroup.add(hood);

  // shisha (kabina) - yarim shaffof
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0d1720, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55,
    transmission: 0.4, clearcoat: 1,
  });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, 2.0), glassMat);
  cabin.position.set(0, 1.26, -0.2);
  cabin.castShadow = true;
  carGroup.add(cabin);

  // kabina tepasidagi ingichka ramka chizig'i
  const roofTrim = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.05, 2.02),
    new THREE.MeshStandardMaterial({ color: 0x14181d })
  );
  roofTrim.position.set(0, 1.58, -0.2);
  carGroup.add(roofTrim);

  // xrom bamperlar
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcfd8e0, roughness: 0.15, metalness: 0.95 });
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.2, 0.25), chromeMat);
  bumperF.position.set(0, 0.4, 2.15);
  carGroup.add(bumperF);
  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.2, 0.25), chromeMat);
  bumperR.position.set(0, 0.4, -2.15);
  carGroup.add(bumperR);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
  spoiler.position.set(0, 1.15, -2.0);
  carGroup.add(spoiler);
  [-0.85, 0.85].forEach(x => {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), spoiler.material);
    strut.position.set(x, 0.95, -2.0);
    carGroup.add(strut);
  });

  // faralar (yorug' emissiv) + nur konusi
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffee88, emissiveIntensity: 1 });
  [-0.75, 0.75].forEach(x => {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), headMat);
    head.position.set(x, 0.7, 2.05);
    carGroup.add(head);
  });
  const beamTex = (() => {
    const cvs = document.createElement('canvas'); cvs.width = 64; cvs.height = 64;
    const ctx = cvs.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,250,220,0.85)');
    g.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cvs);
  })();
  [-0.75, 0.75].forEach(x => {
    const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.scale.set(1.6, 1.6, 1);
    beam.position.set(x, 0.7, 2.5);
    carGroup.add(beam);
  });

  brakeLightMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.5 });
  [-0.75, 0.75].forEach(x => {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), brakeLightMat);
    tail.position.set(x, 0.7, -2.05);
    carGroup.add(tail);
  });

  // g'ildiraklar + xrom disklar
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.42, 20);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });
  const rimGeo = new THREE.TorusGeometry(0.27, 0.06, 8, 16);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8dee3, roughness: 0.2, metalness: 0.9 });
  const hubGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.46, 10);

  function makeWheel(x, z) {
    const wGroup = new THREE.Group();
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.castShadow = true;
    wGroup.add(w);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.y = Math.PI / 2;
    wGroup.add(rim);
    const hub = new THREE.Mesh(hubGeo, rimMat);
    hub.rotation.z = Math.PI / 2;
    wGroup.add(hub);
    wGroup.position.set(x, 0.45, z);
    carGroup.add(wGroup);
    return wGroup;
  }
  wheelFL = makeWheel(-1.15, 1.4);
  wheelFR = makeWheel(1.15, 1.4);
  wheelRL = makeWheel(-1.15, -1.4);
  wheelRR = makeWheel(1.15, -1.4);

  carGroup.position.set(0, 0, 0);
  scene.add(carGroup);
  car = carGroup;

  buildExhaustParticles();
  buildDustParticles();
}

/* ---------------- Zarracha (particle) yordamchi funksiyalar ---------------- */
function makeSoftDotTexture(color) {
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = 32;
  const ctx = cvs.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cvs);
}

function buildExhaustParticles() {
  const tex = makeSoftDotTexture('rgba(210,210,210,0.85)');
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.7 });
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(mat.clone());
    s.scale.set(0.01, 0.01, 1);
    s.visible = false;
    scene.add(s);
    exhaustParticles.push({ sprite: s, life: 0, active: false });
  }
}

function buildDustParticles() {
  const tex = makeSoftDotTexture('rgba(200,180,140,0.75)');
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.6 });
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Sprite(mat.clone());
    s.scale.set(0.01, 0.01, 1);
    s.visible = false;
    scene.add(s);
    dustParticles.push({ sprite: s, life: 0, active: false, vx: 0, vz: 0 });
  }
}

function buildBurstPool() {
  const tex = makeSoftDotTexture('rgba(255,220,80,0.95)');
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(mat.clone());
    s.scale.set(0.01, 0.01, 1);
    s.visible = false;
    scene.add(s);
    burstParticles.push({ sprite: s, life: 0, active: false, vx: 0, vy: 0, vz: 0 });
  }
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

/* ---------------- Zarrachalarni ishga tushirish ---------------- */
function spawnExhaust() {
  const p = exhaustParticles.find(p => !p.active);
  if (!p) return;
  const back = new THREE.Vector3(-Math.sin(carState.angle), 0, -Math.cos(carState.angle));
  p.sprite.position.set(
    carState.x + back.x * 2.2 + (Math.random() - 0.5) * 0.3,
    0.5 + Math.random() * 0.2,
    carState.z + back.z * 2.2 + (Math.random() - 0.5) * 0.3
  );
  p.sprite.scale.set(0.35, 0.35, 1);
  p.sprite.material.opacity = 0.55;
  p.sprite.visible = true;
  p.active = true;
  p.life = 0;
}

function spawnDust() {
  const p = dustParticles.find(p => !p.active);
  if (!p) return;
  p.sprite.position.set(
    carState.x + (Math.random() - 0.5) * 1.6,
    0.15,
    carState.z + (Math.random() - 0.5) * 2.2
  );
  p.sprite.scale.set(0.25, 0.25, 1);
  p.sprite.material.opacity = 0.55;
  p.sprite.visible = true;
  p.active = true;
  p.life = 0;
  p.vx = (Math.random() - 0.5) * 1.5;
  p.vz = (Math.random() - 0.5) * 1.5;
}

function spawnBurst(x, y, z) {
  for (let i = 0; i < 14; i++) {
    const p = burstParticles.find(p => !p.active);
    if (!p) break;
    p.sprite.position.set(x, y, z);
    p.sprite.scale.set(0.2, 0.2, 1);
    p.sprite.material.opacity = 1;
    p.sprite.visible = true;
    p.active = true;
    p.life = 0;
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.5 + Math.random() * 2.5;
    p.vx = Math.cos(ang) * spd;
    p.vz = Math.sin(ang) * spd;
    p.vy = 2 + Math.random() * 2.5;
  }
}

function updateParticles(dt) {
  exhaustParticles.forEach(p => {
    if (!p.active) return;
    p.life += dt;
    p.sprite.position.y += dt * 0.6;
    p.sprite.scale.addScalar(dt * 1.1);
    p.sprite.material.opacity = Math.max(0, 0.55 - p.life * 0.7);
    if (p.life > 0.8) { p.active = false; p.sprite.visible = false; }
  });

  dustParticles.forEach(p => {
    if (!p.active) return;
    p.life += dt;
    p.sprite.position.x += p.vx * dt;
    p.sprite.position.z += p.vz * dt;
    p.sprite.scale.addScalar(dt * 0.9);
    p.sprite.material.opacity = Math.max(0, 0.55 - p.life * 0.9);
    if (p.life > 0.7) { p.active = false; p.sprite.visible = false; }
  });

  burstParticles.forEach(p => {
    if (!p.active) return;
    p.life += dt;
    p.vy -= dt * 4;
    p.sprite.position.x += p.vx * dt;
    p.sprite.position.y += p.vy * dt;
    p.sprite.position.z += p.vz * dt;
    p.sprite.material.opacity = Math.max(0, 1 - p.life * 1.4);
    if (p.life > 0.8) { p.active = false; p.sprite.visible = false; }
  });
}

function updateClouds(dt) {
  const limit = WORLD.half * 1.7;
  clouds.forEach(c => {
    c.sprite.position.x += c.speed * dt;
    if (c.sprite.position.x > limit) c.sprite.position.x = -limit;
  });
}


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

  // tormoz chiroqlari
  if (brakeLightMat) {
    const braking = keys.brake || keys.backward;
    brakeLightMat.emissiveIntensity = braking ? 1.6 : 0.5;
  }

  // quvur tutuni (tezlanayotganda)
  if ((keys.forward || (keys.nitro && carState.nitro > 0)) && Math.abs(carState.speed) > 2) {
    spawnExhaust();
  }

  // g'ildirak changi (qo'l tormoz + tezlik bilan)
  if (keys.brake && Math.abs(carState.speed) > 6) {
    spawnDust();
  }
}

/* ---------------- Kamera ---------------- */
function updateCamera(dt) {
  const forward = new THREE.Vector3(Math.sin(carState.angle), 0, Math.cos(carState.angle));
  const speedRatio = Math.abs(carState.speed) / CAR_SPEC.maxSpeedNitro;

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

  // yuqori tezlikda yengil kamera tebranishi (shake)
  if (speedRatio > 0.55) {
    const shake = (speedRatio - 0.55) * 0.35;
    desired.x += (Math.random() - 0.5) * shake;
    desired.y += (Math.random() - 0.5) * shake * 0.5;
    desired.z += (Math.random() - 0.5) * shake;
  }

  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  const lookAt = new THREE.Vector3(
    carState.x + forward.x * 4,
    1.2,
    carState.z + forward.z * 4
  );
  camera.lookAt(lookAt);

  // nitro paytida FOV kengayishi - tezlik hissi
  const targetFov = (keys.nitro && carState.nitro > 0) ? baseFov + 12 : baseFov;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
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
      spawnBurst(c.x, 1.3, c.z);
      const coinValueEl = document.getElementById('coin-value');
      coinValueEl.firstChild.textContent = coinsCollected;
      coinValueEl.classList.remove('pop');
      void coinValueEl.offsetWidth; // qayta trigger uchun reflow
      coinValueEl.classList.add('pop');
      showMessage('+1 tanga! ✨');
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
  const speedEl = document.getElementById('speed-value');
  speedEl.textContent = Math.round(kmh);
  speedEl.classList.toggle('speed-mid', kmh > 70 && kmh <= 130);
  speedEl.classList.toggle('speed-high', kmh > 130);

  elapsedTime += dt;
  const mm = String(Math.floor(elapsedTime / 60)).padStart(2, '0');
  const ss = String(Math.floor(elapsedTime % 60)).padStart(2, '0');
  document.getElementById('time-value').textContent = `${mm}:${ss}`;

  const nitroFill = document.getElementById('nitro-bar-fill');
  nitroFill.style.width = carState.nitro + '%';
  const nitroActive = keys.nitro && carState.nitro > 0;
  nitroFill.classList.toggle('active', nitroActive);

  document.getElementById('speed-vignette').classList.toggle('on', nitroActive || kmh > 130);
  document.getElementById('speed-lines').classList.toggle('on', nitroActive);
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

  updateClouds(dt);

  if (gameStarted) {
    updateCar(dt);
    updateCamera(dt);
    updateCoins(dt, t);
    updateParticles(dt);
    updateHUD(dt);
    drawMinimap();
  }

  renderer.render(scene, camera);
}

init();