# PROTOCOLO // FPS tático para navegador

Jogue no PC ou no celular: treino solo contra bots e PvP em equipes de até **5 jogadores**. Quem cria a sala hospeda a simulação no próprio navegador: os participantes se conectam por WebRTC/PeerJS. **Não há servidor dedicado de partida**; o servidor Node deste pacote só entrega os arquivos do site.

## Publicar no Render

1. **Extraia o ZIP**. A pasta `protocolo-render/` extraída é a raiz do projeto.
2. Publique os arquivos dessa pasta em um repositório Git (GitHub/GitLab).
3. No Render, escolha **New → Web Service**, conecte o repositório e selecione Node.
4. Configure **Build Command:** `echo "sem build"` e **Start Command:** `node server.js`. O plano Free é compatível; não é necessário instalar dependências.
5. Faça o deploy e acesse a URL HTTPS criada pelo Render. O arquivo `render.yaml` também está incluído caso prefira um Blueprint.

Alternativa: crie um **Static Site**, deixe a raiz do repositório como diretório do projeto e use `public` como *Publish Directory*. Não precisa de build.

> **Multiplayer:** HTTPS (ou `localhost`) é necessário para WebRTC. O serviço de sinalização PeerJS Cloud e os servidores STUN/TURN são externos; o servidor Render **não** processa o jogo. A pessoa que cria a sala precisa manter a aba aberta, de preferência em primeiro plano. Conexões P2P podem ser bloqueadas por algumas redes/NATs; o TURN público incluído é apenas fallback e não oferece garantia de disponibilidade. Em produção, configure um TURN próprio em `public/net.js`.

## Novidades desta versão

- Arena industrial redesenhada com rotas simétricas, coberturas, marcas de cada equipe e reator central animado. Elementos estáticos agrupados por material para reduzir as chamadas de desenho.
- **Novos modelos 3D de verdade:** seis armas GLB individuais da coleção Quaternius (aprox. 1.000–2.536 triângulos cada) e um par de braços/mãos WRAD com malha anatômica, cerca de 50 ossos e dedos posados para empunhar. Os braços usam uma textura de luva tática reduzida a **256 × 256**; o GLB inteiro tem cerca de **129 KB**. As armas têm cores de vértice e uma chamada de desenho cada; o mesmo rig de mãos é compartilhado pelas seis. Arquivos locais, sem CDN para os modelos. Se faltar algum modelo, há reserva visual para não travar o jogo.
- Recuo e clarão no cano real, balanço ao andar, troca, ADS e movimento de recarga com as mãos. Agentes remotos mantêm as malhas compactas e animações de caminhada/tiro/morte, sem pesar no celular.
- Em **cada round PvP**: **15 segundos de compra**. Todos ficam completamente imóveis no spawn e não podem atacar até o timer acabar. No PC, abra a loja com **B**; no celular, toque em **LOJA**. O treino solo continua sem espera de compra.
- Economia autoritativa no navegador do anfitrião: todos começam com **900 créditos**, pistola FANTASMA grátis; VANDAL, ESPECTRO, BULLDOG, GUARDIÃO e SHERIFF são compráveis. Eliminação dá +200; vitória +3000; derrota +1900; empate +2200, até o limite de 9000. Sobreviventes conservam suas armas; mortos perdem armas compradas ao começar o próximo round.
- Controles responsivos para toque, opção de tela cheia, qualidade/resolução ajustáveis, contador de FPS e limites **30/60/90/120/sem limite**.

## Controles

| Ação | PC | Celular |
|---|---|---|
| Mover | WASD | Joystick à esquerda |
| Mirar | Mouse | Deslizar à direita |
| Atirar | Clique esquerdo | ATIRAR |
| Mira de precisão | Clique direito | MIRA (alternar) |
| Pular / recarregar | Espaço / R | PULAR / RECAR. |
| Lançar fumaça | Q | FUMAÇA |
| Trocar arma | 1 / 2 | ARMA |
| Andar com precisão | Shift | ANDAR (alternar) |
| Abrir loja PvP | B | LOJA (durante a compra) |
| Tela cheia | Botão na interface | Botão na interface |

No celular, a horizontal oferece mais espaço para os controles; a vertical também funciona. Os ícones são SVG embutidos no HTML. O navegador pode solicitar permissão para tela cheia; em navegadores que não a oferecem, o jogo continua utilizável.

## Estrutura e desenvolvimento

```text
protocolo-render/
├── server.js         servidor estático Node, sem dependências
├── package.json
├── render.yaml       Blueprint opcional do Render
└── public/
    ├── index.html    menus, HUD, loja e controles
    ├── game.js       arena, bots, física, render e regras
    ├── net.js        WebRTC, host autoritativo e sincronização
    ├── GLTFLoader.js carregador de GLB, incluído localmente
    ├── assets/       6 armas GLB, braços GLB e manifesto
    ├── three.min.js
    └── peerjs.min.js
```

Para rodar localmente: `node server.js` e abra `http://localhost:8080` (ou defina `PORT`). Clientes enviam inputs ao anfitrião; o anfitrião valida compras, simula movimento/dano/economia e envia snapshots. A predição do próprio movimento e a interpolação dos outros jogadores reduzem a percepção de latência.

## Origem dos modelos 3D

- Armas: **Quaternius — 50 Low Poly Guns**, [coleção original](https://quaternius.itch.io/50-lowpoly-guns), licença **CC0 1.0**. Os arquivos `public/assets/{vandal,fantasma,espectro,bulldog,guardiao,sheriff}.glb` são adaptações de seis malhas OBJ separadas do pack; as cores de materiais foram convertidas em cores de vértice.
- Braços e mãos: **“WRAD ARMS” by wriks**, [projeto original](https://wriks.itch.io/wrad-arms), licença **CC0 1.0**. `public/assets/arms.glb` conserva a malha e o esqueleto originais; a textura foi reduzida e recolorida como luvas. O arquivo original informa a atribuição de cortesia “WRAD ARMS” by wriks: https://wriks.motorcycles.
- **Three.js/GLTFLoader** são distribuídos sob MIT. O carregador tem a mesma versão da engine (r128). Modelos e loaders estão dentro do ZIP; só o serviço de sinalização P2P depende de terceiros.

CC0 permite usar e adaptar os modelos, inclusive comercialmente. Os créditos acima reconhecem os criadores, apesar de não serem exigidos por essa licença.
