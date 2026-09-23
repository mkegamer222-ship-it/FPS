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
const SET_DEF={sens:1,fov:75,vol:0.8,qual:'high',invert:false};
let SET=Object.assign({},SET_DEF);
try{
  const s=JSON.parse(localStorage.getItem('proto_set_v1'));
  if(s)SET=Object.assign(SET_DEF,s);
}catch(e){}
function saveSet(){try{localStorage.setItem('proto_set_v1',JSON.stringify(SET));}catch(e){}}
function applyQuality(){
  const high=SET.qual==='high';
  renderer.setPixelRatio(high?Math.min(window.devicePixelRatio||1,isTouch?1.5:2):1);
  sun.castShadow=high;
  renderer.shadowMap.enabled=high;
  for(const m of mapGroup.children){m.castShadow=high;m.receiveShadow=true;}
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

// ---------------- mapa ----------------
const solids=[];
const radarRects=[];
const mapGroup=new THREE.Group();
scene.add(mapGroup);
function mat(color,rough){
  return new THREE.MeshStandardMaterial({color,roughness:rough===undefined?0.92:rough,metalness:0.05});
}
function addBox(x,z,w,h,d,color,opts){
  opts=opts||{};
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));
  m.position.set(x,h/2+(opts.y||0),z);
  m.castShadow=true;m.receiveShadow=true;
  mapGroup.add(m);
  if(opts.solid!==false){
    solids.push({minX:x-w/2,maxX:x+w/2,minY:opts.y||0,maxY:(opts.y||0)+h,minZ:z-d/2,maxZ:z+d/2});
    radarRects.push({x,z,w,d});
  }
  return m;
}
const floor=new THREE.Mesh(new THREE.PlaneGeometry(96,96),mat(0x22303f,0.96));
floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(96,48,0x2e3c50,0x283547);
grid.position.y=0.02;scene.add(grid);
function siteDecal(x,z,letter,color){
  const cv=document.createElement('canvas');cv.width=cv.height=256;
  const g=cv.getContext('2d');
  g.strokeStyle=color;g.lineWidth=10;g.beginPath();g.arc(128,128,104,0,Math.PI*2);g.stroke();
  g.fillStyle=color;g.font='italic bold 150px Arial';g.textAlign='center';g.textBaseline='middle';g.fillText(letter,128,140);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(9,9),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,opacity:0.5,depthWrite:false}));
  m.rotation.x=-Math.PI/2;m.position.set(x,0.04,z);
  scene.add(m);
}
siteDecal(-20,-18,'A','#46ffd7');
siteDecal(20,18,'B','#ff4655');
const C_WALL=0x3e4e66,C_WALL2=0x33415a,C_CRATE=0x5a6b85,C_DARK=0x2c3950;
addBox(0,-41,84,7,2,C_WALL);addBox(0,41,84,7,2,C_WALL);
addBox(-41,0,2,7,84,C_WALL);addBox(41,0,2,7,84,C_WALL);
addBox(0,-4,10,5,10,C_WALL2);
addBox(-7,-12,8,4,1.6,C_WALL2);addBox(7,-12,8,4,1.6,C_WALL2);
addBox(-15,-18,1.6,4,10,C_WALL);
addBox(-24,-13,3,3,3,C_CRATE);addBox(-23,-22,2.6,2.6,2.6,C_CRATE);
addBox(15,18,1.6,4,10,C_WALL);
addBox(24,13,3,3,3,C_CRATE);addBox(23,22,2.6,2.6,2.6,C_CRATE);
addBox(-8,3,2.6,2.6,2.6,C_CRATE);addBox(8,3,2.6,2.6,2.6,C_CRATE);
addBox(0,15,3,3,3,C_CRATE);
addBox(-14,-4,2.2,2.2,2.2,C_CRATE);addBox(14,-4,2.2,2.2,2.2,C_CRATE);
addBox(30,-9,3,1.5,3,C_DARK);addBox(30,-13,3,3,3,C_CRATE);
addBox(-30,9,3,1.5,3,C_DARK);addBox(-30,13,3,3,3,C_CRATE);
addBox(-8,33,1.6,5,6,C_WALL2);addBox(8,33,1.6,5,6,C_WALL2);
addBox(-34,-27,1.6,4,9,C_WALL2);addBox(-27,-34,9,4,1.6,C_WALL2);
addBox(34,27,1.6,4,9,C_WALL2);addBox(27,34,9,4,1.6,C_WALL2);
addBox(33,-31,3.4,2.8,3.4,C_CRATE);addBox(-33,31,3.4,2.8,3.4,C_CRATE);
applyQuality();

const NAV=[[-20,-18],[20,18],[0,-30],[-30,-14],[30,14],[-18,10],[18,-10],[0,-14],[-36,26],[36,-26],[0,24],[-20,24],[20,-24]];
const SPAWNS=[[-20,-18],[20,18],[0,-30],[-30,-14],[30,14],[-20,24],[20,-24],[0,-14]];

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
  step(){aNoise(0.05,420,1.2,0.07,'lowpass');},
  join(){tone(880,0.08,0.2,'sine');setTimeout(()=>tone(1100,0.1,0.2,'sine'),80);}
};

// ---------------- armas ----------------
const WEAPONS=[
  {name:'VANDAL',  dmg:30, head:78, mag:25, reserve:75, rate:0.10, kick:0.55, spread:0.0040, reload:2.1, auto:true},
  {name:'FANTASMA',dmg:26, head:52, mag:12, reserve:36, rate:0.17, kick:0.32, spread:0.0026, reload:1.4, auto:true}
];

// ---------------- entidades ----------------
const SPEED=5.4,WALK=2.7,GRAV=20,JUMP=7.8,EYE=1.62,PR=0.45;
function makeEnt(id,name){
  return{
    id,name,isLocal:false,team:0,
    x:0,y:0,z:34,vy:0,yaw:0,pitch:0,grounded:true,speed:0,
    hp:100,dead:false,deathT:0,
    weapon:0,mags:[WEAPONS[0].mag,WEAPONS[1].mag],reserves:[WEAPONS[0].reserve,WEAPONS[1].reserve],
    reloading:false,reloadT:0,fireCd:0,fireSpread:0,
    smokeCharges:3,smokeCd:0,kills:0,stepAcc:0,
    input:{mx:0,mz:0,yaw:0,pitch:0,walk:false,fire:false,jump:false,reload:false,q:false,weapon:0,ads:false}
  };
}
function resetEntForRound(e,x,z,yaw){
  e.hp=100;e.dead=false;e.deathT=0;
  e.weapon=0;e.mags=[WEAPONS[0].mag,WEAPONS[1].mag];e.reserves=[WEAPONS[0].reserve,WEAPONS[1].reserve];
  e.reloading=false;e.reloadT=0;e.fireCd=0;e.fireSpread=0;
  e.smokeCharges=3;e.smokeCd=0;
  e.x=x;e.z=z;e.y=0;e.vy=0;
  e.yaw=yaw||0;e.pitch=0;
  e.input.fire=false;e.input.jump=false;e.input.reload=false;e.input.q=false;e.input.weapon=0;
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
  roundN=$('roundN'),enemN=$('enemN'),killN=$('killN'),smokeN=$('smokeN'),wnameEl=$('wname'),
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
  d.innerHTML='<span class="k">'+killer+'</span><span class="w">'+(head?'☠':'✕')+'</span><span class="v">'+victim+'</span>';
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
function updateHUD(me){
  hpText.textContent=Math.max(0,Math.round(me.hp));
  hpBar.style.width=clamp(me.hp,0,100)+'%';
  hpBar.className=me.hp<35?'lowhp':'';hpBar.id='hpBar';
  const w=WEAPONS[me.weapon];
  ammoN.textContent=me.mags[me.weapon];
  ammoR.textContent='/ '+me.reserves[me.weapon];
  ammoWrap.className=me.mags[me.weapon]===0?'empty':'';ammoWrap.id='ammoWrap';
  wnameEl.textContent=w.name+(me.reloading?' · RECARREGANDO':'');
  roundN.textContent=HUDSRC.round;
  enemN.textContent=HUDSRC.enemies;
  killN.textContent=HUDSRC.kills;
  $('timeN').textContent=Math.max(0,Math.ceil(HUDSRC.time||0));
  smokeN.textContent='●'.repeat(me.smokeCharges)+'○'.repeat(3-me.smokeCharges);
  $('ws0').className='wslot'+(me.weapon===0?' on':'');
  $('ws1').className='wslot'+(me.weapon===1?' on':'');
  vigEl.classList.toggle('low',me.hp<35&&me.hp>0);
}

// ---------------- viewmodel das armas ----------------
const gunRifle=new THREE.Group(),gunPistol=new THREE.Group();
camera.add(gunRifle);camera.add(gunPistol);
function gmat(c,e){return new THREE.MeshStandardMaterial({color:c,roughness:0.5,metalness:0.35,emissive:e?c:0x000000,emissiveIntensity:e||0});}
function gbox(parent,w,h,d,x,y,z,m){const mm=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mm.position.set(x,y,z);parent.add(mm);return mm;}
const gmDark=gmat(0x1d2733),gmMid=gmat(0x2c3a4d),gmTeal=gmat(0x46ffd7,0.8),gmRed=gmat(0xff4655,0.6);
gbox(gunRifle,0.085,0.13,0.5,0,0,0.05,gmDark);
gbox(gunRifle,0.045,0.05,0.42,0,0.02,-0.32,gmMid);
gbox(gunRifle,0.03,0.06,0.1,0,0.095,0.02,gmDark);
gbox(gunRifle,0.055,0.15,0.09,0,-0.13,0.12,gmMid);
gbox(gunRifle,0.075,0.09,0.2,0,-0.01,0.34,gmDark);
gbox(gunRifle,0.09,0.02,0.16,0,0.065,-0.1,gmTeal);
gbox(gunPistol,0.075,0.11,0.3,0,0,0.08,gmDark);
gbox(gunPistol,0.04,0.045,0.22,0,0.03,-0.16,gmMid);
gbox(gunPistol,0.05,0.13,0.08,0,-0.1,0.14,gmMid);
gbox(gunPistol,0.078,0.02,0.1,0,0.062,0,gmRed);
const muzzleR=new THREE.Object3D();muzzleR.position.set(0,0.02,-0.56);gunRifle.add(muzzleR);
const muzzleP=new THREE.Object3D();muzzleP.position.set(0,0.03,-0.3);gunPistol.add(muzzleP);
const flashCv=document.createElement('canvas');flashCv.width=flashCv.height=64;
{
  const g=flashCv.getContext('2d');
  const grd=g.createRadialGradient(32,32,2,32,32,30);
  grd.addColorStop(0,'rgba(255,240,200,1)');grd.addColorStop(0.4,'rgba(255,190,90,0.9)');grd.addColorStop(1,'rgba(255,120,40,0)');
  g.fillStyle=grd;g.fillRect(0,0,64,64);
}
function mkFlash(parent,mz){
  const f=new THREE.Mesh(new THREE.PlaneGeometry(0.34,0.34),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(flashCv),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
  f.position.copy(mz.position);f.visible=false;parent.add(f);
  const li=new THREE.PointLight(0xffc873,0,7);li.position.copy(mz.position);parent.add(li);
  return{f,li};
}
const flashR=mkFlash(gunRifle,muzzleR),flashP=mkFlash(gunPistol,muzzleP);
let localKick=0,flashT=0,curFlash=flashR,curMuzzle=muzzleR;

// ---------------- efeitos ----------------
const tracers=[],sparks=[];
const sparkGeo=new THREE.BoxGeometry(0.05,0.05,0.05);
function tracer(a,b,color){
  const g=new THREE.BufferGeometry().setFromPoints([a,b]);
  const m=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity:0.9}));
  scene.add(m);tracers.push({m,life:0.07,max:0.07});
}
function sparksAt(p,color,n){
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
  if(flashT<=0){flashR.f.visible=false;flashP.f.visible=false;flashR.li.intensity=0;flashP.li.intensity=0;}
}
function localShotFX(weaponIdx){
  localKick=1;flashT=0.045;
  curFlash=weaponIdx===0?flashR:flashP;
  curMuzzle=weaponIdx===0?muzzleR:muzzleP;
  curFlash.f.rotation.z=rand(0,6.28);curFlash.f.visible=true;curFlash.li.intensity=3;
  if(weaponIdx===0)sfx.shoot();else sfx.shootP();
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
function makeBotMesh(accent){
  accent=accent===undefined?0xff4655:accent;
  const g=new THREE.Group();
  const mLeg=mat(0x26303d),mBody=mat(0x37455a),mHead=mat(0xd8dee6,0.6);
  const mAcc=new THREE.MeshStandardMaterial({color:accent,roughness:0.6,emissive:accent,emissiveIntensity:0.55});
  function box(w,h,d,x,y,z,m){const mm=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mm.position.set(x,y,z);mm.castShadow=true;g.add(mm);return mm;}
  box(0.52,0.72,0.34,0,0.36,0,mLeg);
  box(0.66,0.78,0.4,0,1.13,0,mBody);
  box(0.5,0.3,0.44,0,1.24,0,mAcc);
  box(0.36,0.36,0.36,0,1.72,0,mHead);
  box(0.38,0.12,0.38,0,1.76,0,mAcc);
  box(0.18,0.6,0.22,-0.44,1.1,0,mBody);
  box(0.18,0.6,0.22,0.44,1.1,0,mBody);
  box(0.1,0.12,0.62,0.18,1.28,0.24,mLeg);
  g.userData.mats=[mLeg,mBody,mHead,mAcc];
  return g;
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
    if(srcEnt)srcEnt.kills++;
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
  const w=WEAPONS[p.weapon];
  if(p.reloading||p.dead)return;
  if(p.mags[p.weapon]>=w.mag||p.reserves[p.weapon]<=0)return;
  p.reloading=true;p.reloadT=0;
  if(p.isLocal)sfx.reload();
  netEvent({e:'reload',id:p.id});
}
function hostFireWeapon(p){
  const w=WEAPONS[p.weapon];
  if(p.mags[p.weapon]<=0){startReload(p);return;}
  p.mags[p.weapon]--;
  p.fireCd=w.rate;
  if(p.isLocal)localShotFX(p.weapon);
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
  netEvent({e:'shot',id:p.id,w:p.weapon,ox,oy,oz,hx,hy,hz});
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
  const w=WEAPONS[p.weapon];
  p.fireCd-=dt;
  p.smokeCd=Math.max(0,p.smokeCd-dt);
  p.fireSpread=Math.max(0,p.fireSpread-dt*4);
  if(p.input.weapon!==p.weapon&&!p.dead){
    p.weapon=p.input.weapon;
    p.reloading=false;p.reloadT=0;
  }
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
function startRoundHost(){
  SIM.roundToken++;
  SIM.round++;
  clearSmokes(SIM.smokes);
  if(PVP()){
    // ------- PvP: equipe vermelha (sul) vs azul (norte), sem bots/barreira -------
    SIM.bots.length=0;SIM.enemiesLeft=0;
    const tA=SIM.players.filter(p=>p.team===0);
    const tB=SIM.players.filter(p=>p.team===1);
    tA.forEach((p,i)=>resetEntForRound(p,(i-(tA.length-1)/2)*2.2,33,0));
    tB.forEach((p,i)=>resetEntForRound(p,(i-(tB.length-1)/2)*2.2,-33,Math.PI));
    removeBarrier();
    SIM.state='countdown';SIM.cdT=3.4;SIM.lastCd=-1;SIM.roundT=90;
    annAll('ROUND '+SIM.round,'VERMELHO '+SIM.score[0]+' × '+SIM.score[1]+' AZUL · ELIMINE A EQUIPE',2);
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
function hostStep(dt){
  if(SIM.state==='countdown'){
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
function ensureVisPlayer(id,team){
  let v=VIS.players.get(id);
  if(v&&v.team!==team){scene.remove(v.group);VIS.players.delete(id);v=null;}
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
function setVisTarget(v,x,y,z,yaw,alive,snap){
  if(snap||!v.init){v.x=x;v.y=y;v.z=z;v.yaw=yaw;v.init=true;v.deadT=0;}
  v.tx=x;v.ty=y;v.tz=z;v.tyaw=yaw;v.alive=alive;
}
function tickVisGroup(v,dt){
  const k=1-Math.exp(-18*dt);
  v.x+=(v.tx-v.x)*k;v.y+=(v.ty-v.y)*k;v.z+=(v.tz-v.z)*k;
  let dy=v.tyaw-v.yaw;
  while(dy>Math.PI)dy-=Math.PI*2;
  while(dy<-Math.PI)dy+=Math.PI*2;
  v.yaw+=dy*k;
  let py=v.y;
  if(!v.alive){
    v.deadT+=dt;
    v.group.rotation.x=-Math.min(1,v.deadT/0.32)*Math.PI/2;
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
    setVisTarget(v,p.x,p.y,p.z,p.yaw,!p.dead,false);
    v.group.visible=true;
  }
  for(const[id,v]of VIS.players){
    if(!ids.has(id)){scene.remove(v.group);VIS.players.delete(id);}
  }
  const bids=new Set();
  for(const b of SIM.bots){
    bids.add(b.id);
    const v=ensureVisBot(b.id);
    setVisTarget(v,b.x,b.y,b.z,b.rot,b.alive,false);
    v.group.userData.mats.forEach(m=>{m.emissiveIntensity=(m.emissive.getHex()===0xff4655?0.55:0.12)+b.flash*1.4;});
  }
  for(const[id,v]of VIS.bots){
    if(!bids.has(id)){scene.remove(v.group);VIS.bots.delete(id);}
  }
}
function cleanupVis(){
  for(const[id,v]of VIS.players){scene.remove(v.group);}
  for(const[id,v]of VIS.bots){scene.remove(v.group);}
  VIS.players.clear();VIS.bots.clear();
}

// ---------------- entrada local ----------------
const VIEW={yaw:0,pitch:0};
const INPUT={mx:0,mz:0,walk:false,fire:false,jump:false,reload:false,q:false,weapon:0,ads:false};
const keys=new Set();
function recomputeKeys(){
  let ix=0,iz=0;
  if(keys.has('KeyW'))iz+=1;if(keys.has('KeyS'))iz-=1;
  if(keys.has('KeyD'))ix+=1;if(keys.has('KeyA'))ix-=1;
  INPUT.mx=ix+joyX;INPUT.mz=iz+joyY;
}
window.addEventListener('keydown',e=>{
  if(e.repeat)return;
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
document.addEventListener('touchmove',e=>{if(inGame()&&!G.paused)e.preventDefault();},{passive:false});
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
bindBtn('btnWep',()=>INPUT.weapon=INPUT.weapon===0?1:0);

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
function updateCameraAndWeapon(dt){
  const me=getMe();
  if(!me)return;
  camera.position.set(me.x,me.y+EYE,me.z);
  camera.rotation.y=me.yaw;camera.rotation.x=me.pitch;
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
  // arma atual
  gunRifle.visible=!me.dead&&me.weapon===0;
  gunPistol.visible=!me.dead&&me.weapon===1;
  const gun=me.weapon===0?gunRifle:gunPistol;
  localKick=Math.max(0,localKick-dt*7);
  const spd=clamp(me.speed/SPEED,0,1);
  me.stepAcc=(me.stepAcc||0)+me.speed*dt*(me.grounded?1.6:0);
  const bobA=Math.sin(me.stepAcc*2)*0.012*spd;
  const bobB=Math.cos(me.stepAcc)*0.008*spd;
  const rp=me.reloading?Math.sin(Math.min(1,me.reloadT/WEAPONS[me.weapon].reload)*Math.PI):0;
  const bx=INPUT.ads?0.02:0.26,by=INPUT.ads?-0.17:-0.22;
  gun.position.x+=(bx+bobB-gun.position.x)*Math.min(1,dt*10);
  gun.position.y=by+bobA-rp*0.14;
  gun.position.z=-0.44+localKick*0.07-(INPUT.ads?0.06:0);
  gun.rotation.x=localKick*0.05-rp*0.55;
  const gap=5+spd*7+me.fireSpread*5+(me.grounded?0:8);
  crossEl.style.setProperty('--gap',gap+'px');
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
setInterval(()=>{
  if(!SIM.active||G.paused)return;
  syncLocalInput();
  hostStep(SIM_DT);
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
  const n=$('nameInput').value.trim().toUpperCase();
  return n||('AGENTE-'+randi(10,99));
}
function loop(now){
  requestAnimationFrame(loop);
  let dt=(now-last)/1000;last=now;
  if(dt>0.05)dt=0.05;
  if(G.mode==='menu'){
    const a=now*0.00012;
    camera.position.set(Math.sin(a)*30,17,Math.cos(a)*30);
    camera.lookAt(0,1.5,0);
  }else if(!G.paused){
    if(G.mode==='solo'||G.mode==='host'){
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
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);

// ---------------- menu / configurações ----------------
$('colCtrl').innerHTML=isTouch
  ?'<div class="h">CONTROLES · TOQUE</div><b>Lado esquerdo</b>: joystick de movimento<br><b>Lado direito</b>: arraste para mirar<br><b>ATIRAR</b>: fogo automático · <b>TROCAR</b>: troca de arma<br><b>▲</b> pular · <b>RECAR.</b> recarregar · <b>Q</b> fumaça'
  :'<div class="h">CONTROLES · PC</div><b>WASD</b> mover · <b>SHIFT</b> andar (mais preciso)<br><b>Mouse</b> mirar · <b>Clique esq.</b> atirar · <b>Clique dir.</b> zoom<br><b>ESPAÇO</b> pular · <b>R</b> recarregar · <b>Q</b> fumaça · <b>1/2</b> trocar arma';
$('btnSolo').addEventListener('click',startSolo);
$('btnSettings').addEventListener('click',()=>{menuEl.classList.add('hidden');$('settings').classList.remove('hidden');});
$('btnSetBack').addEventListener('click',()=>{$('settings').classList.add('hidden');menuEl.classList.remove('hidden');});
function setUI(){
  $('setSens').value=SET.sens;$('setSensV').textContent=SET.sens.toFixed(2);
  $('setFov').value=SET.fov;$('setFovV').textContent=SET.fov;
  $('setVol').value=SET.vol;$('setVolV').textContent=Math.round(SET.vol*100)+'%';
  $('setQual').value=SET.qual;
  $('setInvert').checked=SET.invert;
}
$('setSens').addEventListener('input',e=>{SET.sens=parseFloat(e.target.value);$('setSensV').textContent=SET.sens.toFixed(2);saveSet();});
$('setFov').addEventListener('input',e=>{SET.fov=parseInt(e.target.value,10);$('setFovV').textContent=SET.fov;saveSet();});
$('setVol').addEventListener('input',e=>{SET.vol=parseFloat(e.target.value);$('setVolV').textContent=Math.round(SET.vol*100)+'%';if(master)master.gain.value=SET.vol;saveSet();});
$('setQual').addEventListener('change',e=>{SET.qual=e.target.value;applyQuality();saveSet();});
$('setInvert').addEventListener('change',e=>{SET.invert=e.target.checked;saveSet();});
$('btnSetReset').addEventListener('click',()=>{SET=Object.assign({},SET_DEF);if(master)master.gain.value=SET.vol;applyQuality();saveSet();setUI();});
setUI();
try{
  const savedName=localStorage.getItem('proto_name');
  if(savedName)$('nameInput').value=savedName;
}catch(e){}
$('nameInput').addEventListener('change',()=>{try{localStorage.setItem('proto_name',$('nameInput').value.trim().toUpperCase());}catch(e){}});

function backToMenu(){
  G.mode='menu';G.paused=false;
  SIM.active=false;SIM.players.length=0;
  clearBots();clearSmokes(SIM.smokes);removeBarrier();cleanupVis();
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
