import {build} from 'esbuild';
import fs from 'fs';
const r=await build({entryPoints:['src/main.js'],bundle:true,minify:true,format:'iife',write:false,target:'es2019',legalComments:'none',nodePaths:['/tmp/rr/node_modules']});
const js=r.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
fs.mkdirSync('out/assets',{recursive:true});
fs.writeFileSync('out/index.html',fs.readFileSync('template.html','utf8').replace('/*BUNDLE*/',()=>js));
console.log('built',(fs.statSync('out/index.html').size/1024).toFixed(0)+' KB');
