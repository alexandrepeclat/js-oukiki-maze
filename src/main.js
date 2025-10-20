import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const CONFIG = { cols: 11, rows: 11, cellSize: 3, wallHeight: 2.2, trapCount: 8 };

// === UTILS ===
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

// === MAZE GEN ===
function generateMaze(cols, rows) {
  const w = cols, h = rows;
  const maze = Array.from({ length: h }, () => Array.from({ length: w }, () => 1));
  const carve = (cx, cy) => {
    maze[cy][cx] = 0;
    const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    for (let i = dirs.length - 1; i >= 0; i--) { const j = randInt(0, i);[dirs[i], dirs[j]] = [dirs[j], dirs[i]]; }
    for (const d of dirs) {
      const nx = cx + d[0], ny = cy + d[1];
      if (nx > 0 && nx < w && ny > 0 && ny < h && maze[ny][nx] === 1) {
        maze[cy + d[1] / 2][cx + d[0] / 2] = 0;
        carve(nx, ny);
      }
    }
  };
  carve(1, 1);
  return maze;
}

// === SCENE ===
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 18, 8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(5, 10, 7); scene.add(dir);

// === BALL ===
let ballMesh = null, ballRadius = 0.4;
const gltfLoader = new GLTFLoader();
function createFallbackBall() {
  const geo = new THREE.SphereGeometry(ballRadius, 32, 32);
  const mat = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.4, color: 0xffd166 });
  const m = new THREE.Mesh(geo, mat);
  scene.add(m);
  return m;
}
const ballPos = new THREE.Vector3(), ballVel = new THREE.Vector3();

// === MAZE VISUAL ===
let mazeGroup = null, mazeData = null;
function buildMazeVisual(maze) {
  if (mazeGroup) { scene.remove(mazeGroup); mazeGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
  mazeGroup = new THREE.Group();
  const cs = CONFIG.cellSize, w = maze[0].length, h = maze.length;
  const floorGeom = new THREE.PlaneGeometry(w * cs, h * cs);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x222233 });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((w - 1) / 2 * cs, 0, (h - 1) / 2 * cs);
  mazeGroup.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
  const wallGeom = new THREE.BoxGeometry(cs, CONFIG.wallHeight, cs);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (maze[y][x] === 1) {
        const wx = x * cs, wz = y * cs;
        const box = new THREE.Mesh(wallGeom, wallMat);
        box.position.set(wx, CONFIG.wallHeight / 2, wz);
        box.userData.isWall = true;
        box.userData.aabb = {
          min: new THREE.Vector3(wx - cs / 2, 0, wz - cs / 2),
          max: new THREE.Vector3(wx + cs / 2, CONFIG.wallHeight, wz + cs / 2)
        };
        mazeGroup.add(box);
      }
    }
  }

  mazeGroup.position.x = -((w - 1) / 2) * cs;
  mazeGroup.position.z = -((h - 1) / 2) * cs;
  scene.add(mazeGroup);
}

// === INPUTS ===
let accel = { x: 0, y: 0, z: 0 };
let keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
function handleMotion(e) {
  if (e.accelerationIncludingGravity) {
    accel.x = e.accelerationIncludingGravity.x || 0;
    accel.y = e.accelerationIncludingGravity.y || 0;
  }
}
document.getElementById('motion-btn').addEventListener('click', () => {
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().then(resp => { if (resp === 'granted') window.addEventListener('devicemotion', handleMotion); });
  } else window.addEventListener('devicemotion', handleMotion);
});
window.addEventListener('keydown', e => { if (e.code in keys) keys[e.code] = true; });
window.addEventListener('keyup', e => { if (e.code in keys) keys[e.code] = false; });

// === COLLISIONS ===
function checkCollisions() {
  if (!mazeGroup || !ballMesh) return;
  const r = ballRadius;
  const ballBox = {
    min: new THREE.Vector3(ballPos.x - r, 0, ballPos.z - r),
    max: new THREE.Vector3(ballPos.x + r, CONFIG.wallHeight, ballPos.z + r)
  };

  mazeGroup.children.forEach(c => {
    if (!c.userData.isWall) return;
    const a = c.userData.aabb;
    if (a.max.x < ballBox.min.x || a.min.x > ballBox.max.x ||
      a.max.z < ballBox.min.z || a.min.z > ballBox.max.z) return;
    const dx1 = a.max.x - ballBox.min.x;
    const dx2 = ballBox.max.x - a.min.x;
    const dz1 = a.max.z - ballBox.min.z;
    const dz2 = ballBox.max.z - a.min.z;
    const minX = Math.min(dx1, dx2);
    const minZ = Math.min(dz1, dz2);
    if (minX < minZ) {
      if (dx1 < dx2) ballPos.x += dx1 + 0.001;
      else ballPos.x -= dx2 + 0.001;
      ballVel.x *= -0.2;
    } else {
      if (dz1 < dz2) ballPos.z += dz1 + 0.001;
      else ballPos.z -= dz2 + 0.001;
      ballVel.z *= -0.2;
    }
  });
}

// === ANIMATE ===
function animate() {
  requestAnimationFrame(animate);
  const dt = 0.016;
  const force = 1.5;
  const keyForce = 3.0;

  // clavier
  let fx = 0, fz = 0;
  if (keys.ArrowUp) fz -= keyForce;
  if (keys.ArrowDown) fz += keyForce;
  if (keys.ArrowLeft) fx -= keyForce;
  if (keys.ArrowRight) fx += keyForce;

  // mouvement
  if (ballMesh) {
    ballVel.x += ((-accel.x || 0) * force + fx) * dt;
    ballVel.z += ((accel.y || 0) * force + fz) * dt;
    ballVel.multiplyScalar(0.95);
    ballPos.add(ballVel);
    checkCollisions();
    ballMesh.position.copy(ballPos);
  }

  renderer.render(scene, camera);
}
animate();

// === LOAD/START ===
document.getElementById('load-btn').addEventListener('click', () => {
  mazeData = generateMaze(CONFIG.cols, CONFIG.rows);
  buildMazeVisual(mazeData);
  if (ballMesh) { scene.remove(ballMesh); ballMesh = null; }

  gltfLoader.load('model.glb', gltf => {
    ballMesh = gltf.scene.children[0] || gltf.scene;
    const box = new THREE.Box3().setFromObject(ballMesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = (ballRadius * 2) / (maxDim || 1);

    // augmente la taille visuelle du modèle
    const visualScaleFactor = 30.03; // ← ajuste cette valeur
    ballMesh.scale.setScalar(scale * visualScaleFactor);

    scene.add(ballMesh);
    ballMesh.position.copy(ballPos);
    console.log('GLTF loaded:', gltf);
  }, undefined, err => {
    console.warn('Erreur chargement modèle, fallback sphère', err);
    ballMesh = createFallbackBall();
  });

  ballPos.set(0, ballRadius, 0);
  ballVel.set(0, 0, 0);
});
