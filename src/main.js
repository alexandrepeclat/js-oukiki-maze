import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ===== CONFIG =====
const CONFIG = { cols:11, rows:11, cellSize:3, wallHeight:2.2, trapCount:8 };

// ===== UTIL =====
const randInt = (a,b)=>Math.floor(Math.random()*(b-a+1))+a;

// ===== GENERATION LABYRINTHE =====
function generateMaze(cols,rows){
  const w=cols,h=rows;
  const maze = Array.from({length:h},()=>Array.from({length:w},()=>1));
  const carve=(cx,cy)=>{
    maze[cy][cx]=0;
    const dirs=[[2,0],[-2,0],[0,2],[0,-2]];
    for(let i=dirs.length-1;i>=0;i--){ const j=randInt(0,i); [dirs[i],dirs[j]]=[dirs[j],dirs[i]]; }
    for(const d of dirs){
      const nx=cx+d[0], ny=cy+d[1];
      if(nx>0&&nx<w&&ny>0&&ny<h&&maze[ny][nx]===1){
        maze[cy+d[1]/2][cx+d[0]/2]=0;
        carve(nx,ny);
      }
    }
  };
  carve(1,1);
  return maze;
}

// ===== SCENE =====
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 100);
camera.position.set(0,18,8);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);
window.addEventListener('resize',()=>{ camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

scene.add(new THREE.HemisphereLight(0xffffff,0x444444,0.6));
const dir = new THREE.DirectionalLight(0xffffff,0.9); dir.position.set(5,10,7); scene.add(dir);

// ===== BALL =====
let ballMesh=null, ballRadius=0.4;
const gltfLoader = new GLTFLoader();
function createFallbackBall(){ const geo=new THREE.SphereGeometry(ballRadius,32,32); const mat=new THREE.MeshStandardMaterial({metalness:0.2,roughness:0.4,color:0xffd166}); const m=new THREE.Mesh(geo,mat); scene.add(m); return m; }
const ballPos = new THREE.Vector3(), ballVel=new THREE.Vector3();

// ===== MAZE VISUAL =====
let mazeGroup=null, mazeData=null, startCell=null, endCell=null, traps=[];
function buildMazeVisual(maze){
  if(mazeGroup){ scene.remove(mazeGroup); mazeGroup.traverse(c=>{ if(c.geometry)c.geometry.dispose(); }); }
  mazeGroup=new THREE.Group();
  const cs=CONFIG.cellSize, w=maze[0].length, h=maze.length;
  const floorGeom=new THREE.PlaneGeometry(w*cs,h*cs);
  const floorMat=new THREE.MeshStandardMaterial({color:0x222233});
  const floor=new THREE.Mesh(floorGeom,floorMat); floor.rotation.x=-Math.PI/2; floor.position.set((w-1)/2*cs,0,(h-1)/2*cs); mazeGroup.add(floor);
  const wallMat=new THREE.MeshStandardMaterial({color:0xaaaaaa});
  const wallGeom=new THREE.BoxGeometry(cs,CONFIG.wallHeight,cs);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(maze[y][x]===1){ const wx=x*cs,wz=y*cs; const box=new THREE.Mesh(wallGeom,wallMat); box.position.set(wx,CONFIG.wallHeight/2,wz); mazeGroup.add(box); box.userData.isWall=true; box.userData.aabb={ min:new THREE.Vector3(wx-cs/2,0,wz-cs/2), max:new THREE.Vector3(wx+cs/2,CONFIG.wallHeight,wz+cs/2)};}
  mazeGroup.position.x=-((w-1)/2)*cs; mazeGroup.position.z=-((h-1)/2)*cs;
  scene.add(mazeGroup);
}

// ===== ACCEL =====
let accel={x:0,y:0,z:0}, usingDevice=false;
function handleMotion(e){ if(e.accelerationIncludingGravity){ accel.x=e.accelerationIncludingGravity.x||0; accel.y=e.accelerationIncludingGravity.y||0; usingDevice=true; } }
document.getElementById('motion-btn').addEventListener('click',()=>{ 
  if(typeof DeviceMotionEvent !=='undefined' && typeof DeviceMotionEvent.requestPermission==='function'){
    DeviceMotionEvent.requestPermission().then(resp=>{ if(resp==='granted') window.addEventListener('devicemotion', handleMotion); });
  } else window.addEventListener('devicemotion', handleMotion);
});

// ===== ANIMATION =====
function animate(){
  requestAnimationFrame(animate);
  const dt=0.016;
  if(ballMesh){
    const force=6;
    ballVel.x += (-accel.x||0)*force*dt;
    ballVel.z += (accel.y||0)*force*dt;
    ballVel.multiplyScalar(0.95);
    ballPos.add(ballVel);
    ballMesh.position.copy(ballPos);
  }
  renderer.render(scene,camera);
}
animate();

// ===== LOAD/START =====
document.getElementById('load-btn').addEventListener('click',()=>{
  mazeData=generateMaze(CONFIG.cols,CONFIG.rows);
  buildMazeVisual(mazeData);
  startCell={x:1,y:1}; endCell={x:CONFIG.cols-2,y:CONFIG.rows-2};
  traps=[];
  if(ballMesh){ scene.remove(ballMesh); ballMesh=null; }
  const url=document.getElementById('glb-url').value.trim();
  if(url){
    gltfLoader.load(url,gltf=>{ ballMesh=gltf.scene.children[0]||gltf.scene; const box=new THREE.Box3().setFromObject(ballMesh); const s=Math.max(box.getSize(new THREE.Vector3()).x,box.getSize(new THREE.Vector3()).y,box.getSize(new THREE.Vector3()).z)||1; ballMesh.scale.setScalar(ballRadius*2/s); scene.add(ballMesh); ballMesh.position.copy(ballPos);},undefined,err=>{ console.warn(err); ballMesh=createFallbackBall(); });
  } else ballMesh=createFallbackBall();
  ballPos.set(0,ballRadius,0); ballVel.set(0,0,0);
});
