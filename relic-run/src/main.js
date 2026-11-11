import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {T,LANGS,LNAME} from './i18n.js';

/* ================= helpers ================= */
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), rnd=(a,b)=>a+Math.random()*(b-a), pick=a=>a[(Math.random()*a.length)|0];
const lerp=(a,b,k)=>a+(b-a)*k;
const LANES=[-2.4,0,2.4];
let L='en';
const t=(k,...a)=>{let s=(T[L]&&T[L][k])||T.en[k]||k; a.forEach((v,i)=>{s=s.replace('{'+i+'}',v)}); return s};
const TOUCH=matchMedia('(pointer:coarse)').matches||('ontouchstart' in window);

/* ================= save ================= */
let SAVE={unlocked:1,stars:{},coins:0,best:{}};
try{Object.assign(SAVE,JSON.parse(localStorage.getItem('rr-save')||'{}'))}catch(e){}
const save=()=>{try{localStorage.setItem('rr-save',JSON.stringify(SAVE))}catch(e){}};

/* ================= worlds ================= */
const WORLDS=[
 {id:1,sky:0x8fdcf0,horizon:0xe6f6d8,fog:0xcdeccb,ground:0x2f7a3a,path:'#b99f66',
  stages:[
   {len:650,s0:15,s1:19,dens:.45},
   {len:850,s0:17,s1:22,dens:.65},
   {len:1050,s0:19,s1:25,dens:.8,chase:true}
  ]},
 {id:2},{id:3},{id:4},{id:5}
];

/* ================= audio ================= */
const A=(()=>{
  let ac,master,noiseBuf,muted=false,musicOn=false,nextT=0,step=0,timer=null;
  const mf=m=>440*Math.pow(2,(m-69)/12);
  function init(){
    if(ac){ if(ac.state==='suspended')ac.resume(); return }
    try{ac=new (window.AudioContext||window.webkitAudioContext)()}catch(e){return}
    const comp=ac.createDynamicsCompressor(); master=ac.createGain(); master.gain.value=muted?0:.8; master.connect(comp); comp.connect(ac.destination);
    noiseBuf=ac.createBuffer(1,ac.sampleRate,ac.sampleRate); const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  }
  function tone(f,t0,d,type,v,to){
    const o=ac.createOscillator(),g=ac.createGain(); o.type=type||'sine'; o.frequency.setValueAtTime(f,t0); if(to)o.frequency.exponentialRampToValueAtTime(to,t0+d);
    g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(v,t0+.008); g.gain.exponentialRampToValueAtTime(.0001,t0+d); o.connect(g); g.connect(master); o.start(t0); o.stop(t0+d+.05);
  }
  function noise(t0,d,v,f){
    const s=ac.createBufferSource(); s.buffer=noiseBuf; const fl=ac.createBiquadFilter(); fl.type='bandpass'; fl.frequency.value=f||1500; const g=ac.createGain();
    g.gain.setValueAtTime(v,t0); g.gain.exponentialRampToValueAtTime(.0001,t0+d); s.connect(fl); fl.connect(g); g.connect(master); s.start(t0); s.stop(t0+d+.05);
  }
  const SC=[0,3,5,7,10,12,15,17];
  function playStep(t0,n){
    const s=n%16, bar=((n/16)|0)%4, root=[45,41,43,40][bar];
    if(s%4===0){ tone(mf(root-12),t0,.22,'sine',.22,mf(root-12)*.97); noise(t0,.05,.05,120) }
    if(s%8===4) noise(t0,.12,.1,1800);
    if(s%2===0) noise(t0,.03,.025,7000);
    if(s%2===0||s%8===3) tone(mf(root),t0,.2,'triangle',.07);
    const m=[0,2,4,2,5,4,2,1][(s>>1)%8]; if(s%2===0&&(bar%2===0||s>7)) tone(mf(root+24+SC[m]),t0,.16,'square',.02);
  }
  function sched(){
    if(!ac)return; if(!musicOn){nextT=Math.max(nextT,ac.currentTime+.05);return}
    if(nextT<ac.currentTime-.4)nextT=ac.currentTime+.05;
    while(nextT<ac.currentTime+.14){playStep(nextT,step);nextT+=.115;step++}
  }
  function sfx(n){
    if(!ac||muted)return; const t0=ac.currentTime;
    switch(n){
      case'jump': tone(300,t0,.18,'square',.07,700); break;
      case'slide': noise(t0,.3,.12,900); break;
      case'coin': tone(988,t0,.07,'square',.05); tone(1319,t0+.06,.16,'square',.05); break;
      case'hit': noise(t0,.35,.3,300); tone(130,t0,.3,'sawtooth',.2,50); break;
      case'pick': [523,659,784,1047].forEach((f,i)=>tone(f,t0+i*.06,.14,'triangle',.08)); break;
      case'shield': tone(200,t0,.4,'sawtooth',.1,900); break;
      case'win': [523,659,784,1047,1319].forEach((f,i)=>tone(f,t0+i*.1,.3,'square',.06)); break;
      case'over': [392,330,262,196].forEach((f,i)=>tone(f,t0+i*.16,.3,'sawtooth',.07)); break;
      case'ui': tone(660,t0,.07,'square',.04); break;
      case'rumble': noise(t0,.5,.14,120); break;
    }
  }
  setInterval(sched,50);
  return{init,sfx,set music(v){musicOn=v},toggle(){muted=!muted; if(master)master.gain.value=muted?0:.8; return muted}};
})();

/* ================= three.js setup (realistic look) ================= */
const cv=$('#c');
const LOW=(()=>{ try{ return (navigator.hardwareConcurrency||8)<=4 || Math.min(screen.width,screen.height)<420 || /Android.*(SM-A|Redmi|moto g)/i.test(navigator.userAgent) }catch(e){return false} })();
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,LOW?1.5:2));
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
const cam=new THREE.PerspectiveCamera(60,1,.1,700), cam2=new THREE.PerspectiveCamera(55,1.6,.1,300);
const hemi=new THREE.HemisphereLight(0xcfe8ff,0x6a6a3a,.7); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff0d0,3.1); sun.position.set(-16,22,10); sun.castShadow=true;
sun.shadow.mapSize.set(LOW?1024:2048,LOW?1024:2048); {const sc=sun.shadow.camera; sc.left=-22;sc.right=22;sc.top=34;sc.bottom=-26;sc.near=1;sc.far=90} sun.shadow.bias=-.0004; sun.shadow.normalBias=.04;
scene.add(sun,sun.target);

/* ---- procedural texture toolkit (replaced by OpenAI-generated photos when assets/*.webp exist) ---- */
function vnoise(period,seed){ // tileable value noise
  const g=[]; let s=seed|0; const r=()=>{s=(s*1664525+1013904223)|0; return ((s>>>8)&0xffff)/65535};
  for(let i=0;i<period*period;i++)g.push(r());
  return (x,y)=>{ x=((x%period)+period)%period; y=((y%period)+period)%period; const x0=Math.floor(x),y0=Math.floor(y),x1=(x0+1)%period,y1=(y0+1)%period,fx=x-x0,fy=y-y0,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    return lerp(lerp(g[y0*period+x0],g[y0*period+x1],sx),lerp(g[y1*period+x0],g[y1*period+x1],sx),sy) };
}
function fbm(n1,n2,n3){ return (x,y)=>n1(x,y)*.55+n2(x*2,y*2)*.3+n3(x*4,y*4)*.15 }
function mkCanvas(w){const c=document.createElement('canvas'); c.width=c.height=w; return c}
function heightNormal(cv0,strength){ // Sobel normal map from luminance
  const w=cv0.width, x=cv0.getContext('2d'), d=x.getImageData(0,0,w,w).data, h=new Float32Array(w*w);
  for(let i=0;i<w*w;i++)h[i]=(d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11)/255;
  const o=mkCanvas(w), ox=o.getContext('2d'), od=ox.createImageData(w,w), at=(i,j)=>h[((j+w)%w)*w+((i+w)%w)];
  for(let j=0;j<w;j++)for(let i=0;i<w;i++){ const dx=(at(i+1,j-1)+2*at(i+1,j)+at(i+1,j+1))-(at(i-1,j-1)+2*at(i-1,j)+at(i-1,j+1)), dy=(at(i-1,j+1)+2*at(i,j+1)+at(i+1,j+1))-(at(i-1,j-1)+2*at(i,j-1)+at(i+1,j-1));
    let nx=-dx*strength, ny=dy*strength, nz=1, l=Math.hypot(nx,ny,nz); const k=(j*w+i)*4; od.data[k]=(nx/l*.5+.5)*255; od.data[k+1]=(ny/l*.5+.5)*255; od.data[k+2]=(nz/l*.5+.5)*255; od.data[k+3]=255 }
  ox.putImageData(od,0,0); return o;
}
const asTex=(c,rx,ry,srgb=true)=>{const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry); t.anisotropy=renderer.capabilities.getMaxAnisotropy?Math.min(8,renderer.capabilities.getMaxAnisotropy()):4; if(srgb)t.colorSpace=THREE.SRGBColorSpace; return t};
function pavingCanvas(w,base,mossy){ // irregular flagstones, tileable (voronoi on a torus)
  const pts=[]; for(let i=0;i<22;i++)pts.push([Math.random()*w,Math.random()*w,.85+Math.random()*.3]);
  const c=mkCanvas(w), x=c.getContext('2d'), im=x.createImageData(w,w), n1=vnoise(8,3),n2=vnoise(16,5),n3=vnoise(32,9), f=fbm(n1,n2,n3), hm=new Float32Array(w*w);
  for(let j=0;j<w;j++)for(let i=0;i<w;i++){
    let d1=1e9,d2=1e9,id=0; for(let p=0;p<pts.length;p++){ let dx=Math.abs(i-pts[p][0]),dy=Math.abs(j-pts[p][1]); if(dx>w/2)dx=w-dx; if(dy>w/2)dy=w-dy; const d=Math.hypot(dx,dy)/pts[p][2]; if(d<d1){d2=d1;d1=d;id=p}else if(d<d2)d2=d }
    const edge=d2-d1, bevel=Math.min(1,edge/7), nz=f(i/w*8,j/w*8), grain=(Math.random()-.5)*.08, shade=.78+(id%7)*.045+nz*.28+grain;
    const k=(j*w+i)*4, m=edge<2.2?.62:1; // mortar
    let r=base[0]*shade*m,g=base[1]*shade*m,b=base[2]*shade*m;
    if(mossy){const mo=Math.max(0,f(i/w*6+9,j/w*6)-.55)*3.2+(edge<5?.18:0); const q=Math.min(.75,mo*(1-bevel*.5)); r=lerp(r,52,q);g=lerp(g,92,q);b=lerp(b,34,q)}
    im.data[k]=r;im.data[k+1]=g;im.data[k+2]=b;im.data[k+3]=255; hm[j*w+i]=bevel*.6+nz*.4;
  }
  x.putImageData(im,0,0); return c;
}
function groundCanvas(w){
  const c=mkCanvas(w), x=c.getContext('2d'), im=x.createImageData(w,w), f=fbm(vnoise(8,11),vnoise(16,12),vnoise(48,13)), dirt=vnoise(6,21);
  for(let j=0;j<w;j++)for(let i=0;i<w;i++){ const n=f(i/w*8,j/w*8), blade=(Math.sin(i*1.7+n*9)*Math.sin(j*2.3)*.5+.5)*.18, dt=Math.max(0,dirt(i/w*6,j/w*6)-.62)*2.4, k=(j*w+i)*4;
    let r=lerp(52,92,n)+blade*34, g=lerp(84,136,n)+blade*44, b=lerp(34,58,n); r=lerp(r,98,dt);g=lerp(g,84,dt);b=lerp(b,52,dt); im.data[k]=r;im.data[k+1]=g;im.data[k+2]=b;im.data[k+3]=255 }
  x.putImageData(im,0,0); return c;
}
function barkCanvas(w){
  const c=mkCanvas(w), x=c.getContext('2d'), im=x.createImageData(w,w), n1=vnoise(4,31),n2=vnoise(24,32);
  for(let j=0;j<w;j++)for(let i=0;i<w;i++){ const s=n1(i/w*4,j/w*1.5)*.5+n2(i/w*24,j/w*2)*.5, ridge=Math.abs(Math.sin(i/w*Math.PI*14+s*5)), k=(j*w+i)*4, v=.45+ridge*.4+s*.2;
    im.data[k]=190*v;im.data[k+1]=150*v;im.data[k+2]=108*v;im.data[k+3]=255 }
  x.putImageData(im,0,0); return c;
}
function rockCanvas(w){
  const c=mkCanvas(w), x=c.getContext('2d'), im=x.createImageData(w,w), f=fbm(vnoise(6,41),vnoise(14,42),vnoise(40,43)), cr=vnoise(10,44);
  for(let j=0;j<w;j++)for(let i=0;i<w;i++){ const n=f(i/w*6,j/w*6), crack=Math.abs(cr(i/w*10,j/w*10)-.5)<.025?.45:1, v=(.55+n*.6)*crack, k=(j*w+i)*4, mo=Math.max(0,f(i/w*5+7,j/w*5)-.6)*2;
    im.data[k]=lerp(140*v,60,mo);im.data[k+1]=lerp(140*v,100,mo);im.data[k+2]=lerp(132*v,44,mo);im.data[k+3]=255 }
  x.putImageData(im,0,0); return c;
}
function leafCanvas(w){ // transparent leafy branch cluster
  const c=mkCanvas(w), x=c.getContext('2d'); x.clearRect(0,0,w,w);
  for(let i=0;i<70;i++){ const a=Math.random()*6.28, rr=Math.pow(Math.random(),.6)*w*.42, px=w/2+Math.cos(a)*rr, py=w/2+Math.sin(a)*rr, rot=a+(Math.random()-.5)*1.4, L=w*(.12+Math.random()*.08), W=L*.42;
    x.save(); x.translate(px,py); x.rotate(rot); const g=x.createLinearGradient(0,0,L,0), s=Math.random(); g.addColorStop(0,`rgb(${28+s*24},${84+s*44},${24+s*18})`); g.addColorStop(1,`rgb(${52+s*34},${126+s*52},${34+s*22})`);
    x.fillStyle=g; x.beginPath(); x.moveTo(0,0); x.quadraticCurveTo(L*.5,-W,L,0); x.quadraticCurveTo(L*.5,W,0,0); x.fill(); x.strokeStyle='rgba(20,60,16,.55)'; x.lineWidth=1; x.beginPath(); x.moveTo(0,0); x.lineTo(L*.95,0); x.stroke(); x.restore() }
  return c;
}
function cloudCanvas(w){
  const c=mkCanvas(w), x=c.getContext('2d'); for(let i=0;i<26;i++){ const px=w*(.2+Math.random()*.6), py=w*(.4+Math.random()*.2), r=w*(.08+Math.random()*.14), g=x.createRadialGradient(px,py,0,px,py,r); g.addColorStop(0,'rgba(255,255,255,.55)'); g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g; x.fillRect(0,0,w,w) } return c;
}
const pathC=pavingCanvas(512,[196,172,120],true), pathN=heightNormal(pathC,2.6);
const groundC=groundCanvas(512), groundN=heightNormal(groundC,1.6);
const barkC=barkCanvas(256), barkN=heightNormal(barkC,2.2), rockC=rockCanvas(256), rockN=heightNormal(rockC,2.4), leafC=leafCanvas(256);
const S_=(c,rx=1,ry=1)=>asTex(c,rx,ry), N_=(c,rx=1,ry=1)=>asTex(c,rx,ry,false);
const MAT={
  path:new THREE.MeshStandardMaterial({map:S_(pathC,1.8,260/4.8/1.8),normalMap:N_(pathN,1.8,260/4.8/1.8),roughness:.92,normalScale:new THREE.Vector2(1.1,1.1)}),
  ground:new THREE.MeshStandardMaterial({map:S_(groundC,40,40),normalMap:N_(groundN,40,40),roughness:1}),
  bark:new THREE.MeshStandardMaterial({map:S_(barkC),normalMap:N_(barkN),roughness:.95,vertexColors:true}),
  rock:new THREE.MeshStandardMaterial({map:S_(rockC),normalMap:N_(rockN),roughness:.9,vertexColors:true}),
  leaf:new THREE.MeshStandardMaterial({map:S_(leafC),alphaTest:.5,side:THREE.DoubleSide,roughness:.75,vertexColors:true}),
  wood:new THREE.MeshStandardMaterial({map:S_(barkC),normalMap:N_(barkN),roughness:.85,vertexColors:true}),
  gold:new THREE.MeshStandardMaterial({color:0xffc83d,metalness:1,roughness:.22,emissive:0x2a1800}),
  plain:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8}),
  water:new THREE.MeshStandardMaterial({color:0x1b6e8e,roughness:.06,metalness:.15,transparent:true,opacity:.9})
};
// environment lighting from a procedural sky
{ const pm=new THREE.PMREMGenerator(renderer), es=new THREE.Scene(), g=new THREE.SphereGeometry(100,24,16), c=new Float32Array(g.attributes.position.count*3), top=new THREE.Color(0x4f9cdb), hor=new THREE.Color(0xf2ecd6), gr=new THREE.Color(0x4a5a30);
  for(let i=0;i<c.length/3;i++){const y=g.attributes.position.getY(i)/100, col=y>0?hor.clone().lerp(top,Math.pow(y,.6)):hor.clone().lerp(gr,Math.min(1,-y*2)); c[i*3]=col.r;c[i*3+1]=col.g;c[i*3+2]=col.b}
  g.setAttribute('color',new THREE.BufferAttribute(c,3)); es.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide})));
  const sunb=new THREE.Mesh(new THREE.SphereGeometry(8,12,8),new THREE.MeshBasicMaterial({color:0xfff2c0})); sunb.position.set(-50,60,40); es.add(sunb);
  scene.environment=pm.fromScene(es,.02).texture; scene.environmentIntensity=.7; pm.dispose(); }

/* ---- geometry helpers ---- */
function smooth(g){ g=g.clone(); g.deleteAttribute('normal'); g.deleteAttribute('uv'); const m=mergeVertices(g,1e-4); m.computeVertexNormals(); return m }
function noisy(g,amp,freq,seed=1){ // organic displacement (rocks, worn stone)
  g=g.index?g:mergeVertices(g); const p=g.attributes.position, v=new THREE.Vector3(), n=vnoise(16,seed*7+3), n2=vnoise(32,seed*11+5);
  g.computeVertexNormals(); const nr=g.attributes.normal;
  for(let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i); const k=(n(v.x*freq+8,v.y*freq+v.z*freq*.7+8)*.7+n2(v.x*freq*2+4,v.z*freq*2+v.y*freq)*.3-.5)*amp; p.setXYZ(i,v.x+nr.getX(i)*k,v.y+nr.getY(i)*k,v.z+nr.getZ(i)*k) }
  g.computeVertexNormals(); return g;
}
function uvBox(g){ // simple triplanar-ish uv for displaced shapes
  const p=g.attributes.position, uv=new Float32Array(p.count*2); for(let i=0;i<p.count;i++){uv[i*2]=(p.getX(i)+p.getZ(i)*.6)*.35;uv[i*2+1]=(p.getY(i)+p.getZ(i)*.4)*.35} g.setAttribute('uv',new THREE.BufferAttribute(uv,2)); return g;
}
// part: {g, c(color), p,r,s}. Returns geometry (non-indexed, position/normal/uv/color)
function bake({g,c=0xffffff,p=[0,0,0],r=[0,0,0],s=[1,1,1],jit=.05}){
  let geo=g.clone(); if(!geo.attributes.normal)geo.computeVertexNormals();
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p),new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),new THREE.Vector3(...s)));
  if(geo.index)geo=geo.toNonIndexed(); if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));
  const col=new THREE.Color(c), n=geo.attributes.position.count, arr=new Float32Array(n*3); const j=(Math.random()-.5)*jit*2;
  for(let i=0;i<n;i++){arr[i*3]=clamp(col.r+j,0,1);arr[i*3+1]=clamp(col.g+j,0,1);arr[i*3+2]=clamp(col.b+j,0,1)}
  geo.setAttribute('color',new THREE.BufferAttribute(arr,3)); for(const k of Object.keys(geo.attributes)) if(!['position','normal','uv','color'].includes(k))geo.deleteAttribute(k);
  return geo;
}
function build(groups){ // groups: [[material,[parts]],...] -> Mesh factory info
  const geos=groups.map(([,parts])=>mergeGeometries(parts.map(bake),false)); const geo=geos.length>1?mergeGeometries(geos,true):geos[0]; geo.userData.mat=groups.length>1?groups.map(g=>g[0]):groups[0][0]; return geo;
}
function canopy(cx,cy,cz,r,n,tint){ // leaf cards with outward normals
  const pos=[],nor=[],uv=[],idx=[],col=[]; const base=new THREE.Color(tint);
  for(let i=0;i<n;i++){ const d=new THREE.Vector3(Math.random()-.5,Math.random()*.9-.25,Math.random()-.5).normalize(), cen=new THREE.Vector3(cx,cy,cz).addScaledVector(d,r*(.35+Math.random()*.65));
    const u=new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize(), v=new THREE.Vector3().crossVectors(u,d.clone().add(new THREE.Vector3(.2,.5,.1))).normalize(), s=r*(.55+Math.random()*.45);
    const nn=d.clone().add(new THREE.Vector3(0,.35,0)).normalize(), j=.85+Math.random()*.3, k0=pos.length/3;
    for(const [a,b,uu,vv] of [[-1,-1,0,0],[1,-1,1,0],[1,1,1,1],[-1,1,0,1]]){ const q=cen.clone().addScaledVector(u,a*s*.5).addScaledVector(v,b*s*.5); pos.push(q.x,q.y,q.z); nor.push(nn.x,nn.y,nn.z); uv.push(uu,vv); col.push(base.r*j,base.g*j,base.b*j) }
    idx.push(k0,k0+1,k0+2,k0,k0+2,k0+3) }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.setAttribute('color',new THREE.Float32BufferAttribute(col,3)); g.setIndex(idx); return g;
}
const cyl=(a,b,h,n=14)=>new THREE.CylinderGeometry(a,b,h,n,4), box=(w,h,d)=>new THREE.BoxGeometry(w,h,d), ico=(r,d=2)=>new THREE.IcosahedronGeometry(r,d), cone=(r,h,n=10)=>new THREE.ConeGeometry(r,h,n), caps=(r,l)=>new THREE.CapsuleGeometry(r,l,6,14);
const rockG=(r,seed,sy=.8)=>uvBox(noisy(smooth(ico(r,4)),r*.55,.9,seed));

/* ---- props ---- */
const G={};
const trunk=(h,r0,r1,lean=0)=>({g:smooth(cyl(r1,r0,h,12)),c:0xb08a64,p:[lean*.5,h/2,0],r:[0,0,lean*.1]});
G.treeA=build([[MAT.bark,[trunk(6,.55,.28),{g:smooth(cone(.5,1.6,8)),c:0xb08a64,p:[0,.2,0],s:[1.6,.5,1.6]}]],[MAT.leaf,[{g:canopy(0,6.6,0,2.6,34,0x4fae4c)},{g:canopy(.6,8.4,.2,1.9,24,0x66c25a)},{g:canopy(-.8,5.2,.3,1.9,22,0x3d9444)}]]]);
G.treeB=build([[MAT.bark,[trunk(4.6,.5,.26,.5)]],[MAT.leaf,[{g:canopy(.3,5.4,0,3.2,40,0x2f8a42)},{g:canopy(1.3,6.2,.6,2,24,0x4aa850)}]]]);
G.palm=build([[MAT.bark,[{g:smooth(cyl(.2,.34,7.2,10)),c:0xa8845c,p:[.35,3.6,0],r:[0,0,-.1]}]],[MAT.leaf,[...[0,1,2,3,4,5,6].map(i=>{const a=i*.9,p=new THREE.PlaneGeometry(2.8,.9,6,1); p.rotateX(-Math.PI/2); p.translate(1.4,0,0); const pos=p.attributes.position; for(let k=0;k<pos.count;k++){const x=pos.getX(k); pos.setY(k,-x*x*.18)} p.computeVertexNormals(); return {g:p,c:0x4faa4c,p:[.7,7.1,0],r:[0,a,.15]}})]]]);
G.rocks=build([[MAT.rock,[{g:rockG(1.1,2),p:[0,.45,0],s:[1.3,.75,1],c:0xffffff},{g:rockG(.7,3),p:[1.3,.3,.5],c:0xd8d8d0},{g:rockG(.5,4),p:[-1,.22,.9],c:0xe6e6dc}]]]);
G.pillar=build([[MAT.rock,[{g:noisy(smooth(cyl(.9,1.05,6.2,18)),.14,.7,5),p:[0,3.1,0]},{g:noisy(smooth(box(2.5,.7,2.5)),.1,.8,6),p:[0,6.4,0]},{g:noisy(smooth(box(2.3,.5,2.3)),.1,.8,7),p:[0,.25,0]}]],[MAT.leaf,[{g:canopy(.4,5.6,.4,.9,8,0x58b04a)}]]]);
G.bush=build([[MAT.leaf,[{g:canopy(0,.8,0,1.5,26,0x3f9c46)},{g:canopy(.9,.5,.4,.9,12,0x56b455)}]]]);
G.fern=build([[MAT.leaf,[...[0,1,2,3,4,5].map(i=>{const p=new THREE.PlaneGeometry(1.8,.5,5,1); p.rotateX(-Math.PI/2); p.translate(.9,0,0); const pos=p.attributes.position; for(let k=0;k<pos.count;k++){const x=pos.getX(k); pos.setY(k,x*.4-x*x*.32)} p.computeVertexNormals(); return {g:p,c:0x4cb250,p:[0,.1,0],r:[0,i*1.05,0]}})]]]);
G.arch=build([[MAT.rock,[{g:noisy(smooth(cyl(.95,1.15,9,20)),.18,.6,8),p:[-6,4.5,0]},{g:noisy(smooth(cyl(.95,1.15,9,20)),.18,.6,9),p:[6,4.5,0]},{g:noisy(smooth(box(15,1.5,2.1)),.12,.6,10),p:[0,9.5,0]}]],[MAT.gold,[{g:smooth(box(5,.7,2.3)),p:[0,10.6,0]}]],[MAT.leaf,[{g:canopy(-5.6,8.8,.3,1.1,12,0x58b04a)},{g:canopy(4,9.2,.3,1.3,14,0x58b04a)},{g:canopy(-6.3,5,.5,.9,8,0x4aa84c)}]]]);
G.gate=build([[MAT.rock,[{g:noisy(smooth(box(2.2,12,2.6)),.14,.5,11),p:[-7,6,0]},{g:noisy(smooth(box(2.2,12,2.6)),.14,.5,12),p:[7,6,0]},{g:noisy(smooth(box(16.5,2.2,2.8)),.12,.5,13),p:[0,12.2,0]}]],[MAT.gold,[{g:smooth(box(8,1.1,3)),p:[0,13.6,0]},{g:smooth(box(1.6,6,.4)),p:[-4,4,1.4]},{g:smooth(box(1.6,6,.4)),p:[4,4,1.4]}]],[MAT.leaf,[{g:canopy(-6.2,11.5,.5,1.6,16,0x58b04a)},{g:canopy(6.4,11.5,.5,1.6,16,0x58b04a)}]]]);
G.log=build([[MAT.wood,[{g:smooth(cyl(.5,.5,2.3,16)),r:[0,0,Math.PI/2],p:[0,.52,0],c:0xcfa77a},{g:smooth(cyl(.54,.54,.2,16)),r:[0,0,Math.PI/2],p:[-1.1,.52,0],c:0x9a7a52},{g:smooth(cyl(.54,.54,.2,16)),r:[0,0,Math.PI/2],p:[1.1,.52,0],c:0x9a7a52}]],[MAT.leaf,[{g:canopy(.2,.95,0,.5,8,0x4aa84c)}]]]);
G.block=build([[MAT.rock,[{g:noisy(smooth(box(1.9,2.3,1.5)),.16,.9,14),p:[0,1.15,0]}]],[MAT.gold,[{g:smooth(box(.8,.8,.08)),p:[0,1.3,.76]}]],[MAT.leaf,[{g:canopy(.5,2.3,0,.55,8,0x4aa84c)}]]]);
G.beam=build([[MAT.wood,[{g:smooth(cyl(.38,.46,3.8,14)),p:[-4.2,1.9,0],c:0xcfa77a},{g:smooth(cyl(.38,.46,3.8,14)),p:[4.2,1.9,0],c:0xcfa77a},{g:smooth(cyl(.34,.34,9,14)),r:[0,0,Math.PI/2],p:[0,1.7,0],c:0xdbb58a}]],[MAT.leaf,[...[-3,-1.5,0,1.6,3].map((x,i)=>({g:canopy(x,1.2-i%2*.25,.1,.45,6,0x4aa84c)}))]]]);
G.coin=cyl(.42,.42,.09,20).rotateX(Math.PI/2);
const mk=g=>{const m=new THREE.Mesh(g,g.userData.mat||MAT.plain); m.castShadow=true; m.receiveShadow=true; return m};
const coinMat=MAT.gold, shieldMat=new THREE.MeshStandardMaterial({color:0x57c8ff,emissive:0x0a5a8a,roughness:.15,metalness:.2,transparent:true,opacity:.9}), magnetMat=new THREE.MeshStandardMaterial({color:0xff5a6a,emissive:0x7a1018,metalness:.8,roughness:.3});
const waterMat=MAT.water;

/* ---- explorer ---- */
const player=new THREE.Group(), body=new THREE.Group(); player.add(body);
const SM=(c,r=.7,m=0)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
const skin=SM(0xd9a47c,.55), shirt=SM(0x3a6f6a,.85), jacket=SM(0x6a4326,.6), pants=SM(0x7a6a4a,.9), boots=SM(0x2a1a10,.5), hatM=SM(0x8a6238,.75), packM=SM(0x5a3a22,.8), strap=SM(0x2a1a10,.7);
const add=(geo,m,x,y,z,p=body)=>{const me=new THREE.Mesh(geo,m); me.position.set(x,y,z); me.castShadow=true; p.add(me); return me};
add(caps(.27,.34),jacket,0,1.2,0); add(new THREE.SphereGeometry(.2,20,14),skin,0,1.88,0.01).scale.set(1,1.1,1.02); add(new THREE.CylinderGeometry(.09,.1,.14,10),skin,0,1.7,0);
// fedora
{const lp=[];for(let i=0;i<=10;i++)lp.push(new THREE.Vector2(i<4?.2+i*.0:.2-(i-4)*.01+0,i*.018)); const crown=new THREE.Mesh(new THREE.CylinderGeometry(.2,.24,.17,18),hatM); crown.position.set(0,2.07,0); crown.castShadow=true; body.add(crown); const brim=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.025,22),hatM); brim.position.set(0,1.99,0); brim.castShadow=true; body.add(brim); const band=new THREE.Mesh(new THREE.CylinderGeometry(.245,.245,.04,18),strap); band.position.set(0,2.03,0); body.add(band)}
add(caps(.17,.18),packM,0,1.25,.3).scale.set(1.3,1,.8); add(new THREE.CylinderGeometry(.03,.03,.9,6),strap,.1,1.28,.04).rotation.z=.5;
const mkLimb=(r,l,m,x,y,foot)=>{const g=new THREE.Group(); g.position.set(x,y,0); const me=new THREE.Mesh(caps(r,l),m); me.position.y=-(l/2+r); me.castShadow=true; g.add(me); if(foot){const b=new THREE.Mesh(new THREE.BoxGeometry(.2,.14,.32),boots); b.position.set(0,-(l+2*r)+.02,.06); b.castShadow=true; g.add(b)} body.add(g); return g};
const legL=mkLimb(.11,.55,pants,-.15,.84,true), legR=mkLimb(.11,.55,pants,.15,.84,true), armL=mkLimb(.085,.42,shirt,-.37,1.55), armR=mkLimb(.085,.42,shirt,.37,1.55);
const shadow=new THREE.Mesh(new THREE.CircleGeometry(.6,16).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.18,depthWrite:false})); shadow.position.y=.04;
const shieldBub=new THREE.Mesh(ico(1.25,3),new THREE.MeshBasicMaterial({color:0x57c8ff,transparent:true,opacity:.22,depthWrite:false})); shieldBub.position.y=1.1; shieldBub.visible=false;
player.add(shadow,shieldBub); scene.add(player);

/* ---- guardian boulder ---- */
const guardian=new THREE.Group();
const gBody=new THREE.Mesh(uvBox(noisy(smooth(ico(4,4)),1.1,.35,21)),new THREE.MeshStandardMaterial({map:S_(rockC,2,2),normalMap:N_(rockN,2,2),roughness:.92,color:0xb8b2a6})); gBody.position.y=4; gBody.castShadow=true;
const gEyes=[-1,1].map(s=>{const e=new THREE.Mesh(ico(.55,2),new THREE.MeshBasicMaterial({color:0xffb02e})); e.position.set(s*1.4,4.8,3.7); gBody.add(e); return e});
const gRing=new THREE.Mesh(new THREE.TorusGeometry(4.1,.3,10,36),MAT.gold); gRing.position.y=4; gRing.rotation.y=Math.PI/2;
guardian.add(gBody,gRing); guardian.visible=false; scene.add(guardian);

/* ---- world: ground, sky, hills ---- */
const TILE=4.8, PATH_W=8.6, pathTex=MAT.path.map, pathNTex=MAT.path.normalMap;
const path=new THREE.Mesh(new THREE.PlaneGeometry(PATH_W,260),MAT.path); path.rotation.x=-Math.PI/2; path.receiveShadow=true; scene.add(path);
const side=new THREE.Mesh(new THREE.PlaneGeometry(520,520),MAT.ground); side.rotation.x=-Math.PI/2; side.position.y=-.06; side.receiveShadow=true; scene.add(side);
const curbs=[-1,1].map(s=>{const m=new THREE.Mesh(noisy(smooth(new THREE.BoxGeometry(.6,.4,260,3,3,120)),.06,.8,31),new THREE.MeshStandardMaterial({map:S_(rockC,1,60),normalMap:N_(rockN,1,60),roughness:.95})); m.position.set(s*(PATH_W/2+.25),.12,0); m.receiveShadow=true; m.castShadow=true; scene.add(m); return m});
const skyGeo=new THREE.SphereGeometry(450,24,14); {const c=new Float32Array(skyGeo.attributes.position.count*3),top=new THREE.Color(0x3f8fd6),hor=new THREE.Color(0xdfe9e0);
  for(let i=0;i<c.length/3;i++){const y=skyGeo.attributes.position.getY(i)/450, k=Math.pow(clamp(y*1.5,0,1),.7), col=hor.clone().lerp(top,k); c[i*3]=col.r;c[i*3+1]=col.g;c[i*3+2]=col.b} skyGeo.setAttribute('color',new THREE.BufferAttribute(c,3))}
const sky=new THREE.Mesh(skyGeo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false,depthWrite:false,toneMapped:false})); sky.renderOrder=-3; scene.add(sky);
const sunSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:(()=>{const c=mkCanvas(128),x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,252,230,1)');g.addColorStop(.2,'rgba(255,240,190,.75)');g.addColorStop(1,'rgba(255,230,150,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)})(),fog:false,depthWrite:false,transparent:true,toneMapped:false}));
sunSpr.scale.set(150,150,1); sunSpr.renderOrder=-2; scene.add(sunSpr);
const cloudTex=new THREE.CanvasTexture(cloudCanvas(256)); const clouds=new THREE.Group(); for(let i=0;i<10;i++){const c=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudTex,fog:false,depthWrite:false,transparent:true,opacity:.75,toneMapped:false})); c.scale.set(rnd(130,220),rnd(40,70),1); c.position.set(rnd(-320,320),rnd(120,210),-rnd(200,420)); c.renderOrder=-2; clouds.add(c)} scene.add(clouds);
const ridge=new THREE.Group(); {const mats=[0x4a8f68,0x3f8060,0x5aa078].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:1})); for(let i=0;i<40;i++){const a=(i/40)*Math.PI*2,r=rnd(250,320),h=rnd(26,60),m=new THREE.Mesh(noisy(smooth(ico(1,3)),.5,1.2,40+i),mats[i%3]); m.scale.set(rnd(50,95),h,rnd(40,80)); m.position.set(Math.cos(a)*r,-8,Math.sin(a)*r); ridge.add(m)} scene.add(ridge)}
let backdrop=null;
function tryBackdrop(world){
  const im=new Image(); im.onload=()=>{
    const tex=new THREE.Texture(im); tex.colorSpace=THREE.SRGBColorSpace; tex.needsUpdate=true;
    const w=760,h=w*im.height/im.width, m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex,fog:false,depthWrite:false,toneMapped:false}));
    m.renderOrder=-1; m.userData.h=h; backdrop=m; scene.add(m); ridge.visible=false;
  }; im.src='assets/w'+world+'-sky.webp';
}
// OpenAI-generated photographic textures replace the procedural ones when present (same pipeline, no code change)
function tryTexture(name,apply){ const im=new Image(); im.onload=()=>apply(im); im.src='assets/tex-'+name+'.webp' }
function swapMap(mat,im,rx,ry,normalStrength){
  const t=new THREE.Texture(im); t.wrapS=t.wrapT=THREE.MirroredRepeatWrapping; t.repeat.set(rx,ry); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8; t.needsUpdate=true; mat.map=t;
  if(normalStrength){const c=mkCanvas(512), x=c.getContext('2d'); x.drawImage(im,0,0,512,512); const n=new THREE.CanvasTexture(heightNormal(c,normalStrength)); n.wrapS=n.wrapT=THREE.MirroredRepeatWrapping; n.repeat.set(rx,ry); mat.normalMap=n}
  mat.needsUpdate=true;
}
function loadPhotoTextures(){
  tryTexture('path',im=>{swapMap(MAT.path,im,1.8,260/4.8/1.8,2.2); path.material=MAT.path});
  tryTexture('ground',im=>swapMap(MAT.ground,im,30,30,1.4));
  tryTexture('bark',im=>{swapMap(MAT.bark,im,1,2,1.8); swapMap(MAT.wood,im,1,1,1.8)});
  tryTexture('rock',im=>swapMap(MAT.rock,im,1,1,2));
  tryTexture('leaf',im=>{ // the photo has a white background: key it out into an alpha cutout
    const c=mkCanvas(512), x=c.getContext('2d',{willReadFrequently:true}); x.drawImage(im,0,0,512,512); const d=x.getImageData(0,0,512,512), a=d.data;
    for(let i=0;i<a.length;i+=4){ const m=Math.min(a[i],a[i+1],a[i+2]); const al=clamp((238-m)/22,0,1); a[i+3]=al*255; if(al<1){ a[i]=lerp(a[i],40,1-al); a[i+1]=lerp(a[i+1],110,1-al); a[i+2]=lerp(a[i+2],36,1-al) } }
    x.putImageData(d,0,0); const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8; MAT.leaf.map=t; MAT.leaf.needsUpdate=true; });
}

/* ================= game state ================= */
const G0={state:'title',world:1,stage:0,z:0,speed:0,base:0,hp:3,coins:0,spawnedCoins:0,hits:0,inv:0,slow:0,x:0,lane:1,y:0,vy:0,slide:0,shield:0,magnet:0,t:0,shake:0,flash:0,runT:0,gap:22,done:false,buffer:null,bufT:0,hint:0};
const S=Object.assign({},G0);
let props=[],obstacles=[],coinsA=[],pickups=[],pits=[],sceneryZ=0,archZ=0,rowZ=0,finish=null,stageCfg=null;

function resetRun(world,stage){
  for(const o of [...props,...obstacles,...coinsA,...pickups,...pits]) scene.remove(o.mesh);
  props=[];obstacles=[];coinsA=[];pickups=[];pits=[]; if(finish){scene.remove(finish);finish=null}
  Object.assign(S,G0,{state:'play',world,stage}); stageCfg=WORLDS[world-1].stages[stage];
  S.speed=stageCfg.s0; S.base=stageCfg.s0; S.z=0; S.hint=4;
  sceneryZ=20; archZ=-60; rowZ=-48;
  player.position.set(0,0,0); guardian.visible=!!stageCfg.chase; S.gap=22;
  topUp();
}
function addMesh(arr,mesh,z,extra){ scene.add(mesh); const o=Object.assign({mesh,z},extra); arr.push(o); return o }
function topUp(){
  while(sceneryZ>S.z-190){
    const z=sceneryZ; sceneryZ-=rnd(3.5,7);
    for(const s of [-1,1]){
      const r=Math.random(), kind=r<.32?G.treeA:r<.55?G.treeB:r<.68?G.palm:r<.78?G.rocks:r<.9?G.bush:G.fern;
      const m=mk(kind), sc=rnd(.8,1.35); m.scale.setScalar(sc); m.position.set(s*(PATH_W/2+rnd(1.8,16)),0,z+rnd(-2,2)); m.rotation.y=Math.random()*6.28; addMesh(props,m,m.position.z);
    }
    if(Math.random()<.18){const m=mk(G.pillar); const s=pick([-1,1]); m.position.set(s*(PATH_W/2+2.6),0,z); addMesh(props,m,z)}
  }
  while(archZ>S.z-190){ if(S.state!=='play'||archZ>-stageCfg.len+30){const m=mk(G.arch); m.position.set(0,0,archZ); addMesh(props,m,archZ)} archZ-=rnd(70,100) }
  const end=-stageCfg.len;
  while(rowZ>S.z-150&&rowZ>end+20){ genRow(rowZ); const prog=clamp(-S.z/stageCfg.len,0,1), d=clamp(stageCfg.dens+prog*.25,0,1); rowZ-=Math.max(11,(S.base+4)*lerp(1.5,.85,d)) }
  if(S.state==='play'&&!finish&&S.z-150<end){ finish=mk(G.gate); finish.position.set(0,0,end); scene.add(finish) }
}
function coinLine(x,z,n,y=.9,gap=2){ for(let i=0;i<n;i++){ const m=new THREE.Mesh(G.coin,coinMat); m.position.set(x,y,z-i*gap); addMesh(coinsA,m,z-i*gap,{x,y,taken:false}); S.spawnedCoins++ } }
function genRow(z){
  const prog=clamp(-S.z/stageCfg.len,0,1), d=clamp(stageCfg.dens+prog*.25,0,1), r=Math.random();
  if(r<.2){ // beam (slide) across all lanes
    const m=mk(G.beam); m.position.set(0,0,z); addMesh(obstacles,m,z,{type:'beam',x:0,w:9,d:.9,y0:1.15,y1:2.4});
    coinLine(0,z+5,3,.55,1.6);
  }else if(r<.4){ // pit (jump) across all lanes
    const L2=rnd(5,6.5), m=new THREE.Mesh(new THREE.PlaneGeometry(PATH_W-.1,L2),waterMat); m.rotation.x=-Math.PI/2; m.position.set(0,.04,z); addMesh(pits,m,z,{d:L2});
    obstacles.push({mesh:new THREE.Object3D(),z,type:'pit',x:0,w:9,d:L2,y0:-1,y1:.3}); for(let i=0;i<5;i++){ const c=new THREE.Mesh(G.coin,coinMat); const k=i/4; c.position.set(0,.9+Math.sin(k*Math.PI)*1.5,z+L2/2-k*L2); addMesh(coinsA,c,c.position.z,{x:0,y:c.position.y,taken:false}); S.spawnedCoins++ }
  }else{ // per-lane mix of blocks and logs
    const kinds=[0,0,0].map(()=>Math.random()<.5+d*.2?(Math.random()<.5?'block':'log'):null);
    if(kinds.filter(k=>k==='block').length>=3) kinds[1]=null;
    if(!kinds.some(k=>k!=='block')) kinds[pick([0,1,2])]=null;
    kinds.forEach((k,i)=>{ if(!k)return; const m=mk(k==='block'?G.block:G.log); m.position.set(LANES[i],0,z); addMesh(obstacles,m,z,k==='block'?{type:'block',x:LANES[i],w:1.9,d:1.4,y0:0,y1:2.4}:{type:'log',x:LANES[i],w:2.3,d:.9,y0:0,y1:.95}) });
    const free=kinds.map((k,i)=>(!k)?i:-1).filter(i=>i>=0); if(free.length) coinLine(LANES[pick(free)],z+3,5,.9,1.8);
    else { const li=kinds.findIndex(k=>k==='log'); if(li>=0){ for(let i=0;i<4;i++){ const c=new THREE.Mesh(G.coin,coinMat); const kk=i/3; c.position.set(LANES[li],1.1+Math.sin(kk*Math.PI)*1.3,z+2-kk*4); addMesh(coinsA,c,c.position.z,{x:LANES[li],y:c.position.y,taken:false}); S.spawnedCoins++ } } }
    if(Math.random()<.12){ const li=kinds.findIndex(k=>!k); if(li>=0){ const sh=Math.random()<.6, m=new THREE.Mesh(sh?ico(.5,0):new THREE.TorusGeometry(.4,.16,6,10),sh?shieldMat:magnetMat); m.position.set(LANES[li],1,z+6); addMesh(pickups,m,z+6,{x:LANES[li],kind:sh?'shield':'magnet'}) } }
  }
}

/* ================= input ================= */
const keys={}; let swipe=null;
function act(a){
  if(S.state!=='play')return;
  S.buffer=a; S.bufT=.18;
}
function doAction(a){
  if(a==='left'&&S.lane>0){S.lane--; A.sfx('ui')}
  else if(a==='right'&&S.lane<2){S.lane++; A.sfx('ui')}
  else if(a==='jump'&&S.y<.15){S.vy=11.8; S.slide=0; A.sfx('jump')}
  else if(a==='slide'){ if(S.y>.15) S.vy=-15; else {S.slide=.75; A.sfx('slide')} }
  else return false; return true;
}
addEventListener('keydown',e=>{
  if(keys[e.code])return; keys[e.code]=1; A.init();
  const m={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'jump',KeyW:'jump',Space:'jump',ArrowDown:'slide',KeyS:'slide'}[e.code];
  if(m&&!(e.target&&/^(BUTTON|SELECT)$/.test(e.target.tagName))){ e.preventDefault(); act(m) }
  if(e.code==='KeyP'||e.code==='Escape'){ if(S.state==='play')pauseGame(); else if(S.state==='pause')resumeGame() }
  if(e.code==='KeyM')muteBtn();
});
addEventListener('keyup',e=>{keys[e.code]=0});
cv.addEventListener('pointerdown',e=>{A.init(); swipe={x:e.clientX,y:e.clientY,id:e.pointerId}; try{cv.setPointerCapture(e.pointerId)}catch(_){}});
cv.addEventListener('pointermove',e=>{
  if(!swipe||e.pointerId!==swipe.id)return; const dx=e.clientX-swipe.x, dy=e.clientY-swipe.y, TH=26;
  if(Math.abs(dx)>=TH&&Math.abs(dx)>Math.abs(dy)){act(dx>0?'right':'left'); swipe.x=e.clientX; swipe.y=e.clientY}
  else if(dy<=-TH&&Math.abs(dy)>Math.abs(dx)){act('jump'); swipe.x=e.clientX; swipe.y=e.clientY}
  else if(dy>=TH&&Math.abs(dy)>Math.abs(dx)){act('slide'); swipe.x=e.clientX; swipe.y=e.clientY}
});
const endSw=e=>{if(swipe&&e.pointerId===swipe.id)swipe=null};
cv.addEventListener('pointerup',endSw); cv.addEventListener('pointercancel',endSw);
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('blur',()=>{if(S.state==='play')pauseGame()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&S.state==='play')pauseGame()});

/* ================= update ================= */
const aabb=(o)=>{ // hit test against player
  const px=player.position.x, py=S.y, top=S.slide>0?py+.85:py+1.8;
  if(Math.abs(px-o.x)>o.w/2+.35)return false;
  if(Math.abs(S.z-o.z)>o.d/2+.3)return false;
  return top>o.y0&&py<o.y1;
};
function hurt(kind){
  if(S.inv>0)return;
  if(S.shield>0){S.shield=0; S.inv=1; A.sfx('shield'); return}
  S.hp--; S.hits++; S.inv=1.5; S.slow=1.2; S.shake=.5; S.flash=.35; A.sfx('hit');
  if(S.hp<=0) endRun(false);
}
function update(dt){
  S.t+=dt; S.runT+=dt;
  const prog=clamp(-S.z/stageCfg.len,0,1);
  S.base=lerp(stageCfg.s0,stageCfg.s1,prog);
  S.slow=Math.max(0,S.slow-dt); S.inv=Math.max(0,S.inv-dt); S.shield=Math.max(0,S.shield); S.magnet=Math.max(0,S.magnet-dt); S.hint=Math.max(0,S.hint-dt);
  const goal=S.base*(S.slow>0?.62:1); S.speed+=(goal-S.speed)*Math.min(1,dt*3);
  S.z-=S.speed*dt;
  if(S.bufT>0){S.bufT-=dt; if(S.buffer&&doAction(S.buffer)){S.buffer=null}} else S.buffer=null;
  // vertical
  if(S.y>0||S.vy>0){S.vy-=32*dt; S.y+=S.vy*dt; if(S.y<=0){S.y=0;S.vy=0}}
  if(S.slide>0)S.slide-=dt;
  const tx=LANES[S.lane]; player.position.x+=(tx-player.position.x)*Math.min(1,dt*13); player.position.z=S.z; player.position.y=S.y;
  // anim
  const run=S.runT*S.speed*.55, air=S.y>.1;
  const sw=air?0:Math.sin(run)*.9; legL.rotation.x=air?-.7:sw; legR.rotation.x=air?.5:-sw; armL.rotation.x=air?-2.4:-sw*.9; armR.rotation.x=air?-2.2:sw*.9;
  body.position.y=air?0:Math.abs(Math.sin(run))*.07; body.rotation.x=S.slide>0?-1.15:.12; body.position.z=S.slide>0?.15:0; body.position.y+=S.slide>0?-.15:0;
  body.rotation.z=clamp((tx-player.position.x)*-.18,-.35,.35);
  player.visible=S.inv>0?((S.t*18)|0)%2===0:true;
  shieldBub.visible=S.shield>0; shadow.scale.setScalar(clamp(1-S.y*.2,.5,1));
  // guardian
  if(stageCfg.chase){ const want=6+S.hp*5; S.shake=Math.max(S.shake,S.hp===1?.22:S.hp===2?.08:0); S.gap+=(want-S.gap)*Math.min(1,dt*2.5); guardian.position.set(0,0,S.z+S.gap+4); gBody.rotation.x-=S.speed*dt/4; gRing.rotation.x=gBody.rotation.x; gEyes.forEach(e=>e.scale.setScalar(1+Math.sin(S.t*8)*.15)) }
  // world follow
  path.position.z=S.z-60; pathTex.offset.y=(S.z/TILE)%1; side.position.set(0,-.06,S.z); curbs.forEach(c=>c.position.z=S.z-60); sky.position.set(0,0,S.z); ridge.position.set(0,0,S.z); sunSpr.position.set(60,110,S.z-380);
  if(backdrop){ backdrop.position.set(0,backdrop.userData.h*.32+18,S.z-330) }
  sun.position.set(-8,14,S.z+6); sun.target.position.set(0,0,S.z-6);
  topUp();
  // collisions
  for(const o of obstacles){ if(o.hit)continue; if(aabb(o)){o.hit=true; hurt(o.type)} }
  for(const c of coinsA){ if(c.taken)continue; const dz=Math.abs(c.z-S.z), mag=S.magnet>0&&dz<10&&Math.abs(c.x-player.position.x)<6;
    if(mag){ c.mesh.position.x+=(player.position.x-c.mesh.position.x)*Math.min(1,dt*9); c.mesh.position.y+=(S.y+1-c.mesh.position.y)*Math.min(1,dt*9); c.z+=(S.z-c.z)*Math.min(1,dt*9); c.mesh.position.z=c.z; c.x=c.mesh.position.x; c.y=c.mesh.position.y }
    if(dz<.9&&Math.abs(c.x-player.position.x)<.8&&Math.abs(c.y-(S.y+.9))<1.3){ c.taken=true; c.mesh.visible=false; S.coins++; A.sfx('coin') }
    else c.mesh.rotation.y=S.t*4 }
  for(const p of pickups){ if(p.taken)continue; p.mesh.rotation.y=S.t*3; p.mesh.position.y=1+Math.sin(S.t*4)*.15;
    if(Math.abs(p.z-S.z)<1&&Math.abs(p.x-player.position.x)<.9&&S.y<1.6){ p.taken=true; p.mesh.visible=false; A.sfx('pick'); if(p.kind==='shield')S.shield=1; else S.magnet=8 } }
  recycle();
  // finish
  if(S.z<=-stageCfg.len&&S.state==='play') endRun(true);
  S.shake=Math.max(0,S.shake-dt*1.8); S.flash=Math.max(0,S.flash-dt);
}
function recycle(){ const cut=S.z+48; for(const arr of [props,obstacles,coinsA,pickups,pits]){ for(let i=arr.length-1;i>=0;i--){ if(arr[i].z>cut+(arr[i].d||0)){ scene.remove(arr[i].mesh); arr.splice(i,1) } } } }
function camUpdate(){
  const portrait=innerHeight>innerWidth*1.02, px=player.position.x;
  const d=portrait?10.5:7.6, h=portrait?5.8:4.3, look=portrait?-9:-8;
  const sk=S.shake*.25, sx=(Math.random()-.5)*sk, sy=(Math.random()-.5)*sk;
  cam.position.set(px*.55+sx,h+sy+(S.y*.35),S.z+d); cam.lookAt(px*.35,1.6,S.z+look);
}

/* ================= UI ================= */
const ov=$('#ov'), hud=$('#hud');
function showOv(h){ov.innerHTML=h; ov.classList.add('on'); ov.dir=L==='ar'?'rtl':'ltr'; const b=ov.querySelector('button'); if(b)try{b.focus({preventScroll:true})}catch(e){}}
function hideOv(){ov.classList.remove('on'); ov.innerHTML=''}
const BACK=()=>`<a class="btn ghost" href="../../${L}/">${L==='ar'?'→':'←'} ${t('back')}</a>`;
const starStr=n=>'★'.repeat(n)+'☆'.repeat(3-n);
function showTitle(){
  S.state='title'; document.body.classList.remove('playing'); A.music=false; guardian.visible=false;
  const sel=`<select class="lang" aria-label="${t('lang')}">${LANGS.map(l=>`<option value="${l}"${l===L?' selected':''}>${LNAME[l]}</option>`).join('')}</select>`;
  const worlds=WORLDS.map((w,i)=>{
    if(i>0) return `<div class="world locked"><span class="wn">${t('w'+w.id)}</span><span class="ws">${t('soon')}</span></div>`;
    const st=w.stages.map((s,k)=>{const un=SAVE.unlocked>k; const sc=SAVE.stars['1-'+k]||0; return `<button class="stg" data-a="stage" data-s="${k}" ${un?'':'disabled'}><b>${t('stage',k+1)}</b><span>${un?starStr(sc):'🔒'}</span></button>`}).join('');
    return `<div class="world open"><span class="wn">${t('w1')}</span><div class="stgs">${st}</div></div>`;
  }).join('');
  showOv(`<div class="card"><div class="top"><p class="eyebrow">${t('eyebrow')}</p>${sel}</div>
   <h1>Relic <em>Run</em></h1><div class="stripe"></div><p>${t('tag')}</p>
   <p class="how">${TOUCH?t('howT'):t('howK')}</p>
   <div class="worlds">${worlds}</div>
   <div class="row"><button class="btn" data-a="play">${t('play')}</button>${BACK()}</div>
   <p class="note">${t('credit')}${SAVE.coins?` ${t('coins')}: ${SAVE.coins}`:''}</p></div>`);
}
function startStage(world,stage){
  A.init(); hideOv(); resetRun(world,stage); document.body.classList.add('playing'); document.body.classList.toggle('chase',!!stageCfg.chase); A.music=true; A.sfx('ui'); updateHud(true); toastMsg(t('go'),900);
}
function pauseGame(){ if(S.state!=='play')return; S.state='pause'; A.music=false;
  showOv(`<div class="card"><p class="eyebrow">${t('stage',S.stage+1)}</p><h2>${t('paused')}</h2><div class="stripe"></div><div class="row"><button class="btn" data-a="resume">${t('resume')}</button><button class="btn ghost" data-a="restart">${t('restart')}</button><button class="btn ghost" data-a="menu">${t('menu')}</button></div></div>`);
}
function resumeGame(){ if(S.state!=='pause')return; hideOv(); S.state='play'; A.music=true; A.init() }
function endRun(win){
  S.state=win?'win':'over'; A.music=false; A.sfx(win?'win':'over'); document.body.classList.remove('playing');
  const dist=Math.round(clamp(-S.z,0,stageCfg.len)), score=dist+S.coins*10, key='1-'+S.stage;
  SAVE.coins+=S.coins; if(score>(SAVE.best[key]||0))SAVE.best[key]=score;
  if(win){ const stars=1+(S.hits===0?1:0)+(S.coins>=.7*S.spawnedCoins?1:0); if(stars>(SAVE.stars[key]||0))SAVE.stars[key]=stars; if(S.stage+1<3&&SAVE.unlocked<S.stage+2)SAVE.unlocked=S.stage+2; save();
    const last=S.stage>=2;
    showOv(`<div class="card"><p class="eyebrow">${t('w1')} · ${t('stage',S.stage+1)}</p><h2>${last?t('wdone'):t('cleared',S.stage+1)}</h2><div class="stripe"></div>
     <div class="big stars">${starStr(stars)}</div><div class="stat"><div><small>${t('coins')}</small>${S.coins}</div><div><small>${t('score')}</small>${score}</div><div><small>${t('best')}</small>${SAVE.best[key]}</div></div>
     ${last?`<p>${t('finale')}</p>`:''}<div class="row">${last?'':`<button class="btn" data-a="next">${t('next')}</button>`}<button class="btn ghost" data-a="restart">${t('retry')}</button><button class="btn ghost" data-a="menu">${t('menu')}</button></div></div>`);
  }else{ save();
    showOv(`<div class="card"><p class="eyebrow">${t('lost')}</p><h2>${t('failed')}</h2><div class="stripe"></div>
     <div class="stat"><div><small>${t('dist')}</small>${dist} / ${stageCfg.len}</div><div><small>${t('coins')}</small>${S.coins}</div><div><small>${t('best')}</small>${SAVE.best[key]}</div></div>
     <div class="row"><button class="btn" data-a="restart">${t('retry')}</button><button class="btn ghost" data-a="menu">${t('menu')}</button></div></div>`);
  }
}
ov.addEventListener('click',e=>{const b=e.target.closest('[data-a]'); if(!b||b.disabled)return; A.init(); const a=b.dataset.a;
  if(a==='play') startStage(1,Math.min(2,SAVE.unlocked-1));
  else if(a==='stage') startStage(1,+b.dataset.s);
  else if(a==='resume') resumeGame();
  else if(a==='restart') startStage(S.world,S.stage);
  else if(a==='next') startStage(S.world,S.stage+1);
  else if(a==='menu') showTitle();
});
ov.addEventListener('change',e=>{if(e.target.classList&&e.target.classList.contains('lang')){setLang(e.target.value); showTitle()}});
function muteBtn(){A.init(); const m=A.toggle(); $('#bMute').textContent=m?'×':'♪'; $('#bMute').style.opacity=m?.5:1}
$('#bMute').addEventListener('click',muteBtn); $('#bPause').addEventListener('click',()=>{if(S.state==='play')pauseGame()});
/* HUD */
const H={hp:-1,coins:-1,prog:-1,sh:-1,mg:-1};
function toastMsg(m,ms){const e=$('#toast'); e.textContent=m; e.className='on'; setTimeout(()=>e.classList.remove('on'),ms||1200)}
function updateHud(force){
  if(force){H.hp=H.coins=H.prog=-1}
  if(S.hp!==H.hp){H.hp=S.hp; $('#hp').innerHTML=[0,1,2].map(i=>`<span class="heart${i<S.hp?'':' off'}">♥</span>`).join('')}
  if(S.coins!==H.coins){H.coins=S.coins; $('#coins').textContent=S.coins}
  const p=Math.round(clamp(-S.z/stageCfg.len,0,1)*100); if(p!==H.prog){H.prog=p; $('#bar i').style.width=p+'%'}
  const pw=(S.shield>0?t('shield')+' ':'')+(S.magnet>0?t('magnet')+' '+Math.ceil(S.magnet):''); const pe=$('#pw'); if(pe.textContent!==pw)pe.textContent=pw;
  $('#hint').style.opacity=S.hint>0?1:0; $('#flash').style.opacity=S.flash>0?S.flash*1.4:0;
  $('#stg').textContent=stageCfg.chase?t('guard'):t('stage',S.stage+1);
}
function setLang(l){ L=l; try{localStorage.setItem('rr-lang',l)}catch(e){}; applyLang() }
function applyLang(){ document.documentElement.lang=L; $('#bPause').setAttribute('aria-label',t('pause')); $('#bMute').setAttribute('aria-label',t('sound')); $('#hint').textContent=TOUCH?t('hintT'):t('hintK') }
function initLang(){ let l=null; try{l=new URLSearchParams(location.search).get('lang')}catch(e){} if(!LANGS.includes(l)){try{l=localStorage.getItem('rr-lang')}catch(e){}} if(!LANGS.includes(l))l=((navigator.language||'en')+'').slice(0,2).toLowerCase(); if(!LANGS.includes(l))l='en'; setLang(l) }

/* ================= loop ================= */
function resize(){ const w=innerWidth,h=innerHeight; renderer.setSize(w,h,false); cam.aspect=w/h; const portrait=h>w*1.02; cam.fov=portrait?66:58; cam.updateProjectionMatrix() }
addEventListener('resize',resize); addEventListener('orientationchange',()=>setTimeout(resize,120));
let last=0;
function frame(ts){
  requestAnimationFrame(frame);
  const dt=Math.min(.05,(ts-last)/1000||0); last=ts;
  if(S.state==='play'){update(dt); updateHud()}
  else if(S.state==='title'){ S.t+=dt; S.z-=dt*6; player.position.set(0,0,S.z); const run=S.t*6; legL.rotation.x=Math.sin(run)*.9;legR.rotation.x=-Math.sin(run)*.9;armL.rotation.x=-Math.sin(run)*.8;armR.rotation.x=Math.sin(run)*.8; path.position.z=S.z-60; pathTex.offset.y=(S.z/TILE)%1; side.position.z=S.z; curbs.forEach(c=>c.position.z=S.z-60); sky.position.z=S.z; ridge.position.z=S.z; sunSpr.position.set(60,110,S.z-380); if(backdrop)backdrop.position.set(0,backdrop.userData.h*.32+18,S.z-330); topUp(); recycle(); cam.position.set(2.6,2.8,S.z+6); cam.lookAt(0,1.4,S.z-4) }
  if(S.state!=='title') camUpdate();
  renderer.render(scene,cam);
  if(stageCfg&&stageCfg.chase&&(S.state==='play'||S.state==='pause')&&document.body.classList.contains('playing')) renderMirror();
}
function renderMirror(){
  const r=$('#mirror').getBoundingClientRect(); if(!r.width)return; const w=innerWidth,h=innerHeight;
  renderer.setScissorTest(true); renderer.setViewport(r.left,h-r.bottom,r.width,r.height); renderer.setScissor(r.left,h-r.bottom,r.width,r.height);
  cam2.aspect=r.width/r.height; cam2.updateProjectionMatrix(); cam2.position.set(player.position.x*.3,3,S.z+.4); cam2.lookAt(0,3.4,S.z+40);
  const pv=player.visible; player.visible=false; renderer.render(scene,cam2); player.visible=pv;
  renderer.setScissorTest(false); renderer.setViewport(0,0,w,h);
}
function boot(){
  initLang(); resize(); scene.fog=new THREE.Fog(WORLDS[0].fog,45,200); renderer.setClearColor(WORLDS[0].horizon);
  stageCfg=WORLDS[0].stages[0]; S.world=1; sceneryZ=20; archZ=-80; rowZ=-9999; S.z=0; S.state='title'; topUp();
  tryBackdrop(1); loadPhotoTextures();
  const bi=new Image(); bi.onload=()=>document.documentElement.style.setProperty('--title-img',`url(assets/title.webp)`); bi.src='assets/title.webp';
  showTitle(); requestAnimationFrame(frame);
}
window.__rr={S,SAVE,startStage,endRun,act,get stageCfg(){return stageCfg},get obstacles(){return obstacles}};
boot();
