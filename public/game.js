'use strict';
/* ============================================================
   PROTOCOLO // FPS tático — engine, simulação e modo solo
   (multiplayer em net.js)
   ============================================================ */

// ---------------- utilidades ----------------
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const rand=(a,b)=>a+Math.random()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const isTouch=window.matchMedia('(pointer: coarse)').matches||
  (navigator.maxTouchPoints>0&&!window.matchMedia('(pointer: fine)').matches);
if(isTouch)document.body.classList.add('touch');
const $=id=>document.getElementById(id);

// ---------------- configurações ----------------
const SET_DEF={sens:1,fov:75,vol:0.8,qual:'auto',res:1,fx:true,fps:false,fpsCap:0,invert:false};
let SET=Object.assign({},SET_DEF);
try{
  const s=JSON.parse(localStorage.getItem('proto_set_v1'));
  if(s)SET=Object.assign(SET_DEF,s);
}catch(e){}
function saveSet(){try{localStorage.setItem('proto_set_v1',JSON.stringify(SET));}catch(e){}}
// níveis de qualidade: sombras, tamanho do shadow map e teto de pixel ratio
function qualBase(){
  const q=SET.qual==='auto'?'high':SET.qual;
  if(q==='high')return{sh:true,shSize:isTouch?1024:2048,cap:isTouch?1.5:2};
  if(q==='med')return{sh:true,shSize:1024,cap:1.25};
  return{sh:false,shSize:512,cap:1};
}
let autoScale=1; // modo AUTO reduz/aumenta a resolução interna conforme o FPS
function computedPR(){
  const base=Math.min(window.devicePixelRatio||1,qualBase().cap);
  return clamp(base*SET.res*autoScale,0.5,Math.max(1,window.devicePixelRatio||1));
}
function applyQuality(){
  const qb=qualBase();
  renderer.setPixelRatio(computedPR());
  if(renderer.shadowMap.enabled!==qb.sh){
    renderer.shadowMap.enabled=qb.sh;
    scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;});
  }
  sun.castShadow=qb.sh;
  sun.shadow.mapSize.set(qb.shSize,qb.shSize);
  if(sun.shadow.map&&sun.shadow.map.dispose){sun.shadow.map.dispose();sun.shadow.map=null;}
  for(const m of mapGroup.children){m.castShadow=qb.sh&&m.userData.shadow!==false;m.receiveShadow=true;}
  resize();
}

// ---------------- renderer / cena ----------------
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0f1923);
scene.fog=new THREE.Fog(0x0f1923,70,170);
const camera=new THREE.PerspectiveCamera(SET.fov,1,0.08,300);
camera.rotation.order='YXZ';
scene.add(camera);
function resize(){
  renderer.setSize(window.innerWidth,window.innerHeight);
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);resize();

scene.add(new THREE.HemisphereLight(0xcfe4ff,0x2a2119,0.85));
const sun=new THREE.DirectionalLight(0xffe6bf,1.05);
sun.position.set(38,60,22);
sun.castShadow=true;
sun.shadow.mapSize.set(isTouch?1024:2048,isTouch?1024:2048);
sun.shadow.camera.left=-60;sun.shadow.camera.right=60;
sun.shadow.camera.top=60;sun.shadow.camera.bottom=-60;
sun.shadow.camera.near=10;sun.shadow.camera.far=180;
sun.shadow.bias=-0.0004;
scene.add(sun);

// ---------------- mapa V3: estação AURORA ----------------
// A arena inteira é construída com InstancedMesh (poucas draw calls no celular).
// Coberturas e hitboxes vêm da MESMA lista; nenhuma parede visual é atravessável.
const solids=[];
const radarRects=[];
const mapGroup=new THREE.Group();
scene.add(mapGroup);
function mat(color,rough){
  return new THREE.MeshStandardMaterial({color,roughness:rough===undefined?0.92:rough,metalness:0.05});
}
const MAPCOL={floor:0x223440,tile:0x283d4a,tile2:0x2c414c,wall:0x354b59,wall2:0x445d69,
  edge:0x172832,cover:0x576f78,top:0x778991,dark:0x162630,teal:0x39d8c1,red:0xe65366,
  blue:0x5ca8e8,amber:0xf5c57a,shadow:0x1a323a};
const mapBoxes=[];
function addBox(x,z,w,h,d,color,opts){
  opts=opts||{};
  mapBoxes.push({x,z,w,h,d,color,opts});
  if(opts.solid!==false){
    const y=opts.y||0;
    solids.push({minX:x-w/2,maxX:x+w/2,minY:y,maxY:y+h,minZ:z-d/2,maxZ:z+d/2});
    if(opts.radar!==false)radarRects.push({x,z,w,d});
  }
}
function flushMapBoxes(){
  const buckets=new Map();
  for(const b of mapBoxes){
    const glow=b.opts.glow||0,shadow=b.opts.shadow!==false;
    const key=b.color+'|'+glow+'|'+shadow;
    if(!buckets.has(key))buckets.set(key,{color:b.color,glow,shadow,boxes:[]});
    buckets.get(key).boxes.push(b);
  }
  const dummy=new THREE.Object3D();
  for(const spec of buckets.values()){
    const material=new THREE.MeshStandardMaterial({color:spec.color,roughness:spec.glow?0.43:0.86,metalness:0.18,
      emissive:spec.glow?spec.color:0x000000,emissiveIntensity:spec.glow});
    const m=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,spec.boxes.length);
    for(let i=0;i<spec.boxes.length;i++){
      const b=spec.boxes[i];
      dummy.position.set(b.x,(b.opts.y||0)+b.h/2,b.z);
      dummy.rotation.set(0,0,0);
      dummy.scale.set(b.w,b.h,b.d);
      dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);
    }
    m.instanceMatrix.needsUpdate=true;m.frustumCulled=false;
    m.castShadow=spec.shadow;m.receiveShadow=true;m.userData.shadow=spec.shadow;
    mapGroup.add(m);
  }
}
const floor=new THREE.Mesh(new THREE.PlaneGeometry(96,96),mat(MAPCOL.floor,0.96));
floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
// Piso metálico em módulos alternados; sul e norte são rotacionáveis pela simetria do mapa.
for(let x=-39;x<=39;x+=6)for(let z=-39;z<=39;z+=6){
  addBox(x,z,5.88,.036,5.88,((x+z)/6)%2===0?MAPCOL.tile:MAPCOL.tile2,{y:0.008,solid:false,shadow:false});
}
// Limites: cobertura, passarelas altas e letreiro de navegação.
addBox(0,-41,84,8,2,MAPCOL.wall);addBox(0,41,84,8,2,MAPCOL.wall);
addBox(-41,0,2,8,84,MAPCOL.wall);addBox(41,0,2,8,84,MAPCOL.wall);
for(const side of [-1,1]){
  addBox(side*40,0,.22,.15,76,side<0?MAPCOL.blue:MAPCOL.red,{y:5.15,solid:false,shadow:false,glow:1.8});
  addBox(0,side*40,76,.15,.22,side<0?MAPCOL.blue:MAPCOL.red,{y:5.15,solid:false,shadow:false,glow:1.8});
  // Lanes exteriores largas; os marcadores luminosos acompanham o caminho de cada time.
  for(let z=-30;z<=30;z+=10){
    addBox(side*20,z,2.0,.016,3.2,side<0?MAPCOL.blue:MAPCOL.teal,{y:.055,solid:false,shadow:false,glow:.85});
    addBox(side*35,z,.65,.018,3.5,MAPCOL.amber,{y:.056,solid:false,shadow:false,glow:.9});
  }
  // Núcleo central e asas: acesso pelo meio ou pelas duas rotas laterais.
  addBox(side*11,-13,1.8,3.4,7.2,MAPCOL.wall2);
  addBox(side*11,13,1.8,3.4,7.2,MAPCOL.wall2);
  addBox(side*11,-13,2.05,.2,7.4,MAPCOL.top,{y:3.35,solid:false,shadow:false});
  addBox(side*11,13,2.05,.2,7.4,MAPCOL.top,{y:3.35,solid:false,shadow:false});
  addBox(side*9,25,3.5,1.6,3.2,MAPCOL.cover);
  addBox(side*9,-25,3.5,1.6,3.2,MAPCOL.cover);
  addBox(side*9,25,3.55,.11,3.25,MAPCOL.amber,{y:1.53,solid:false,shadow:false,glow:.4});
  addBox(side*9,-25,3.55,.11,3.25,MAPCOL.amber,{y:1.53,solid:false,shadow:false,glow:.4});
  // Caixas baixas que permitem salto, e pilhas altas que quebram a linha de tiro.
  for(const z of [-22,22]){
    addBox(side*31,z,4.0,1.1,4.6,MAPCOL.cover);
    addBox(side*31,z,4.05,.13,4.65,MAPCOL.top,{y:1.06,solid:false,shadow:false});
    addBox(side*35,z+4,2.1,2.35,2.1,MAPCOL.wall2);
    addBox(side*35,z+4,2.17,.1,2.17,MAPCOL.amber,{y:2.3,solid:false,shadow:false,glow:.7});
  }
  addBox(side*32,0,4.2,2.7,5.6,MAPCOL.wall2);
  addBox(side*32,0,4.4,.14,5.8,MAPCOL.top,{y:2.65,solid:false,shadow:false});
  // Portais altos nos acessos, sem bloquear a passagem a pé nem o tiro na lane x=-20.
  for(const z of [-16,16]){
    addBox(side*30,z,.72,4.7,.72,MAPCOL.dark);
    addBox(side*9,z,.72,4.7,.72,MAPCOL.dark);
    addBox(side*19.5,z,21.7,.45,.75,MAPCOL.wall2,{y:4.65,solid:false});
    addBox(side*19.5,z,21.7,.12,.35,side<0?MAPCOL.blue:MAPCOL.red,{y:4.93,solid:false,shadow:false,glow:1.1});
  }
  // Estrutura de acesso nas bases, para enquadrar a saída de cada equipe.
  addBox(side*18,36,3,3.1,2.8,MAPCOL.wall2);
  addBox(side*18,-36,3,3.1,2.8,MAPCOL.wall2);
}
// Reator do meio: cobertura em todas as faces, tampo e anel iluminado.
addBox(0,0,9,3.9,9,MAPCOL.dark);
addBox(0,0,9.5,.20,9.5,MAPCOL.cover,{y:3.76,solid:false});
for(const x of [-4.58,4.58])addBox(x,0,.12,.18,8.8,MAPCOL.teal,{y:2.8,solid:false,shadow:false,glow:1.4});
for(const z of [-4.58,4.58])addBox(0,z,8.8,.18,.12,MAPCOL.teal,{y:2.8,solid:false,shadow:false,glow:1.4});
addBox(0,0,6,.1,6,MAPCOL.teal,{y:3.98,solid:false,shadow:false,glow:1.2});
// Bases sinalizadas (faixas não colidem, nem obstruem os spawns).
for(const side of [-1,1]){
  const z=side*33,col=side<0?MAPCOL.blue:MAPCOL.red;
  addBox(0,z,13,.018,.24,col,{y:.057,solid:false,shadow:false,glow:1.5});
  for(let i=-2;i<=2;i++)addBox(i*2.3,z+side*2,.12,.018,2.2,col,{y:.057,solid:false,shadow:false,glow:.8});
}
flushMapBoxes();
function siteDecal(x,z,letter,color){
  const cv=document.createElement('canvas');cv.width=cv.height=256;
  const g=cv.getContext('2d');
  g.strokeStyle=color;g.lineWidth=9;g.beginPath();g.arc(128,128,100,0,Math.PI*2);g.stroke();
  g.fillStyle=color;g.font='italic bold 142px Arial';g.textAlign='center';g.textBaseline='middle';g.fillText(letter,128,143);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(8.5,8.5),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,opacity:0.54,depthWrite:false}));
  m.rotation.x=-Math.PI/2;m.position.set(x,.093,z);
  scene.add(m);
}
siteDecal(-27,-10,'A','#46ffd7');
siteDecal(27,10,'B','#ff6776');
function spawnRing(z,color){
  const m=new THREE.Mesh(new THREE.TorusGeometry(3,.075,5,36),
    new THREE.MeshBasicMaterial({color,transparent:true,opacity:.72}));
  m.rotation.x=-Math.PI/2;m.position.set(0,.095,z);scene.add(m);
}
spawnRing(33,MAPCOL.red);spawnRing(-33,MAPCOL.blue);
const reactorCore=new THREE.Mesh(new THREE.OctahedronGeometry(1.05,0),
  new THREE.MeshStandardMaterial({color:MAPCOL.teal,metalness:.5,roughness:.2,emissive:MAPCOL.teal,emissiveIntensity:1.0}));
reactorCore.position.set(0,5.8,0);scene.add(reactorCore);
applyQuality();

const NAV=[[-20,-18],[20,18],[-20,3],[20,-3],[0,-30],[0,30],[0,17],[0,-17],[-30,10],[30,-10],[-34,-28],[34,28]];
const SPAWNS=[[-20,-18],[20,18],[0,-29],[-27,-10],[27,10],[-20,24],[20,-24],[0,14]];

// ---------------- física ----------------
function collideXZ(x,y,z,r,h){
  h=h===undefined?1.8:h;
  for(let i=0;i<solids.length;i++){
    const b=solids[i];
    if(y<b.maxY-0.001&&y+h>b.minY&&x>b.minX-r&&x<b.maxX+r&&z>b.minZ-r&&z<b.maxZ+r)return true;
  }
  return false;
}
function groundHeight(x,z,r,fromY){
  let g=0;
  for(let i=0;i<solids.length;i++){
    const b=solids[i];
    if(x>b.minX-r&&x<b.maxX+r&&z>b.minZ-r&&z<b.maxZ+r&&b.maxY<=fromY+0.25&&b.maxY>g)g=b.maxY;
  }
  return g;
}
function rayBox(ox,oy,oz,dx,dy,dz,b){
  let tmin=-1e9,tmax=1e9;
  const AXES=[[ox,dx,b.minX,b.maxX],[oy,dy,b.minY,b.maxY],[oz,dz,b.minZ,b.maxZ]];
  for(let i=0;i<3;i++){
    const o=AXES[i][0],d=AXES[i][1],mn=AXES[i][2],mx=AXES[i][3];
    if(Math.abs(d)<1e-8){if(o<mn||o>mx)return -1;}
    else{
      let t1=(mn-o)/d,t2=(mx-o)/d;
      if(t1>t2){const s=t1;t1=t2;t2=s;}
      if(t1>tmin)tmin=t1;if(t2<tmax)tmax=t2;
      if(tmin>tmax)return -1;
    }
  }
  if(tmin>0)return tmin;
  return tmax>0?tmax:-1;
}
function segSphere(ax,ay,az,bx,by,bz,cx,cy,cz,r){
  const abx=bx-ax,aby=by-ay,abz=bz-az;
  const l2=abx*abx+aby*aby+abz*abz;
  const t=l2<1e-9?0:clamp(((cx-ax)*abx+(cy-ay)*aby+(cz-az)*abz)/l2,0,1);
  const px=ax+abx*t-cx,py=ay+aby*t-cy,pz=az+abz*t-cz;
  return px*px+py*py+pz*pz<r*r;
}

// ---------------- áudio ----------------
let AC=null,noiseBuf=null,master=null;
function initAudio(){
  if(AC)return;
  const C=window.AudioContext||window.webkitAudioContext;
  if(!C)return;
  AC=new C();
  master=AC.createGain();master.gain.value=SET.vol;master.connect(AC.destination);
  noiseBuf=AC.createBuffer(1,AC.sampleRate,AC.sampleRate);
  const d=noiseBuf.getChannelData(0);
  for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
}
function aNoise(dur,freq,q,vol,type){
  if(!AC)return;
  const t=AC.currentTime;
  const src=AC.createBufferSource();src.buffer=noiseBuf;src.loop=true;
  const f=AC.createBiquadFilter();f.type=type||'bandpass';f.frequency.value=freq;f.Q.value=q;
  const g=AC.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  src.connect(f);f.connect(g);g.connect(master);
  src.start(t);src.stop(t+dur+0.02);
}
function tone(freq,dur,vol,type,slide){
  if(!AC)return;
  const t=AC.currentTime;
  const o=AC.createOscillator();o.type=type||'square';o.frequency.setValueAtTime(freq,t);
  if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,freq+slide),t+dur);
  const g=AC.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+0.02);
}
const sfx={
  shoot(){aNoise(0.13,1700,0.7,0.5);tone(150,0.09,0.35,'square',-110);},
  shootP(){aNoise(0.1,2200,0.8,0.35);tone(190,0.07,0.25,'square',-120);},
  botShoot(){aNoise(0.11,900,0.8,0.14);tone(120,0.08,0.1,'square',-70);},
  hit(){tone(1250,0.05,0.22,'square');},
  headshot(){tone(1600,0.06,0.26,'square');tone(2100,0.05,0.14,'square');},
  kill(){tone(520,0.09,0.3,'square');setTimeout(()=>tone(780,0.12,0.3,'square'),70);},
  hurt(){tone(95,0.16,0.4,'sawtooth',-40);aNoise(0.12,300,1,0.2,'lowpass');},
  reload(){tone(600,0.04,0.18,'square');setTimeout(()=>tone(480,0.05,0.18,'square'),180);},
  reloadDone(){tone(820,0.05,0.2,'square');},
  smoke(){aNoise(0.5,500,0.6,0.3,'lowpass');},
  tick(){tone(900,0.05,0.2,'sine');},
  go(){tone(660,0.1,0.3,'square');setTimeout(()=>tone(990,0.16,0.3,'square'),90);},
  win(){tone(523,0.12,0.3,'square');setTimeout(()=>tone(659,0.12,0.3,'square'),110);setTimeout(()=>tone(784,0.2,0.3,'square'),220);},
  lose(){tone(330,0.2,0.3,'sawtooth');setTimeout(()=>tone(220,0.3,0.3,'sawtooth'),180);},
  deny(){tone(200,0.08,0.2,'square');},
  buy(){tone(680,0.07,0.15,'sine');setTimeout(()=>tone(970,0.1,0.14,'sine'),70);},
  step(){aNoise(0.05,420,1.2,0.07,'lowpass');},
  join(){tone(880,0.08,0.2,'sine');setTimeout(()=>tone(1100,0.1,0.2,'sine'),80);}
};

// ---------------- armas ----------------
// Catálogo indexado por ID; weapon em cada entidade é apenas o slot (0 primária, 1 pistola).
// O servidor/host decide compras, créditos e loadout; clientes só enviam o ID desejado.
const WEAPONS=[
  {name:'VANDAL',  slot:0,price:2900,dmg:30,head:78, mag:25,reserve:75, rate:0.10,kick:0.55,reload:2.1,kind:'rifle',icon:'i-rifle'},
  {name:'FANTASMA',slot:1,price:0,   dmg:26,head:52, mag:12,reserve:36, rate:0.17,kick:0.32,reload:1.4,kind:'pistol',icon:'i-pistol'},
  {name:'ESPECTRO',slot:0,price:1600,dmg:20,head:52, mag:30,reserve:90, rate:0.075,kick:0.36,reload:1.75,kind:'smg',icon:'i-smg'},
  {name:'BULLDOG', slot:0,price:2050,dmg:25,head:68, mag:24,reserve:72, rate:0.11,kick:0.47,reload:2.0,kind:'rifle',icon:'i-rifle'},
  {name:'GUARDIÃO',slot:0,price:2300,dmg:40,head:105,mag:12,reserve:48, rate:0.23,kick:0.78,reload:2.3,kind:'dmr',icon:'i-dmr'},
  {name:'SHERIFF', slot:1,price:800, dmg:40,head:110,mag:6, reserve:24, rate:0.28,kick:0.75,reload:1.8,kind:'pistol',icon:'i-pistol'}
];
const BUY_TIME=15,START_CREDITS=900,MAX_CREDITS=9000;
function weaponId(p){return p.loadout[p.weapon]>=0?p.loadout[p.weapon]:1;}
function weaponDef(p){return WEAPONS[weaponId(p)];}

// ---------------- entidades ----------------
const SPEED=5.4,WALK=2.7,GRAV=20,JUMP=7.8,EYE=1.62,PR=0.45;
function makeEnt(id,name){
  return{
    id,name,isLocal:false,team:0,
    x:0,y:0,z:34,vy:0,yaw:0,pitch:0,grounded:true,speed:0,
    hp:100,dead:false,deathT:0,
    weapon:0,loadout:[0,1],credits:0,
    mags:[WEAPONS[0].mag,WEAPONS[1].mag],reserves:[WEAPONS[0].reserve,WEAPONS[1].reserve],
    reloading:false,reloadT:0,fireCd:0,fireSpread:0,
    smokeCharges:3,smokeCd:0,kills:0,stepAcc:0,
    input:{mx:0,mz:0,yaw:0,pitch:0,walk:false,fire:false,jump:false,reload:false,q:false,weapon:0,ads:false}
  };
}
function resetEntForRound(e,x,z,yaw,pvp){
  // PvP: quem morreu perde a arma comprada; quem sobreviveu conserva o equipamento.
  if(!pvp)e.loadout=[0,1];
  else if(e.dead)e.loadout=[-1,1];
  e.hp=100;e.dead=false;e.deathT=0;
  e.weapon=e.loadout[0]>=0?0:1;
  e.mags=e.loadout.map(id=>id>=0?WEAPONS[id].mag:0);
  e.reserves=e.loadout.map(id=>id>=0?WEAPONS[id].reserve:0);
  e.reloading=false;e.reloadT=0;e.fireCd=0;e.fireSpread=0;
  e.smokeCharges=3;e.smokeCd=0;e.speed=0;
  e.x=x;e.z=z;e.y=0;e.vy=0;
  e.yaw=yaw||0;e.pitch=0;
  e.input.mx=0;e.input.mz=0;e.input.fire=false;e.input.jump=false;e.input.reload=false;e.input.q=false;
  e.input.yaw=e.yaw;e.input.pitch=0;e.input.weapon=e.weapon;
}
function integrate(e,dt){
  const inp=e.input;
  const speed=inp.walk?WALK:SPEED;
  let ix=clamp(inp.mx,-1,1),iz=clamp(inp.mz,-1,1);
  const l=Math.hypot(ix,iz);if(l>1){ix/=l;iz/=l;}
  const fx=-Math.sin(e.yaw),fz=-Math.cos(e.yaw);
  const rx=Math.cos(e.yaw),rz=-Math.sin(e.yaw);
  let mx=(fx*iz+rx*ix)*speed,mz=(fz*iz+rz*ix)*speed;
  if(e.dead){mx=0;mz=0;}
  e.speed=Math.hypot(mx,mz);
  const nx=e.x+mx*dt,nz=e.z+mz*dt;
  if(!collideXZ(nx,e.y,e.z,PR))e.x=nx;
  if(!collideXZ(e.x,e.y,nz,PR))e.z=nz;
  const prevY=e.y;
  e.vy-=GRAV*dt;e.y+=e.vy*dt;
  e.grounded=false;
  if(e.vy<=0){
    const g=groundHeight(e.x,e.z,PR*0.85,prevY+0.02);
    if(e.y<=g){e.y=g;e.vy=0;e.grounded=true;}
  }
  if(inp.jump){
    if(e.grounded&&!e.dead){e.vy=JUMP;e.grounded=false;}
    inp.jump=false;
  }
}

// ---------------- estado global ----------------
const G={mode:'menu',paused:false}; // mode: menu|solo|host|client
const SIM={active:false,players:[],bots:[],smokes:[],round:0,enemiesLeft:0,state:'idle',cdT:0,lastCd:0,endT:0,roundToken:0,ending:null,score:[0,0],roundT:0};

// net hook (net.js substitui)
function netEvent(ev){if(window.NET&&window.NET.pushEvent)window.NET.pushEvent(ev);}
function annAll(txt,sub,dur){announce(txt,sub,dur);netEvent({e:'ann',txt,sub:sub||''});}
function feedAll(killer,victim,head){feed(killer,victim,head);netEvent({e:'feed',k:killer,v:victim,h:head?1:0});}

// ---------------- HUD ----------------
const hudEl=$('hud'),annEl=$('announce'),annSub=$('announceSub'),
  hpBar=$('hpBar'),hpText=$('hpText'),ammoN=$('ammoN'),ammoR=$('ammoR'),ammoWrap=$('ammoWrap'),
  roundN=$('roundN'),enemN=$('enemN'),killN=$('killN'),smokeN=$('smokeN'),smokeTouch=$('smokeTouch'),wnameEl=$('wname'),
  feedBox=$('feed'),hmEl=$('hitmarker'),crossEl=$('crosshair'),
  vigEl=$('vignette'),dmgEl=$('dmgFlash'),modeTag=$('modeTag'),
  menuEl=$('menu'),pauseEl=$('pause'),radarEl=$('radar');
const radarCtx=radarEl.getContext('2d');
let annTimer=null,hmTimer=null;
function announce(text,sub,dur){
  dur=dur||1.6;
  annEl.textContent=text;annSub.textContent=sub||'';
  annEl.style.setProperty('--dur',dur+'s');annSub.style.setProperty('--dur',dur+'s');
  annEl.classList.remove('show');annSub.classList.remove('show');
  void annEl.offsetWidth;
  annEl.classList.add('show');if(sub)annSub.classList.add('show');
  clearTimeout(annTimer);
  annTimer=setTimeout(()=>{annEl.classList.remove('show');annSub.classList.remove('show');},dur*1000);
}
function feed(killer,victim,head){
  const d=document.createElement('div');d.className='feedItem';
  for(const [cl,txt] of [['k',killer],['w',head?'☠':'✕'],['v',victim]]){
    const s=document.createElement('span');s.className=cl;s.textContent=String(txt);d.appendChild(s);
  }
  feedBox.prepend(d);
  while(feedBox.children.length>5)feedBox.lastChild.remove();
  setTimeout(()=>d.remove(),4200);
}
function hitmarker(kill,head){
  hmEl.className='hitmarker show'+(kill?' kill':'')+(head?' head':'');
  clearTimeout(hmTimer);
  hmTimer=setTimeout(()=>{hmEl.className='hitmarker';},kill?280:140);
}
function dmgFlash(){
  dmgEl.style.transition='none';dmgEl.style.opacity=0.65;
  void dmgEl.offsetWidth;
  dmgEl.style.transition='opacity .6s';dmgEl.style.opacity=0;
}
const HUDSRC={round:1,enemies:0,kills:0,smoke:3};
const _hud={};
function htext(k,el,v){if(_hud[k]!==v){_hud[k]=v;el.textContent=v;}}
function hcls(k,el,v){if(_hud[k]!==v){_hud[k]=v;el.className=v;}}
function hstyle(k,el,prop,v){if(_hud[k]!==v){_hud[k]=v;el.style[prop]=v;}}
function updateHUD(me){
  const hp=Math.max(0,Math.round(me.hp));
  htext('hp',hpText,hp);
  hstyle('hpw',hpBar,'width',clamp(me.hp,0,100)+'%');
  hcls('hpc',hpBar,me.hp<35?'lowhp':'');
  const w=weaponDef(me);
  htext('am',ammoN,me.mags[me.weapon]);
  htext('ar',ammoR,'/ '+me.reserves[me.weapon]);
  hcls('aw',ammoWrap,me.mags[me.weapon]===0?'empty':'');
  htext('wn',wnameEl,w.name+(me.reloading?' · RECARREGANDO':''));
  htext('rn',roundN,HUDSRC.round);
  htext('en',enemN,HUDSRC.enemies);
  htext('kn',killN,HUDSRC.kills);
  htext('tn',$('timeN'),Math.max(0,Math.ceil(HUDSRC.time||0)));
  const smokeStr='●'.repeat(me.smokeCharges)+'○'.repeat(3-me.smokeCharges);
  htext('sm',smokeN,smokeStr);
  if(smokeTouch)htext('smt',smokeTouch,smokeStr);
  hcls('w0',$('ws0'),'wslot'+(me.weapon===0?' on':''));
  hcls('w1',$('ws1'),'wslot'+(me.weapon===1?' on':''));
  htext('ws0n',$('ws0Name'),me.loadout[0]>=0?WEAPONS[me.loadout[0]].name:'SEM ARMA');
  htext('ws1n',$('ws1Name'),WEAPONS[me.loadout[1]].name);
  htext('cred',$('creditN'),me.credits||0);
  const low=me.hp<35&&me.hp>0;
  if(_hud.vig!==low){_hud.vig=low;vigEl.classList.toggle('low',low);}
  syncBuyUI(me);
}

// ---------------- loja PvP (UI local; compra sempre validada no anfitrião) ----------------
const SHOP={open:false,stamp:''};
function isBuyPhase(){
  return G.mode==='host'&&SIM.state==='buy'||
    G.mode==='client'&&!!window.NET&&NET.st==='b'&&NET.started;
}
function shopNotice(text,ok){
  const el=$('shopMsg');el.textContent=text||'';
  el.style.color=ok?'var(--teal)':'var(--red)';
}
function renderShop(me){
  const stamp=me.credits+'|'+me.loadout.join(',');
  if(SHOP.stamp===stamp)return;
  SHOP.stamp=stamp;
  $('shopList').innerHTML=WEAPONS.map((w,id)=>{
    const owned=me.loadout[w.slot]===id;
    const broke=me.credits<w.price;
    const label=owned?'EQUIPADA':broke?'SALDO INSUFICIENTE':'COMPRAR';
    return '<article class="gunCard'+(owned?' owned':'')+'">'+
      '<div class="gunTop"><span class="gunName">'+w.name+'</span><span class="gunPrice">'+(w.price?'¤ '+w.price:'GRÁTIS')+'</span></div>'+
      '<svg class="gunArt" aria-hidden="true"><use href="#'+w.icon+'"/></svg>'+
      '<small>'+(w.slot===0?'PRIMÁRIA':'PISTOLA')+' · DANO '+w.dmg+' · '+w.mag+' TIROS · '+Math.round(1/w.rate*10)/10+'/s</small>'+
      '<button data-buy="'+id+'"'+(owned||broke?' disabled':'')+' aria-label="'+label+' '+w.name+'">'+label+'</button></article>';
  }).join('');
}
function openShop(){
  if(!isBuyPhase())return;
  if(!$('pause').classList.contains('hidden')||!$('settings').classList.contains('hidden'))return;
  SHOP.open=true;SHOP.stamp='';
  $('shop').classList.remove('hidden');
  shopNotice('Selecione sua arma para a rodada.',true);
  INPUT.fire=false;
  if(document.pointerLockElement&&document.exitPointerLock)document.exitPointerLock();
  const me=getMe();if(me)renderShop(me);
}
function closeShop(restoreLock){
  if(!SHOP.open)return;
  SHOP.open=false;SHOP.stamp='';
  $('shop').classList.add('hidden');
  if(restoreLock&&inGame())lockPointer();
}
function toggleShop(){if(SHOP.open)closeShop(true);else openShop();}
function syncBuyUI(me){
  const active=isBuyPhase();
  $('buyPhase').classList.toggle('hidden',!active);
  $('shopBtn').classList.toggle('hidden',!active);
  if(!active){if(SHOP.open)closeShop(false);return;}
  const sec=Math.max(0,Math.ceil(G.mode==='client'?NET.cdT:SIM.cdT));
  htext('buySec',$('buySecs'),sec);
  htext('shopSec',$('shopSecs'),sec);
  htext('shopCred',$('shopCredits'),me.credits||0);
  if(SHOP.open)renderShop(me);
}
$('shopBtn').addEventListener('click',openShop);
$('shopClose').addEventListener('click',()=>closeShop(true));
$('shopList').addEventListener('click',e=>{
  const btn=e.target.closest&&e.target.closest('[data-buy]');
  if(!btn||btn.disabled||!isBuyPhase())return;
  const id=Number(btn.dataset.buy);
  if(G.mode==='host'){
    const result=tryBuy(getMe(),id);
    shopNotice(result.msg,result.ok);
    if(!result.ok)sfx.deny();
    if(result.ok)renderShop(getMe());
  }else if(window.NET){
    shopNotice('Aguardando confirmação do anfitrião…',true);
    NET.requestBuy(id);
  }
});

// ---------------- viewmodel: 6 armas e mãos articuladas em primeira pessoa ----------------
const gunModels=[],flashModels=[];
const viewCube=new THREE.BoxGeometry(1,1,1),handSphere=new THREE.SphereGeometry(1,8,6);
function gmat(c,e){return new THREE.MeshStandardMaterial({color:c,roughness:.58,metalness:.35,
  emissive:e?c:0x000000,emissiveIntensity:e||0});}
function gbox(parent,w,h,d,x,y,z,m){
  const mm=new THREE.Mesh(viewCube,m);mm.scale.set(w,h,d);mm.position.set(x,y,z);parent.add(mm);return mm;
}
const gmDark=gmat(0x1b2832),gmMid=gmat(0x344a57),gmEdge=gmat(0x778b95),
  gmTeal=gmat(0x52e3c8,.68),gmRed=gmat(0xff6575,.45),gmBlue=gmat(0x6db5ec,.5),
  gmAmber=gmat(0xffcb83,.45),gmSleeve=gmat(0x3b5061),gmGlove=gmat(0x202a35),
  gmSkin=new THREE.MeshStandardMaterial({color:0xc99d7e,roughness:.95,emissive:0x3c2214,emissiveIntensity:.12});
function makeViewHand(parent,x,z,isLeft){
  const arm=new THREE.Group();arm.position.set(x,-.05,z);parent.add(arm);
  const dir=isLeft?-1:1;
  const sleeve=gbox(arm,.16,.28,.18,dir*.04,-.24,.12,gmSleeve);
  sleeve.rotation.z=-dir*.21;sleeve.rotation.x=-.32;
  gbox(arm,.17,.068,.16,dir*.02,-.12,.04,gmGlove); // punho
  const palm=new THREE.Mesh(handSphere,gmSkin);
  palm.scale.set(.078,.067,.095);palm.position.set(0,-.016,-.025);arm.add(palm);
  gbox(arm,.145,.045,.10,0,.047,-.07,gmGlove); // proteção dos nós dos dedos
  for(let i=0;i<4;i++){
    const finger=new THREE.Mesh(handSphere,gmSkin);
    finger.scale.set(.020,.035,.057);
    finger.position.set((i-1.5)*.038,-.028,-.126);finger.rotation.x=-.30;arm.add(finger);
  }
  const thumb=new THREE.Mesh(handSphere,gmSkin);
  thumb.scale.set(.029,.048,.052);thumb.position.set(dir*.087,-.046,-.005);
  thumb.rotation.z=dir*.45;arm.add(thumb);
  return arm;
}
function makeViewGun(w,id){
  const root=new THREE.Group();camera.add(root);root.scale.setScalar(.83);
  const accent=id===3?gmAmber:id===4?gmBlue:id===5?gmRed:gmTeal;
  const pistol=w.slot===1;
  let muzzleZ,mag;
  if(pistol){
    const heavy=id===5;
    gbox(root,.108,.105,heavy?.37:.33,0,.04,.03,gmDark); // corpo
    gbox(root,.115,.037,heavy?.34:.30,0,.098,-.008,gmEdge); // ferrolho
    gbox(root,.11,.026,.21,0,.11,-.012,accent);
    const grip=gbox(root,.088,.18,.096,0,-.12,.14,gmMid);grip.rotation.x=-.2;
    gbox(root,.04,.09,.018,0,.12,-.17,gmDark);
    gbox(root,.085,.045,.1,0,-.006,-.21,gmEdge);
    if(heavy){
      const cyl=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.13,8),gmMid);
      cyl.rotation.z=Math.PI/2;cyl.position.set(0,.028,-.065);root.add(cyl);
      gbox(root,.07,.045,.26,0,.04,-.27,gmDark);
    }
    mag=gbox(root,.067,.14,.09,0,-.2,.14,gmDark);
    muzzleZ=heavy?-.41:-.30;
  }else{
    const smg=id===2,dmr=id===4;
    const len=smg?.39:dmr?.66:.53;
    gbox(root,.13,.16,len,0,.03,.09,gmDark); // receiver
    gbox(root,.146,.065,len*.76,0,.13,-.04,gmMid);
    gbox(root,.108,.037,len*.72,0,.17,-.06,accent); // listra da arma
    gbox(root,.074,.075,smg?.23:.42,0,.06,-len*.78,gmEdge); // handguard
    gbox(root,.033,.033,dmr?.29:.22,0,.063,-len-0.14,gmDark); // cano
    gbox(root,.18,.035,.20,0,.02,.44,gmMid); // coronha
    gbox(root,.06,.12,.10,0,.15,.08,gmDark); // mira
    gbox(root,.075,.028,.16,0,.22,.05,accent);
    const grip=gbox(root,.082,.18,.10,0,-.13,.16,gmMid);grip.rotation.x=-.22;
    mag=gbox(root,smg?.11:.10,smg?.23:.20,.105,0,-.18,-.04,gmDark);
    mag.rotation.x=.14;
    gbox(root,.12,.028,.14,0,-.09,-.21,gmEdge);
    if(dmr)gbox(root,.16,.045,.17,0,.18,-.26,gmBlue);
    muzzleZ=-len-(dmr?.32:.24);
  }
  const muzzle=new THREE.Object3D();muzzle.position.set(0,.06,muzzleZ);root.add(muzzle);
  const handR=makeViewHand(root,.12,-.10,false);
  const handL=makeViewHand(root,pistol?-.13:-.155,pistol?-.10:-.20,true);
  // Fallback simples, exibido somente se os GLBs locais ainda não carregaram.
  const fallback=root.children.filter(child=>child!==muzzle&&child!==handL&&child!==handR);
  root.userData={handL,handR,mag,magY:mag.position.y,muzzle,fallback,real:false};
  return root;
}
const flashCv=document.createElement('canvas');flashCv.width=flashCv.height=64;
{
  const g=flashCv.getContext('2d');
  const grd=g.createRadialGradient(32,32,2,32,32,30);
  grd.addColorStop(0,'rgba(255,250,215,1)');grd.addColorStop(.36,'rgba(255,202,101,.95)');grd.addColorStop(1,'rgba(255,120,40,0)');
  g.fillStyle=grd;g.fillRect(0,0,64,64);
}
const flashTexture=new THREE.CanvasTexture(flashCv),flashPlane=new THREE.PlaneGeometry(.32,.32);
function mkFlash(parent,mz){
  const f=new THREE.Mesh(flashPlane,new THREE.MeshBasicMaterial({map:flashTexture,transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false}));
  f.position.copy(mz.position);f.visible=false;parent.add(f);
  const li=new THREE.PointLight(0xffc873,0,6);li.position.copy(mz.position);parent.add(li);
  return{f,li};
}
for(let i=0;i<WEAPONS.length;i++){
  const gun=makeViewGun(WEAPONS[i],i);gunModels.push(gun);
  flashModels.push(mkFlash(gun,gun.userData.muzzle));
  gun.visible=false;
}
let localKick=0,flashT=0,curFlash=flashModels[0],curMuzzle=gunModels[0].userData.muzzle;
let viewWeaponId=-1,equipT=0;

// Malhas CC0 de Quaternius + braços articulados CC0 de WRAD. Cada arma real ocupa
// uma malha colorida (1 draw call); os dois braços compartilham UM esqueleto/textura.
// Tudo é local e estático no pacote Render; falha de carregamento mantém o fallback.
const VM_ASSETS=[
  {file:'vandal',   depth:-.86,scale:.86,yaw:.25,handsZ:.53,muzzleZ:-.771},
  {file:'fantasma', depth:-.60,scale:1.10,yaw:.29,handsZ:.53,muzzleZ:-.507},
  {file:'espectro', depth:-.65,scale:1.12,yaw:.27,handsZ:.35,muzzleZ:-.521},
  {file:'bulldog',  depth:-.78,scale:.96,yaw:.26,handsZ:.46,muzzleZ:-.652},
  {file:'guardiao', depth:-.87,scale:1.03,yaw:.25,lift:.10,handsZ:.50,muzzleZ:-.853},
  {file:'sheriff',  depth:-.54,scale:1.16,yaw:.30,handsZ:.29,muzzleZ:-.636}
];
let tacticalArms=null;
const armAxisY=new THREE.Vector3(0,1,0);
const armAxisX=new THREE.Vector3(1,0,0);
const armQuat=new THREE.Quaternion();
function loadRealViewmodels(){
  if(typeof THREE.GLTFLoader!=='function'){
    console.warn('GLTFLoader indisponível; usando modelos de reserva.');return;
  }
  const loader=new THREE.GLTFLoader();
  for(let id=0;id<VM_ASSETS.length;id++){
    const cfg=VM_ASSETS[id],root=gunModels[id];
    loader.load('assets/'+cfg.file+'.glb',gltf=>{
      const mesh=gltf.scene;
      mesh.scale.setScalar(cfg.scale);
      mesh.rotation.y=cfg.yaw;
      mesh.position.y=cfg.lift||0;
      mesh.traverse(obj=>{
        if(obj.isMesh){obj.castShadow=false;obj.receiveShadow=false;}
      });
      root.add(mesh);
      root.userData.real=true;
      root.userData.depth=cfg.depth;
      root.userData.asset=mesh;
      root.userData.cfg=cfg;
      // Desanexa os placeholders: nem os ossos nem os cubos são percorridos
      // pela cena durante os frames quando já existem modelos reais.
      for(const primitive of root.userData.fallback)root.remove(primitive);
      root.userData.fallback.length=0;
      if(tacticalArms)root.remove(root.userData.handL,root.userData.handR);
      // O clarão e o traçante continuam saindo da boca do cano real.
      const mz=cfg.muzzleZ*cfg.scale;
      root.userData.muzzle.position.set(Math.sin(cfg.yaw)*mz,.055+(cfg.lift||0),Math.cos(cfg.yaw)*mz);
      flashModels[id].f.position.copy(root.userData.muzzle.position);
      flashModels[id].li.position.copy(root.userData.muzzle.position);
    },undefined,err=>console.warn('Falha ao carregar',cfg.file,err));
  }
  loader.load('assets/arms.glb',gltf=>{
    const rig=gltf.scene;
    rig.scale.setScalar(.12);
    rig.rotation.z=Math.PI; // antebraços entram pela base da tela, não pelo topo
    rig.visible=false;
    rig.traverse(obj=>{
      if(obj.isBone)return;
      if(obj.isSkinnedMesh){
        obj.castShadow=false;obj.receiveShadow=false;obj.frustumCulled=false;
        obj.material.roughness=.97;
      }
    });
    const bones={};
    rig.traverse(obj=>{if(obj.isBone)bones[obj.name.toLowerCase()]=obj;});
    const shoulderR=bones.shoulderr,shoulderL=bones.shoulderl;
    if(!shoulderR||!shoulderL){console.warn('Braços sem ossos dos ombros');return;}
    // O rig original tem dedos abertos: flexione duas falanges por dedo
    // para abraçar o guarda-mão/empunhadura, sem criar geometria extra.
    for(const [name,bone] of Object.entries(bones)){
      if(/^finger_(index|middle|ring|pinky)[12][rl]$/.test(name))
        bone.quaternion.premultiply(armQuat.setFromAxisAngle(armAxisX,.8));
      else if(/^finger_thumb[12][rl]$/.test(name))
        bone.quaternion.premultiply(armQuat.setFromAxisAngle(armAxisX,.15));
    }
    // Inclina os dois ombros para aproximar as mãos da empunhadura e do guarda-mão.
    tacticalArms={rig,shoulderR,shoulderL,baseR:shoulderR.quaternion.clone(),
      baseL:shoulderL.quaternion.clone()};
    camera.add(rig);
    for(const gun of gunModels){
      if(gun.userData.real)gun.remove(gun.userData.handL,gun.userData.handR);
    }
  },undefined,err=>console.warn('Falha ao carregar braços articulados',err));
}
function updateRealArms(gun,reloadP){
  if(!tacticalArms)return;
  const a=tacticalArms,cfg=gun.userData.cfg;
  a.rig.visible=!!(gun.visible&&cfg);
  if(!cfg)return;
  // Acompanha o balanço, a troca, a recarga e o recuo da arma sem duplicar o rig.
  a.rig.position.set(gun.position.x+.02,gun.position.y-.35,gun.position.z+cfg.handsZ);
  a.rig.rotation.set(-localKick*.045,0,Math.PI+gun.rotation.z*.3);
  const swing=Math.sin(reloadP*Math.PI);
  a.shoulderR.quaternion.copy(a.baseR).premultiply(
    armQuat.setFromAxisAngle(armAxisY,.92+localKick*.035-swing*.07));
  a.shoulderL.quaternion.copy(a.baseL).premultiply(
    armQuat.setFromAxisAngle(armAxisY,-.92+swing*.15));
  if(swing>0){
    // A mão de apoio libera o carregador durante a recarga.
    a.shoulderL.quaternion.premultiply(armQuat.setFromAxisAngle(armAxisX,-swing*.18));
  }
}
// As requisições começam ainda no menu, antes do primeiro frame de partida.
loadRealViewmodels();

// ---------------- efeitos ----------------
const tracers=[],sparks=[];
const sparkGeo=new THREE.BoxGeometry(0.05,0.05,0.05);
function tracer(a,b,color){
  const g=new THREE.BufferGeometry().setFromPoints([a,b]);
  const m=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity:0.9}));
  scene.add(m);tracers.push({m,life:0.07,max:0.07});
}
function sparksAt(p,color,n){
  if(!SET.fx)return;
  n=n||5;
  for(let i=0;i<n;i++){
    const s=new THREE.Mesh(sparkGeo,new THREE.MeshBasicMaterial({color,transparent:true}));
    s.position.copy(p);s.scale.setScalar(rand(0.6,1.4));
    const v=new THREE.Vector3(rand(-1,1),rand(0.2,1.6),rand(-1,1)).normalize().multiplyScalar(rand(2,5.5));
    sparks.push({m:s,v,life:0.3,max:0.3});scene.add(s);
  }
}
function updateFX(dt){
  for(let i=tracers.length-1;i>=0;i--){
    const t=tracers[i];t.life-=dt;
    t.m.material.opacity=Math.max(0,t.life/t.max)*0.9;
    if(t.life<=0){scene.remove(t.m);t.m.geometry.dispose();t.m.material.dispose();tracers.splice(i,1);}
  }
  for(let i=sparks.length-1;i>=0;i--){
    const s=sparks[i];s.life-=dt;
    s.m.position.addScaledVector(s.v,dt);s.v.y-=12*dt;
    s.m.material.opacity=Math.max(0,s.life/s.max);
    if(s.life<=0){scene.remove(s.m);s.m.material.dispose();sparks.splice(i,1);}
  }
  flashT-=dt;
  if(flashT<=0&&curFlash.f.visible){curFlash.f.visible=false;curFlash.li.intensity=0;}
}
function localShotFX(id){
  localKick=1;flashT=.05;
  if(curFlash){curFlash.f.visible=false;curFlash.li.intensity=0;}
  curFlash=flashModels[id];curMuzzle=gunModels[id].userData.muzzle;
  curFlash.f.rotation.z=rand(0,6.28);curFlash.f.visible=true;curFlash.li.intensity=3;
  if(WEAPONS[id].slot===1)sfx.shootP();else sfx.shoot();
}

// ---------------- fumaça ----------------
const smokeGeo=new THREE.SphereGeometry(1,18,14);
function spawnSmokeProj(x,y,z,vx,vy,vz){
  const m=new THREE.Mesh(smokeGeo,new THREE.MeshStandardMaterial({color:0x9fb4c8,roughness:1,transparent:true,opacity:0.93}));
  m.scale.setScalar(0.16);m.position.set(x,y,z);
  scene.add(m);
  SIM.smokes.push({mesh:m,vel:new THREE.Vector3(vx,vy,vz),r:2.7,life:8,state:'fly'});
}
function updateSmokesArr(arr,dt){
  for(let i=arr.length-1;i>=0;i--){
    const s=arr[i];
    if(s.state==='fly'){
      s.vel.y-=16*dt;
      s.mesh.position.addScaledVector(s.vel,dt);
      if(s.mesh.position.y<=1.9){s.state='cloud';s.mesh.position.y=1.9;}
    }else{
      const sc=s.mesh.scale.x;
      s.mesh.scale.setScalar(sc+(s.r-sc)*Math.min(1,dt*7));
      s.life-=dt;
      if(s.life<1.2)s.mesh.material.opacity=0.93*(s.life/1.2);
      if(s.life<=0){scene.remove(s.mesh);arr.splice(i,1);}
    }
  }
}
function clearSmokes(arr){for(const s of arr)scene.remove(s.mesh);arr.length=0;}
function hasLOS(ax,ay,az,bx,by,bz,smokeArr){
  const dx=bx-ax,dy=by-ay,dz=bz-az;
  const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
  if(len<0.001)return true;
  const ux=dx/len,uy=dy/len,uz=dz/len;
  for(let i=0;i<solids.length;i++){
    const t=rayBox(ax,ay,az,ux,uy,uz,solids[i]);
    if(t>0.5&&t<len-0.5)return false;
  }
  for(const s of smokeArr){
    if(s.state!=='cloud')continue;
    const p=s.mesh.position;
    if(segSphere(ax,ay,az,bx,by,bz,p.x,p.y,p.z,s.r*0.85))return false;
  }
  return true;
}

// ---------------- bots ----------------
const BOT_NAMES=['VÍBORA','ESPECTRO','FÊNIX','CIPHER','KATANA','DRAGO','ONYX','RAZOR','HALO','NEON'];
// ---------------- agentes: malhas compactadas + esqueleto animado ----------------
// Cada membro tem uma única geometria de caixas com cores de vértice; as geometrias
// são partilhadas por TODOS os agentes. Bem menos draw calls que dezenas de cubos por bot.
const agentBoxGeo=new THREE.BoxGeometry(1,1,1);
const agentHeadGeo=new THREE.SphereGeometry(1,8,6);
const agentGeomCache=new Map();
const agentBodyMat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.78,metalness:.12});
const agentSkinMat=mat(0xc6a18a,.83);
const AGCOL={leg:0x263945,body:0x3b5160,armor:0x526a75,helmet:0x1d313d};
function bakedAgentBoxes(parent,key,parts,material,shadow=true){
  let geo=agentGeomCache.get(key);
  if(!geo){
    const bp=agentBoxGeo.getAttribute('position'),bn=agentBoxGeo.getAttribute('normal'),bi=agentBoxGeo.getIndex();
    const n=bp.count,m=bi.count,p=new Float32Array(parts.length*n*3),
      norm=new Float32Array(parts.length*n*3),colors=new Float32Array(parts.length*n*3),
      indices=new Uint16Array(parts.length*m);
    for(let i=0;i<parts.length;i++){
      const [w,h,d,x,y,z,tint]=parts[i],col=new THREE.Color(tint===undefined?0xffffff:tint);
      for(let j=0;j<n;j++){
        const k=(i*n+j)*3;
        p[k]=bp.getX(j)*w+x;p[k+1]=bp.getY(j)*h+y;p[k+2]=bp.getZ(j)*d+z;
        norm[k]=bn.getX(j);norm[k+1]=bn.getY(j);norm[k+2]=bn.getZ(j);
        colors[k]=col.r;colors[k+1]=col.g;colors[k+2]=col.b;
      }
      for(let j=0;j<m;j++)indices[i*m+j]=bi.getX(j)+i*n;
    }
    geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(p,3));
    geo.setAttribute('normal',new THREE.BufferAttribute(norm,3));
    geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
    geo.setIndex(new THREE.BufferAttribute(indices,1));
    geo.computeBoundingSphere();
    agentGeomCache.set(key,geo);
  }
  const mesh=new THREE.Mesh(geo,material);mesh.castShadow=shadow;parent.add(mesh);
  return mesh;
}
function makeBotMesh(accent){
  accent=accent===undefined?0xff4655:accent;
  const root=new THREE.Group();
  const mAcc=new THREE.MeshStandardMaterial({color:accent,roughness:.56,
    emissive:accent,emissiveIntensity:.52});
  const body=(group,key,parts)=>bakedAgentBoxes(group,key,parts,agentBodyMat);
  const glow=(group,key,parts)=>bakedAgentBoxes(group,key,parts,mAcc,false);
  body(root,'hip',[[.43,.20,.28,0,.85,0,AGCOL.leg]]);
  const torso=new THREE.Group();torso.position.set(0,.86,0);root.add(torso);
  body(torso,'torso',[
    [.65,.68,.38,0,.32,0,AGCOL.body],
    [.58,.46,.13,0,.37,-.27,AGCOL.armor],
    [.40,.43,.17,0,.31,.29,AGCOL.helmet],
    [.58,.09,.38,0,.62,0,AGCOL.helmet],
    [.13,.09,.25,-.23,.04,-.19,AGCOL.helmet],
    [.13,.09,.25,.23,.04,-.19,AGCOL.helmet]
  ]);
  glow(torso,'torsoAccent',[
    [.36,.065,.18,0,.33,-.35],
    [.18,.13,.42,-.34,.63,0],
    [.18,.13,.42,.34,.63,0]
  ]);
  const head=new THREE.Group();head.position.set(0,.69,0);torso.add(head);
  body(head,'helmet',[
    [.45,.17,.39,0,.36,.015,AGCOL.helmet],
    [.42,.05,.24,0,.41,-.07,AGCOL.armor]
  ]);
  glow(head,'visor',[[.36,.09,.07,0,.2,-.205]]);
  const skull=new THREE.Mesh(agentHeadGeo,agentSkinMat);
  skull.scale.set(.195,.225,.185);skull.position.y=.18;skull.castShadow=true;head.add(skull);
  const legs=[],arms=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.19,.79,0);root.add(leg);legs.push(leg);
    body(leg,'leg',[
      [.24,.43,.27,0,-.23,0,AGCOL.leg],
      [.24,.23,.27,0,-.53,-.01,AGCOL.armor],
      [.25,.17,.34,0,-.69,-.075,AGCOL.helmet]
    ]);
    const arm=new THREE.Group();arm.position.set(side*.41,.51,0);torso.add(arm);arms.push(arm);
    body(arm,'arm',[
      [.22,.36,.24,0,-.18,0,AGCOL.body],
      [.20,.19,.21,0,-.35,-.14,AGCOL.armor],
      [.18,.10,.20,0,-.43,-.25,0xc6a18a]
    ]);
  }
  const rifle=new THREE.Group();rifle.position.set(0,.27,-.42);torso.add(rifle);
  body(rifle,'rifle',[
    [.10,.11,.48,0,0,-.09,AGCOL.helmet],
    [.043,.052,.25,0,0,-.40,AGCOL.armor]
  ]);
  glow(rifle,'rifleAccent',[[.09,.045,.30,0,.075,-.10]]);
  const pistol=new THREE.Group();pistol.position.set(.08,.18,-.36);torso.add(pistol);
  body(pistol,'pistol',[
    [.11,.10,.27,0,0,-.08,AGCOL.helmet],
    [.07,.12,.09,0,-.10,.02,AGCOL.armor]
  ]);
  glow(pistol,'pistolAccent',[[.11,.04,.22,0,.07,-.08]]);
  pistol.visible=false;
  root.userData={mats:[mAcc],rig:{legs,arms,head,torso,rifle,pistol}};
  return root;
}
function makeBot(id,x,z){
  return{
    id,x,z,y:0,vy:0,alive:true,removed:false,deadT:0,
    hp:100,name:pick(BOT_NAMES),
    speed:Math.min(3.0+SIM.round*0.22+(SIM.players.length-1)*0.15,5.0),
    fireInterval:Math.max(0.55,1.15-SIM.round*0.07),
    acc:Math.min(0.66,0.30+SIM.round*0.045+(SIM.players.length-1)*0.03),
    dmg:Math.min(16,7+SIM.round),
    fireT:rand(0.6,1.4),strafeT:0,strafeDir:0,
    nav:null,idleT:0,detour:0,detourDir:1,
    engaged:false,lastX:0,lastZ:0,rot:0,flash:0,target:null,group:null
  };
}
function spawnBots(n){
  const spots=SPAWNS.slice().sort(()=>Math.random()-0.5);
  for(let i=0;i<n;i++){
    const sp=spots[i%spots.length];
    SIM.bots.push(makeBot(i,sp[0]+rand(-1.5,1.5),sp[1]+rand(-1.5,1.5)));
  }
  SIM.enemiesLeft=n;
}
function botBox(b,head){
  if(head)return{minX:b.x-0.22,maxX:b.x+0.22,minY:b.y+1.5,maxY:b.y+1.94,minZ:b.z-0.22,maxZ:b.z+0.22};
  return{minX:b.x-0.45,maxX:b.x+0.45,minY:b.y+0.1,maxY:b.y+1.5,minZ:b.z-0.32,maxZ:b.z+0.32};
}
function botPickTarget(b){
  let best=null,bd=1e9;
  for(const p of SIM.players){
    if(p.dead)continue;
    const d=Math.hypot(p.x-b.x,p.z-b.z);
    if(d<bd&&d<46){bd=d;best=p;}
  }
  if(best&&hasLOS(b.x,b.y+1.6,b.z,best.x,best.y+EYE,best.z,SIM.smokes)){b.target=best;return true;}
  b.target=null;return false;
}
function botShootAt(b,t,dist){
  b.shot=1;
  sfxIfNear(b.x,b.z,sfx.botShoot);
  netEvent({e:'shot',id:b.id,bot:1,ox:b.x,oy:b.y+1.35,oz:b.z,hx:t.x,hy:t.y+EYE,hz:t.z});
  let acc=b.acc-dist*0.004-t.speed*0.03;
  acc=clamp(acc,0.05,0.85);
  if(Math.random()<acc)damageEnt(t,b.dmg+randi(-2,3),b.name);
}
function sfxIfNear(x,z,fn){
  const me=getMe();
  if(!me)return;
  const d=Math.hypot(x-me.x,z-me.z);
  if(d<45)fn();
}
function updateBot(b,dt){
  if(!b.alive){
    if(b.removed)return;
    b.deadT+=dt;
    if(b.deadT>2.2)b.removed=true;
    return;
  }
  b.flash=Math.max(0,b.flash-dt*5);
  b.shot=Math.max(0,(b.shot||0)-dt*7);
  const canSee=SIM.state==='playing'&&botPickTarget(b);
  if(canSee){b.lastX=b.target.x;b.lastZ=b.target.z;b.engaged=true;}
  let tx,tz,speed=b.speed;
  if(b.engaged&&b.target&&canSee){
    const t=b.target;
    const dx=t.x-b.x,dz=t.z-b.z,dist=Math.hypot(dx,dz)||0.001;
    b.strafeT-=dt;
    if(b.strafeT<=0){b.strafeDir=pick([-1,0,1,-1,1]);b.strafeT=rand(0.7,1.6);}
    let mx=0,mz=0;
    const fx=dx/dist,fz=dz/dist;
    if(dist>26){mx+=fx;mz+=fz;}
    else if(dist<7){mx-=fx;mz-=fz;}
    mx+=-fz*b.strafeDir*0.8;mz+=fx*b.strafeDir*0.8;
    tx=b.x+mx*10;tz=b.z+mz*10;
    b.fireT-=dt;
    if(b.fireT<=0){b.fireT=b.fireInterval*rand(0.8,1.3);botShootAt(b,t,dist);}
    b.rot=Math.atan2(dx,dz);
  }else if(b.engaged){
    // perdeu o alvo de vista (ou ele morreu): vai até a última posição conhecida
    tx=b.lastX;tz=b.lastZ;
    if(Math.hypot(tx-b.x,tz-b.z)<2||!canSee&&b.target===null&&SIM.state!=='playing')b.engaged=false;
    if(b.target===null)b.engaged=false;
  }else{
    if(!b.nav||Math.hypot(b.nav[0]-b.x,b.nav[1]-b.z)<2||b.idleT>6){b.nav=pick(NAV);b.idleT=0;}
    tx=b.nav[0];tz=b.nav[1];speed*=0.72;
  }
  b.idleT+=dt;
  if(speed>0){
    let ang=Math.atan2(tx-b.x,tz-b.z);
    if(b.detour>0)ang+=b.detourDir;
    const nx=b.x+Math.sin(ang)*speed*dt;
    const nz=b.z+Math.cos(ang)*speed*dt;
    let moved=false;
    if(!collideXZ(nx,b.y,b.z,0.45)){b.x=nx;moved=true;}
    if(!collideXZ(b.x,b.y,nz,0.45)){b.z=nz;moved=true;}
    if(!moved){
      if(b.detour<=0){b.detour=rand(0.5,1.0);b.detourDir=pick([-1,1])*1.2;}
      if(!b.engaged)b.nav=pick(NAV);
    }
    if(!b.engaged)b.rot=ang;
  }
  b.detour=Math.max(0,b.detour-dt);
  const g=groundHeight(b.x,b.z,0.36,b.y+0.3);
  if(b.y<=g){b.y=g;b.vy=0;}else{b.vy-=GRAV*dt;b.y+=b.vy*dt;}
  if(b.y<0){b.y=0;b.vy=0;}
  if(b.target&&!b.target.dead){
    const dx=b.target.x-b.x,dz=b.target.z-b.z,d=Math.hypot(dx,dz);
    if(d<1.3&&d>0.001){b.x-=dx/d*0.05;b.z-=dz/d*0.05;}
  }
}
function killBot(b,byEnt,head){
  b.alive=false;b.deadT=0;
  SIM.enemiesLeft--;
  if(byEnt)byEnt.kills++;
  feedAll(byEnt?byEnt.name:'—',b.name,head);
  if(byEnt&&byEnt.isLocal)sfx.kill();
  if(SIM.enemiesLeft<=0&&SIM.state==='playing')roundWin();
}

// ---------------- dano ----------------
function damageEnt(p,d,src,head){
  if(SIM.state!=='playing'||p.dead)return;
  const srcEnt=(src&&typeof src==='object')?src:null;
  const srcName=srcEnt?srcEnt.name:(src||'BOT');
  p.hp-=d;
  netEvent({e:'dmg',id:p.id,d});
  if(p.isLocal){dmgFlash();sfx.hurt();}
  if(p.hp<=0){
    p.hp=0;p.dead=true;p.deathT=0;
    if(srcEnt){
      srcEnt.kills++;
      if(PVP())srcEnt.credits=Math.min(MAX_CREDITS,srcEnt.credits+200);
    }
    if(srcEnt&&srcEnt.isLocal)sfx.kill();
    feedAll(srcName,p.name,!!head);
    if(p.isLocal)announce('VOCÊ CAIU','',1.4);
    if(PVP()){
      checkTeamWipe();
    }else{
      let allDead=true;
      for(const q of SIM.players)if(!q.dead){allDead=false;break;}
      if(allDead)roundLose();
    }
  }
}

// ---------------- disparo (simulação) ----------------
function startReload(p){
  const w=weaponDef(p);
  if(p.reloading||p.dead)return;
  if(p.mags[p.weapon]>=w.mag||p.reserves[p.weapon]<=0)return;
  p.reloading=true;p.reloadT=0;
  if(p.isLocal)sfx.reload();
  netEvent({e:'reload',id:p.id});
}
function hostFireWeapon(p){
  const w=weaponDef(p);
  if(p.mags[p.weapon]<=0){startReload(p);return;}
  p.mags[p.weapon]--;
  p.fireCd=w.rate;
  if(p.isLocal)localShotFX(weaponId(p));
  else{const v=VIS.players.get(p.id);if(v)v.shot=1;}
  const cp=Math.cos(p.pitch);
  let dx=-Math.sin(p.yaw)*cp,dy=Math.sin(p.pitch),dz=-Math.cos(p.yaw)*cp;
  const mv=p.speed/SPEED;
  // spread calculado ANTES do kick deste tiro: 1º tiro parado é preciso (estilo Valorant)
  const sp=(0.0016+p.fireSpread*0.004+mv*0.004)*(p.input.walk?0.4:1)*(p.input.ads?0.55:1);
  const s1=rand(-sp,sp),s2=rand(-sp,sp);
  p.fireSpread=Math.min(p.fireSpread+w.kick,3);
  const rx=Math.cos(p.yaw),rz=-Math.sin(p.yaw);
  dx+=rx*s1;dz+=rz*s1;dy+=s2;
  const dl=Math.hypot(dx,dy,dz);dx/=dl;dy/=dl;dz/=dl;
  const ox=p.x,oy=p.y+EYE,oz=p.z;
  let bestT=120,hitB=null,hitP=null,hitHead=false;
  for(let i=0;i<solids.length;i++){
    const t=rayBox(ox,oy,oz,dx,dy,dz,solids[i]);
    if(t>0&&t<bestT){bestT=t;hitB=null;hitP=null;}
  }
  for(const b of SIM.bots){
    if(!b.alive)continue;
    const th=rayBox(ox,oy,oz,dx,dy,dz,botBox(b,true));
    const tb=rayBox(ox,oy,oz,dx,dy,dz,botBox(b,false));
    let t=-1,head=false;
    if(th>0&&(tb<0||th<=tb)){t=th;head=true;}
    else if(tb>0){t=tb;head=false;}
    if(t>0&&t<bestT){bestT=t;hitB=b;hitP=null;hitHead=head;}
  }
  // PvP: acerta jogadores inimigos (sem fogo amigo)
  for(const q of SIM.players){
    if(q===p||q.dead||q.team===p.team)continue;
    const th=rayBox(ox,oy,oz,dx,dy,dz,playerBox(q,true));
    const tb=rayBox(ox,oy,oz,dx,dy,dz,playerBox(q,false));
    let t=-1,head=false;
    if(th>0&&(tb<0||th<=tb)){t=th;head=true;}
    else if(tb>0){t=tb;head=false;}
    if(t>0&&t<bestT){bestT=t;hitP=q;hitB=null;hitHead=head;}
  }
  const hx=ox+dx*bestT,hy=oy+dy*bestT,hz=oz+dz*bestT;
  netEvent({e:'shot',id:p.id,w:weaponId(p),ox,oy,oz,hx,hy,hz});
  if(hitB){
    const dmg=hitHead?w.head:w.dmg;
    hitB.hp-=dmg;hitB.flash=1;
    hitB.lastX=p.x;hitB.lastZ=p.z;hitB.engaged=true;
    netEvent({e:'hit',by:p.id,tgt:hitB.id,head:hitHead?1:0,kill:hitB.hp<=0?1:0,at:[hx,hy,hz]});
    if(p.isLocal){hitmarker(hitB.hp<=0,hitHead);if(hitHead)sfx.headshot();else sfx.hit();}
    if(hitB.hp<=0)killBot(hitB,p,hitHead);
  }else if(hitP){
    // headshot em jogador = dano letal (estilo Vandal 1-tap)
    const dmg=hitHead?w.head*2:w.dmg;
    const dead=hitP.hp-dmg<=0;
    netEvent({e:'hit',by:p.id,tgt:hitP.id,head:hitHead?1:0,kill:dead?1:0,at:[hx,hy,hz]});
    if(p.isLocal){hitmarker(dead,hitHead);if(hitHead)sfx.headshot();else sfx.hit();}
    damageEnt(hitP,dmg,p,hitHead);
  }else if(bestT<120){
    netEvent({e:'wall',id:p.id,at:[hx,hy,hz]});
  }
}
function playerBox(q,head){
  if(head)return{minX:q.x-0.22,maxX:q.x+0.22,minY:q.y+1.5,maxY:q.y+1.94,minZ:q.z-0.22,maxZ:q.z+0.22};
  return{minX:q.x-0.45,maxX:q.x+0.45,minY:q.y+0.1,maxY:q.y+1.5,minZ:q.z-0.32,maxZ:q.z+0.32};
}
function stepWeapons(p,dt){
  p.fireCd-=dt;
  p.smokeCd=Math.max(0,p.smokeCd-dt);
  p.fireSpread=Math.max(0,p.fireSpread-dt*4);
  if(p.input.weapon!==p.weapon&&!p.dead&&p.loadout[p.input.weapon]>=0){
    p.weapon=p.input.weapon;
    p.reloading=false;p.reloadT=0;
  }
  const w=weaponDef(p);
  if(p.input.reload){p.input.reload=false;startReload(p);}
  if(p.reloading){
    p.reloadT+=dt;
    if(p.reloadT>=w.reload){
      const need=w.mag-p.mags[p.weapon];
      const take=Math.min(need,p.reserves[p.weapon]);
      p.mags[p.weapon]+=take;p.reserves[p.weapon]-=take;
      p.reloading=false;
      if(p.isLocal)sfx.reloadDone();
    }
  }
  if(p.input.q){
    p.input.q=false;
    if(!p.dead&&p.smokeCharges>0&&p.smokeCd<=0&&SIM.state==='playing'){
      p.smokeCharges--;p.smokeCd=1.3;
      const cp=Math.cos(p.pitch);
      const dx=-Math.sin(p.yaw)*cp,dy=Math.sin(p.pitch),dz=-Math.cos(p.yaw)*cp;
      const vx=dx*15,vy=dy*15+3.4,vz=dz*15;
      spawnSmokeProj(p.x+dx*0.7,p.y+EYE+dy*0.7,p.z+dz*0.7,vx,vy,vz);
      netEvent({e:'smoke',id:p.id,x:p.x+dx*0.7,y:p.y+EYE+dy*0.7,z:p.z+dz*0.7,vx,vy,vz});
      if(p.isLocal)sfx.smoke();
    }
  }
  if(p.input.fire&&!p.reloading&&!p.dead&&SIM.state==='playing'&&p.fireCd<=0){
    hostFireWeapon(p);
  }
}

// ---------------- rounds ----------------
let barrierMesh=null,barrierSolid=null;
function buildBarrier(){
  removeBarrier();
  barrierMesh=new THREE.Mesh(new THREE.BoxGeometry(16,5,0.4),
    new THREE.MeshBasicMaterial({color:0x46ffd7,transparent:true,opacity:0.28,depthWrite:false}));
  barrierMesh.position.set(0,2.5,30);
  scene.add(barrierMesh);
  barrierSolid={minX:-8,maxX:8,minY:0,maxY:5,minZ:29.8,maxZ:30.2};
  solids.push(barrierSolid);
}
function removeBarrier(){
  if(barrierSolid){const i=solids.indexOf(barrierSolid);if(i>=0)solids.splice(i,1);barrierSolid=null;}
  if(barrierMesh){scene.remove(barrierMesh);barrierMesh=null;}
}
const PVP=()=>G.mode==='host'&&SIM.players.length>=2;
function tryBuy(p,id){
  if(!PVP()||SIM.state!=='buy'||!p||!SIM.players.includes(p)||p.dead)
    return{ok:false,msg:'Compras disponíveis apenas nos 15 segundos iniciais.'};
  if(!Number.isInteger(id)||id<0||id>=WEAPONS.length)
    return{ok:false,msg:'Arma inválida.'};
  const w=WEAPONS[id],slot=w.slot;
  if(p.loadout[slot]===id)return{ok:false,msg:'Você já tem esta arma.'};
  if(p.credits<w.price)return{ok:false,msg:'Créditos insuficientes.'};
  p.credits-=w.price;
  p.loadout[slot]=id;p.mags[slot]=w.mag;p.reserves[slot]=w.reserve;
  p.weapon=slot;p.input.weapon=slot;p.reloading=false;p.reloadT=0;p.fireCd=0;
  if(p.isLocal){INPUT.weapon=slot;sfx.buy();}
  netEvent({e:'buy',id:p.id,w:id});
  return{ok:true,msg:w.name+' equipada.'};
}
function startRoundHost(){
  SIM.roundToken++;
  SIM.round++;
  clearSmokes(SIM.smokes);
  if(PVP()){
    // ------- PvP: 15 segundos de compra, todos imóveis, economia autoritativa -------
    SIM.bots.length=0;SIM.enemiesLeft=0;
    if(SIM.round===1)for(const p of SIM.players){p.credits=START_CREDITS;p.loadout=[-1,1];}
    const tA=SIM.players.filter(p=>p.team===0);
    const tB=SIM.players.filter(p=>p.team===1);
    tA.forEach((p,i)=>resetEntForRound(p,(i-(tA.length-1)/2)*2.2,33,0,true));
    tB.forEach((p,i)=>resetEntForRound(p,(i-(tB.length-1)/2)*2.2,-33,Math.PI,true));
    const local=SIM.players.find(p=>p.isLocal);
    if(local){VIEW.yaw=local.yaw;VIEW.pitch=0;INPUT.weapon=local.weapon;INPUT.fire=false;}
    removeBarrier();
    SIM.state='buy';SIM.cdT=BUY_TIME;SIM.lastCd=-1;SIM.roundT=90;
    annAll('ROUND '+SIM.round,'FASE DE COMPRA · 15 SEGUNDOS · JOGADORES IMÓVEIS',2.1);
    if(isTouch)openShop();
  }else{
    // ------- solo / sala sem oponente: cooperativo contra bots -------
    SIM.players.forEach((p,i)=>resetEntForRound(p,(i-(SIM.players.length-1))*1.1,34,0));
    clearBots();
    const botN=Math.min(2+SIM.round+(SIM.players.length-1),9);
    spawnBots(botN);
    buildBarrier();
    SIM.state='countdown';SIM.cdT=3.4;SIM.lastCd=-1;SIM.roundT=0;
    annAll('ROUND '+SIM.round,'ELIMINEM TODOS OS INIMIGOS',1.8);
  }
}
function aliveCount(t){
  let n=0;
  for(const p of SIM.players)if(p.team===t&&!p.dead)n++;
  return n;
}
function checkTeamWipe(){
  if(SIM.state!=='playing'||!PVP())return;
  const a=aliveCount(0),b=aliveCount(1);
  if(a>0&&b>0)return;
  pvpEnd(a>0?0:(b>0?1:-1));
}
function timeUp(){
  const a=aliveCount(0),b=aliveCount(1);
  pvpEnd(a===b?-1:(a>b?0:1));
}
function pvpEnd(w){
  if(SIM.state!=='playing')return;
  SIM.state='roundend';SIM.endT=3;
  for(const p of SIM.players){
    const reward=w<0?2200:(p.team===w?3000:1900);
    p.credits=Math.min(MAX_CREDITS,p.credits+reward);
  }
  if(w===-1){annAll('EMPATE','NINGUÉM SOBROU VIVO',2);sfx.lose();}
  else{
    SIM.score[w]++;
    annAll('EQUIPE '+(w===0?'VERMELHA':'AZUL')+' VENCEU','PLACAR '+SIM.score[0]+' × '+SIM.score[1],2.2);
    sfx.win();
  }
}
function clearBots(){SIM.bots.length=0;}
function roundWin(){
  SIM.state='roundend';SIM.endT=2.6;SIM.ending='win';
  annAll('ROUND VENCIDO','PREPAREM-SE...',2);
  sfx.win();
}
function roundLose(){
  SIM.state='roundend';SIM.endT=2.6;SIM.ending='lose';
  SIM.round--;
  annAll('ROUND PERDIDO','',2);
  sfx.lose();
}

// ---------------- passo da simulação (host/solo) ----------------
let SIM_ALPHA=1;
function hostStep(dt){
  // estado anterior de cada entidade: o render interpola entre prev e atual
  // (técnica "Fix Your Timestep" de Glenn Fiedler) => movimento suave em qualquer FPS
  for(const p of SIM.players){p.px=p.x;p.py=p.y;p.pz=p.z;p.pyaw=p.yaw;p.ppitch=p.pitch;}
  for(const b of SIM.bots){b.px=b.x;b.py=b.y;b.pz=b.z;b.prot=b.rot;}
  if(SIM.state==='buy'){
    SIM.cdT=Math.max(0,SIM.cdT-dt);
    const c=Math.ceil(SIM.cdT);
    if(c!==SIM.lastCd){
      SIM.lastCd=c;
      if(c>0&&c<=3){sfx.tick();announce(String(c),'PREPARE-SE',0.75);}
    }
    if(SIM.cdT<=0){
      SIM.state='playing';
      for(const p of SIM.players)p.input.fire=false; // fogo pressionado na loja não vaza para o round
      INPUT.fire=false;
      closeShop(false);
      annAll('AÇÃO!','FIM DA FASE DE COMPRA',0.9);
      sfx.go();
    }
  }else if(SIM.state==='countdown'){
    SIM.cdT-=dt;
    const c=Math.ceil(SIM.cdT);
    if(c!==SIM.lastCd&&c>0){SIM.lastCd=c;sfx.tick();announce(String(c),'',0.8);}
    if(SIM.cdT<=0){
      removeBarrier();
      SIM.state='playing';
      annAll('GO GO GO!','',0.8);
      sfx.go();
    }
  }else if(SIM.state==='playing'){
    if(PVP()&&SIM.roundT>0){
      SIM.roundT-=dt;
      if(SIM.roundT<=0)timeUp();
    }
  }else if(SIM.state==='roundend'){
    SIM.endT-=dt;
    if(SIM.endT<=0)startRoundHost();
  }
  for(const p of SIM.players){
    if(p.dead){p.deathT+=dt;continue;}
    p.yaw=p.input.yaw;p.pitch=p.input.pitch;
    if(SIM.state==='buy'){
      // Congelamento real no anfitrião: nem inputs falsificados do cliente movem/atiram.
      p.speed=0;p.vy=0;p.y=0;
      p.input.fire=false;p.input.jump=false;p.input.reload=false;p.input.q=false;
      continue;
    }
    integrate(p,dt);
    stepWeapons(p,dt);
  }
  if(SIM.state==='playing'){
    for(const b of SIM.bots)updateBot(b,dt);
  }else{
    for(const b of SIM.bots)if(!b.alive)updateBot(b,dt);
  }
  SIM.bots=SIM.bots.filter(b=>!b.removed);
}

// ---------------- camada visual (meshes suavizados) ----------------
const VIS={players:new Map(),bots:new Map()};
function destroyVisual(v){
  scene.remove(v.group);
  for(const m of v.group.userData.mats||[])m.dispose(); // geometrias continuam partilhadas
}
function ensureVisPlayer(id,team){
  let v=VIS.players.get(id);
  if(v&&v.team!==team){destroyVisual(v);VIS.players.delete(id);v=null;}
  if(!v){
    v={group:makeBotMesh(team===1?0x46b0ff:0xff4655),team,x:0,y:-3,z:0,yaw:0,tx:0,ty:0,tz:0,tyaw:0,init:false,alive:true,deadT:0};
    scene.add(v.group);
    VIS.players.set(id,v);
  }
  return v;
}
function ensureVisBot(id){
  let v=VIS.bots.get(id);
  if(!v){
    v={group:makeBotMesh(0xff4655),x:0,y:0,z:0,yaw:0,tx:0,ty:0,tz:0,tyaw:0,init:false,alive:true,deadT:0};
    scene.add(v.group);
    VIS.bots.set(id,v);
  }
  return v;
}
function setVisTarget(v,x,y,z,yaw,alive,snap,weapon=0){
  if(snap||!v.init){v.x=x;v.y=y;v.z=z;v.yaw=yaw;v.init=true;v.deadT=0;v.motion=0;}
  v.tx=x;v.ty=y;v.tz=z;v.tyaw=yaw;v.alive=alive;
  v.weaponId=WEAPONS[weapon]?weapon:0;
}
function tickVisGroup(v,dt){
  const oldX=v.x,oldZ=v.z,k=1-Math.exp(-18*dt);
  v.x+=(v.tx-v.x)*k;v.y+=(v.ty-v.y)*k;v.z+=(v.tz-v.z)*k;
  let dy=v.tyaw-v.yaw;
  while(dy>Math.PI)dy-=Math.PI*2;
  while(dy<-Math.PI)dy+=Math.PI*2;
  v.yaw+=dy*k;
  const speed=v.alive?Math.hypot(v.x-oldX,v.z-oldZ)/Math.max(dt,.001):0;
  v.motion=(v.motion||0)+(clamp(speed/SPEED,0,1)-(v.motion||0))*Math.min(1,dt*9);
  v.animT=(v.animT||0)+dt*(3+v.motion*8);
  v.shot=Math.max(0,(v.shot||0)-dt*7);
  const rig=v.group.userData.rig;
  if(rig){
    const stride=Math.sin(v.animT)*v.motion;
    rig.legs[0].rotation.x=stride*.64;
    rig.legs[1].rotation.x=-stride*.64;
    rig.arms[0].rotation.x=-stride*.12+v.shot*.12;
    rig.arms[1].rotation.x=stride*.12+v.shot*.12;
    rig.torso.position.y=.86+Math.abs(stride)*.017+Math.sin(v.animT*.35)*.008;
    rig.torso.rotation.z=Math.sin(v.animT)*v.motion*.025;
    rig.head.rotation.y=Math.sin(v.animT*.27)*.055;
    rig.rifle.rotation.x=v.shot*.20;
    rig.pistol.rotation.x=v.shot*.30;
    rig.pistol.visible=WEAPONS[v.weaponId].slot===1;
    rig.rifle.visible=!rig.pistol.visible;
  }
  let py=v.y;
  if(!v.alive){
    v.deadT+=dt;
    v.group.rotation.x=-Math.min(1,v.deadT/.32)*Math.PI/2;
    if(v.deadT>1.4)py-=(v.deadT-1.4)*1.4;
  }else{
    v.deadT=0;
    v.group.rotation.x=0;
  }
  v.group.position.set(v.x,Math.max(py,-3),v.z);
  v.group.rotation.y=v.yaw;
}
function tickVisuals(dt){
  for(const v of VIS.players.values())tickVisGroup(v,dt);
  for(const v of VIS.bots.values())tickVisGroup(v,dt);
}
function syncSIMtoVIS(){
  const ids=new Set();
  for(const p of SIM.players){
    if(p.isLocal)continue;
    ids.add(p.id);
    const v=ensureVisPlayer(p.id,p.team);
    setVisTarget(v,p.x,p.y,p.z,p.yaw,!p.dead,false,weaponId(p));
    v.group.visible=true;
  }
  for(const[id,v]of VIS.players){
    if(!ids.has(id)){destroyVisual(v);VIS.players.delete(id);}
  }
  const bids=new Set();
  for(const b of SIM.bots){
    bids.add(b.id);
    const v=ensureVisBot(b.id);
    setVisTarget(v,b.x,b.y,b.z,b.rot+Math.PI,b.alive,false);
    v.shot=Math.max(v.shot||0,b.shot||0);
    v.group.userData.mats[0].emissiveIntensity=.52+b.flash*1.4;
  }
  for(const[id,v]of VIS.bots){
    if(!bids.has(id)){destroyVisual(v);VIS.bots.delete(id);}
  }
}
function cleanupVis(){
  for(const v of VIS.players.values())destroyVisual(v);
  for(const v of VIS.bots.values())destroyVisual(v);
  VIS.players.clear();VIS.bots.clear();
}

// ---------------- entrada local ----------------
const VIEW={yaw:0,pitch:0};
const INPUT={mx:0,mz:0,walk:false,fire:false,jump:false,reload:false,q:false,weapon:0,ads:false};
const keys=new Set();
let walkToggle=false;
function recomputeKeys(){
  let ix=0,iz=0;
  if(keys.has('KeyW'))iz+=1;if(keys.has('KeyS'))iz-=1;
  if(keys.has('KeyD'))ix+=1;if(keys.has('KeyA'))ix-=1;
  INPUT.mx=ix+joyX;INPUT.mz=iz+joyY;
  INPUT.walk=walkToggle||keys.has('ShiftLeft')||keys.has('ShiftRight');
}
window.addEventListener('keydown',e=>{
  if(e.code==='KeyB'&&isBuyPhase()){
    if(!e.repeat){e.preventDefault();toggleShop();}
    return;
  }
  if(e.code==='Escape'&&SHOP.open){e.preventDefault();closeShop(true);return;}
  if(e.repeat||!inGame()||G.paused||SHOP.open||
    (e.target&&e.target.closest&&e.target.closest('input,select,.overlay')))return;
  keys.add(e.code);recomputeKeys();
  if(e.code==='KeyR')INPUT.reload=true;
  if(e.code==='KeyQ')INPUT.q=true;
  if(e.code==='Digit1')INPUT.weapon=0;
  if(e.code==='Digit2')INPUT.weapon=1;
  if(e.code==='Space'){e.preventDefault();INPUT.jump=true;}
});
window.addEventListener('keyup',e=>{keys.delete(e.code);recomputeKeys();});
window.addEventListener('blur',()=>{
  keys.clear();recomputeKeys();INPUT.fire=false;
  if(G.mode==='solo')pauseGame();
});
function lookDelta(dx,dy){
  const s=(INPUT.ads?0.72:1)*SET.sens;
  VIEW.yaw-=dx*0.0021*s;
  VIEW.pitch=clamp(VIEW.pitch-dy*0.0021*s*(SET.invert?-1:1),-1.45,1.45);
}
let mouseDragLook=false;
document.addEventListener('mousemove',e=>{
  if(!inGame())return;
  if(document.pointerLockElement===canvas){
    lookDelta(e.movementX,e.movementY);
  }else if(mouseDragLook&&!isTouch){
    // fallback: arrastar com o botão segurado quando o lock não está disponível
    lookDelta(e.movementX,e.movementY);
  }
});
document.addEventListener('mousedown',e=>{
  if(!inGame()||isTouch)return;
  if(e.target&&e.target.closest&&e.target.closest('button,.overlay,input,select'))return;
  if(document.pointerLockElement===canvas){
    if(e.button===0)INPUT.fire=true;
    if(e.button===2)INPUT.ads=true;
  }else{
    // 2º jogador no PC: o lock pode ter sido negado sem gesto — clicar trava o mouse e/ou ativa fallback
    if(e.button===0){
      lockPointer();
      mouseDragLook=true;
      INPUT.fire=true;
    }
    if(e.button===2)INPUT.ads=true;
  }
});
document.addEventListener('mouseup',e=>{
  if(e.button===0){INPUT.fire=false;mouseDragLook=false;}
  if(e.button===2)INPUT.ads=false;
});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===canvas)mouseDragLook=false;
});
document.addEventListener('contextmenu',e=>e.preventDefault());
function inGame(){return G.mode==='solo'||G.mode==='host'||G.mode==='client';}
function lockPointer(){if(!isTouch&&canvas.requestPointerLock)canvas.requestPointerLock();}
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement!==canvas&&inGame()&&!isTouch&&!G.paused){
    if(G.mode==='solo')pauseGame();
    else openMpOverlay();
  }
});

// entrada por toque/caneta (Pointer Events)
const joyBase=$('joyBase'),joyKnob=$('joyKnob');
let movePid=null,lookPid=null,joyOX=0,joyOY=0,joyX=0,joyY=0,lookLX=0,lookLY=0;
const stage=$('stage');
function isUiTarget(el){return el&&el.closest&&el.closest('.overlay,button,input,select,.btn');}
stage.addEventListener('pointerdown',e=>{
  if(isUiTarget(e.target))return;      // menus/botões recebem clique normal
  if(!inGame()||G.paused)return;       // não bloquear gestos fora do jogo
  if(e.pointerType==='mouse')return;   // mouse usa pointer lock
  if(e.pointerType==='touch')document.body.classList.add('touch');
  e.preventDefault();
  try{stage.setPointerCapture(e.pointerId);}catch(err){}
  if(movePid===null&&e.clientX<window.innerWidth*0.45){
    movePid=e.pointerId;joyOX=e.clientX;joyOY=e.clientY;
    joyBase.style.display='block';
    joyBase.style.left=(joyOX-56)+'px';joyBase.style.top=(joyOY-56)+'px';
    joyKnob.style.transform='translate(0,0)';
  }else if(lookPid===null){
    lookPid=e.pointerId;lookLX=e.clientX;lookLY=e.clientY;
  }
},{passive:false});
stage.addEventListener('pointermove',e=>{
  if(e.pointerType==='mouse')return;
  if(e.pointerId===movePid){
    joyX=clamp((e.clientX-joyOX)/48,-1,1);
    joyY=clamp(-(e.clientY-joyOY)/48,-1,1);
    joyKnob.style.transform='translate('+joyX*38+'px,'+(-joyY*38)+'px)';
    recomputeKeys();
  }else if(e.pointerId===lookPid){
    const dx=e.clientX-lookLX,dy=e.clientY-lookLY;
    lookLX=e.clientX;lookLY=e.clientY;
    if(inGame()){
      const s=SET.sens*(SET.invert?-1:1);
      VIEW.yaw-=dx*0.0042*s;
      VIEW.pitch=clamp(VIEW.pitch-dy*0.0042*s,-1.45,1.45);
    }
  }
},{passive:false});
function pointerEnd(e){
  if(e.pointerId===movePid){movePid=null;joyX=joyY=0;joyBase.style.display='none';recomputeKeys();}
  if(e.pointerId===lookPid)lookPid=null;
}
stage.addEventListener('pointerup',pointerEnd);
stage.addEventListener('pointercancel',pointerEnd);
// bloqueia gestos do navegador (pull-to-refresh, pinch, duplo toque) durante o jogo
document.addEventListener('touchmove',e=>{
  // Menus são roláveis no mobile, inclusive o menu multiplayer (simulação ativa).
  // Só bloqueamos gestos de navegador sobre a área jogável.
  if(inGame()&&!G.paused&&!(e.target&&e.target.closest&&e.target.closest('.overlay')))
    e.preventDefault();
},{passive:false});
document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('dblclick',e=>e.preventDefault());
function bindBtn(id,down,up){
  const el=$(id);
  el.addEventListener('pointerdown',e=>{
    e.preventDefault();e.stopPropagation();
    try{el.setPointerCapture(e.pointerId);}catch(err){}
    el.classList.add('on');if(down)down();
  });
  const off=e=>{
    if(e){e.preventDefault();e.stopPropagation();}
    if(!el.classList.contains('on'))return;
    el.classList.remove('on');if(up)up();
  };
  el.addEventListener('pointerup',off);
  el.addEventListener('pointercancel',off);
  el.addEventListener('lostpointercapture',off);
}
bindBtn('btnFire',()=>INPUT.fire=true,()=>INPUT.fire=false);
bindBtn('btnJump',()=>INPUT.jump=true);
bindBtn('btnReload',()=>INPUT.reload=true);
bindBtn('btnSmoke',()=>INPUT.q=true);
bindBtn('btnWep',()=>{
  const me=getMe();
  if(me&&me.loadout[0]<0){INPUT.weapon=1;sfx.deny();return;}
  INPUT.weapon=INPUT.weapon===0?1:0;
});
bindBtn('btnAim',()=>{
  INPUT.ads=!INPUT.ads;
  $('btnAim').classList.toggle('active',INPUT.ads);
  $('btnAim').setAttribute('aria-pressed',String(INPUT.ads));
});
bindBtn('btnWalk',()=>{
  walkToggle=!walkToggle;
  recomputeKeys();
  $('btnWalk').classList.toggle('active',walkToggle);
  $('btnWalk').setAttribute('aria-pressed',String(walkToggle));
});

// ---------------- tela cheia ----------------
function requestGameFS(){
  const el=document.documentElement;
  const req=el.requestFullscreen||el.webkitRequestFullscreen;
  if(!req)return;
  try{
    const p=req.call(el);
    if(p&&p.then){
      p.then(()=>{
        try{if(screen.orientation&&screen.orientation.lock)screen.orientation.lock('landscape').catch(()=>{});}catch(e){}
      }).catch(()=>{});
    }
  }catch(e){}
}
function toggleFS(){
  const cur=document.fullscreenElement||document.webkitFullscreenElement;
  if(cur){
    const ex=document.exitFullscreen||document.webkitExitFullscreen;
    if(ex)ex.call(document);
    return;
  }
  requestGameFS();
}
document.addEventListener('fullscreenchange',resize);
document.addEventListener('webkitfullscreenchange',resize);

// ---------------- pausa ----------------
function pauseGame(){
  if(G.mode!=='solo'||G.paused)return;
  G.paused=true;
  $('mpPauseNote').classList.add('hidden');
  $('btnLeavePause').classList.add('hidden');
  $('pauseTitle').textContent='PAUSADO';
  pauseEl.classList.remove('hidden');
  INPUT.fire=false;keys.clear();recomputeKeys();
  if(document.pointerLockElement)document.exitPointerLock();
}
function openMpOverlay(){
  $('mpPauseNote').classList.remove('hidden');
  $('btnLeavePause').classList.remove('hidden');
  $('pauseTitle').textContent='CONECTADO';
  pauseEl.classList.remove('hidden');
  INPUT.fire=false;
}
function resumeGame(){
  pauseEl.classList.add('hidden');
  if(G.mode==='solo')G.paused=false;
  lockPointer();
}
$('pauseBtn').addEventListener('click',()=>{
  if(G.mode==='solo')pauseGame();
  else if(inGame())openMpOverlay();
});
$('fsBtn').addEventListener('click',toggleFS);
$('btnFs').addEventListener('click',toggleFS);
$('btnFsPause').addEventListener('click',toggleFS);
$('resumeBtn').addEventListener('click',resumeGame);
$('btnLeavePause').addEventListener('click',()=>{
  pauseEl.classList.add('hidden');
  if(window.NET)NET.leave();
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&G.mode==='solo')pauseGame();
});

// ---------------- radar ----------------
function drawRadar(me,botsSrc,playersSrc){
  const S=132,k=S/2/46;
  const g=radarCtx;
  g.clearRect(0,0,S,S);
  g.fillStyle='rgba(15,25,35,0.72)';
  g.beginPath();g.arc(S/2,S/2,S/2-1,0,7);g.fill();
  g.save();
  g.beginPath();g.arc(S/2,S/2,S/2-2,0,7);g.clip();
  g.fillStyle='#2e3d52';
  for(const r of radarRects)g.fillRect(S/2+(r.x-r.w/2)*k,S/2+(r.z-r.d/2)*k,r.w*k,r.d*k);
  g.fillStyle='rgba(190,205,220,0.55)';
  for(const s of SIM.smokes){
    if(s.state!=='cloud')continue;
    g.beginPath();g.arc(S/2+s.mesh.position.x*k,S/2+s.mesh.position.z*k,s.r*k,0,7);g.fill();
  }
  g.fillStyle='#ff4655';
  for(const b of botsSrc){
    if(!b.alive)continue;
    g.beginPath();g.arc(S/2+b.x*k,S/2+b.z*k,2.6,0,7);g.fill();
  }
  for(const p of playersSrc){
    g.fillStyle=p.enemy?'#ff4655':'#46b0ff';
    g.beginPath();g.arc(S/2+p.x*k,S/2+p.z*k,2.4,0,7);g.fill();
  }
  g.save();
  g.translate(S/2+me.x*k,S/2+me.z*k);
  g.rotate(-me.yaw);
  g.fillStyle='#ece8e1';
  g.beginPath();g.moveTo(0,-6);g.lineTo(4.5,4.5);g.lineTo(-4.5,4.5);g.closePath();g.fill();
  g.restore();
  g.restore();
  g.strokeStyle='rgba(236,232,225,0.3)';
  g.beginPath();g.arc(S/2,S/2,S/2-1.5,0,7);g.stroke();
}

// ---------------- câmera / arma / HUD por frame ----------------
let stepDist=0;
function getMe(){
  if(G.mode==='client')return window.NET?NET.PE:null;
  for(const p of SIM.players)if(p.isLocal)return p;
  return null;
}
function lerpAngle(a,b,t){let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return a+d*t;}
function updateCameraAndWeapon(dt){
  const me=getMe();
  if(!me)return;
  // câmera interpolada entre os dois últimos passos de simulação
  let cx=me.x,cy=me.y,cz=me.z,cyaw=me.yaw,cpitch=me.pitch;
  if(me.px!==undefined&&!me.dead){
    const d2=(me.x-me.px)*(me.x-me.px)+(me.z-me.pz)*(me.z-me.pz)+(me.y-me.py)*(me.y-me.py);
    if(d2<4){ // guarda anti-teleporte (respawn/correção): não interpola saltos
      const a=SIM_ALPHA;
      cx=me.px+(me.x-me.px)*a;cy=me.py+(me.y-me.py)*a;cz=me.pz+(me.z-me.pz)*a;
      cyaw=lerpAngle(me.pyaw,me.yaw,a);cpitch=lerpAngle(me.ppitch,me.pitch,a);
    }
  }
  camera.position.set(cx,cy+EYE,cz);
  camera.rotation.y=cyaw;camera.rotation.x=cpitch;
  if(me.dead){
    camera.rotation.z=Math.min(0.8,me.deathT*2);
    camera.position.y=Math.max(me.y+0.5,me.y+EYE-me.deathT*1.6);
  }else camera.rotation.z=0;
  // passos
  if(me.speed>0.5&&me.grounded&&!me.dead){
    stepDist+=me.speed*dt;
    if(stepDist>2.4){stepDist=0;sfx.step();}
  }else stepDist=0;
  // fov
  const tf=INPUT.ads&&!me.dead?SET.fov-13:SET.fov;
  if(Math.abs(camera.fov-tf)>0.05){camera.fov+=(tf-camera.fov)*Math.min(1,dt*12);camera.updateProjectionMatrix();}
  // Arma atual + mãos: equipar, balanço ao andar, respiração, recuo e troca de pente.
  const id=weaponId(me),gun=gunModels[id];
  if(viewWeaponId!==id){
    if(viewWeaponId>=0)gunModels[viewWeaponId].visible=false;
    viewWeaponId=id;equipT=.27;
    gun.position.set(INPUT.ads?.02:.27,-.45,gun.userData.depth||-.44);
  }
  gun.visible=!me.dead;
  localKick=Math.max(0,localKick-dt*7);
  equipT=Math.max(0,equipT-dt);
  const spd=clamp(me.speed/SPEED,0,1);
  me.stepAcc=(me.stepAcc||0)+me.speed*dt*(me.grounded?1.6:0);
  const bobA=Math.sin(me.stepAcc*2)*.013*spd;
  const bobB=Math.cos(me.stepAcc)*.011*spd;
  const breath=Math.sin(performance.now()*.0022)*.004;
  const rp=me.reloading?Math.sin(Math.min(1,me.reloadT/weaponDef(me).reload)*Math.PI):0;
  const bx=INPUT.ads?.015:.28,by=INPUT.ads?-.17:-.23;
  gun.position.x+=(bx+bobB-gun.position.x)*Math.min(1,dt*12);
  gun.position.y=by+bobA+breath-rp*.16-Math.sin(equipT/.27*Math.PI/2)*.21;
  const targetZ=(gun.userData.depth||-.44)+localKick*.07-(INPUT.ads?.07:0);
  gun.position.z+=(targetZ-gun.position.z)*Math.min(1,dt*18);
  gun.rotation.x=localKick*.13-rp*.5;
  gun.rotation.z=Math.sin(me.stepAcc)*.013*spd+localKick*.028-rp*.06;
  gun.userData.handL.position.y=-.05-rp*.10;
  gun.userData.handL.rotation.x=rp*.65+localKick*.09;
  gun.userData.handR.rotation.z=localKick*.12-rp*.07;
  gun.userData.mag.position.y=gun.userData.magY-rp*.12;
  updateRealArms(gun,me.reloading?Math.min(1,me.reloadT/weaponDef(me).reload):0);
  const gap=5+spd*7+me.fireSpread*5+(me.grounded?0:8);
  const gr=Math.round(gap*10)/10;
  if(_hud.gap!==gr){_hud.gap=gr;crossEl.style.setProperty('--gap',gr+'px');}
  crossEl.classList.toggle('hide',me.dead);
  updateHUD(me);
}

// ---------------- modo solo ----------------
function startSolo(){
  initAudio();
  requestGameFS();
  cleanupVis();
  SIM.players.length=0;
  const me=makeEnt('p0',localName());
  me.isLocal=true;
  SIM.players.push(me);
  SIM.active=true;SIM.round=0;SIM.score=[0,0];
  $('timeTag').classList.add('hidden');
  G.mode='solo';G.paused=false;
  modeTag.textContent='SOLO';
  menuEl.classList.add('hidden');hudEl.classList.remove('hidden');
  lockPointer();
  startRoundHost();
}

// ---------------- loop principal ----------------
const SIM_DT=0.05;
let simAcc=0,last=performance.now();
let fpsEma=60,fpsUiT=0,autoT=0;
function trackPerf(dtRaw){
  if(dtRaw<=0)return;
  fpsEma+=(1/dtRaw-fpsEma)*0.06;
  if(SET.fps){
    fpsUiT+=dtRaw;
    if(fpsUiT>0.25){fpsUiT=0;$('fpsN').textContent=Math.round(Math.min(fpsEma,999));}
  }
  if(SET.qual==='auto'&&SET.fpsCap===0&&inGame()&&!G.paused){
    autoT+=dtRaw;
    if(autoT>2){
      autoT=0;
      if(fpsEma<42&&autoScale>0.6){
        autoScale=Math.max(0.6,autoScale*0.85);
        renderer.setPixelRatio(computedPR());resize();
      }else if(fpsEma>57&&autoScale<1){
        autoScale=Math.min(1,autoScale+0.15);
        renderer.setPixelRatio(computedPR());resize();
      }
    }
  }
}
// simulação em passo fixo acionada pelo loop de render (60 Hz mobile / 120 Hz desktop):
// a câmera e as entidades atualizam na mesma cadência dos quadros => movimento fluido
const SIM_STEP=isTouch?(1/60):(1/120);
let lastRafAt=performance.now();
setInterval(()=>{
  // rAF fica pausado em aba de fundo (e não existe em testes): o intervalo assume a simulação
  if(!SIM.active||G.paused)return;
  if(performance.now()-lastRafAt>300){
    syncLocalInput();
    hostStep(SIM_DT);
  }
  // snapshots de rede continuam saindo a 20 Hz (o cliente interpola)
  if(window.NET)NET.afterSim();
},50);
function syncLocalInput(){
  const me=getMe();
  if(!me||G.mode==='client')return;
  const i=me.input;
  i.mx=INPUT.mx;i.mz=INPUT.mz;
  i.yaw=VIEW.yaw;i.pitch=VIEW.pitch;
  i.walk=INPUT.walk;i.fire=INPUT.fire;i.ads=INPUT.ads;
  i.weapon=INPUT.weapon;
  i.jump=i.jump||INPUT.jump;INPUT.jump=false;
  i.reload=i.reload||INPUT.reload;INPUT.reload=false;
  i.q=i.q||INPUT.q;INPUT.q=false;
}
function localName(){
  const n=$('nameInput').value.trim().toUpperCase().replace(/[^A-Z0-9À-ÖØ-öø-ÿ _-]/g,'').slice(0,18);
  return n||('AGENTE-'+randi(10,99));
}
let frameLast=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  lastRafAt=now;
  // limitador de FPS: pula quadros até completar o intervalo alvo
  if(SET.fpsCap>0){
    const iv=1000/SET.fpsCap;
    const el=now-frameLast;
    if(el<iv-1)return;
    frameLast=now-(el%iv);
  }else{
    frameLast=now;
  }
  const raw=(now-last)/1000;last=now;
  trackPerf(raw);
  let dt=raw;
  if(dt>0.05)dt=0.05;
  if(G.mode==='menu'){
    const a=now*0.00012;
    camera.position.set(Math.sin(a)*30,17,Math.cos(a)*30);
    camera.lookAt(0,1.5,0);
  }else if(!G.paused){
    if(G.mode==='solo'||G.mode==='host'){
      // passos de simulação acumulados até alcançar o tempo real (passo fixo)
      simAcc+=dt;
      if(simAcc>0.25)simAcc=0.25;
      while(simAcc>=SIM_STEP){
        syncLocalInput();
        hostStep(SIM_STEP);
        simAcc-=SIM_STEP;
      }
      SIM_ALPHA=clamp(simAcc/SIM_STEP,0,1);
      syncSIMtoVIS();
      const me=getMe();
      HUDSRC.round=SIM.round;
      HUDSRC.enemies=(G.mode==='host'&&PVP()&&me)?aliveCount(me.team===0?1:0):SIM.enemiesLeft;
      HUDSRC.time=SIM.roundT;
      HUDSRC.kills=me?me.kills:0;HUDSRC.smoke=me?me.smokeCharges:0;
      if(G.mode==='host'&&PVP()&&window.NET){
        modeTag.textContent='SALA '+NET.roomCode+' · '+SIM.score[0]+' × '+SIM.score[1];
      }
    }else if(G.mode==='client'&&window.NET){
      NET.frame(dt);
    }
    tickVisuals(dt);
    updateSmokesArr(SIM.smokes,dt);
    updateFX(dt);
    updateCameraAndWeapon(dt);
    const me=getMe();
    if(me){
      let botsR=[],playersR=[];
      if(G.mode==='client'&&window.NET){
        botsR=NET.radarBots();
        playersR=NET.radarPlayers().map(p=>({x:p.x,z:p.z,enemy:p.team!==NET.myTeam}));
      }else{
        botsR=SIM.bots;
        playersR=SIM.players.filter(p=>!p.isLocal&&!p.dead).map(p=>({x:p.x,z:p.z,enemy:p.team!==me.team}));
      }
      drawRadar(me,botsR,playersR);
    }
  }
  // Pequeno movimento do reator, sem custo extra de geometria por quadro.
  reactorCore.position.y=5.8+Math.sin(now*.0014)*.18;
  reactorCore.rotation.y=now*.00027;
  reactorCore.rotation.z=Math.sin(now*.0009)*.06;
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);

// ---------------- menu / configurações ----------------
const CTRL_HTML=isTouch
  ?'<div class="h"><svg class="ic" aria-hidden="true"><use href="#i-move"/></svg>CONTROLES · TOQUE</div><b>Esquerda</b>: mova pelo joystick (toque e arraste)<br><b>Direita</b>: deslize para mirar<br><b>ATIRAR</b>: segure para disparar<br><b>PULAR</b> · <b>RECAR.</b> · <b>FUMAÇA</b> · <b>ARMA</b> à direita<br><b>MIRA</b> e <b>ANDAR</b>: toque para ativar/desativar<br><b>Dica:</b> o jogo fica mais confortável na horizontal.'
  :'<div class="h"><svg class="ic" aria-hidden="true"><use href="#i-sens"/></svg>CONTROLES · PC</div><b>WASD</b> mover · <b>SHIFT</b> andar (mais preciso)<br><b>Mouse</b> mirar · <b>Clique esq.</b> atirar · <b>Clique dir.</b> zoom<br><b>ESPAÇO</b> pular · <b>R</b> recarregar · <b>Q</b> fumaça · <b>1/2</b> trocar arma';
$('colCtrl').innerHTML=CTRL_HTML;
$('helpCtrl').innerHTML=CTRL_HTML;
let settingsFrom='menu';
$('btnSolo').addEventListener('click',startSolo);
$('btnSettings').addEventListener('click',()=>{settingsFrom='menu';menuEl.classList.add('hidden');$('settings').classList.remove('hidden');});
$('btnHelp').addEventListener('click',()=>{menuEl.classList.add('hidden');$('help').classList.remove('hidden');});
$('btnHelpBack').addEventListener('click',()=>{$('help').classList.add('hidden');menuEl.classList.remove('hidden');});
$('btnPauseSettings').addEventListener('click',()=>{settingsFrom='pause';pauseEl.classList.add('hidden');$('settings').classList.remove('hidden');});
$('btnSetBack').addEventListener('click',()=>{
  $('settings').classList.add('hidden');
  if(settingsFrom==='pause'&&inGame())pauseEl.classList.remove('hidden');
  else menuEl.classList.remove('hidden');
});
function setUI(){
  $('setSens').value=SET.sens;$('setSensV').textContent=SET.sens.toFixed(2);
  $('setFov').value=SET.fov;$('setFovV').textContent=SET.fov;
  $('setVol').value=SET.vol;$('setVolV').textContent=Math.round(SET.vol*100)+'%';
  $('setQual').value=SET.qual;
  $('setRes').value=String(SET.res);
  $('setFx').checked=SET.fx;
  $('setFps').checked=SET.fps;
  $('setFpsCap').value=String(SET.fpsCap);
  $('setInvert').checked=SET.invert;
  $('fpsTag').classList.toggle('hidden',!SET.fps);
}
$('setSens').addEventListener('input',e=>{SET.sens=parseFloat(e.target.value);$('setSensV').textContent=SET.sens.toFixed(2);saveSet();});
$('setFov').addEventListener('input',e=>{SET.fov=parseInt(e.target.value,10);$('setFovV').textContent=SET.fov;saveSet();});
$('setVol').addEventListener('input',e=>{SET.vol=parseFloat(e.target.value);$('setVolV').textContent=Math.round(SET.vol*100)+'%';if(master)master.gain.value=SET.vol;saveSet();});
$('setQual').addEventListener('change',e=>{SET.qual=e.target.value;autoScale=1;applyQuality();saveSet();});
$('setRes').addEventListener('change',e=>{SET.res=parseFloat(e.target.value);applyQuality();saveSet();});
$('setFx').addEventListener('change',e=>{SET.fx=e.target.checked;saveSet();});
$('setFps').addEventListener('change',e=>{SET.fps=e.target.checked;$('fpsTag').classList.toggle('hidden',!SET.fps);saveSet();});
$('setFpsCap').addEventListener('change',e=>{SET.fpsCap=parseInt(e.target.value,10)||0;frameLast=performance.now();saveSet();});
$('setInvert').addEventListener('change',e=>{SET.invert=e.target.checked;saveSet();});
$('btnSetReset').addEventListener('click',()=>{SET=Object.assign({},SET_DEF);autoScale=1;if(master)master.gain.value=SET.vol;applyQuality();saveSet();setUI();});
setUI();
try{
  const savedName=localStorage.getItem('proto_name');
  if(savedName)$('nameInput').value=savedName;
}catch(e){}
$('nameInput').addEventListener('change',()=>{try{localStorage.setItem('proto_name',$('nameInput').value.trim().toUpperCase());}catch(e){}});

function backToMenu(){
  closeShop(false);
  $('buyPhase').classList.add('hidden');$('shopBtn').classList.add('hidden');
  $('creditTag').classList.add('hidden');
  G.mode='menu';G.paused=false;
  walkToggle=false;INPUT.ads=false;INPUT.fire=false;recomputeKeys();
  $('btnAim').classList.remove('active');$('btnAim').setAttribute('aria-pressed','false');
  $('btnWalk').classList.remove('active');$('btnWalk').setAttribute('aria-pressed','false');
  SIM.active=false;SIM.players.length=0;
  clearBots();clearSmokes(SIM.smokes);removeBarrier();cleanupVis();
  for(const gun of gunModels)gun.visible=false;
  if(tacticalArms)tacticalArms.rig.visible=false;
  viewWeaponId=-1;
  hudEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  $('lobby').classList.add('hidden');
  $('timeTag').classList.add('hidden');
  $('pingTag').classList.add('hidden');
  menuEl.classList.remove('hidden');
}
window.backToMenu=backToMenu;

if(typeof THREE==='undefined'){
  document.body.innerHTML='<div style="color:#ece8e1;font-family:sans-serif;padding:40px">Falha ao carregar a engine 3D (three.min.js).</div>';
}
