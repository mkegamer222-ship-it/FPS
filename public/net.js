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
  myTeam:0,rtt:0,resyncAcc:0,hbInt:null,joinAttempts:0,
  PE:null,sendAcc:0,interpBots:[],interpPlayers:[],
  leftIntentionally:false,

  // ---------- gancho chamado pelo game.js ----------
  pushEvent(ev){if(this.isHost&&this.started)this.evQueue.push(ev);},
  afterSim(){if(this.isHost&&this.started)this.broadcast();},
  requestBuy(id){
    if(!this.started||this.st!=='b'||!this.hostConn||!this.hostConn.open){
      shopNotice('Loja indisponível.',false);return;
    }
    try{this.hostConn.send({t:'buy',w:id});}catch(e){shopNotice('Falha ao enviar compra.',false);}
  },

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
    if(this.lobby.length>=2&&!this.started){
      this.lobbyMsg('PvP · EQUIPES ALTERNADAS: '+this.lobby.map((p,i)=>(i%2===0?'V':'A')).join(' · '));
    }
    this.lobby.forEach((p,i)=>{
      const d=document.createElement('div');
      d.className='lobbyP';
      const label=document.createElement('span');label.textContent=String(p.name);d.appendChild(label);
      const tags=document.createElement('span');
      if(i===0){const host=document.createElement('span');host.className='host';host.textContent='ANFITRIÃO';tags.appendChild(host);}
      if(p.id===this.myId){const you=document.createElement('span');you.className='you';you.textContent='VOCÊ';tags.appendChild(you);}
      d.appendChild(tags);box.appendChild(d);
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
      {urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302','stun:stun.cloudflare.com:3478']},
      {urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
      {urls:'turn:openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'}
    ]}};
    this.peer=id?new Peer(id,opt):new Peer(opt);
    this.peer.on('open',()=>{
      if(isHost)this.lobbyMsg('SALA PRONTA · AGUARDANDO JOGADORES');
    });
    this.peer.on('disconnected',()=>{try{this.peer.reconnect();}catch(e){}});
    this.peer.on('error',err=>{
      const t=err&&err.type;
      if(t==='peer-unavailable'){
        if(!isHost){
          // a sala pode ainda estar registrando no sinalizador: tenta de novo
          this.joinAttempts=(this.joinAttempts||0)+1;
          if(this.joinAttempts<=6){
            this.msg('Procurando a sala... ('+this.joinAttempts+'/6)',true);
            setTimeout(()=>{
              if(!this.started&&this.myId===null&&!this.leftIntentionally&&this.peer&&!this.peer.destroyed){
                this.tryConnect(this.roomCode);
              }
            },1200);
            return;
          }
        }
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
      const name=(String((conn.metadata&&conn.metadata.name)||'AGENTE').trim().toUpperCase()
        .replace(/[^A-Z0-9À-ÖØ-öø-ÿ _-]/g,'').slice(0,18))||'AGENTE';
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
      if(d.t==='ping'){
        try{conn.send({t:'pong',ts:d.ts});}catch(e){}
        return;
      }
      if(d.t==='resync'&&this.started){this.broadcast();return;}
      if(d.t==='i'&&this.started){
        const c=this.conns.find(c=>c.conn===conn);
        if(c){c.lastT=performance.now();this.applyInput(c.pid,d);}
      }
      if(d.t==='buy'&&this.started){
        const c=this.conns.find(c=>c.conn===conn);
        const p=c&&SIM.players.find(q=>q.id===c.pid);
        const result=tryBuy(p,d.w); // o host valida fase, ID da arma e saldo
        try{conn.send({t:'buyAck',ok:result.ok,msg:result.msg});}catch(e){}
      }
    });
    const onClose=()=>{
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
    };
    conn.on('close',onClose);
    conn.on('error',onClose);
  },
  broadcastLobby(){
    for(const c of this.conns)c.conn.send({t:'lobby',lobby:this.lobby});
    this.renderLobby();
  },
  applyInput(pid,d){
    const p=SIM.players.find(q=>q.id===pid);
    if(!p)return;
    const i=p.input;
    i.mx=Number.isFinite(d.mx)?clamp(d.mx,-1,1):0;
    i.mz=Number.isFinite(d.mz)?clamp(d.mz,-1,1):0;
    i.yaw=Number.isFinite(d.y)?d.y:0;
    i.pitch=Number.isFinite(d.p)?clamp(d.p,-1.45,1.45):0;
    i.walk=!!d.wk;i.fire=!!d.f;i.ads=!!d.a;
    i.weapon=d.w===1?1:0;
    if(d.j)i.jump=true;
    if(d.r)i.reload=true;
    if(d.q)i.q=true;
  },

  // ---------- host: iniciar partida ----------
  startGame(){
    if(this.started)return;
    this.started=true;this.everStarted=true;
    requestGameFS();
    // equipes alternadas: 0 = vermelha (host), 1 = azul
    const teams=this.lobby.map((l,i)=>[l.id,i%2]);
    for(const c of this.conns)c.conn.send({t:'start',teams});
    cleanupVis();
    SIM.players.length=0;
    this.lobby.forEach((l,i)=>{
      const e=makeEnt(l.id,l.name);
      e.team=i%2;
      if(l.id==='p0')e.isLocal=true;
      SIM.players.push(e);
    });
    this.myTeam=0;
    SIM.active=true;SIM.round=0;SIM.score=[0,0];
    G.mode='host';G.paused=false;
    $('timeTag').classList.remove('hidden');
    $('pingTag').classList.remove('hidden');
    $('creditTag').classList.remove('hidden');
    $('lobby').classList.add('hidden');
    hudEl.classList.remove('hidden');
    lockPointer();
    startRoundHost();
  },

  // ---------- host: snapshot ----------
  broadcast(){
    if(!this.conns.length){this.evQueue.length=0;return;}
    // zera input de cliente sumido (aba fechada/dormindo) para não virar "fantasma"
    const now=performance.now();
    for(const c of this.conns){
      if(c.lastT&&now-c.lastT>3000){
        const p=SIM.players.find(q=>q.id===c.pid);
        if(p){
          p.input.mx=0;p.input.mz=0;p.input.fire=false;p.input.walk=false;p.input.ads=false;
        }
      }
    }
    const pr=n=>+n.toFixed(2);
    const rows=SIM.players.map(p=>[p.id,pr(p.x),pr(p.y),pr(p.z),pr(p.yaw),pr(p.pitch),
      Math.round(p.hp),p.mags[p.weapon],p.reloading?1:0,p.dead?1:0,p.weapon,
      p.input.ads?1:0,p.kills,p.smokeCharges,p.reserves[p.weapon],p.team,
      p.credits,p.loadout[0],p.loadout[1],p.mags[0],p.mags[1],p.reserves[0],p.reserves[1]]);
    const brows=SIM.bots.map(b=>[b.id,pr(b.x),pr(b.z),pr(b.y),pr(b.rot),b.alive?1:0]);
    const msg={t:'s',st:SIM.state==='playing'?'p':(SIM.state==='buy'?'b':(SIM.state==='countdown'?'c':'e')),
      cd:+SIM.cdT.toFixed(1),rnd:SIM.round,el:SIM.enemiesLeft,
      al:[aliveCount(0),aliveCount(1)],sc:SIM.score,rt:Math.ceil(SIM.roundT),
      p:rows,b:brows,ev:this.evQueue};
    let any=false;
    for(const c of this.conns){
      const dc=c.conn.dataChannel;
      if(dc&&dc.bufferedAmount>150000)continue; // canal congestionado: descarta p/ não criar espiral de latência
      try{c.conn.send(msg);any=true;}catch(e){}
    }
    if(any)this.evQueue=[];
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
    this.joinAttempts=0;
    this.msg('Conectando à sala '+code+'...',true);
    this.openPeer(null,false);
    const self=this;
    // keepalive: mantém o binding do NAT vivo e mede RTT desde o lobby
    this.hbInt=setInterval(()=>{
      try{
        if(self.hostConn&&self.hostConn.open)self.hostConn.send({t:'ping',ts:performance.now()});
      }catch(e){}
    },1000);
    this.peer.on('open',()=>{
      self.tryConnect(code);
      setTimeout(()=>{
        if(!self.started&&self.myId===null){
          self.msg('Não houve resposta da sala. Tente novamente.',false);
          self.abortJoin();
        }
      },12000);
    });
  },
  // tenta (re)conectar ao host — o registro da sala no sinalizador pode demorar
  tryConnect(code){
    const self=this;
    this.hostConn=this.peer.connect('protocolo-fps-'+code.toLowerCase(),
      {reliable:true,serialization:'json',metadata:{name:this.myName}});
    this.hostConn.on('open',()=>{self.msg('Conectado! Entrando no lobby...',true);});
    this.hostConn.on('data',d=>self.hostMsg(d));
    this.hostConn.on('close',()=>{
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
    this.hostConn.on('error',()=>{
      if(!self.leftIntentionally)self.netLost('Erro na conexão P2P com o anfitrião.');
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
        this.startClientGame(d.teams||[]);
        break;
      case 'buyAck':
        shopNotice(d.msg||'Compra processada.',!!d.ok);
        if(d.ok)sfx.buy();else sfx.deny();
        break;
      case 'pong':
        this.rtt=performance.now()-(d.ts||0);
        $('pingN').textContent=Math.round(this.rtt)+'ms';
        break;
      case 's':
        this.onSnapshot(d);
        break;
    }
  },
  startClientGame(teams){
    this.started=true;this.everStarted=true;
    cleanupVis();
    SIM.active=false;SIM.players.length=0;
    clearSmokes(SIM.smokes);
    const t=(teams||[]).find(r=>r[0]===this.myId);
    this.myTeam=t?t[1]:1;
    this.PE=makeEnt(this.myId,this.myName);
    this.PE.isLocal=true;
    this.PE.team=this.myTeam;
    this.PE.loadout=[-1,1];this.PE.weapon=1;this.PE.credits=START_CREDITS;
    this.PE.mags=[0,WEAPONS[1].mag];this.PE.reserves=[0,WEAPONS[1].reserve];
    INPUT.weapon=1;
    this.st='b';this.cdT=BUY_TIME;this.lastRnd=0;this.snaps.length=0;this.snapNow=true;this.visSnap=true;
    this.lastSnapT=performance.now();
    VIEW.yaw=this.myTeam===1?Math.PI:0;
    VIEW.pitch=0;
    G.mode='client';G.paused=false;
    $('timeTag').classList.remove('hidden');
    $('pingTag').classList.remove('hidden');
    $('creditTag').classList.remove('hidden');
    $('lobby').classList.add('hidden');
    hudEl.classList.remove('hidden');
    lockPointer();
  },

  // ---------- cliente: snapshot recebido ----------
  onSnapshot(d){
    this.snaps.push({t:performance.now(),d});
    if(this.snaps.length>12)this.snaps.shift();
    this.lastSnap=d;
    const newRound=d.rnd!==this.lastRnd;
    if(newRound){
      this.lastRnd=d.rnd;this.snapNow=true;this.visSnap=true;this.snaps.length=1;this.lastCd=-1;
      VIEW.yaw=this.myTeam===1?Math.PI:0;VIEW.pitch=0;INPUT.fire=false;
    }
    this.st=d.st;this.cdT=Math.max(0,d.cd||0);
    if(d.st==='c'||d.st==='b'){
      const c=Math.ceil(d.cd);
      if(c!==this.lastCd&&c>0){
        this.lastCd=c;
        if(d.st==='c'||c<=3){sfx.tick();announce(String(c),d.st==='b'?'PREPARE-SE':'',0.75);}
      }
    }else this.lastCd=-1;
    for(const ev of d.ev)this.handleEvent(ev);
    const me=d.p.find(r=>r[0]===this.myId);
    if(me&&this.PE)this.correctSelf(me);
    if(d.st==='b'&&newRound&&isTouch)openShop();
    if(d.st!=='b'&&SHOP.open)closeShop(false);
    this.lastSnapT=performance.now();
    HUDSRC.round=d.rnd;
    HUDSRC.enemies=d.al?(this.myTeam===0?d.al[1]:d.al[0]):d.el;
    HUDSRC.time=d.rt||0;
    if(d.sc)modeTag.textContent='SALA '+this.roomCode+' · '+d.sc[0]+' × '+d.sc[1];
  },
  correctSelf(row){
    const PE=this.PE;
    const ax=row[1],ay=row[2],az=row[3];
    const errH=Math.hypot(ax-PE.x,az-PE.z);
    const frozen=this.st==='b';
    if(errH>2.5||this.snapNow||frozen){PE.x=ax;PE.z=az;PE.vy=0;}
    else{PE.x+=(ax-PE.x)*0.55;PE.z+=(az-PE.z)*0.55;}
    if(frozen||Math.abs(ay-PE.y)>1.2)PE.y=ay;
    else PE.y+=(ay-PE.y)*0.55;
    if(frozen)PE.speed=0;
    const primary=Number.isInteger(row[17])?row[17]:-1;
    const sidearm=Number.isInteger(row[18])?row[18]:1;
    const loadChanged=PE.loadout[0]!==primary||PE.loadout[1]!==sidearm;
    PE.loadout=[primary,sidearm];PE.credits=row[16]||0;
    if(loadChanged||this.snapNow)INPUT.weapon=row[10];
    if(this.snapNow){PE.fireSpread=0;PE.fireCd=0;PE.stepAcc=0;}
    PE.weapon=row[10];
    PE.mags=[row[19]||0,row[20]||0];
    PE.reserves=[row[21]||0,row[22]||0];
    PE.hp=row[6];PE.reloading=row[8]===1;
    const wasDead=PE.dead;
    PE.dead=row[9]===1;
    if(PE.dead&&!wasDead)PE.deathT=0;
    PE.kills=row[12];PE.smokeCharges=row[13];
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
          sfxIfNear(ev.ox,ev.oz,WEAPONS[ev.w]&&WEAPONS[ev.w].slot===1?sfx.shootP:sfx.shoot);
          const v=VIS.players.get(ev.id);if(v)v.shot=1;
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
    // watchdog: se o anfitrião parar de mandar dados, avisa em vez de congelar calado
    if(this.started&&this.lastSnapT&&performance.now()-this.lastSnapT>5000){
      this.netLost('O anfitrião parou de responder (aba fechada/dormindo ou conexão caiu).');
      return;
    }
    // re-sincronização: se perdeu snapshots, pede um completo ao host
    this.resyncAcc=(this.resyncAcc||0)+dt;
    if(this.resyncAcc>1){
      this.resyncAcc=0;
      if(this.started&&this.lastSnapT){
        const gap=performance.now()-this.lastSnapT;
        if(gap>1500&&gap<5000&&this.hostConn&&this.hostConn.open){
          try{this.hostConn.send({t:'resync'});}catch(e){}
        }
      }
    }
    if(PE.dead)PE.deathT+=dt;
    const frozen=this.st==='b';
    if(frozen)this.cdT=Math.max(0,(this.cdT||0)-dt);
    const i=PE.input;
    i.mx=frozen?0:INPUT.mx;i.mz=frozen?0:INPUT.mz;
    i.yaw=VIEW.yaw;i.pitch=VIEW.pitch;
    i.walk=INPUT.walk;i.ads=INPUT.ads;i.fire=frozen?false:INPUT.fire;
    i.weapon=INPUT.weapon;
    // enviar input a 30 Hz (resposta mais justa no host)
    this.sendAcc+=dt;
    if(this.sendAcc>=0.033&&this.hostConn&&this.hostConn.open){
      this.sendAcc=0;
      try{
        this.hostConn.send({t:'i',
          mx:frozen?0:+clamp(INPUT.mx,-1,1).toFixed(2),mz:frozen?0:+clamp(INPUT.mz,-1,1).toFixed(2),
          y:+VIEW.yaw.toFixed(3),p:+VIEW.pitch.toFixed(3),
          wk:INPUT.walk?1:0,f:frozen?0:(INPUT.fire?1:0),a:INPUT.ads?1:0,w:INPUT.weapon,
          j:frozen?0:(INPUT.jump?1:0),r:frozen?0:(INPUT.reload?1:0),q:frozen?0:(INPUT.q?1:0)});
      }catch(e){}
    }
    // Durante a compra, ignorar movimento, tiro e ações também na predição local.
    if(frozen){
      i.jump=false;i.reload=false;i.q=false;
      INPUT.jump=false;INPUT.reload=false;INPUT.q=false;
      PE.speed=0;PE.vy=0;
    }else{
      i.jump=i.jump||INPUT.jump;INPUT.jump=false;
      if(INPUT.reload){i.reload=true;INPUT.reload=false;}
      if(INPUT.q){i.q=true;INPUT.q=false;}
    }
    PE.yaw=VIEW.yaw;PE.pitch=VIEW.pitch;
    if(!PE.dead&&!frozen)integrate(PE,dt);
    if(!frozen)this.stepLocalWeapons(PE,dt);
    this.renderNet();
  },
  startReloadLocal(PE){
    const w=weaponDef(PE);
    if(PE.reloading||PE.dead)return;
    if(PE.mags[PE.weapon]>=w.mag||PE.reserves[PE.weapon]<=0)return;
    PE.reloading=true;PE.reloadT=0;
    sfx.reload();
  },
  stepLocalWeapons(PE,dt){
    PE.fireCd-=dt;
    PE.fireSpread=Math.max(0,PE.fireSpread-dt*4);
    PE.smokeCd=Math.max(0,PE.smokeCd-dt);
    if(PE.input.weapon!==PE.weapon&&!PE.dead&&PE.loadout[PE.input.weapon]>=0){
      PE.weapon=PE.input.weapon;PE.reloading=false;PE.reloadT=0;
    }
    if(PE.input.reload){PE.input.reload=false;this.startReloadLocal(PE);}
    if(PE.reloading){
      PE.reloadT+=dt;
      const w=weaponDef(PE);
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
    const w=weaponDef(PE);
    if(PE.mags[PE.weapon]<=0){this.startReloadLocal(PE);return;}
    PE.mags[PE.weapon]--;
    PE.fireCd=w.rate;
    localShotFX(weaponId(PE));
    // rastro apenas visual (o dano é decidido pelo host)
    const cp=Math.cos(PE.pitch);
    let dx=-Math.sin(PE.yaw)*cp,dy=Math.sin(PE.pitch),dz=-Math.cos(PE.yaw)*cp;
    const mv=PE.speed/SPEED;
    const sp=(0.0016+PE.fireSpread*0.004+mv*0.004)*(INPUT.walk?0.4:1)*(INPUT.ads?0.55:1);
    const s1=rand(-sp,sp),s2=rand(-sp,sp);
    PE.fireSpread=Math.min(PE.fireSpread+w.kick,3);
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
    for(const q of this.interpPlayers){
      if(q.team===this.myTeam)continue;
      const bb={minX:q.x-0.45,maxX:q.x+0.45,minY:0.1,maxY:1.94,minZ:q.z-0.32,maxZ:q.z+0.32};
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
      const v=ensureVisPlayer(id,row[15]||0);
      const slot=row[10]===0?0:1;
      setVisTarget(v,x,y,z,yw,row[9]===0,this.visSnap,row[slot===0?17:18]);
      this.interpPlayers.push({x,z,team:row[15]||0});
    }
    for(const[id,v]of VIS.players){
      if(!seen.has(id)){destroyVisual(v);VIS.players.delete(id);}
    }
    const bseen=new Set();
    this.interpBots=[];
    for(const row of b.d.b){
      const id='b'+row[0];bseen.add(id);
      const ra=a.d.b.find(r=>'b'+r[0]===id)||row;
      const x=lerp(ra[1],row[1]),z=lerp(ra[2],row[2]),y=lerp(ra[3],row[3]),rot=lerpA(ra[4],row[4]);
      const v=ensureVisBot(id);
      setVisTarget(v,x,y,z,rot+Math.PI,row[5]===1,this.visSnap);
      this.interpBots.push({x,z,alive:row[5]===1});
    }
    for(const[id,v]of VIS.bots){
      if(!bseen.has(id)){destroyVisual(v);VIS.bots.delete(id);}
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
    closeShop(false);
    $('buyPhase').classList.add('hidden');$('shopBtn').classList.add('hidden');
    $('creditTag').classList.add('hidden');
    try{for(const c of this.conns)c.conn.close();}catch(e){}
    try{if(this.hostConn)this.hostConn.close();}catch(e){}
    try{if(this.peer)this.peer.destroy();}catch(e){}
    if(this.hbInt){clearInterval(this.hbInt);this.hbInt=null;}
    this.joinAttempts=0;this.rtt=0;
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
$('btnCopyCode').addEventListener('click',()=>{
  const code=NET.roomCode||$('lobbyCode').textContent.trim();
  const lbl=$('copyLbl');
  const done=()=>{
    lbl.textContent='✓ COPIADO!';
    setTimeout(()=>{lbl.textContent='COPIAR';},1200);
  };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(done).catch(()=>fallback());
  }else fallback();
  function fallback(){
    const ta=document.createElement('textarea');
    ta.value=code;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');done();}catch(e){}
    document.body.removeChild(ta);
  }
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

// expõe o NET para o game.js (const de script clássico não vira propriedade de window)
window.NET=NET;
