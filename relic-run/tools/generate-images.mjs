// Generates Relic Run artwork with the OpenAI image API. Claude writes and orchestrates the prompts (prompts.json);
// the images are produced by OpenAI and saved as WebP next to the game. Existing files are kept unless --force.
// Usage: OPENAI_API_KEY=sk-... node tools/generate-images.mjs [--force] [--only=title,w1-sky]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const OUT=process.env.OUT_DIR||path.join(here,'..','..','public','games','relic-run','assets');
const KEY=process.env.OPENAI_API_KEY; if(!KEY){console.error('Set OPENAI_API_KEY first.');process.exit(1)}
const MODELS=(process.env.OPENAI_IMAGE_MODEL||'gpt-image-2,gpt-image-2.5-sunburst,gpt-image-2.5-flare').split(',').map(s=>s.trim()).filter(Boolean); let mi=0; const QUALITY=process.env.OPENAI_IMAGE_QUALITY||'medium';
const force=process.argv.includes('--force'); const onlyArg=process.argv.find(a=>a.startsWith('--only=')); const only=onlyArg?onlyArg.slice(7).split(',').filter(Boolean):null;
const cfg=JSON.parse(fs.readFileSync(path.join(here,'prompts.json'),'utf8'));
fs.mkdirSync(OUT,{recursive:true});
let ok=0,skipped=0,failed=0;
async function gen(item){
  const file=path.join(OUT,item.file+'.webp');
  if(!force&&fs.existsSync(file)){skipped++;console.log('skip',item.file);return}
  let noBg=false;
  for(let attempt=1;attempt<=6;attempt++){
    try{
      const body={model:MODELS[mi],prompt:cfg.style+' '+item.prompt,size:item.size,quality:QUALITY,n:1,output_format:'webp',output_compression:82};
      if(item.background&&!noBg)body.background=item.background;
      const r=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
      const j=await r.json(); if(!r.ok) throw new Error(j.error&&j.error.message||r.status);
      fs.writeFileSync(file,Buffer.from(j.data[0].b64_json,'base64')); ok++; console.log('done',item.file,MODELS[mi],Math.round(fs.statSync(file).size/1024)+' KB'); return;
    }catch(e){ const m=String(e.message||e); console.error('retry',item.file,attempt,MODELS[mi],m);
      if(/does not exist|not found|deprecated|shut down|do not have access|must be verified/i.test(m)&&mi<MODELS.length-1){mi++; console.log('switching model to',MODELS[mi])}
      else if(/background|transparent/i.test(m)&&item.background&&!noBg){noBg=true; console.log('retrying without transparent background:',item.file)}
      await new Promise(r=>setTimeout(r,2000*Math.min(attempt,3))) }
  }
  failed++;
}
const todo=cfg.items.filter(i=>!only||only.includes(i.file));
const pool=2; let idx=0;
await Promise.all(Array.from({length:pool},async()=>{while(idx<todo.length){await gen(todo[idx++])}}));
console.log(`finished: ${ok} created, ${skipped} skipped, ${failed} failed`); if(failed)process.exit(1);
