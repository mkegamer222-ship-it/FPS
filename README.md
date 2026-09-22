# PROTOCOLO // FPS tático estilo Valorant — P2P

FPS cooperativo no navegador (PC e mobile). Você e até 4 amigos enfrentam ondas de bots.
**O multiplayer é 100% Peer-to-Peer**: quem cria a sala vira o servidor dela (WebRTC data channels,
sinalização via PeerJS Cloud). Nenhum servidor de jogo é necessário.

## Estrutura

```
protocolo-render/
├── server.js       servidor estático (Node puro, zero dependências)
├── package.json
├── render.yaml     blueprint do Render (opcional)
└── public/         o jogo (index.html, game.js, net.js, three/peerjs)
```

## Publicar no Render (opção recomendada: Web Service)

1. Crie uma conta em https://render.com
2. Suba esta pasta para um repositório Git (GitHub/GitLab) — ou use *Deploy without Git* com o zip.
3. No painel: **New → Web Service** e aponte para o repositório.
4. Configurações:
   - **Build Command:** deixe vazio (ou `echo ok`)
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. Deploy. O Render injeta a variável `PORT` automaticamente; o site ficará em
   `https://NOME-DO-SERVICO.onrender.com`.

### Alternativa: Static Site (também funciona)

New → **Static Site** → *Root Directory*: `public`. Sem build, sem publish dir adicional.
(O Web Service é preferível por dar mais controle e logs.)

## Importante para o multiplayer funcionar

- **HTTPS é obrigatório** para WebRTC. No Render o HTTPS é automático — não rode em `http://`.
- O anfitrião deve **manter a aba aberta**; a sala vive no navegador dele.
- A conexão direta usa STUN (Google). Em NATs muito restritivos a conexão P2P pode não abrir —
  nesse caso, adicione um servidor TURN na constante `iceServers` dentro de `net.js`
  (ex.: Twilio/Xirsys) e faça redeploy.
- No plano Free do Render o serviço "dorme" após inatividade; o primeiro acesso pode demorar ~1 min.

## Controles

| Ação | PC | Mobile |
|---|---|---|
| Mover | WASD | Joystick (lado esquerdo) |
| Mirar | Mouse | Arrastar (lado direito) |
| Atirar | Clique esq. | Botão ATIRAR |
| Zoom de precisão | Clique dir. | — |
| Pular / Recarregar | Espaço / R | Botões ▲ / RECAR. |
| Fumaça (Q) | Q | Botão Q |
| Trocar arma | 1 / 2 | Botão TROCAR |
| Andar (preciso) | Shift | — |

## Rodar localmente

```bash
node server.js        # abre em http://localhost:8080
```
O multiplayer local exige HTTPS ou `localhost` (localhost é aceito pelos navegadores).

## Como funciona o P2P

- **Criar sala:** o navegador do anfitrião registra o ID `protocolo-fps-CÓDIGO` no PeerJS Cloud
  (apenas sinalização) e passa a aceitar conexões WebRTC diretas dos outros jogadores.
- **Modelo host-authoritative:** clientes enviam somente inputs (20x/s); o anfitrião simula
  física, bots, dano e rounds, e transmite snapshots + eventos (20x/s) para todos.
- Clientes fazem predição local do próprio movimento e interpolação dos demais (buffer de 120 ms).

Sem licença de uso — divirta-se.
