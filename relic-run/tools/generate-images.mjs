// Generates Relic Run artwork with the OpenAI image API. Claude writes and orchestrates the prompts (prompts.json);
// the images are produced by OpenAI and saved as WebP next to the game. Existing files are kept unless --force.
// Usage: OPENAI_API_KEY=sk-... node tools/generate-images.mjs [--force] [--only=title,w1-sky]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const OUT=process.env.OUT_DIR||path.join(here,'..','..','public','games','relic-run','assets');
const KEY=process.env.OPENAI_API_KEY; if(!KEY){console.error('Set OPENAI_API_KEY first.');process.exit(1)}
const MODEL=process.env.OPENAI_IMAGE_MODEL||'gpt-image-1', QUALITY=process.env.OPENAI_IMAGE_QUALITY||'medium';
const force=process.argv.includes('--force'); const onlyArg=process.argv.find(a=>a.startsWith('--only=')); const only=onlyArg?onlyArg.slice(7).split(',').filter(Boolean):null;
const cfg=JSON.parse(fs.readFileSync(path.join(here,'prompts.json'),'utf8'));
fs.mkdirSync(OUT,{recursive:true});
let ok=0,skipped=0,failed=0;
async function gen(item){
  const file=path.join(OUT,item.file+'.webp');
  if(!force&&fs.existsSync(file)){skipped++;console.log('skip',item.file);return}
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const r=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},
        body:JSON.stringify({model:MODEL,prompt:cfg.style+' '+item.prompt,size:item.size,quality:QUALITY,n:1,output_format:'webp',output_compression:82,...(item.background?{background:item.background}:{})})});
      const j=await r.json(); if(!r.ok) throw new Error(j.error&&j.error.message||r.status);
      fs.writeFileSync(file,Buffer.from(j.data[0].b64_json,'base64')); ok++; console.log('done',item.file,Math.round(fs.statSync(file).size/1024)+' KB'); return;
    }catch(e){ console.error('retry',item.file,attempt,String(e.message||e)); await new Promise(r=>setTimeout(r,2500*attempt)) }
  }
  failed++;
}
const todo=cfg.items.filter(i=>!only||only.includes(i.file));
const pool=2; let idx=0;
await Promise.all(Array.from({length:pool},async()=>{while(idx<todo.length){await gen(todo[idx++])}}));
console.log(`finished: ${ok} created, ${skipped} skipped, ${failed} failed`); if(failed)process.exit(1);
