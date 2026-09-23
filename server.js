/* PROTOCOLO // servidor estático zero-dependências para o Render */
'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');

const PORT=process.env.PORT||8080;
const ROOT=path.join(__dirname,'public');
const MIME={
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json',
  '.glb':'model/gltf-binary',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.svg':'image/svg+xml',
  '.ico':'image/x-icon',
  '.woff2':'font/woff2'
};

http.createServer((req,res)=>{
  let urlPath;
  try{urlPath=decodeURIComponent((req.url||'/').split('?')[0]);}
  catch(e){res.writeHead(400);return res.end();}
  if(urlPath==='/')urlPath='/index.html';
  const filePath=path.normalize(path.join(ROOT,urlPath));
  if(filePath!==ROOT&&!filePath.startsWith(ROOT+path.sep)){
    res.writeHead(403);return res.end('403');
  }
  fs.readFile(filePath,(err,data)=>{
    if(err){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('404');}
    res.writeHead(200,{
      'Content-Type':MIME[path.extname(filePath).toLowerCase()]||'application/octet-stream',
      'Cache-Control':'no-cache'
    });
    res.end(data);
  });
}).listen(PORT,'0.0.0.0',()=>{
  console.log('PROTOCOLO rodando na porta',PORT);
});
