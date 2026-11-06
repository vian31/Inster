"use strict";
const DAY=864e5,MO=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const n=s=>{const[a,b,c]=s.split("-").map(Number);return Date.UTC(a,b-1,c)/DAY};
const iso=d=>new Date(d*DAY).toISOString().slice(0,10);
const dt=d=>new Date(d*DAY);
const dm=d=>{const x=dt(d);return x.getUTCDate()+" "+MO[x.getUTCMonth()]};
const JOURS=["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const f=(v,d=0)=>Number(v).toLocaleString("fr-FR",{minimumFractionDigits:d,maximumFractionDigits:d});
const $=s=>document.querySelector(s);
const uid=()=>Math.random().toString(36).slice(2,9);
const KEY="inster-compteur-v1";
const localToday=()=>{const x=new Date();return Date.UTC(x.getFullYear(),x.getMonth(),x.getDate())/DAY};

function fresh(){return{set:{start:"2026-11-05",months:36,limit:15000,dw:6,dy:300,odo0:0,tarif:"base",prices:{base:.2001,hp:.2142,hc:.1589},diesel:{conso:7.5,prices:[{from:"2026-11-05",price:2.385}]},cap:42,soc0:null},readings:[],charges:[]}}
let S;try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){S=null}
if(!S||!S.set)S=fresh();
if(!(S.set.cap>0))S.set.cap=42;if(!(S.set.dw>0))S.set.dw=6;if(!(S.set.dy>0))S.set.dy=300;if(S.set.soc0===undefined)S.set.soc0=null;
const dieselAt=d=>{const P=S.set.diesel.prices;let p=P[0].price;for(const x of P)if(n(x.from)<=d)p=x.price;return p*S.set.diesel.conso};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){toast("Enregistrement impossible : le navigateur refuse le stockage. Exporte tes données.")}};
let tab="bilan",range=13,formKind="charge",pieMode="kwh",scale="w";
/* brouillon de recharge : survit à la fermeture de l'app */
const DKEY="inster-brouillon-recharge",DF=["cDate","cOdo","cSocA","cSocB","cKwh","cPlace","cAmps","cPrice"];
const getDraft=()=>{try{return JSON.parse(localStorage.getItem(DKEY))}catch(e){return null}};
const saveDraft=()=>{const o={};let any=false;DF.forEach(id=>{const e=document.getElementById(id);if(e){o[id]=e.value;if(["cOdo","cSocA","cSocB","cKwh"].includes(id)&&e.value.trim())any=true}});try{any?localStorage.setItem(DKEY,JSON.stringify(o)):localStorage.removeItem(DKEY)}catch(e){}};
const clearDraft=()=>{try{localStorage.removeItem(DKEY)}catch(e){}};

/* ---- Calculs ---- */
function model(){
  const st=S.set,start=n(st.start),today=localToday();
  const end=(()=>{const x=dt(start);return Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+ +st.months,x.getUTCDate())/DAY})();
  const vis=r=>n(r.date)<=today;
  const reads=S.readings.filter(vis).sort((a,b)=>a.date<b.date?-1:1);
  const chs=S.charges.filter(vis).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.odo||0)-(b.odo||0));
  /* compteur : relevés + recharges où le compteur est noté */
  const byDay={};[...reads.map(r=>r),...chs.filter(c=>c.odo!=null)].forEach(x=>{byDay[x.date]=Math.max(byDay[x.date]??0,x.odo)});
  const odoList=Object.keys(byDay).sort().map(k=>({date:k,odo:byDay[k]}));
  const pts=[{d:start,o:+st.odo0},...odoList.map(r=>({d:n(r.date),o:r.odo}))];
  const odoAt=d=>{if(d<=pts[0].d)return pts[0].o;for(let i=1;i<pts.length;i++)if(d<=pts[i].d){const a=pts[i-1],b=pts[i];return a.o+(b.o-a.o)*(d-a.d)/Math.max(1,b.d-a.d)}return pts[pts.length-1].o};
  const last=pts[pts.length-1];
  const cap=st.limit*st.months/12,total=end-start,kmDay=st.limit/st.dy,wk=kmDay*st.dw,mq=st.limit/12;
  const driven=last.o-st.odo0;
  const elapsedL=Math.max(1,last.d-start);
  const theoL=cap*elapsedL/total;
  const proj=odoList.length&&elapsedL>=14?driven/elapsedL*total:null;
  /* semaines lun-dim */
  const weeks=[];
  let sun=start+((7-dt(start).getUTCDay())%7);
  for(;sun<=last.d&&odoList.length;sun+=7){weeks.push({d:sun,km:odoAt(sun)-odoAt(sun-7)})}
  /* énergie batterie (% × capacité) */
  const bcap=+st.cap||42;
  const soc=chs.filter(c=>c.socA!=null&&c.socB!=null&&c.socB>c.socA).map(c=>({...c,eb:(c.socB-c.socA)/100*bcap,r:(c.socB-c.socA)/100*bcap/c.kwh}));
  const ampsMap={};soc.forEach(c=>{const k=c.place==="ext"?"Borne":c.amps+" A";const g=ampsMap[k]||(ampsMap[k]={k,a:c.place==="ext"?999:c.amps,nb:0,kwh:0,eb:0,last:null});g.nb++;g.kwh+=c.kwh;g.eb+=c.eb;g.last=c.r});
  const byAmps=Object.values(ampsMap).sort((x,y)=>x.a-y.a);
  const Kb=soc.reduce((s,c)=>s+c.kwh,0),Eb=soc.reduce((s,c)=>s+c.eb,0),rendG=Kb?Eb/Kb:null;
  /* conso voiture entre deux recharges : fin de l'une -> début de la suivante */
  const segs=[];let prevEnd=st.soc0!=null?{soc:+st.soc0,odo:+st.odo0,date:st.start}:null;
  chs.forEach(c=>{
    if(prevEnd&&c.socA!=null&&c.odo!=null){const km=c.odo-prevEnd.odo,e=(prevEnd.soc-c.socA)/100*bcap;
      if(km>=15&&e>0)segs.push({date:c.date,from:prevEnd.date,km,e,c:e/km*100})}
    prevEnd=c.socB!=null&&c.odo!=null?{soc:c.socB,odo:c.odo,date:c.date}:null});
  const segKm=segs.reduce((s,x)=>s+x.km,0),segAvg=segKm?segs.reduce((s,x)=>s+x.e,0)/segKm*100:null;
  /* cumul */
  const cumul=weeks.map(w=>({d:w.d,real:odoAt(w.d)-st.odo0,theo:cap*(w.d-start)/total}));
  /* mois */
  const months=[];const t0=dt(start);let y=t0.getUTCFullYear(),m=t0.getUTCMonth();
  for(;;){
    const a=Date.UTC(y,m,1)/DAY,b=Date.UTC(y,m+1,0)/DAY;
    if(a>last.d)break;
    const km=odoAt(b)-odoAt(a-1);
    const cs=chs.filter(c=>{const d=n(c.date);return d>=a&&d<=b&&d<=last.d});
    const kwh=cs.reduce((s,c)=>s+c.kwh,0),cost=cs.reduce((s,c)=>s+c.kwh*c.price,0);
    let wc=0,wk2=0;segs.forEach(x=>{const d=n(x.date);if(d>=a&&d<=b){wc+=x.e*100;wk2+=x.km}});if(!wk2)reads.forEach((r,i)=>{const d=n(r.date);if(d>=a&&d<=b&&r.conso){const k=r.odo-(i?reads[i-1].odo:st.odo0);wc+=r.conso*k;wk2+=k}});
    let dcost=0;for(let d=a;d<=b;d++){const k=odoAt(d)-odoAt(d-1);if(k>0)dcost+=k*dieselAt(d)/100}
    months.push({dcost,ref:km>=50?dcost/km*100:null,label:MO[m],y,km,kwh,cost,prise:km>=50&&kwh?kwh/km*100:null,euro:km>=50&&kwh?cost/km*100:null,car:wk2?wc/wk2:null});
    m++;if(m>11){m=0;y++}
  }
  /* mois en cours */
  const td=dt(today),a=Date.UTC(td.getUTCFullYear(),td.getUTCMonth(),1)/DAY,b=Date.UTC(td.getUTCFullYear(),td.getUTCMonth()+1,0)/DAY;
  const from=Math.max(a,start),span=b-from+1,quota=mq*span/(b-a+1);
  const L=Math.min(last.d,today);const prog=L<from?0:(L-from+1)/span;
  const used=L<from?0:odoAt(L)-odoAt(from-1);
  const theoUsed=quota*prog;
  /* année de contrat */
  const yi=Math.max(0,Math.floor((today-start)/365.25)),ya=start+Math.round(yi*365.25);
  const yearKm=last.o-odoAt(ya);
  /* totaux */
  const cl=chs.filter(c=>n(c.date)<=last.d),K=cl.reduce((s,c)=>s+c.kwh,0),E=cl.reduce((s,c)=>s+c.kwh*c.price,0);
  const withC=reads.map((r,i)=>({k:r.odo-(i?reads[i-1].odo:st.odo0),c:r.conso})).filter(x=>x.c);
  const carAvg=segAvg!=null?segAvg:withC.length?withC.reduce((s,x)=>s+x.k*x.c,0)/withC.reduce((s,x)=>s+x.k,0):null;
  /* rappel */
  const dow=td.getUTCDay(),mon=today-((dow+6)%7);
  const wUsed=Math.max(0,odoAt(L)-odoAt(Math.max(mon-1,start)));
  const has=odoList.some(r=>n(r.date)>=mon);
  const firstSun=start+((7-dt(start).getUTCDay())%7);
  const notif=dow===0&&!has;
  const late=!notif&&today>firstSun&&!odoList.some(r=>n(r.date)>=mon-7);
  const dieselTotal=months.reduce((x,o)=>x+o.dcost,0);
  const sp=pl=>{const a=chs.filter(c=>c.place===pl);return{nb:a.length,kwh:a.reduce((s,c)=>s+c.kwh,0),eur:a.reduce((s,c)=>s+c.kwh*c.price,0)}};
  const split={dom:sp("dom"),ext:sp("ext")};
  return{kmDay,wUsed,split,odoList,byAmps,rendG,Kb,Eb,segs,segAvg,bcap,dieselTotal,st,start,today,end,reads,chs,odoAt,last,cap,total,wk,mq,driven,theoL,proj,weeks,cumul,months,quota,used,theoUsed,prog,L,yi,yearKm,K,E,carAvg,notif,late,mon,elapsedL};
}

/* ---- Graphiques ---- */
const nice=v=>{const p=Math.pow(10,Math.floor(Math.log10(v||1))),x=v/p;return(x<=1?1:x<=2?2:x<=2.5?2.5:x<=5?5:x<=7.5?7.5:10)*p};
function tooltips(host,svg,W,items,xOf,cross){
  const tip=document.createElement("div");tip.className="tip";tip.hidden=true;host.append(tip);
  const show=e=>{const r=svg.getBoundingClientRect();const x=(e.clientX-r.left)*W/r.width;
    let bi=0,bd=1e9;items.forEach((_,i)=>{const dd=Math.abs(xOf(i)-x);if(dd<bd){bd=dd;bi=i}});
    tip.innerHTML=items[bi].tip;tip.hidden=false;
    const tw=tip.offsetWidth;const px=xOf(bi)*r.width/W;tip.style.left=Math.max(0,Math.min(r.width-tw,px-tw/2))+"px";
    if(cross){cross.setAttribute("x1",xOf(bi));cross.setAttribute("x2",xOf(bi));cross.style.display=""}};
  const hide=()=>{tip.hidden=true;if(cross)cross.style.display="none"};
  svg.addEventListener("pointermove",show);svg.addEventListener("pointerdown",show);svg.addEventListener("pointerleave",hide);
}
function axis(W,H,ml,mr,mt,mb,yMax,yMin,fmt){
  let s="";const ys=v=>mt+(H-mt-mb)*(1-(v-yMin)/(yMax-yMin));
  for(let i=0;i<=2;i++){const v=yMin+(yMax-yMin)*i/2;s+=`<line class="gridl" x1="${ml}" x2="${W-mr}" y1="${ys(v)}" y2="${ys(v)}"/><text x="${ml-5}" y="${ys(v)+4}" text-anchor="end">${fmt(v)}</text>`}
  return{s,ys};
}
function bars(host,o){
  host.innerHTML="";const W=Math.max(280,host.clientWidth||320),H=190,ml=44,mr=8,mt=14,mb=22;
  const it=o.items;if(!it.length){host.innerHTML=`<p class="muted small">${o.empty}</p>`;return}
  const yMax=nice(Math.max(...it.map(i=>Math.max(i.v,i.ref||0)),o.target||0)*1.05);
  const{s:ax,ys}=axis(W,H,ml,mr,mt,mb,yMax,0,v=>f(v,o.dec||0));
  const band=(W-ml-mr)/it.length,bw=Math.max(2,Math.min(o.bw||22,band-2));
  const xOf=i=>ml+band*i+band/2;
  let s=ax,step=Math.ceil(it.length/6);
  it.forEach((d,i)=>{const y=ys(d.v),h=H-mb-y,x=xOf(i)-bw/2,r=Math.min(4,h,bw/2);
    if(h>0.5)s+=`<path fill="${d.hi?"var(--s2)":"var(--s1)"}" d="M${x} ${y+h}V${y+r}Q${x} ${y} ${x+r} ${y}H${x+bw-r}Q${x+bw} ${y} ${x+bw} ${y+r}V${y+h}Z"/>`;
    if((it.length-1-i)%step===0)s+=`<text x="${xOf(i)}" y="${H-6}" text-anchor="middle">${d.label}</text>`});
  if(o.target){s+=`<line class="tgt" x1="${ml}" x2="${W-mr}" y1="${ys(o.target)}" y2="${ys(o.target)}"/><text class="lab" x="${ml+4}" y="${ys(o.target)-5}">${o.targetLabel}</text>`}
  if(o.refLabel){let dp="";it.forEach((d,i)=>{if(d.ref==null)return;const y=ys(d.ref),x0=ml+band*i;dp+=(dp?"L":"M")+x0+" "+y+"L"+(x0+band)+" "+y});s+=`<path class="tgt" fill="none" d="${dp}"/>`;const e=it[it.length-1];s+=`<text class="lab" x="${W-mr}" y="${ys(Math.max(...it.map(i=>i.ref||0)))-6}" text-anchor="end">${o.refLabel} ${f(e.ref,2)} €</text>`}
  if(o.endLabel){const e=it[it.length-1];s+=`<text class="lab" x="${Math.min(xOf(it.length-1),W-mr-14)}" y="${ys(e.v)-5}" text-anchor="middle">${f(e.v,o.dec||0)}</text>`}
  host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.aria}">${s}</svg>`;
  tooltips(host,host.querySelector("svg"),W,it,xOf);
}
function lines(host,o){
  host.innerHTML="";const W=Math.max(280,host.clientWidth||320),H=190,ml=44,mr=74,mt=14,mb=22;
  const L=o.labels,all=o.series.flatMap(s=>s.v.filter(v=>v!=null));
  if(L.length<2||!all.length){host.innerHTML=`<p class="muted small">${o.empty}</p>`;return}
  let lo=o.zero?0:Math.floor(Math.min(...all)-1),hi=Math.ceil(Math.max(...all)+.5);
  if(o.zero)hi=nice(hi*1.02);else{const st=Math.ceil((hi-lo)/2);hi=lo+st*2}
  const{s:ax,ys}=axis(W,H,ml,mr,mt,mb,hi,lo,v=>f(v,0));
  const xOf=i=>ml+(W-ml-mr)*i/(L.length-1);
  let s=ax;const step=Math.ceil(L.length/5);
  L.forEach((l,i)=>{if((L.length-1-i)%step===0)s+=`<text x="${xOf(i)}" y="${H-6}" text-anchor="middle">${l}</text>`});
  const ends=[];
  o.series.forEach(se=>{
    let d="",pen=false;se.v.forEach((v,i)=>{if(v==null){pen=false;return}d+=(pen?"L":"M")+xOf(i)+" "+ys(v);pen=true});
    s+=`<path fill="none" stroke="${se.c}" stroke-width="2" stroke-linejoin="round" ${se.dash?'stroke-dasharray="5 4"':""} d="${d}"/>`;
    if(o.dots)se.v.forEach((v,i)=>{if(v!=null)s+=`<circle cx="${xOf(i)}" cy="${ys(v)}" r="4" fill="${se.c}" stroke="var(--surface)" stroke-width="2"/>`});
    let li=se.v.length-1;while(li>=0&&se.v[li]==null)li--;
    if(li>=0)ends.push({y:ys(se.v[li]),t:se.name,v:se.v[li],x:xOf(li)});
  });
  ends.sort((a,b)=>a.y-b.y);for(let i=1;i<ends.length;i++)if(ends[i].y-ends[i-1].y<28)ends[i].y=ends[i-1].y+28;
  ends.forEach(e=>{s+=`<text class="lab" x="${W-mr+8}" y="${e.y}">${e.t}</text><text x="${W-mr+8}" y="${e.y+13}">${f(e.v,o.dec)}${o.unit||""}</text>`});
  s+=`<line id="cr" x1="0" x2="0" y1="${mt}" y2="${H-mb}" stroke="var(--muted)" stroke-width="1" style="display:none"/>`;
  host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.aria}">${s}</svg>`;
  const svg=host.querySelector("svg");
  const it=L.map((l,i)=>({tip:`<strong>${l}</strong><br>`+o.series.map(se=>`${se.name} : ${se.v[i]==null?"–":f(se.v[i],o.dec)}`).join("<br>")}));
  tooltips(host,svg,W,it,xOf,svg.querySelector("#cr"));
}

/* ---- Anneaux et jauge ---- */
const polar=(cx,cy,r,deg)=>{const a=deg*Math.PI/180;return[cx+r*Math.cos(a),cy-r*Math.sin(a)]};
function ringParts(cx,cy,r,w,parts,track){
  const C=2*Math.PI*r;let off=0;
  let s=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${w}" stroke="${track}"/>`;
  parts.forEach(p=>{const L=Math.max(0,p.f)*C;if(L<.5)return;const seg=Math.max(.5,L-2);
    s+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.c}" stroke-width="${w}" stroke-dasharray="${seg.toFixed(2)} ${(C-seg).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;off+=L});
  return s;
}
const SCALES=["w","m","y","t"];
function ringData(m,sc){
  const st=m.st,Ld=m.L,td=dt(m.today);
  if(sc==="w"){const ws=Math.max(m.mon,m.start),we=m.mon+6,target=m.wk*(we-ws+1)/7,prog=Ld<ws?0:Math.min(1,(Ld-ws+1)/(we-ws+1));
    return{name:"Semaine",title:`Semaine du ${dm(m.mon)}`,used:m.wUsed,target,theo:target*prog}}
  if(sc==="m")return{name:"Mois",title:`${MO[td.getUTCMonth()]} ${td.getUTCFullYear()}`,used:m.used,target:m.quota,theo:m.theoUsed};
  if(sc==="y"){const ya=m.start+Math.round(m.yi*365.25),ye=m.start+Math.round((m.yi+1)*365.25),prog=Math.min(1,Math.max(0,(m.last.d-ya)/(ye-ya)));
    return{name:"Année "+(m.yi+1),title:`Année ${m.yi+1} du contrat`,used:m.yearKm,target:st.limit,theo:st.limit*prog}}
  return{name:"Contrat",title:`Contrat ${f(st.months/12,0)} ans`,used:m.driven,target:m.cap,theo:m.theoL};
}
function ringHero(m,r0){
  const cx=80,cy=80,r=64,w=16,T=Math.max(1,r0.target),drv=Math.min(Math.max(0,r0.used),T);
  const ok=Math.min(drv,r0.theo),over=drv-ok,pct=r0.used/T*100;
  let s=ringParts(cx,cy,r,w,[{f:ok/T,c:"var(--butter)"},{f:over/T,c:"var(--over)"}],"rgba(255,255,255,.2)");
  const a=Math.min(1,r0.theo/T)*2*Math.PI-Math.PI/2,r1=r-w/2-3,r2=r+w/2+3;
  s+=`<line x1="${(cx+r1*Math.cos(a)).toFixed(1)}" y1="${(cy+r1*Math.sin(a)).toFixed(1)}" x2="${(cx+r2*Math.cos(a)).toFixed(1)}" y2="${(cy+r2*Math.sin(a)).toFixed(1)}" stroke="currentColor" stroke-width="2.5"/>`;
  s+=`<text class="ru" x="${cx}" y="${cy-20}" text-anchor="middle">${r0.name}</text><text class="rv" x="${cx}" y="${cy+8}" text-anchor="middle">${f(pct,0)} %</text>`;
  s+=SCALES.map((k,i)=>`<circle cx="${cx-15+i*10}" cy="${cy+26}" r="3" fill="${k===scale?"var(--butter)":"rgba(255,255,255,.35)"}"/>`).join("");
  return`<button class="ringBtn" data-ring="1" aria-label="${r0.title} : ${f(r0.used)} km sur ${f(r0.target)}. Toucher pour changer d'échelle"><svg class="ring viz" viewBox="0 0 160 160" aria-hidden="true">${s}</svg></button>`;
}
const G0=10,G1=24,gDeg=v=>180-(Math.min(G1,Math.max(G0,v))-G0)/(G1-G0)*180;
const gArc=(d0,d1)=>{const a=polar(120,108,84,d0),b=polar(120,108,84,d1);return`M${a[0].toFixed(1)} ${a[1].toFixed(1)}A84 84 0 0 1 ${b[0].toFixed(1)} ${b[1].toFixed(1)}`};
const gZone=v=>v==null?null:v<15?["Bon","good"]:v<=18?["Moyen","warn"]:["Élevé","bad"];
function gaugeSvg(v){
  let s="";
  [[10,15,"var(--good)"],[15,18,"var(--gold)"],[18,24,"var(--bad)"]].forEach(([a,b,c])=>{
    s+=`<path d="${gArc(a===10?180:gDeg(a)-.8,b===24?0:gDeg(b)+.8)}" fill="none" stroke="${c}" stroke-width="16"/>`});
  if(v!=null){const p=polar(120,108,84,gDeg(v));s+=`<circle class="gmark" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="10"/>`}
  s+=`<text class="gv" x="120" y="104" text-anchor="middle">${v!=null?f(v,1):"–"}</text><text class="gu" x="120" y="124" text-anchor="middle">kWh/100 km</text><text class="gl" x="30" y="126" text-anchor="middle">10</text><text class="gl" x="210" y="126" text-anchor="middle">24</text>`;
  return`<svg class="gauge viz" viewBox="0 0 240 132" role="img" aria-label="${v!=null?"Consommation moyenne "+f(v,1)+" kWh/100 km, zone "+gZone(v)[0].toLowerCase():"Consommation moyenne pas encore disponible"}">${s}</svg>`;
}

/* ---- Vues ---- */
function reminder(m){
  if(m.notif)return`<div class="notif" role="status"><div class="lv small muted"><span>Rappel dans l'app</span><span>dimanche</span></div>
    <strong>Relevé kilométrique à faire</strong><p class="small">Aucun relevé cette semaine. Dernier compteur : ${f(m.last.o)} km (${dm(m.last.d)}).</p>
    <div><button class="btn small" data-go="releve">Saisir le relevé</button></div></div>`;
  if(m.late)return`<div class="card"><span><span class="pill warn">! En retard</span></span><p class="small">Le relevé de dimanche dernier manque. <button class="btn ghost small" data-go="releve">Saisir</button></p></div>`;
  return"";
}
const backupAge=m=>m.today-(S.lastExport?n(S.lastExport):m.start);
function vBilan(m){
  const rg=ringData(m,scale),rm=rg.theo-rg.used;
  const pctR=Math.min(100,m.driven/m.cap*100),pctT=Math.min(100,m.theoL/m.cap*100),marge=m.theoL-m.driven;
  const remR=m.quota-m.used,remT=m.quota-m.theoUsed,gap=remR-remT;
  const pm=Math.min(100,m.used/m.quota*100),pmT=Math.min(100,m.theoUsed/m.quota*100);
  const projTxt=m.proj==null?"Projection disponible après deux semaines":`À ce rythme : ${f(m.proj)} km en fin de contrat`;
  const mo=m.months;
  const t=m.today,td=dt(t);
  return`
  ${!m.odoList.length?`<div class="card"><h2>Bienvenue</h2><p class="small">Indique le compteur et le % de batterie à la livraison dans Réglages, puis note le compteur et le % avant/après à chaque recharge.</p><div class="row"><button class="btn small" data-tab="regl">Ouvrir les réglages</button></div></div>`:""}
  ${(()=>{const d=getDraft();return d?`<div class="card"><span><span class="pill good">Recharge en cours</span></span><p class="small">Commencée${d.cSocA?" à "+d.cSocA+" %":""}${d.cOdo?", compteur "+d.cOdo+" km":""}. Complète-la au débranchement.</p><div><button class="btn small" data-go="charge">Terminer la saisie</button></div></div>`:""})()}
  ${reminder(m)?`<div>${reminder(m)}</div>`:""}
  ${backupAge(m)>30&&(m.odoList.length||m.chs.length)?`<div class="card"><span><span class="pill warn">! Sauvegarde</span></span><p class="small">${S.lastExport?"Dernière sauvegarde il y a "+backupAge(m)+" jours.":"Aucune sauvegarde depuis le début."} Si les données du navigateur sont effacées, tout est perdu.</p><div><button class="btn ghost small" data-tab="regl">Sauvegarder</button></div></div>`:""}
  <div class="grid two">
   <section class="card hero">
    <div class="lv small"><span class="tag" style="color:inherit">Compteur ${f(m.last.o)} km</span><span class="muted">relevé du ${dm(m.last.d)}</span></div>
    <div class="heroRow">
     ${ringHero(m,rg)}
     <div class="heroTxt">
      <strong class="rtitle">${rg.title}</strong>
      <span class="pill ${rm>=0?"good":"warn"}">${rm>=0?"✓ Marge":"! En avance de"} ${f(Math.abs(rm))} km</span>
      <p class="small">${f(rg.used)} / ${f(rg.target)} km</p>
      <p class="small muted">Trait : ${f(rg.theo)} km théoriques au ${dm(m.L)}</p>
      ${scale==="t"?`<p class="small muted">${projTxt}. Fin : ${dm(m.end)} ${dt(m.end).getUTCFullYear()}.</p>`:`<p class="small muted">Reste ${f(Math.max(0,rg.target-rg.used))} km sur la période.</p>`}
     </div>
    </div>
    <p class="small muted">Touche l'anneau : semaine, mois, année, contrat.</p>
   </section>
   <section class="card">
    <div class="lv"><h2>${MO[td.getUTCMonth()]} ${td.getUTCFullYear()}</h2><span class="pill ${gap>=0?"good":"warn"}">${gap>=0?"✓ +":"! −"}${f(Math.abs(gap))} km</span></div>
    <div class="pair">
      <div><span class="small muted">Km restants</span><div class="big">${f(remR)}</div></div>
      <div><span class="small muted">Théorique</span><div class="big">${f(remT)}</div></div>
    </div>
    <div class="meter"><i style="width:${pm}%"></i><b style="left:${pmT}%"></b></div>
    <p class="small muted">${f(m.used)} km roulés sur ${f(m.quota)} km du mois, arrêtés au ${dm(m.L)} · Le trait marque la position théorique.</p>
   </section>
  </div>
  <section class="tiles" aria-label="Moyennes depuis le début">
    <div class="tile"><span class="small muted">Côté prise</span><strong>${m.K&&m.driven?f(m.K/m.driven*100,1):"–"}</strong><span class="small muted">kWh/100 km</span></div>
    <div class="tile"><span class="small muted">Côté voiture</span><strong>${m.carAvg?f(m.carAvg,1):"–"}</strong><span class="small muted">kWh/100 km</span></div>
    <div class="tile"><span class="small muted">Coût</span><strong>${m.K&&m.driven?f(m.E/m.driven*100,2):"–"} €</strong><span class="small muted">/100 km</span></div>
    <div class="tile"><span class="small muted">Rendement charge</span><strong>${m.rendG!=null?f(m.rendG*100,0)+" %":m.carAvg&&m.K&&m.carAvg<=m.K/m.driven*100?f(m.carAvg/(m.K/m.driven*100)*100,0)+" %":"–"}</strong><span class="small muted">${f(m.K,0)} kWh · ${f(m.E,0)} €</span></div>
  </section>
  <div class="grid two">${vAmps(m)}${vPie(m)}</div>
  ${vConso(m)}
  ${vKm(m)}
  <div class="grid two">
   <section class="card"><h2>kWh/100 km par mois</h2><div class="chart" id="cK"></div>
    <div class="legend"><span><i style="background:var(--s1)"></i>Prise (écran du chargeur)</span><span><i style="background:var(--s2)"></i>Voiture (% batterie)</span></div></section>
   ${vEco(m)}
  </div>
  `;
}
function vAmps(m){
  const dom=m.byAmps.filter(g=>g.a!==999),mx=Math.max(...dom.map(g=>g.eb/g.kwh));
  return`<section class="card"><h2>Rendement par réglage</h2>
    ${m.byAmps.length?`<div class="hb">${m.byAmps.map(g=>{const p=g.eb/g.kwh*100,best=dom.length>1&&g.a!==999&&g.eb/g.kwh===mx;
      return`<div class="hrow"><span class="hl">${g.k}</span><div class="htrk"><div class="hbar${best?" best":""}" style="width:${Math.min(100,p).toFixed(1)}%"></div></div><strong class="hv">${f(p,0)} %</strong></div><div class="small muted hsub">${g.nb} recharge${g.nb>1?"s":""} · ${f(g.kwh,1)} kWh prise → ${f(g.eb,1)} kWh batterie</div>`}).join("")}</div>
    <p class="small muted">Énergie entrée dans la batterie (écart de % × ${f(m.bcap,1)} kWh) ÷ kWh lus sur le chargeur. Le % de la voiture est arrondi à l'unité : fiable sur des recharges de 30 % et plus, et de plus en plus précis avec le cumul. La capacité réglée décale tous les rendements d'autant, la comparaison entre ampérages reste juste.</p>`
    :`<p class="small muted">Note le % de batterie avant et après chaque recharge : le rendement de chaque ampérage s'affiche ici.</p>`}</section>`;
}
function vPie(m){
  const sp=m.split,eur=pieMode==="eur",val=x=>eur?x.eur:x.kwh,u=eur?" €":" kWh",tot=val(sp.dom)+val(sp.ext);
  if(!(tot>0))return`<section class="card"><h2>Répartition des recharges</h2><p class="small muted">Le camembert apparaît après la première recharge.</p></section>`;
  const rows=[["Domicile","var(--teal)",sp.dom],["Borne extérieure","var(--gold)",sp.ext]];
  const seg=`<div class="seg" role="group" aria-label="Unité">${[["kwh","kWh"],["eur","Coût"]].map(([v,l])=>`<button data-pie="${v}" aria-pressed="${pieMode===v}">${l}</button>`).join("")}</div>`;
  return`<section class="card"><div class="head"><h2>Répartition des recharges</h2>${seg}</div>
    <div class="pieRow"><svg class="pie viz" viewBox="0 0 140 140" role="img" aria-label="Répartition des recharges : ${rows.map(r=>r[0]+" "+f(val(r[2])/tot*100,0)+" %").join(", ")}">${ringParts(70,70,50,20,rows.map(r=>({f:val(r[2])/tot,c:r[1]})),"var(--line)")}<text class="pv" x="70" y="76" text-anchor="middle">${f(tot,0)}</text><text class="ru" x="70" y="94" text-anchor="middle">${eur?"€":"kWh"}</text></svg>
    <div class="pieLeg">${rows.map(r=>`<div class="pr"><span class="sw" style="background:${r[1]}"></span><span class="nm">${r[0]}</span><strong>${f(val(r[2])/tot*100,0)} %</strong></div><div class="small muted" style="margin:0 0 10px 16px">${f(val(r[2]),0)}${u}${r[2].kwh?` · ${f(r[2].eur/r[2].kwh,2)} €/kWh`:""}</div>`).join("")}</div></div></section>`;
}
function vConso(m){
  const v=m.segAvg,z=gZone(v),ls=m.segs[m.segs.length-1];
  return`<section class="card"><div class="head"><h2>Conso voiture entre deux recharges</h2>${z?`<span class="pill ${z[1]}">${z[0]}</span>`:""}</div>
    ${gaugeSvg(v)}
    <div class="legend" style="justify-content:center"><span><i style="background:var(--good)"></i>Bon &lt; 15</span><span><i style="background:var(--gold)"></i>Moyen 15–18</span><span><i style="background:var(--bad)"></i>Élevé &gt; 18</span></div>
    <p class="small muted">${ls?`Dernière période : ${f(ls.c,1)} kWh/100 km sur ${f(ls.km)} km. `:""}Repères d'après les essais de l'Inster : l'hiver et l'autoroute font monter la conso.</p>
    <div class="chart" id="cS"></div>
    <div class="legend"><span><i style="background:var(--s1)"></i>Chaque période</span><span><i style="background:var(--s2)"></i>Moyenne glissante sur 5</span></div>
    <p class="small muted">Écart de % entre la fin d'une recharge et le début de la suivante, ramené aux km du compteur. Inclut chauffage et veille.</p></section>`;
}
function vEco(m){
  const ok=m.K&&m.driven,eco=m.dieselTotal-m.E,mx=Math.max(m.E,m.dieselTotal,1);
  return`<section class="card"><h2>Économie face au diesel</h2>
    ${ok?`<div><div class="heroNum${eco<0?" neg":""}">${eco<0?"−":""}${f(Math.abs(eco),0)} €</div><span class="small muted">${eco<0?"de plus que le diesel":"économisés"} depuis le début, sur ${f(m.driven)} km</span></div>
    <div class="hb"><div class="hrow"><span class="hl">Inster</span><div class="htrk"><div class="hbar best" style="width:${(m.E/mx*100).toFixed(1)}%"></div></div><strong class="hv">${f(m.E,0)} €</strong></div>
    <div class="hrow"><span class="hl">Diesel</span><div class="htrk"><div class="hbar" style="width:${(m.dieselTotal/mx*100).toFixed(1)}%"></div></div><strong class="hv">${f(m.dieselTotal,0)} €</strong></div></div>`
    :`<p class="small muted">Le calcul apparaît après la première recharge et le premier relevé.</p>`}
    <p class="small muted">Diesel de comparaison : ${f(m.st.diesel.conso,1)} L/100 km, soit ${f(dieselAt(m.today),2)} €/100 km aujourd'hui.</p>
    <span class="tag">€/100 km par mois</span>
    <div class="chart" id="cE"></div>
    <p class="small muted">Énergie et carburant seuls, selon l'historique du prix du gazole. Abonnement et entretien non comptés.</p></section>`;
}
function vKm(m){
  const st=m.st,td=dt(m.today),sc=scale;
  const tabs=[["w","Semaine",m.wk,`cette semaine : ${f(m.wUsed)} km`],["m","Mois",m.mq,`${MO[td.getUTCMonth()]} : ${f(m.used)} km`],["y","Année",st.limit,`année ${m.yi+1} : ${f(m.yearKm)} km`],["t",f(st.months/12,0)+" ans",m.cap,`${f(m.driven)} km roulés`]];
  const cap={w:`${st.dw} jours × ${f(m.kmDay,m.kmDay%1?1:0)} km = ${f(m.wk)} km par semaine d'usage.`,m:`${f(st.dy/12,0)} jours d'usage par mois (${st.dy} ÷ 12) × ${f(m.kmDay,m.kmDay%1?1:0)} km = ${f(m.mq)} km.`,y:`${st.dy} jours d'usage × ${f(m.kmDay,m.kmDay%1?1:0)} km = ${f(st.limit)} km par année de contrat.`,t:`${st.months} mois : ${f(m.cap)} km. La projection prolonge le rythme moyen observé.`}[sc];
  const leg=sc==="t"?`<span><i style="background:var(--s1)"></i>Réel</span><span><i style="background:var(--s2)"></i>Théorique</span><span><i style="background:var(--muted)"></i>Projection</span>`
    :`<span><i style="background:var(--s1)"></i>Dans l'objectif</span><span><i style="background:var(--s2)"></i>Au-dessus de l'objectif</span>`;
  return`<section class="card">
    <div class="head"><h2>Km théoriques et réels</h2>${sc==="w"?`<div class="seg" role="group" aria-label="Période">${[[13,"3 mois"],[26,"6 mois"],[0,"Tout"]].map(([v,l])=>`<button data-range="${v}" aria-pressed="${range===v}">${l}</button>`).join("")}</div>`:""}</div>
    <div class="tiles scale" role="group" aria-label="Échelle">${tabs.map(t=>`<button class="tile" data-scale="${t[0]}" aria-pressed="${sc===t[0]}"><span class="small muted">${t[1]}</span><strong>${f(t[2])} km</strong><span class="small muted">${t[3]}</span></button>`).join("")}</div>
    <div class="chart" id="cW"></div>
    <div class="legend">${leg}</div>
    <p class="small muted">${cap}</p></section>`;
}
function totalSeries(m){
  const st=m.st,L=[],real=[],theo=[],proj=[],rate=m.proj!=null?m.driven/m.elapsedL:null;let li=-1;
  const days=[];for(let d=m.start;d<=m.end;d+=7)days.push(d);
  if(!days.includes(m.end))days.push(m.end);
  if(m.odoList.length&&!days.includes(m.last.d)){days.push(m.last.d);days.sort((a,b)=>a-b)}
  for(let i=0;i<days.length;i++){
    const d=days[i],x=dt(d);L.push(MO[x.getUTCMonth()]+" "+String(x.getUTCFullYear()).slice(2));
    real.push(d<=m.last.d?m.odoAt(d)-st.odo0:null);if(d<=m.last.d)li=i;
    theo.push(m.cap*(d-m.start)/m.total);
    proj.push(rate!=null&&d>m.last.d?m.driven+rate*(d-m.last.d):null)}
  if(rate!=null&&li>=0)proj[li]=real[li];
  return{L,real,theo,proj};
}
function drawCharts(m){
  if(scale==="w"){const w=range?m.weeks.slice(-range):m.weeks;
    bars($("#cW"),{items:w.map(x=>({v:x.km,label:dm(x.d).replace(/\.$/,""),hi:x.km>m.wk,tip:`<strong>Semaine du ${dm(x.d-6)}</strong><br>${f(x.km)} km`})),target:m.wk,targetLabel:`Objectif ${f(m.wk)} km`,aria:"Kilomètres par semaine",empty:"Le graphique apparaît après le premier relevé."})}
  else if(scale==="m"){
    bars($("#cW"),{items:m.months.map(x=>({v:x.km,label:x.label,hi:x.km>m.mq,tip:`<strong>${x.label} ${x.y}</strong><br>${f(x.km)} km`})),target:m.mq,targetLabel:`Objectif ${f(m.mq)} km`,aria:"Kilomètres par mois",empty:"Le graphique apparaît après le premier relevé."})}
  else if(scale==="y"){const yrs=[];
    for(let i=0;i<Math.ceil(m.st.months/12);i++){const ys=m.start+Math.round(i*365.25),ye=m.start+Math.round((i+1)*365.25);if(i>0&&ys>m.last.d)break;
      const km=m.odoAt(Math.min(ye,m.last.d))-m.odoAt(Math.min(ys,m.last.d));yrs.push({v:km,label:"Année "+(i+1),hi:km>m.st.limit,tip:`<strong>Année ${i+1}</strong><br>${f(km)} km sur ${f(m.st.limit)}`})}
    bars($("#cW"),{items:yrs,bw:56,target:m.st.limit,targetLabel:`Objectif ${f(m.st.limit)} km`,endLabel:true,aria:"Kilomètres par année de contrat",empty:"Le graphique apparaît après le premier relevé."})}
  else{const t=totalSeries(m);
    lines($("#cW"),{labels:t.L,dec:0,zero:true,unit:" km",series:[{name:"Réel",c:"var(--s1)",v:t.real},{name:"Théorique",c:"var(--s2)",dash:true,v:t.theo},{name:"Projection",c:"var(--muted)",dash:true,v:t.proj}],aria:"Kilomètres cumulés sur la durée du contrat, comparés au théorique",empty:"Le graphique apparaît après le premier relevé."})}
  const sg=m.segs,ma=sg.map((_,i)=>{const w=sg.slice(Math.max(0,i-4),i+1);return w.reduce((s,x)=>s+x.e,0)/w.reduce((s,x)=>s+x.km,0)*100});
  lines($("#cS"),{labels:sg.map(x=>dm(n(x.date))),dots:true,dec:1,series:[{name:"Période",c:"var(--s1)",v:sg.map(x=>x.c)},{name:"Moyenne",c:"var(--s2)",dash:true,v:ma}],aria:"Consommation entre deux recharges en kilowattheures pour 100 km",empty:"Il faut au moins deux périodes entre recharges."});
  const mo=m.months;
  lines($("#cK"),{labels:mo.map(x=>x.label),dots:true,dec:1,series:[{name:"Prise",c:"var(--s1)",v:mo.map(x=>x.prise)},{name:"Voiture",c:"var(--s2)",v:mo.map(x=>x.car)}],aria:"Consommation mensuelle en kilowattheures pour 100 km",empty:"Il faut au moins deux mois de données."});
  const me=mo.filter(x=>x.euro!=null);
  bars($("#cE"),{items:me.map(x=>({v:x.euro,ref:x.ref,label:x.label,tip:`<strong>${x.label} ${x.y}</strong><br>${f(x.euro,2)} €/100 km<br>Diesel : ${f(x.ref,2)} €/100 km<br>${f(x.kwh,0)} kWh · ${f(x.km)} km`})),refLabel:"Diesel",dec:1,endLabel:true,aria:"Coût mensuel pour 100 km",empty:"Le graphique apparaît après la première recharge."});
}
function vSaisir(m){
  const today=iso(m.today),p=m.st.prices[m.st.tarif];
  const dom=S.charges.filter(c=>c.place==="dom"&&c.amps>0).sort((x,y)=>x.date<y.date?-1:x.date>y.date?1:0),lastA=dom.length?dom[dom.length-1].amps:8;
  const dr=getDraft();
  const charge=`<form id="fC" class="card" novalidate><h2>Recharge</h2>
    ${dr?`<div class="lv small"><span class="pill good">Recharge en cours${dr.cSocA?" depuis "+dr.cSocA+" %":""}</span><button type="button" class="btn ghost small" id="dropDraft">Effacer</button></div>`:""}
    <p class="small muted">Au branchement : compteur et % batterie (appli myHyundai). Au débranchement : % batterie et kWh de l'écran du chargeur Dé.</p>
    <div class="pair"><label>Date<input type="date" id="cDate" value="${today}"></label>
    <label>Compteur (km)<input id="cOdo" inputmode="numeric" placeholder="${f(Math.round(m.last.o))}"></label></div>
    <div class="pair"><label>Batterie avant (%)<input id="cSocA" inputmode="numeric" placeholder="35"></label>
    <label>Batterie après (%)<input id="cSocB" inputmode="numeric" placeholder="80"></label></div>
    <label>kWh côté prise<input id="cKwh" inputmode="decimal" placeholder="18,4"></label>
    <div class="pair"><label>Lieu<select id="cPlace"><option value="dom">Domicile</option><option value="ext">Borne extérieure</option></select></label>
    <label>Courant réglé<select id="cAmps">${[6,8,10,13,16].map(v=>`<option ${v===lastA?"selected":""}>${v}</option>`).join("")}</select></label></div>
    <label>Prix du kWh (€)<input id="cPrice" inputmode="decimal" value="${f(p,4)}"></label>
    <p class="small muted" id="cPrev" aria-live="polite">Saisis les kWh pour voir le coût.</p>
    <p class="err" id="cErr" hidden></p>
    <div><button class="btn">Enregistrer la recharge</button></div></form>`;
  const rel=`<form id="fR" class="card" novalidate><h2>Relevé kilométrique</h2>
    <p class="small muted">Dernier relevé : ${f(m.last.o)} km le ${dm(m.last.d)}. Saisis le total du compteur, l'app calcule la distance.</p>
    <div class="pair"><label>Date<input type="date" id="rDate" value="${today}"></label>
    <label>Compteur (km)<input id="rOdo" inputmode="numeric" placeholder="${Math.round(m.last.o+m.wk)}"></label></div>
    <p class="small muted" id="rPrev" aria-live="polite">Objectif de la semaine : ${f(m.wk)} km.</p>
    <p class="err" id="rErr" hidden></p>
    <div><button class="btn">Enregistrer le relevé</button></div></form>`;
  return`<div class="seg" role="group" aria-label="Type de saisie"><button data-kind="charge" aria-pressed="${formKind==="charge"}">Recharge</button><button data-kind="releve" aria-pressed="${formKind==="releve"}">Relevé km</button></div>${formKind==="charge"?charge:rel}`;
}
function vHisto(m){
  const a=[...m.reads.map(r=>({...r,t:"r"})),...m.chs.map(c=>({...c,t:"c"}))].sort((x,y)=>x.date<y.date?1:x.date>y.date?-1:0);
  const rows=a.slice(0,40).map(e=>{
    const line=e.t==="r"?`<strong>Relevé ${f(e.odo)} km</strong>${e.conso?`<br><span class="small muted">${f(e.conso,1)} kWh/100 km voiture</span>`:""}`
      :`<strong>Recharge ${f(e.kwh,1)} kWh</strong><br><span class="small muted">${e.place==="dom"?"Domicile · "+e.amps+" A":"Borne extérieure"} · ${f(e.kwh*e.price,2)} €${e.odo!=null?" · "+f(e.odo)+" km":""}${e.socA!=null&&e.socB!=null?" · "+e.socA+" → "+e.socB+" %"+(e.socB>e.socA?" · rendement "+f((e.socB-e.socA)/100*m.bcap/e.kwh*100,0)+" %":""):""}</span>`;
    return`<div class="item"><div><span class="small muted">${dm(n(e.date))} ${dt(n(e.date)).getUTCFullYear()}</span><br>${line}</div><button class="btn ghost small" data-del="${e.t}:${e.id}">Supprimer</button></div>`}).join("");
  return`<section class="card"><h2>Historique</h2><div class="list">${rows||'<p class="muted">Aucune saisie pour le moment. Ajoute un relevé dans l\'onglet Saisir.</p>'}</div>${a.length>40?`<p class="small muted">Les ${f(a.length-40)} saisies plus anciennes sont masquées.</p>`:""}</section>`;
}
let installEvt=null,pending=null;
const canShareFile=()=>{try{return !!(navigator.canShare&&navigator.canShare({files:[new File(["x"],"x.txt",{type:"text/plain"})]}))}catch(e){return false}};
const backupText=()=>JSON.stringify({app:"inster-compteur",version:1,exportedAt:iso(localToday()),set:S.set,readings:S.readings,charges:S.charges},null,1);
const exported=()=>{S.lastExport=iso(localToday());save();render();toast(`Sauvegarde créée : ${S.readings.length} relevés, ${S.charges.length} recharges`)};
function vRegl(m){
  const s=m.st;
  return`<section class="card"><h2>Contrat</h2>
    <div class="pair"><label>Début<input type="date" id="sStart" value="${s.start}"></label><label>Durée (mois)<input id="sMonths" inputmode="numeric" value="${s.months}"></label></div>
    <div class="pair"><label>Limite km/an<input id="sLimit" inputmode="numeric" value="${s.limit}"></label><label>Compteur à la livraison<input id="sOdo" inputmode="numeric" value="${s.odo0}"></label></div>
    <div class="pair"><label>Jours d'usage par semaine<input id="sDw" inputmode="numeric" value="${s.dw}"></label><label>Jours d'usage par an<input id="sDy" inputmode="numeric" value="${s.dy}"></label></div>
    <div class="pair"><label>Batterie à la livraison (%)<input id="sSoc0" inputmode="numeric" value="${s.soc0??""}" placeholder="98"></label><label>Capacité utile batterie (kWh)<input id="sCap" inputmode="decimal" value="${f(s.cap,1)}"></label></div>
    <p class="small muted">${f(m.kmDay,m.kmDay%1?1:0)} km par jour d'usage, ${f(m.wk)} km/semaine, ${f(s.limit/12)} km/mois, ${f(m.cap)} km au total.</p></section>
   <section class="card"><h2>Tarif Bleu EDF</h2>
    <label>Option utilisée pour les recharges à domicile<select id="sTarif">${[["base","Base"],["hc","Heures creuses"],["hp","Heures pleines"]].map(([v,l])=>`<option value="${v}" ${s.tarif===v?"selected":""}>${l}</option>`).join("")}</select></label>
    <div class="pair"><label>Base (€/kWh)<input id="pBase" inputmode="decimal" value="${f(s.prices.base,4)}"></label><label>Heures creuses<input id="pHc" inputmode="decimal" value="${f(s.prices.hc,4)}"></label></div>
    <label>Heures pleines<input id="pHp" inputmode="decimal" value="${f(s.prices.hp,4)}"></label>
    <p class="small muted">Prix TTC relevés en octobre 2026, à vérifier pour ta puissance souscrite. Chaque recharge garde son prix : un changement de tarif ne modifie pas le passé.</p></section>
   <section class="card"><h2>Comparaison diesel</h2>
    <label>Consommation (L/100 km)<input id="dConso" inputmode="decimal" value="${f(s.diesel.conso,1)}"></label>
    <p class="small muted">Aujourd'hui : ${f(dieselAt(m.today),2)} €/100 km. Chaque prix s'applique à partir de sa date, le passé reste inchangé.</p>
    <div class="pair"><label>Nouveau prix : date<input type="date" id="dNewDate" value="${iso(m.today)}"></label><label>Prix du gazole (€/L)<input id="dNewPrice" inputmode="decimal" placeholder="2,350"></label></div>
    <p class="err" id="dErr" hidden></p>
    <div><button class="btn ghost" id="addD">Ajouter ce prix</button></div>
    <div class="list">${[...s.diesel.prices].reverse().map(x=>`<div class="item"><div>${f(x.price,3)} €/L<br><span class="small muted">depuis le ${dm(n(x.from))} ${dt(n(x.from)).getUTCFullYear()}</span></div>${s.diesel.prices.length>1?`<button class="btn ghost small" data-deld="${x.from}">Supprimer</button>`:""}</div>`).join("")}</div>
    <p class="small muted">Prix de départ : moyenne nationale partielle du 29 octobre 2026.</p></section>
   <section class="card"><h2>Sauvegarde</h2>
    <p class="small muted">${S.lastExport?"Dernier export : "+dm(n(S.lastExport))+" "+dt(n(S.lastExport)).getUTCFullYear()+".":"Aucun export pour le moment."} Tes données n'existent que sur ce téléphone : garde le fichier ailleurs, par exemple sur ton Drive.</p>
    <div class="row"><button class="btn" id="share" ${canShareFile()?"":"hidden"}>Partager vers Drive…</button><button class="btn ${canShareFile()?"ghost":""}" id="dl">Télécharger le fichier</button></div>
    <label>Restaurer une sauvegarde<input type="file" id="impFile" accept=".json,.txt,application/json,text/plain"></label>
    <p class="err" id="ioErr" hidden></p>
    <div><button class="btn ghost" id="imp" hidden></button></div>
    <p class="small muted" id="persist"></p></section>
   <section class="card"><h2>Application</h2>
    <div><button class="btn ghost" id="install" ${installEvt?"":"hidden"}>Installer sur le téléphone</button></div>
    <p class="small muted">Si le bouton n'apparaît pas : menu de Chrome, puis « Ajouter à l'écran d'accueil ». L'app fonctionne ensuite hors connexion.</p></section>
   <section class="card"><h2>Effacer</h2>
    <p class="small muted">Supprime les relevés et les recharges de ce téléphone. Les réglages restent.</p>
    <div><button class="btn ghost" id="wipe">Tout effacer</button></div></section>`;
}
function render(){
  const v=$("#view"),keep={};v.querySelectorAll("input:not([type=date]),select").forEach(i=>{if(i.id)keep[i.id]=i.value});
  const m=model();
  document.querySelectorAll("#nav button").forEach(b=>b.dataset.t===tab?b.setAttribute("aria-current","page"):b.removeAttribute("aria-current"));
  v.innerHTML=tab==="bilan"?vBilan(m):tab==="saisir"?vSaisir(m):tab==="histo"?vHisto(m):vRegl(m);
  if(tab==="saisir"){Object.keys(keep).forEach(k=>{const e=document.getElementById(k);if(e)e.value=keep[k]});
    const d=getDraft();if(d&&formKind==="charge"){DF.forEach(id=>{const e=document.getElementById(id);if(e&&d[id]!=null)e.value=d[id]});$("#cAmps").disabled=$("#cPlace").value==="ext"}}
  if(tab==="bilan")drawCharts(m);
}
function toast(t){const e=$("#toast");e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,2600)}
const num=s=>parseFloat(String(s).replace(/\s/g,"").replace(",","."));
const showErr=(id,t)=>{const e=$(id);e.textContent=t;e.hidden=!t};

function parseBackup(t){
  let o;try{o=JSON.parse(t)}catch(x){throw new Error("Ce texte n'est pas une sauvegarde lisible. Colle le contenu complet du fichier.")}
  if(!o||o.app!=="inster-compteur"||!o.set||!Array.isArray(o.readings)||!Array.isArray(o.charges))throw new Error("Ce fichier ne vient pas d'Inster Compteur.");
  const D=/^\d{4}-\d{2}-\d{2}$/,ok=v=>typeof v==="number"&&isFinite(v)&&v>=0;
  const readings=o.readings.map(r=>{if(!D.test(r.date)||!ok(r.odo))throw new Error("Un relevé est invalide (date "+String(r.date).slice(0,10)+").");return{id:uid(),date:r.date,odo:r.odo,conso:ok(r.conso)?r.conso:null}});
  const charges=o.charges.map(c=>{if(!D.test(c.date)||!ok(c.kwh)||!ok(c.price))throw new Error("Une recharge est invalide (date "+String(c.date).slice(0,10)+").");const pc=v=>ok(v)&&v<=100?v:null;return{id:uid(),date:c.date,kwh:c.kwh,amps:ok(c.amps)?c.amps:0,place:c.place==="ext"?"ext":"dom",price:c.price,odo:ok(c.odo)?c.odo:null,socA:pc(c.socA),socB:pc(c.socB)}});
  const s=o.set,p=s.prices||{};
  if(!D.test(s.start)||!ok(s.months)||!ok(s.limit)||!ok(s.odo0))throw new Error("Les réglages du contrat sont invalides dans ce fichier.");
  return{set:{start:s.start,months:s.months,limit:s.limit,dw:ok(s.dw)&&s.dw>=1&&s.dw<=7?s.dw:6,dy:ok(s.dy)&&s.dy>=1&&s.dy<=366?s.dy:300,odo0:s.odo0,tarif:["base","hc","hp"].includes(s.tarif)?s.tarif:"base",prices:{base:ok(p.base)?p.base:.2001,hc:ok(p.hc)?p.hc:.1589,hp:ok(p.hp)?p.hp:.2142},diesel:{conso:s.diesel&&ok(s.diesel.conso)?s.diesel.conso:7.5,prices:(()=>{const dd=s.diesel||{};const L=Array.isArray(dd.prices)?dd.prices.filter(x=>x&&D.test(x.from)&&ok(x.price)).map(x=>({from:x.from,price:x.price})).sort((x,y)=>x.from<y.from?-1:1):[];return L.length?L:[{from:s.start,price:ok(dd.price)?dd.price:2.385}]})()},cap:ok(s.cap)&&s.cap>0?s.cap:42,soc0:ok(s.soc0)&&s.soc0<=100?s.soc0:null},readings,charges,exportedAt:D.test(o.exportedAt)?o.exportedAt:null};
}
/* ---- Interactions ---- */
$("#nav").addEventListener("click",e=>{if(e.target.dataset.t){tab=e.target.dataset.t;render();scrollTo(0,0)}});
let armed=null;
$("#view").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.go){tab="saisir";formKind=b.dataset.go;render();scrollTo(0,0)}
  if(b.dataset.range){range=+b.dataset.range;render()}
  if(b.dataset.pie){pieMode=b.dataset.pie;render()}
  if(b.dataset.scale){scale=b.dataset.scale;render()}
  if(b.dataset.ring){scale=SCALES[(SCALES.indexOf(scale)+1)%4];render()}
  if(b.id==="dropDraft"){if(armed!=="dropDraft"){armed="dropDraft";b.textContent="Confirmer";return}
    armed=null;clearDraft();["cOdo","cSocA","cSocB","cKwh"].forEach(x=>$("#"+x).value="");render();toast("Recharge en cours effacée")}
  if(b.dataset.kind){formKind=b.dataset.kind;render()}
  if(b.dataset.del){
    if(armed!==b.dataset.del){armed=b.dataset.del;b.textContent="Confirmer";return}
    const[t,id]=armed.split(":");armed=null;
    if(t==="r")S.readings=S.readings.filter(x=>x.id!==id);else S.charges=S.charges.filter(x=>x.id!==id);
    save();render();toast("Saisie supprimée")}
  if(b.id==="wipe"){if(armed!=="wipe"){armed="wipe";b.textContent="Confirmer : tout effacer";return}
    armed=null;S.readings=[];S.charges=[];save();render();toast("Données effacées")}
  if(b.dataset.tab){tab=b.dataset.tab;render();scrollTo(0,0)}
  if(b.id==="dl"){const u=URL.createObjectURL(new Blob([backupText()],{type:"application/json"})),l=document.createElement("a");l.href=u;l.download=`inster-compteur-${iso(localToday())}.json`;document.body.append(l);l.click();l.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);exported()}
  if(b.id==="share"){const fl=new File([backupText()],`inster-compteur-${iso(localToday())}.txt`,{type:"text/plain"});navigator.share({files:[fl],title:"Sauvegarde Inster Compteur"}).then(exported,x=>{if(x.name!=="AbortError")toast("Partage impossible. Utilise Télécharger le fichier.")})}
  if(b.id==="install"&&installEvt){installEvt.prompt();installEvt=null;b.hidden=true}
  if(b.id==="imp"&&pending){if(armed!=="imp"){armed="imp";b.textContent="Confirmer : mes données actuelles seront remplacées";return}
    armed=null;S.set=pending.set;S.readings=pending.readings;S.charges=pending.charges;S.lastExport=pending.exportedAt;pending=null;save();render();toast("Sauvegarde restaurée")}
  if(b.id==="addD"){const date=$("#dNewDate").value,p=num($("#dNewPrice").value),m=model();
    if(!date||n(date)>m.today)return showErr("#dErr","Choisis une date qui n'est pas dans le futur.");
    if(!(p>0&&p<10))return showErr("#dErr","Saisis un prix au litre, par exemple 2,350.");
    const P=S.set.diesel.prices.filter(x=>x.from!==date);P.push({from:date,price:p});P.sort((x,y)=>x.from<y.from?-1:1);S.set.diesel.prices=P;save();render();toast("Prix du gazole ajouté")}
  if(b.dataset.deld){const k="d:"+b.dataset.deld;if(armed!==k){armed=k;b.textContent="Confirmer";return}
    armed=null;S.set.diesel.prices=S.set.diesel.prices.filter(x=>x.from!==b.dataset.deld);save();render();toast("Prix supprimé")}
});
$("#view").addEventListener("input",e=>{
  if(DF.includes(e.target.id))saveDraft();
  if(["cKwh","cPrice","cSocA","cSocB"].includes(e.target.id)){const k=num($("#cKwh").value),p=num($("#cPrice").value),sa=num($("#cSocA").value),sb=num($("#cSocB").value);if(k>0&&p>=0)$("#cPrev").textContent=`Coût de la recharge : ${f(k*p,2)} €`+(sb>sa?` · rendement ${f((sb-sa)/100*S.set.cap/k*100,0)} %`:"")}
  if(e.target.id==="rOdo"){const m=model(),o=num(e.target.value);if(o>m.last.o)$("#rPrev").textContent=`Soit ${f(o-m.last.o)} km depuis le ${dm(m.last.d)}.`}
});
$("#view").addEventListener("change",e=>{
  const id=e.target.id,s=S.set,v=e.target.value;
  if(id==="impFile"){const fl=e.target.files[0];if(!fl)return;const bt=$("#imp");bt.hidden=true;pending=null;armed=null;showErr("#ioErr","");const rd=new FileReader();
    rd.onload=()=>{try{pending=parseBackup(rd.result);bt.textContent=`Restaurer ${pending.readings.length} relevés et ${pending.charges.length} recharges`;bt.hidden=false}catch(x){showErr("#ioErr",x.message)}};
    rd.onerror=()=>showErr("#ioErr","Ce fichier ne peut pas être lu. Choisis un autre fichier.");rd.readAsText(fl);return}
  if(id==="cPlace"){const p=$("#cPrice");p.value=v==="dom"?f(s.prices[s.tarif],4):"";$("#cAmps").disabled=v==="ext";saveDraft();if(v==="ext")p.focus();return}
  if(DF.includes(id)){saveDraft();return}
  const map={sStart:()=>s.start=v,sMonths:()=>s.months=Math.max(1,num(v)||36),sLimit:()=>s.limit=num(v)||15000,sDw:()=>s.dw=Math.min(7,Math.max(1,num(v)||6)),sDy:()=>s.dy=Math.min(366,Math.max(1,num(v)||300)),sOdo:()=>s.odo0=num(v)||0,sTarif:()=>s.tarif=v,pBase:()=>s.prices.base=num(v)||0,pHc:()=>s.prices.hc=num(v)||0,pHp:()=>s.prices.hp=num(v)||0,dConso:()=>s.diesel.conso=num(v)||0,sCap:()=>s.cap=num(v)>0?num(v):42,sSoc0:()=>{const x=num(v);s.soc0=x>=0&&x<=100?x:null}};
  if(map[id]){map[id]();save();render()}
});
$("#view").addEventListener("submit",e=>{
  e.preventDefault();const m=model();
  if(e.target.id==="fC"){
    const date=$("#cDate").value,k=num($("#cKwh").value),p=num($("#cPrice").value),place=$("#cPlace").value;
    if(!date||n(date)>m.today)return showErr("#cErr","Choisis une date qui n'est pas dans le futur.");
    if(!(k>0&&k<=60))return showErr("#cErr","Saisis l'énergie affichée par le chargeur, entre 0 et 60 kWh.");
    if(!(p>=0&&p<3))return showErr("#cErr","Saisis un prix du kWh en euros, par exemple 0,2001.");
    const o=$("#cOdo").value.trim()?num($("#cOdo").value):null,sa=$("#cSocA").value.trim()?num($("#cSocA").value):null,sb=$("#cSocB").value.trim()?num($("#cSocB").value):null;
    if(o!=null){if(!(o>=0))return showErr("#cErr","Saisis le total affiché au compteur.");
      const d=n(date),pts=[...S.readings,...S.charges.filter(c=>c.odo!=null)],prev=Math.max(+S.set.odo0,...pts.filter(r=>n(r.date)<d).map(r=>r.odo)),nx=pts.filter(r=>n(r.date)>d).map(r=>r.odo);
      if(o<prev)return showErr("#cErr",`Le compteur ne peut pas être inférieur à ${f(prev)} km à cette date.`);
      if(nx.length&&o>Math.min(...nx))return showErr("#cErr",`Une saisie plus récente indique ${f(Math.min(...nx))} km.`)}
    if((sa!=null)!==(sb!=null))return showErr("#cErr","Saisis le % avant et le % après, ou aucun des deux.");
    if(sa!=null&&!(sa>=0&&sb<=100&&sb>sa))return showErr("#cErr","Le % après doit être plus grand que le % avant, entre 0 et 100.");
    S.charges.push({id:uid(),date,kwh:k,amps:+$("#cAmps").value,place,price:p,odo:o,socA:sa,socB:sb});save();["#cKwh","#cOdo","#cSocA","#cSocB"].forEach(x=>$(x).value="");clearDraft();render();toast("Recharge enregistrée");
  }else{
    const date=$("#rDate").value,o=num($("#rOdo").value);
    if(!date||n(date)>m.today)return showErr("#rErr","Choisis une date qui n'est pas dans le futur.");
    if(!(o>=0))return showErr("#rErr","Saisis le total affiché au compteur.");
    const d=n(date),prev=Math.max(+S.set.odo0,...S.readings.filter(r=>n(r.date)<d).map(r=>r.odo)),mine=S.readings.filter(r=>n(r.date)>d).map(r=>r.odo);
    if(o<prev)return showErr("#rErr",`Le compteur ne peut pas être inférieur à ${f(prev)} km à cette date.`);
    if(mine.length&&o>Math.min(...mine))return showErr("#rErr",`Un relevé plus récent indique ${f(Math.min(...mine))} km.`);
    S.readings=S.readings.filter(r=>r.date!==date);
    S.readings.push({id:uid(),date,odo:o,conso:null});save();$("#rOdo").value="";render();toast("Relevé enregistré");
  }
});
let rt;addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(()=>{if(tab==="bilan")drawCharts(model())},150)});
render();
let shownDay=localToday();
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&localToday()!==shownDay){shownDay=localToday();render()}});
addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvt=e;if(tab==="regl")render()});
const persistNote=()=>{const p=$("#persist");if(p&&navigator.storage&&navigator.storage.persisted)navigator.storage.persisted().then(v=>{p.textContent=v?"Stockage protégé : le navigateur ne l'effacera pas seul. Un effacement manuel reste possible.":"Stockage non protégé pour le moment : installe l'app pour réduire le risque d'effacement."})};
if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
new MutationObserver(persistNote).observe($("#view"),{childList:true});
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
