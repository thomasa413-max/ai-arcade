// Photoreal fighter art with the OpenAI image API. Claude writes the prompts (fighters.json); OpenAI draws.
// Steps: refs   -> one reference sheet per fighter (fighter/art/<char>/ref.webp)  (approve it before continuing)
//        poses  -> every pose, edited from the reference sheet so the person stays the same
//        stage  -> four background layers
// Usage: OPENAI_API_KEY=... node fighter/tools/generate-fighters.mjs --step=refs|poses|stage [--char=rhea,brann] [--only=idle_a,...] [--force] [--quality=medium|high]
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const ART=path.join(here,'..','art');
const KEY=process.env.OPENAI_API_KEY; if(!KEY){console.error('Set OPENAI_API_KEY first.');process.exit(1)}
const arg=(n,d='')=>{const a=process.argv.find(x=>x.startsWith('--'+n+'='));return a?a.slice(n.length+3):d};
const step=arg('step','refs'); const chars=(arg('char','rhea,brann')).split(',').filter(Boolean); const only=arg('only')?arg('only').split(',').filter(Boolean):null;
const force=process.argv.includes('--force'); const QUALITY=arg('quality',process.env.OPENAI_IMAGE_QUALITY||'medium');
const MODELS=(process.env.OPENAI_IMAGE_MODEL||'gpt-image-2,gpt-image-2.5-sunburst,gpt-image-2.5-flare').split(',').map(s=>s.trim()); let mi=0;
const cfg=JSON.parse(fs.readFileSync(path.join(here,'fighters.json'),'utf8'));
let ok=0,skipped=0,failed=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function call(job){ // job: {file,size,prompt,background,refs:[path]}
  fs.mkdirSync(path.dirname(job.file),{recursive:true});
  if(!force&&fs.existsSync(job.file)){skipped++;console.log('skip',path.relative(ART,job.file));return}
  let noBg=false,noFid=false;
  for(let attempt=1;attempt<=6;attempt++){
    try{
      let r;
      if(job.refs&&job.refs.length){
        const fd=new FormData(); fd.append('model',MODELS[mi]); fd.append('prompt',job.prompt); fd.append('size',job.size); fd.append('quality',QUALITY); fd.append('n','1');
        fd.append('output_format','webp'); fd.append('output_compression','85');
        if(job.background&&!noBg)fd.append('background',job.background); if(!noFid)fd.append('input_fidelity','high');
        for(const p of job.refs)fd.append('image[]',new Blob([fs.readFileSync(p)],{type:'image/webp'}),path.basename(p));
        r=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:'Bearer '+KEY},body:fd});
      }else{
        const body={model:MODELS[mi],prompt:job.prompt,size:job.size,quality:QUALITY,n:1,output_format:'webp',output_compression:85};
        if(job.background&&!noBg)body.background=job.background;
        r=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
      }
      const j=await r.json(); if(!r.ok)throw new Error(j.error&&j.error.message||r.status);
      fs.writeFileSync(job.file,Buffer.from(j.data[0].b64_json,'base64')); ok++; console.log('done',path.relative(ART,job.file),MODELS[mi],Math.round(fs.statSync(job.file).size/1024)+' KB'); return;
    }catch(e){const m=String(e.message||e); console.error('retry',path.relative(ART,job.file),attempt,m);
      if(/input_fidelity/i.test(m)&&!noFid)noFid=true;
      else if(/does not exist|not found|deprecated|shut down|do not have access|must be verified/i.test(m)&&mi<MODELS.length-1){mi++;console.log('switching model to',MODELS[mi])}
      else if(/background|transparent/i.test(m)&&job.background&&!noBg){noBg=true;console.log('retrying without transparent background')}
      await sleep(2500*Math.min(attempt,3))}
  }
  failed++;
}
const jobs=[];
if(step==='refs'){
  for(const c of chars)jobs.push({file:path.join(ART,c,'ref.webp'),size:cfg.ref.size,prompt:cfg.style+' '+cfg.ref.prompt.replace('{desc}',cfg.chars[c].desc)});
}else if(step==='poses'){
  for(const c of chars){
    const ref=path.join(ART,c,'ref.webp'); if(!fs.existsSync(ref)){console.error('Missing reference sheet for',c,'- run the refs step first and approve it.');process.exit(1)}
    const all={...cfg.poses,...Object.fromEntries(Object.entries(cfg.special[c]).map(([k,v])=>[c+'_'+k,v]))};
    for(const [id,desc] of Object.entries(all)){ if(only&&!only.includes(id))continue;
      jobs.push({file:path.join(ART,c,id+'.webp'),size:'1536x1024',background:'transparent',refs:[ref],prompt:cfg.style+' '+cfg.frame+desc+'. Character: '+cfg.chars[c].desc});}
  }
}else if(step==='stage'){
  for(const s of cfg.stage){ if(only&&!only.includes(s.file))continue; jobs.push({file:path.join(ART,'stage',s.file+'.webp'),size:s.size,background:s.background,prompt:s.prompt}); }
}else{console.error('Unknown step',step);process.exit(1)}
console.log(`step=${step} jobs=${jobs.length} quality=${QUALITY}`);
let idx=0; await Promise.all(Array.from({length:3},async()=>{while(idx<jobs.length)await call(jobs[idx++])}));
console.log(`finished: ${ok} created, ${skipped} skipped, ${failed} failed`); if(failed)process.exit(1);
