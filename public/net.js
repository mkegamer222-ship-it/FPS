'use strict';
/* ============================================================
   PROTOCOLO // multiplayer P2P (WebRTC via PeerJS)
   Modelo: o anfitrião É o servidor da sala (host-authoritative).
   Clientes mandam inputs; o host simula tudo e transmite
   snapshots 20x/s + eventos.
   ============================================================ */

const NET={
  isHost:false,started:false,everStarted:false,
  myId:null,myName:'',roomCode:'',
  peer:null,conns:[],hostConn:null,lobby:[],seq:1,
  evQueue:[],snaps:[],lastSnap:null,st:'c',lastCd:-1,lastRnd:0,snapNow:false,visSnap:false,
  PE:null,sendAcc:0,interpBots:[],interpPlayers:[],
  leftIntentionally:false,

  // ---------- gancho chamado pelo game.js ----------
  pushEvent(ev){if(this.isHost&&this.started)this.evQueue.push(ev);},
  afterSim(){if(this.isHost&&this.started)this.broadcast();},

  // ---------- utilidades de UI ----------
  msg(t,ok){
    const el=$('menuMsg');
    el.textContent=t||'';
    el.style.color=ok?'var(--teal)':'var(--red)';
  },
  lobbyMsg(t){$('lobbyMsg').textContent=t;},
  showLobby(code,isHost){
    menuEl.classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('lobbyCode').textContent=code;
    $('btnStart').classList.toggle('hidden',!isHost);
    this.renderLobby();
  },
  renderLobby(){
    const box=$('lobbyList');
    box.innerHTML='';
    this.lobby.forEach((p,i)=>{
      const d=document.createElement('div');
      d.className='lobbyP';
      let tags='';
      if(i===0)tags+='<span class="host">ANFITRIÃO</span>';
      if(p.id===this.myId)tags+='<span class="you">VOCÊ</span>';
      d.innerHTML='<span>'+p.name+'</span>'+tags;
      box.appendChild(d);
    });
  },

  // ---------- criação de sala (HOST) ----------
  createRoom(){
    if(typeof Peer==='undefined'){this.msg('Multiplayer indisponível neste ambiente (sem acesso à rede). Use a versão publicada.',false);return;}
    initAudio();
    this.cleanup();
    this.myName=localName();
    this.roomCode=NET.randomCode();
    this.leftIntentionally=false;
    this.lobbyMsg('CRIANDO SALA...');
    this.showLobby(this.roomCode,true);
    this.lobby=[{id:'p0',name:this.myName}];
    this.myId='p0';
    this.renderLobby();
    this.openPeer('protocolo-fps-'+this.roomCode.toLowerCase(),true);
  },
  randomCode(){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c='';for(let i=0;i<5;i++)c+=chars[Math.floor(Math.random()*chars.length)];
    return c;
  },
  openPeer(id,isHost){
    const opt={config:{iceServers:[
      {urls:'stun:stun.l.google.com:19302'},
      {urls:'stun:stun1.l.google.com:19302'}
    ]}};
    this.peer=id?new Peer(id,opt):new Peer(opt);
    this.peer.on('open',()=>{
      if(isHost)this.lobbyMsg('SALA PRONTA · AGUARDANDO JOGADORES');
    });
    this.peer.on('disconnected',()=>{try{this.peer.reconnect();}catch(e){}});
    this.peer.on('error',err=>{
      const t=err&&err.type;
      if(t==='peer-unavailable'){
        this.msg('Sala não encontrada. Confira o código.',false);
        this.abortJoin();
      }else if(t==='unavailable-id'&&isHost){
        // colisão de código: gera outro
        this.roomCode=NET.randomCode();
        $('lobbyCode').textContent=this.roomCode;
        try{this.peer.destroy();}catch(e){}
        this.openPeer('protocolo-fps-'+this.roomCode.toLowerCase(),true);
      }else if(t==='network'||t==='server-error'){
        if(!this.started){this.msg('Falha de rede com o servidor de sinalização.',false);this.lobbyMsg('ERRO DE CONEXÃO');}
      }
    });
    if(isHost){
      this.peer.on('connection',conn=>this.onIncoming(conn));
    }
  },

  // ---------- host: chegada de cliente ----------
  onIncoming(conn){
    conn.on('open',()=>{
      const name=(conn.metadata&&conn.metadata.name)||'AGENTE';
      if(this.started||this.lobby.length>=5){
        conn.send({t:'full'});
        setTimeout(()=>conn.close(),300);
        return;
      }
      const pid='p'+(this.seq++);
      this.conns.push({conn,pid,name});
      this.lobby.push({id:pid,name});
      conn.send({t:'welcome',id:pid,lobby:this.lobby});
      this.broadcastLobby();
      this.lobbyMsg(this.lobby.length+' AGENTE(S) NA SALA');
      sfx.join();
    });
    conn.on('data',d=>{
      if(!d||typeof d!=='object')return;
      if(d.t==='i'&&this.started){
        const c=this.conns.find(c=>c.conn===conn);
        if(c)this.applyInput(c.pid,d);
      }
    });
    conn.on('close',()=>{
      const c=this.conns.find(c=>c.conn===conn);
      this.conns=this.conns.filter(c=>c.conn!==conn);
      if(!c)return;
      this.lobby=this.lobby.filter(p=>p.id!==c.pid);
      if(this.started){
        const p=SIM.players.find(q=>q.id===c.pid);
        if(p){
          SIM.players=SIM.players.filter(q=>q.id!==c.pid);
          netEvent({e:'jl',n:c.name});
          let allDead=true;
          for(const q of SIM.players)if(!q.dead){allDead=false;break;}
          if(SIM.players.length&&allDead&&SIM.state==='playing')roundLose();
        }
      }else{
        this.broadcastLobby();
        this.lobbyMsg(this.lobby.length+' AGENTE(S) NA SALA');
      }
    });
    conn.on('error',()=>{});
  },
  broadcastLobby(){
    for(const c of this.conns)c.conn.send({t:'lobby',lobby:this.lobby});
    this.renderLobby();
  },
  applyInput(pid,d){
    const p=SIM.players.find(q=>q.id===pid);
    if(!p)return;
    const i=p.input;
    i.mx=d.mx||0;i.mz=d.mz||0;
    i.yaw=d.y||0;i.pitch=d.p||0;
    i.walk=!!d.wk;i.fire=!!d.f;i.ads=!!d.a;
    i.weapon=d.w?1:0;
    if(d.j)i.jump=true;
    if(d.r)i.reload=true;
    if(d.q)i.q=true;
  },

  // ---------- host: iniciar partida ----------
  startGame(){
    if(this.started)return;
    this.started=true;this.everStarted=true;
    for(const c of this.conns)c.conn.send({t:'start'});
    cleanupVis();
    SIM.players.length=0;
    this.lobby.forEach(l=>{
      const e=makeEnt(l.id,l.name);
      if(l.id==='p0')e.isLocal=true;
      SIM.players.push(e);
    });
    SIM.active=true;SIM.round=0;
    G.mode='host';G.paused=false;
    modeTag.textContent='SALA '+this.roomCode;
    $('lobby').classList.add('hidden');
    hudEl.classList.remove('hidden');
    lockPointer();
    startRoundHost();
  },

  // ---------- host: snapshot ----------
  broadcast(){
    if(!this.conns.length){this.evQueue.length=0;return;}
    const pr=n=>+n.toFixed(2);
    const rows=SIM.players.map(p=>[p.id,pr(p.x),pr(p.y),pr(p.z),pr(p.yaw),pr(p.pitch),
      Math.round(p.hp),p.mags[p.weapon],p.reloading?1:0,p.dead?1:0,p.weapon,
      p.input.ads?1:0,p.kills,p.smokeCharges,p.reserves[p.weapon]]);
    const brows=SIM.bots.map(b=>[b.id,pr(b.x),pr(b.z),pr(b.y),pr(b.rot),b.alive?1:0]);
    const msg={t:'s',st:SIM.state==='playing'?'p':(SIM.state==='countdown'?'c':'e'),
      cd:+SIM.cdT.toFixed(1),rnd:SIM.round,el:SIM.enemiesLeft,
      p:rows,b:brows,ev:this.evQueue};
    this.evQueue=[];
    for(const c of this.conns){
      try{c.conn.send(msg);}catch(e){}
    }
  },

  // ---------- cliente: entrar em sala ----------
  joinRoom(code){
    if(typeof Peer==='undefined'){this.msg('Multiplayer indisponível neste ambiente (sem acesso à rede). Use a versão publicada.',false);return;}
    code=(code||'').trim().toUpperCase();
    if(code.length<4){this.msg('Digite o código de 5 letras da sala.',false);return;}
    initAudio();
    this.cleanup();
    this.myName=localName();
    this.roomCode=code;
    this.leftIntentionally=false;
    this.msg('Conectando à sala '+code+'...',true);
    this.openPeer(null,false);
    const self=this;
    this.peer.on('open',()=>{
      self.hostConn=self.peer.connect('protocolo-fps-'+code.toLowerCase(),
        {reliable:true,metadata:{name:self.myName}});
      self.hostConn.on('open',()=>{self.msg('Conectado! Entrando no lobby...',true);});
      self.hostConn.on('data',d=>self.hostMsg(d));
      self.hostConn.on('close',()=>{
        if(self.leftIntentionally)return;
        if(self.everStarted){
          self.netLost('A conexão com o anfitrião caiu.');
        }else{
          self.cleanup();
          $('lobby').classList.add('hidden');
          self.msg('A sala foi fechada ou a conexão falhou.',false);
          backToMenu();
        }
      });
      self.hostConn.on('error',()=>{});
      setTimeout(()=>{
        if(!self.started&&self.myId===null){
          self.msg('Não houve resposta da sala. Tente novamente.',false);
          self.abortJoin();
        }
      },9000);
    });
  },
  abortJoin(){
    this.cleanup();
  },
  hostMsg(d){
    if(!d||typeof d!=='object')return;
    switch(d.t){
      case 'welcome':
        this.myId=d.id;this.lobby=d.lobby;
        this.everStarted=false;
        menuEl.classList.add('hidden');
        this.showLobby(this.roomCode,false);
        this.lobbyMsg('AGUARDANDO O ANFITRIÃO INICIAR...');
        this.msg('');
        sfx.join();
        break;
      case 'lobby':
        this.lobby=d.lobby;this.renderLobby();
        break;
      case 'full':
        this.msg('A sala está cheia (máx. 5 jogadores).',false);
        this.cleanup();
        break;
      case 'start':
        this.startClientGame();
        break;
      case 's':
        this.onSnapshot(d);
        break;
    }
  },
  startClientGame(){
    this.started=true;this.everStarted=true;
    cleanupVis();
    SIM.active=false;SIM.players.length=0;
    clearSmokes(SIM.smokes);
    this.PE=makeEnt(this.myId,this.myName);
    this.PE.isLocal=true;
    this.st='c';this.lastRnd=0;this.snaps.length=0;this.snapNow=true;this.visSnap=true;
    VIEW.yaw=0;VIEW.pitch=0;
    G.mode='client';G.paused=false;
    modeTag.textContent='SALA '+this.roomCode;
    $('lobby').classList.add('hidden');
    hudEl.classList.remove('hidden');
    lockPointer();
  },

  // ---------- cliente: snapshot recebido ----------
  onSnapshot(d){
    this.snaps.push({t:performance.now(),d});
    if(this.snaps.length>12)this.snaps.shift();
    this.lastSnap=d;
    if(d.rnd!==this.lastRnd){this.lastRnd=d.rnd;this.snapNow=true;this.visSnap=true;this.snaps.length=1;}
    if(d.st==='c'){
      const c=Math.ceil(d.cd);
      if(c!==this.lastCd&&c>0){this.lastCd=c;sfx.tick();announce(String(c),'',0.8);}
    }else this.lastCd=-1;
    this.st=d.st;
    for(const ev of d.ev)this.handleEvent(ev);
    const me=d.p.find(r=>r[0]===this.myId);
    if(me&&this.PE)this.correctSelf(me);
    HUDSRC.round=d.rnd;HUDSRC.enemies=d.el;
  },
  correctSelf(row){
    const PE=this.PE;
    const ax=row[1],ay=row[2],az=row[3];
    const err=Math.hypot(ax-PE.x,az-PE.z)+Math.abs(ay-PE.y);
    if(err>3||this.snapNow){PE.x=ax;PE.y=ay;PE.z=az;PE.vy=0;}
    else{PE.x+=(ax-PE.x)*0.4;PE.y+=(ay-PE.y)*0.4;PE.z+=(az-PE.z)*0.4;}
    PE.hp=row[6];
    if(row[10]!==PE.weapon){PE.weapon=row[10];}
    PE.mags[PE.weapon]=row[7];
    PE.reserves[PE.weapon]=row[14];
    PE.reloading=row[8]===1;
    const wasDead=PE.dead;
    PE.dead=row[9]===1;
    if(PE.dead&&!wasDead)PE.deathT=0;
    PE.kills=row[12];
    PE.smokeCharges=row[13];
    HUDSRC.kills=row[12];
    this.snapNow=false;
  },
  handleEvent(ev){
    const V3=(a)=>new THREE.Vector3(a[0],a[1],a[2]);
    switch(ev.e){
      case 'shot':
        if(ev.bot){
          tracer(new THREE.Vector3(ev.ox,ev.oy,ev.oz),new THREE.Vector3(ev.hx,ev.hy,ev.hz),0xff6b76);
          sfxIfNear(ev.ox,ev.oz,sfx.botShoot);
        }else if(ev.id!==this.myId){
          tracer(new THREE.Vector3(ev.ox,ev.oy,ev.oz),new THREE.Vector3(ev.hx,ev.hy,ev.hz),0xffd28c);
          sfxIfNear(ev.ox,ev.oz,ev.w===1?sfx.shootP:sfx.shoot);
        }
        break;
      case 'hit':
        if(ev.by===this.myId){
          hitmarker(!!ev.kill,!!ev.head);
          if(ev.head)sfx.headshot();else sfx.hit();
        }
        sparksAt(V3(ev.at),0xff6b76,5);
        break;
      case 'wall':
        if(ev.id!==this.myId)sparksAt(V3(ev.at),0xb9c4cf,4);
        break;
      case 'dmg':
        if(ev.id===this.myId){dmgFlash();sfx.hurt();}
        break;
      case 'feed':
        feed(ev.k,ev.v,!!ev.h);
        break;
      case 'ann':
        announce(ev.txt,ev.sub,1.8);
        break;
      case 'smoke':
        if(ev.id!==this.myId){
          spawnSmokeProj(ev.x,ev.y,ev.z,ev.vx,ev.vy,ev.vz);
          sfxIfNear(ev.x,ev.z,sfx.smoke);
        }
        break;
      case 'jn':announce(ev.n+' ENTROU NA SALA','',1.2);break;
      case 'jl':announce(ev.n+' SAIOU DA SALA','',1.2);break;
    }
  },

  // ---------- cliente: quadro de predição ----------
  frame(dt){
    const PE=this.PE;
    if(!PE)return;
    if(PE.dead)PE.deathT+=dt;
    const i=PE.input;
    i.mx=INPUT.mx;i.mz=INPUT.mz;
    i.yaw=VIEW.yaw;i.pitch=VIEW.pitch;
    i.walk=INPUT.walk;i.ads=INPUT.ads;i.fire=INPUT.fire;
    i.weapon=INPUT.weapon;
    // enviar input a 20 Hz
    this.sendAcc+=dt;
    if(this.sendAcc>=0.05&&this.hostConn&&this.hostConn.open){
      this.sendAcc=0;
      try{
        this.hostConn.send({t:'i',
          mx:+clamp(INPUT.mx,-1,1).toFixed(2),mz:+clamp(INPUT.mz,-1,1).toFixed(2),
          y:+VIEW.yaw.toFixed(3),p:+VIEW.pitch.toFixed(3),
          wk:INPUT.walk?1:0,f:INPUT.fire?1:0,a:INPUT.ads?1:0,w:INPUT.weapon,
          j:INPUT.jump?1:0,r:INPUT.reload?1:0,q:INPUT.q?1:0});
      }catch(e){}
    }
    // consumir bordas para predição local
    i.jump=i.jump||INPUT.jump;INPUT.jump=false;
    if(INPUT.reload){i.reload=true;INPUT.reload=false;}
    if(INPUT.q){i.q=true;INPUT.q=false;}
    PE.yaw=VIEW.yaw;PE.pitch=VIEW.pitch;
    if(!PE.dead)integrate(PE,dt);
    this.stepLocalWeapons(PE,dt);
    this.renderNet();
  },
  startReloadLocal(PE){
    const w=WEAPONS[PE.weapon];
    if(PE.reloading||PE.dead)return;
    if(PE.mags[PE.weapon]>=w.mag||PE.reserves[PE.weapon]<=0)return;
    PE.reloading=true;PE.reloadT=0;
    sfx.reload();
  },
  stepLocalWeapons(PE,dt){
    PE.fireCd-=dt;
    PE.fireSpread=Math.max(0,PE.fireSpread-dt*4);
    PE.smokeCd=Math.max(0,PE.smokeCd-dt);
    if(PE.input.weapon!==PE.weapon&&!PE.dead){
      PE.weapon=PE.input.weapon;PE.reloading=false;PE.reloadT=0;
    }
    if(PE.input.reload){PE.input.reload=false;this.startReloadLocal(PE);}
    if(PE.reloading){
      PE.reloadT+=dt;
      const w=WEAPONS[PE.weapon];
      if(PE.reloadT>=w.reload){
        const need=w.mag-PE.mags[PE.weapon];
        const take=Math.min(need,PE.reserves[PE.weapon]);
        PE.mags[PE.weapon]+=take;PE.reserves[PE.weapon]-=take;
        PE.reloading=false;sfx.reloadDone();
      }
    }
    if(PE.input.q){
      PE.input.q=false;
      if(!PE.dead&&PE.smokeCharges>0&&PE.smokeCd<=0&&this.st==='p'){
        PE.smokeCharges--;PE.smokeCd=1.3;
        const cp=Math.cos(PE.pitch);
        const dx=-Math.sin(PE.yaw)*cp,dy=Math.sin(PE.pitch),dz=-Math.cos(PE.yaw)*cp;
        spawnSmokeProj(PE.x+dx*0.7,PE.y+EYE+dy*0.7,PE.z+dz*0.7,dx*15,dy*15+3.4,dz*15);
        sfx.smoke();
      }
    }
    if(PE.input.fire&&!PE.reloading&&!PE.dead&&this.st==='p'&&PE.fireCd<=0){
      this.clientFire(PE);
    }
  },
  clientFire(PE){
    const w=WEAPONS[PE.weapon];
    if(PE.mags[PE.weapon]<=0){this.startReloadLocal(PE);return;}
    PE.mags[PE.weapon]--;
    PE.fireCd=w.rate;
    PE.fireSpread=Math.min(PE.fireSpread+w.kick,3);
    localShotFX(PE.weapon);
    // rastro apenas visual (o dano é decidido pelo host)
    const cp=Math.cos(PE.pitch);
    let dx=-Math.sin(PE.yaw)*cp,dy=Math.sin(PE.pitch),dz=-Math.cos(PE.yaw)*cp;
    const mv=PE.speed/SPEED;
    const sp=(0.0016+PE.fireSpread*0.004+mv*0.004)*(INPUT.walk?0.4:1)*(INPUT.ads?0.55:1);
    const s1=rand(-sp,sp),s2=rand(-sp,sp);
    const rx=Math.cos(PE.yaw),rz=-Math.sin(PE.yaw);
    dx+=rx*s1;dz+=rz*s1;dy+=s2;
    const dl=Math.hypot(dx,dy,dz);dx/=dl;dy/=dl;dz/=dl;
    const ox=PE.x,oy=PE.y+EYE,oz=PE.z;
    let bestT=90;
    for(let i2=0;i2<solids.length;i2++){
      const t=rayBox(ox,oy,oz,dx,dy,dz,solids[i2]);
      if(t>0&&t<bestT)bestT=t;
    }
    for(const b of this.interpBots){
      if(!b.alive)continue;
      const bb={minX:b.x-0.45,maxX:b.x+0.45,minY:0.1,maxY:1.94,minZ:b.z-0.32,maxZ:b.z+0.32};
      const t=rayBox(ox,oy,oz,dx,dy,dz,bb);
      if(t>0&&t<bestT)bestT=t;
    }
    const hp=new THREE.Vector3(ox+dx*bestT,oy+dy*bestT,oz+dz*bestT);
    const mw=curMuzzle.getWorldPosition(new THREE.Vector3());
    tracer(mw,hp,0xffd28c);
    if(bestT<90)sparksAt(hp,0xb9c4cf,3);
  },

  // ---------- cliente: interpolação dos remotos ----------
  renderNet(){
    if(!this.snaps.length)return;
    const now=performance.now();
    const rt=now-120;
    let a=this.snaps[0],b=this.snaps[this.snaps.length-1];
    for(let i=0;i<this.snaps.length-1;i++){
      if(this.snaps[i].t<=rt&&this.snaps[i+1].t>=rt){a=this.snaps[i];b=this.snaps[i+1];break;}
    }
    if(b.t<=rt)b=this.snaps[this.snaps.length-1];
    if(a.t>rt)a=this.snaps[0];
    const span=b.t-a.t;
    const f=span>1?clamp((rt-a.t)/span,0,1):1;
    const lerp=(x,y)=>x+(y-x)*f;
    const lerpA=(x,y)=>{let d=y-x;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return x+d*f;};
    const seen=new Set();
    this.interpPlayers=[];
    for(const row of b.d.p){
      const id=row[0];seen.add(id);
      if(id===this.myId)continue;
      const ra=a.d.p.find(r=>r[0]===id)||row;
      const x=lerp(ra[1],row[1]),y=lerp(ra[2],row[2]),z=lerp(ra[3],row[3]),yw=lerpA(ra[4],row[4]);
      const v=ensureVisPlayer(id);
      setVisTarget(v,x,y,z,yw,row[9]===0,this.visSnap);
      this.interpPlayers.push({x,z});
    }
    for(const[id,v]of VIS.players){
      if(!seen.has(id)){scene.remove(v.group);VIS.players.delete(id);}
    }
    const bseen=new Set();
    this.interpBots=[];
    for(const row of b.d.b){
      const id='b'+row[0];bseen.add(id);
      const ra=a.d.b.find(r=>'b'+r[0]===id)||row;
      const x=lerp(ra[1],row[1]),z=lerp(ra[2],row[2]),y=lerp(ra[3],row[3]),rot=lerpA(ra[4],row[4]);
      const v=ensureVisBot(id);
      setVisTarget(v,x,y,z,rot,row[5]===1,this.visSnap);
      this.interpBots.push({x,z,alive:row[5]===1});
    }
    for(const[id,v]of VIS.bots){
      if(!bseen.has(id)){scene.remove(v.group);VIS.bots.delete(id);}
    }
    this.visSnap=false;
  },
  radarBots(){return this.interpBots;},
  radarPlayers(){return this.interpPlayers;},

  // ---------- sair / queda de conexão ----------
  netLost(msgTxt){
    this.cleanup();
    $('netlostMsg').textContent=msgTxt;
    hudEl.classList.add('hidden');
    pauseEl.classList.add('hidden');
    $('netlost').classList.remove('hidden');
  },
  leave(){
    this.leftIntentionally=true;
    this.cleanup();
    backToMenu();
  },
  cleanup(){
    try{for(const c of this.conns)c.conn.close();}catch(e){}
    try{if(this.hostConn)this.hostConn.close();}catch(e){}
    try{if(this.peer)this.peer.destroy();}catch(e){}
    this.conns=[];this.hostConn=null;this.peer=null;
    this.started=false;this.everStarted=false;
    this.isHost=false;this.myId=null;this.lobby=[];this.seq=1;
    this.evQueue=[];this.snaps=[];this.lastSnap=null;this.PE=null;
    SIM.active=false;
  }
};

// marca se é host ao criar
const _origCreate=NET.createRoom.bind(NET);
NET.createRoom=function(){_origCreate();NET.isHost=true;};

// ---------- ligações do menu ----------
$('btnCreate').addEventListener('click',()=>{
  try{localStorage.setItem('proto_name',$('nameInput').value.trim().toUpperCase());}catch(e){}
  NET.createRoom();
});
$('btnJoin').addEventListener('click',()=>{
  try{localStorage.setItem('proto_name',$('nameInput').value.trim().toUpperCase());}catch(e){}
  NET.joinRoom($('roomCodeInput').value);
});
$('btnStart').addEventListener('click',()=>NET.startGame());
$('btnLeaveLobby').addEventListener('click',()=>{
  NET.leftIntentionally=true;
  NET.cleanup();
  backToMenu();
});
$('btnNetLostOk').addEventListener('click',()=>{
  $('netlost').classList.add('hidden');
  backToMenu();
});
$('roomCodeInput').addEventListener('keydown',e=>{
  if(e.key==='Enter')NET.joinRoom($('roomCodeInput').value);
});
$('roomCodeInput').addEventListener('input',e=>{
  e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
});
