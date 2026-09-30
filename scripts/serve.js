import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import handler from '../api/github.js';
const root=process.cwd(),port=Number(process.env.PORT||3000);
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/github'){
  req.query=Object.fromEntries(url.searchParams);
  res.status=n=>{res.statusCode=n;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  return handler(req,res);
 }
 try{const name=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||name.includes('/.git')||name.includes('/node_modules')){res.writeHead(403);return res.end();}const data=await readFile(file);const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.md':'text/plain'};res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(data);}catch{res.writeHead(404);res.end('Not found');}
});server.listen(port,'0.0.0.0',()=>console.log(`HT ready at http://localhost:${port}`));
