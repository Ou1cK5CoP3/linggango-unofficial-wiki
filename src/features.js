
/* ---------- build planner, boss guides, pack mechanics, recipe trees ---------- */
// Player curio slots: merged curios/slots data from the base pack jars (Scroll, Spellstone, Focus are registered in code: assumed 1)
var SLOT_BASE={Head:1,Necklace:2,Back:1,Body:1,Belt:1,Hands:2,Ring:2,Bracelet:2,Glove:2,Anklet:2,Feet:2,Charm:6,Accessory:6,Heart:1,Spellbook:1,Scroll:1,Spellstone:1,Talent:2,Focus:1,"Hostility Curse":1,Curio:1,Elytra:1,"Binding Key":1,Magnetizer:1,Bundle:1};
var STAT_ALIAS={"Knockback Res":"Knockback Resistance","Knockback resistance":"Knockback Resistance","Increased reach":"Reach","Increased block reach":"Block Reach","Step Height Addition":"Step Height"};
var BS={p:12,s:{}},BPICK=null,BINSP=null;

function slotAdds(d){
 if(d._sa)return d._sa;const o={};
 const put=(n,s)=>{s=s.toLowerCase().replace(/s$/,"");const k=Object.keys(SLOT_BASE).find(x=>x.toLowerCase()===s);if(k&&+n>0)o[k]=Math.max(o[k]||0,+n)};
 for(const t of [...d.st,d.fx]){let m;
  for(const r of [/grants (\d+) (\w+) slots?/gi,/\+(\d+)(?:[–-]\d+)? (\w+) slots?/gi,/\+(\d+) slot (\w+)/gi])while((m=r.exec(t)))put(m[1],m[2]);
  const r=/bonus (\w+) slots: (\d+)/gi;while((m=r.exec(t)))put(m[2],m[1])}
 return d._sa=o}
function statsOf(d){
 if(d._stp)return d._stp;const out=[];
 for(const x of d.st){const m=x.trim().match(/^([+-])\s*(\d+(?:\.\d+)?)\s*(%?)\s+(?:to\s+)?([A-Z][A-Za-z' ]{2,40}?)\s*(?:\(.*\))?\.?$/);
  if(!m||/slots?$/i.test(m[4]))continue;let k=STAT_ALIAS[m[4]]||m[4],v=(m[1]==="-"?-1:1)*+m[2];
  if(/^Hearts?$/.test(k)){k="Max Health";v*=2}
  out.push({k:k+(m[3]?" %":""),v})}
 return d._stp=out}
// the generic Curio slot takes any accessory; items tagged only "Curio" still fit nowhere else
function bFits(d,k){return d.sl.includes(k)||(k==="Curio"&&d.sl.length>0)}
function bAvail(d){return ORDER.indexOf(d.t)<=ORDER.indexOf(BS.p)}
function bCaps(){const c={...SLOT_BASE};Object.values(BS.s).flat().forEach(id=>{const a=RL[id]?rlSlots(id):slotAdds(BYID[id]);for(const k in a)c[k]+=a[k]});return c}
function bParse(h){
 const [,p,c]=decodeURIComponent(h).split("/");BS={p:p!==undefined&&p!==""&&ACT[p]&&ORDER.includes(+p)?+p:ORDER[ORDER.length-1],s:{}};
 (c||"").split("|").filter(Boolean).forEach(part=>{const [k,ids]=part.split("=");if(k in SLOT_BASE)BS.s[k]=(ids||"").split(",").map(bLv).filter(i=>BYID[i]&&bFits(BYID[i],k))})}
// "id~level~a.b.c~stars": level, ability points and per-stat stars ("-" any roll, 0-9, a=10); invalid spends are trimmed to fit
function bLv(x){const [id,l,a,q]=x.split("~"),r=RL[id];if(r&&l!==undefined){RLV[id]=rlFit(r,Math.max(0,Math.min(r.mx,+l||0)),(a||"").split(".").map(Number),[...(q||"")].map(c=>c==="-"?-1:parseInt(c,11)))}return id}
function bHash(){return "#build/"+BS.p+"/"+Object.entries(BS.s).filter(([,v])=>v.length).map(([k,v])=>k+"="+v.map(id=>RL[id]?`${id}~${rlState(id).l}~${rlState(id).a.join(".")}${rlState(id).q.some(v=>v>=0)?"~"+rlState(id).q.map(v=>v<0?"-":v.toString(11)).join(""):""}`:id).join(",")).join("|")}
function bSave(){history.replaceState(null,"",bHash());buildPage()}
function bPreset(role){
 BS.s={};const pool=D.filter(d=>bAvail(d)&&!d.inv);
 const score=d=>(isMust(d)?1e6:0)+(d.ro.includes(role)?1e3:0)+d.r*10+(+d.sc||0);
 const order=pool.sort((a,b)=>score(b)-score(a)),used=new Set();
 for(const pass of [0,1]){const caps=bCaps();
  for(const d of order){if(used.has(d.id))continue;const adds=slotAdds(d),n=Object.keys(adds).length;
   if(pass===0&&!n)continue;if(pass===1&&!d.ro.includes(role)&&!isMust(d))continue;
   const k=d.sl.find(s=>s in caps&&caps[s]>(BS.s[s]||[]).length);if(!k)continue;
   (BS.s[k]=BS.s[k]||[]).push(d.id);used.add(d.id);for(const x in adds)caps[x]+=adds[x]}}
 bSave()}
function bOpts(k,q){
 const eq=new Set(Object.values(BS.s).flat());q=(q||"").toLowerCase();
 return D.filter(d=>bFits(d,k)&&bAvail(d)&&!eq.has(d.id)&&(!q||d.n.toLowerCase().includes(q)||d.fx.toLowerCase().includes(q)||d.m.toLowerCase().includes(q)))
  .sort((a,b)=>(isMust(b)-isMust(a))||(b.r-a.r)||((+b.sc||0)-(+a.sc||0))).slice(0,150)}
function bPickHtml(){
 if(!BPICK)return"";const xs=bOpts(BPICK,el("bq")?el("bq").value:"");
 return xs.map(d=>`<div class="bopt r${d.r}${BINSP===d.id?" sel":""}"><button class="bopi" data-insp="${esc(d.id)}" data-t="${d.ix}" title="Show recipe and details">${img(d.id)}<span><b>${esc(d.n)}</b><small>${esc(actL(d.t))} · ${isMust(d)?"★ Must-Have":RN[d.r]} · ${esc(d.m)}</small>${SK.i[d.id]?`<small>${skTag(d.id)}</small>`:""}<small class="bofx">${esc(d.fx)}</small></span></button><button class="chip" data-add="${esc(BPICK)}|${esc(d.id)}" aria-label="Add ${esc(d.n)}">Add</button></div>`).join("")||`<p class="note">Nothing for this slot on this path${el("bq")&&el("bq").value?" matches the search":""}.</p>`}
function bInspHtml(){
 const d=BINSP&&BYID[BINSP];if(!d)return"";const k0=Object.keys(BS.s).find(k=>BS.s[k].includes(d.id)),caps=bCaps();
 const adds=k0?"":Object.keys(SLOT_BASE).filter(k=>bFits(d,k)).map(k=>`<button class="chip" data-add="${esc(k)}|${esc(d.id)}"${(BS.s[k]||[]).length>=caps[k]?` title="${esc(k)} is full"`:""}>Add to ${esc(k)}</button>`).join("");
 const tree=rtreeHtml(d,true),how=d.gr?"":(d.src||[]).slice(0,3).map(s=>`<li>${fmt(s)}</li>`).join("");
 return `<div class="binsp"><div class="bph"><b class="bih">${img(d.id)}<span>${esc(d.n)}<small>${esc(d.sl.join(", "))} · ${esc(actL(d.t))} · ${esc(d.m)}</small></span></b><button class="ghost" data-insp="">Close</button></div>
<p class="bifx">${fmt(d.fx)}</p>${SK.i[d.id]?`<p class="bisk">${skTag(d.id)} <a href="#i${d.ix}">why?</a></p>`:""}${d.gr?tipRecipe(d).replace(/,18px\)/,",30px)"):""}${tree?`<h3>Recipe tree</h3><ul class="rtree">${tree}</ul><p class="note">Click an ingredient to open its recipe here.</p>`:how?`<h3>How to get it</h3><ul class="bihow">${how}</ul>`:""}
<p class="biact">${k0?`<button class="chip" data-rm="${esc(k0)}|${esc(d.id)}">Remove from ${esc(k0)}</button>`:bAvail(d)?adds:`<span class="note">Past your selected Path.</span>`} <a href="#i${d.ix}">Open full page →</a></p></div>`}
function buildPage(h){
 if(h!==undefined){bParse(h);BPICK=null;BINSP=null}
 document.title="Build planner · Linggango Relic Wiki";
 const caps=bCaps(),eq=Object.values(BS.s).flat(),tot={},lf=skLadder(eq);
 eq.forEach(id=>statsOf(BYID[id]).forEach(s=>tot[s.k]=Math.round(((tot[s.k]||0)+s.v*(lf[id]??1))*100)/100));
 const late=eq.filter(id=>!bAvail(BYID[id])).length;
 const row=k=>{const have=BS.s[k]||[],cap=caps[k],n=Math.max(cap,have.length);let b="";
  for(let i=0;i<n;i++){const id=have[i],xt=i>=SLOT_BASE[k]&&i<cap?" xtra":"";if(id){const d=BYID[id];b+=`<span class="bx on${xt}${bAvail(d)?"":" late"}${i>=cap?" over":""}${BINSP===id?" sel":""}"><button class="bxi" data-insp="${esc(id)}" data-t="${d.ix}" title="Show recipe and details">${img(id)}<span>${esc(d.n)}</span></button><button class="bxr" data-rm="${esc(k)}|${esc(id)}" aria-label="Remove ${esc(d.n)}" title="Remove">×</button></span>`}
   else b+=`<button class="bx${xt}${BPICK===k?" sel":""}" data-pick="${esc(k)}" aria-label="Add ${esc(k)} curio"${xt?' title="Bonus slot from an equipped curio"':""}>+</button>`}
  return `<div class="bslot"><div class="bsh"><b>${esc(k)}</b><span class="${have.length>cap?"bad":""}">${have.length}/${cap}</span>${caps[k]>SLOT_BASE[k]?`<em>+${caps[k]-SLOT_BASE[k]}</em>`:""}</div><div class="bsb">${b}</div></div>`};
 const stats=Object.entries(tot).filter(([,v])=>v).sort((a,b)=>a[0].localeCompare(b[0]));
 el("main").innerHTML=`${crumb("Build planner")}<h1>Build planner</h1>
<p class="lede">Pick the furthest Path you've reached, then fill your curio slots. Slot counts are the base pack's player slots; curios that add slots raise them, and the Curio slot takes any accessory. Hover any curio for its tooltip; click it to see its recipe tree, and use × to take it off.</p>
<div class="bbar"><label>Progress <select id="bp">${ORDER.map(a=>`<option value="${a}"${a===BS.p?" selected":""}>${esc(actL(a))}${a?" · "+esc(ACT[a][1]):""}</option>`).join("")}</select></label>
<span class="bpre">Starter build: ${Object.entries(ROLE).map(([k,v])=>`<button class="chip" data-preset="${k}">${v}</button>`).join("")}</span>
<span class="bact"><button class="chip" id="bcopy">Copy link</button><button class="chip" id="bclr">Clear</button></span></div>
${late?`<p class="bwarn">${late} curio${late>1?"s are":" is"} past your selected Path (marked red).</p>`:""}
<div class="bgrid"><div class="bslots">${Object.keys(SLOT_BASE).map(row).join("")}</div>
<aside class="bside">${bInspHtml()}${BPICK?`<div class="bpick"><div class="bph"><b>Add to ${esc(BPICK)}</b><button class="ghost" id="bpx">Close</button></div><input id="bq" type="search" placeholder="Search name, effect or mod" autocomplete="off"><div id="bopts" class="bopts">${bPickHtml()}</div></div>`:""}
<div class="bstats"><h2>Stat totals</h2>${stats.length?`<table>${stats.map(([k,v])=>`<tr><td>${esc(k.replace(/ %$/,""))}</td><td class="num ${v<0?"neg":""}">${v>0?"+":""}${v}${/ %$/.test(k)?"%":""}</td></tr>`).join("")}</table>`:`<p class="note">Add curios to see totals.</p>`}
<p class="note">Only flat "+N Stat" lines are added up${Object.values(lf).some(v=>v<1)?", and ladder-reduced curios count at their reduced share":""}. Effects, conditions and multipliers are listed below instead.</p></div>
${eq.some(id=>RL[id])?`<div class="bfx brl"><h2>Relic levels</h2>${eq.filter(id=>RL[id]).map(id=>rlPanel(id,true)).join("")}<p class="note">Slots a relic adds count its lowest roll.</p></div>`:""}
${eq.length?`<div class="bfx"><h2>Effects</h2><ul>${eq.map(id=>{const d=BYID[id];const k=Object.keys(BS.s).find(k=>BS.s[k].includes(id)),nx=(evo().to[id]||[]).filter(t=>bFits(BYID[t],k));return `<li><a href="#i${d.ix}" data-t="${d.ix}">${esc(d.n)}</a>: ${esc(d.fx)}${lf[id]<1?` <span class="sk sk-${lf[id]?"l":"n"}" title="Outranked by a better ${esc(SK.i[id].l[0])} curio in this build">${esc(SK.i[id].l[0])} ladder: ${lf[id]?pct(lf[id])+" strength":"switched off"}</span>`:""}${nx.map(t=>` <button class="chip" data-evo="${esc(k)}|${esc(id)}|${esc(t)}">Evolve → ${esc(BYID[t].n)}</button>`).join("")}</li>`}).join("")}</ul></div>`:""}</aside></div>`;
 el("bp").onchange=e=>{BS.p=+e.target.value;bSave()};
 el("bclr").onclick=()=>{BS.s={};BPICK=null;bSave()};
 el("bcopy").onclick=()=>{const u=location.href;(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>{el("bcopy").textContent="Link copied"},()=>prompt("Copy this link:",u))};
 if(el("bq")){el("bq").oninput=()=>{el("bopts").innerHTML=bPickHtml()};el("bpx").onclick=()=>{BPICK=null;buildPage()};el("bq").focus({preventScroll:true})}
 el("main").querySelector(".bgrid").onclick=e=>{
  const p=e.target.closest("[data-pick]"),rm=e.target.closest("[data-rm]"),ad=e.target.closest("[data-add]"),ev=e.target.closest("[data-evo]"),ins=e.target.closest("[data-insp]");
  if(ins){BINSP=ins.dataset.insp||null;hideTip();buildPage();const b=el("main").querySelector(".binsp");if(b&&innerWidth<=760)b.scrollIntoView({block:"start"})}
  else if(ev){const [k,id,to]=ev.dataset.evo.split("|");BS.s[k]=BS.s[k].map(x=>x===id?to:x);hideTip();bSave()}
  else if(p){BPICK=p.dataset.pick;buildPage()}
  else if(rm){const [k,id]=rm.dataset.rm.split("|");BS.s[k]=(BS.s[k]||[]).filter(x=>x!==id);hideTip();bSave()}
  else if(ad){const [k,id]=ad.dataset.add.split("|");(BS.s[k]=BS.s[k]||[]).push(id);if((BS.s[k].length>=bCaps()[k]))BPICK=null;hideTip();bSave()}};
 el("main").querySelector(".bpre").onclick=e=>{const b=e.target.closest("[data-preset]");if(b){BPICK=null;bPreset(b.dataset.preset)}};
}

// ACTS row (old guide table) for each Keeper
var BOSS_ACT={iron_colossus:1,goblin_lord:2,arion:3,eldorath:4,zoranth_forgotten:5,elvenite_paladin:6,vaedric:7,discord:8,sanghor:9,zoranth_newborn:10,nyxaris:11};
function pathText(s){return String(s).replace(/\bActs?\b/g,m=>m==="Acts"?"Paths":"Path")}
function bossPath(k){return ORDER.find(a=>PB[a]===k)}
function bossName(k){return (bst(k)&&bst(k).name)||(VBI[k==="ender_dragon"?"dragon":k]||{}).n||nmI("x:"+k)}
function bossList(){
 document.title="Bosses · Linggango Relic Wiki";
 const ks=ORDER.map(a=>PB[a]).filter(Boolean);
 el("main").innerHTML=`${crumb("Bosses")}<h1>Bosses</h1><p class="lede">Every Keeper in fight order, with the vanilla bosses placed where your gear can take them. Each one opens the next Path.</p>
<div class="blist">${ks.map(k=>{const a=bossPath(k),s=bst(k),e=s&&s.effective;return `<a class="bcardl" href="#boss/${k}" style="--tc:${ACT[a][2]}">${emblem(a,"sm")}<span><b>${esc(bossName(k))}</b><small>Opens ${esc(actL(a))} · ${D.filter(d=>d.t===a).length} curios</small>${e?`<small class="bnum">❤ ${Math.round(e.hp).toLocaleString()} · 🛡 ${e.armor} · ⚔ ${e.dmg}</small>`:""}</span></a>`}).join("")}</div>`}
function bossPage(k){
 const a=bossPath(k);if(a===undefined){bossList();return}
 const s=bst(k),nm=bossName(k),i=ORDER.indexOf(a),row=ACTS[BOSS_ACT[k]],xs=D.filter(d=>d.t===a).sort((p,q)=>(isMust(q)-isMust(p))||(q.r-p.r));
 const prev=ORDER.slice(0,i).reverse().find(x=>PB[x]),next=ORDER.slice(i+1).find(x=>PB[x]);
 const side=(typeof BOSSR!=="undefined"?BOSSR:[]).filter(r=>r[1]===ORDER[i-1]&&!/Keeper/.test(r[0]));
 document.title=`${nm} · Linggango Relic Wiki`;
 const ph=s&&s.phases?s.phases.map((p,j)=>`<tr><td>${s.phases.length>1?"Phase "+(j+1):"Stats"}</td><td class="num">${Math.round(p.base.hp).toLocaleString()}</td><td class="num">${p.pre_hardmode?Math.round(p.pre_hardmode.hp).toLocaleString():"—"}</td><td class="num">${p.hardmode?Math.round(p.hardmode.hp).toLocaleString():"—"}</td><td class="num">${p.base.armor}</td><td class="num">${p.base.dmg}${p.hardmode&&p.hardmode.dmg!==p.base.dmg?" → "+p.hardmode.dmg:""}</td></tr>`).join(""):"";
 el("main").innerHTML=`${crumb(`<a href="#bosses">Bosses</a>`,esc(nm))}<h1>${esc(nm)}</h1>
<div class="lhero big" style="--tc:${ACT[a][2]};${tex(a)}">${B3[k]?`<div class="stage" data-boss="${k}"></div>`:emblem(a,"lg")}<div class="bcard"><b>${esc(nm)}</b><small>Defeat it to open <a href="#act/${a}">${esc(actL(a))}</a></small>
${s&&s.effective?`<div class="bstat"><span>❤ ${Math.round(s.effective.hp).toLocaleString()} HP</span><span>🛡 ${s.effective.armor} armor</span><span>⚔ ${s.effective.dmg} damage</span></div>`:""}
${row?`<small class="bnote"><span>Weak to:</span> ${esc(row[2])}${row[4]&&row[4]!=="—"?` · <span>Looting Charm:</span> ${esc(row[4])}`:""}</small>`:""}</div></div>
<div class="bpg">
${s&&s.summon?`<section class="s"><h2>How to summon it</h2><p>${esc(pathText(s.summon))}</p></section>`:""}
${row&&row[5]?`<section class="s"><h2>Notes</h2><p>${esc(pathText(row[5]))}</p></section>`:""}
${ph?`<section class="s"><h2>Stats</h2><div class="tw"><table><tr><th></th><th>Base HP</th><th>Pack HP</th><th>Hardmode HP</th><th>Armor</th><th>Damage</th></tr>${ph}</table></div>${s.rules?`<ul class="note">${s.rules.map(r=>`<li>${esc(r)}</li>`).join("")}</ul>`:""}</section>`:""}
${s&&s.unlocks?`<section class="s"><h2>What it unlocks</h2><p>${esc(s.unlocks)}</p></section>`:""}
${side.length?`<section class="s"><h2>Side bosses to farm before it</h2><div class="tw"><table><tr><th>Boss</th><th>Notes</th><th>Useful drops</th></tr>${side.map(r=>`<tr><td><b>${esc(r[0])}</b></td><td>${esc(pathText(r[3]))}</td><td>${r[4].slice(0,5).map(id=>{const d=BYID[id];return d?`<a href="#i${d.ix}" data-t="${d.ix}">${esc(d.n)}</a>`:esc(nmI(id))}).join(", ")||"—"}</td></tr>`).join("")}</table></div></section>`:""}
<section class="s"><h2>Curios it unlocks (${xs.length})</h2><div class="cards">${xs.map((d,j)=>gcard(d,j)).join("")}</div></section>
<p class="bnav">${prev!==undefined?`<a href="#boss/${PB[prev]}">← ${esc(bossName(PB[prev]))}</a>`:"<span></span>"}${next!==undefined?`<a href="#boss/${PB[next]}">${esc(bossName(PB[next]))} →</a>`:""}</p></div>`}

function mechPage(){
 guide();document.title="Pack mechanics · Linggango Relic Wiki";
 const m=el("main");
 m.querySelectorAll('a[href="#guide"]').forEach(a=>a.setAttribute("href","#mechanics"));
 const h1=m.querySelector("h1");if(h1)h1.textContent="Pack mechanics";
 const c=m.querySelector(".crumb");if(c)c.innerHTML=`<a href="#">Home</a> / Pack mechanics`;
 const w=document.createTreeWalker(m,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))if(/\bActs?\b/.test(n.nodeValue))n.nodeValue=pathText(n.nodeValue);
}

const rIngr=x=>{const c={};x.gr.c.forEach(e=>{if(e&&e[0])c[e[0]]=(c[e[0]]||0)+1});return Object.entries(c)};
// "" unless some ingredient has its own recipe
function rtreeHtml(d,insp){
 if(!d.gr||!rIngr(d).some(([i])=>BYID[i]&&BYID[i].gr))return"";
 const seen=new Set();
 const node=(id,n,depth)=>{const x=BYID[id],sub=x&&x.gr&&depth<6&&!seen.has(id)?(seen.add(id),rIngr(x)):[];
  return `<li><span class="rn">${img(id)}${n>1?`<i>${n}×</i>`:""}${x?(insp?`<button class="lnk" data-insp="${esc(x.id)}" data-t="${x.ix}">${esc(x.n)}</button>`:`<a href="#i${x.ix}" data-t="${x.ix}">${esc(x.n)}</a>`)+`<small>${esc(actL(x.t))}</small>`:`<span>${esc(nmI(id.replace(/^#/,"")))}</span>`}</span>${sub.length?`<ul>${sub.map(([i,c])=>node(i,c,depth+1)).join("")}</ul>`:""}</li>`};
 return node(d.id,1,0)}
function recipeTree(d){
 const host=el("s-recipe"),tr=host&&rtreeHtml(d);if(!tr)return;
 host.insertAdjacentHTML("afterend",`<section class="s ip-sec" id="s-tree"><h2>Recipe tree</h2><ul class="rtree">${tr}</ul><p class="note">Curio ingredients open into their own recipes. Counts are per craft.</p></section>`)}

/* ---------- relic levels: per-level stats from the pack's Relics configs (RL, tools/relic_levels.py) ---------- */
var RLV={},RLMAX=Math.max(...Object.values(RL).map(r=>r.mx));
// 1 point per relic level (IRelicItem.addLevel), spent round-robin on unlocked abilities (lowest level first)
function rlAuto(r,l){const a=r.ab.map(()=>0);let p=0;
 for(let lv=1;lv<=l;lv++){p++;for(;;){let b=-1;r.ab.forEach((x,i)=>{if(x.rq<=lv&&a[i]<x.mx&&x.pt<=p&&(b<0||a[i]<a[b]))b=i});if(b<0)break;p-=r.ab[b].pt;a[b]++}}
 return a}
// keep a manual spend valid for level l: drop locked or over-max points, then refund from the last ability until it fits
function rlFit(r,l,a,q){const s={l,a:r.ab.map((x,i)=>x.rq>l?0:Math.max(0,Math.min(x.mx,a?a[i]|0:0))),q:rlStats(r).map((t,i)=>q&&q[i]>=0&&q[i]<=10?rlSnap(t,q[i]|0):-1)};
 for(let i=s.a.length-1;i>=0&&rlFree(r,s)<0;)s.a[i]?s.a[i]--:i--;return s}
function rlState(id){const r=RL[id];return RLV[id]||(RLV[id]=rlFit(r,Math.min(st.rl,r.mx),null,rlStats(r).map(()=>st.rq)))}
function rlStats(r){return r.ab.flatMap(x=>x.st)}
function rlFree(r,s){return s.l-r.ab.reduce((n,x,i)=>n+s.a[i]*x.pt,0)}
const jround=v=>Math.floor(v+.5);
// IRelicItem.getAbilityValue: upgrade op, clamp to the config thresholds, round to 5 places
function rlVal(t,x,z){let v=t.op==="A"?x+t.m*z:t.op==="MB"?x+x*t.m*z:x*Math.pow(t.m+1,z);
 if(t.t[0]!=null)v=Math.max(v,t.t[0]);if(t.t[1]!=null)v=Math.min(v,t.t[1]);return jround(v*1e5)/1e5}
// the relic's own formatValue, as a stack program pulled from its bytecode; prints like Java's String.valueOf
function rlFmt(p,v){const [r,int]=rlNum(p,v);return int||!Number.isInteger(r)?String(r):r+".0"}
function rlNum(p,v){const k=[];let int=0;
 for(const o of p){if(typeof o==="number")k.push(o);else if(o==="v")k.push(v);else if(o==="I")int=1;else if(o==="D")int=0;
  else if(o==="R"){const n=k.pop(),f=Math.pow(10,n);k.push(jround(k.pop()*f)/f)}else if(o==="r")k.push(jround(k.pop()));else if(o==="i")k.push(Math.trunc(k.pop()));else if(o==="n")k.push(-k.pop());
  else{const b=k.pop(),a=k.pop();k.push(o==="+"?a+b:o==="-"?a-b:o==="*"?a*b:a/b)}}
 return [k.pop(),int]}
// star quality 0..10 (half stars), IRelicItem.getStatByQuality / getStatQuality / getAbilityQuality / getRelicQuality
function rlBase(t,q){return t.lo===t.hi?t.lo:jround((t.lo+(t.hi-t.lo)/10*q)*1e5)/1e5}
function rlSQ(t,b){const f=v=>rlNum(t.p,v)[0],lo=f(t.lo),hi=f(t.hi);return lo===hi?10:Math.max(0,Math.min(10,jround((f(b)-lo)/((hi-lo)/10))))}
// stars a stat can really show (formatted values are coarse, e.g. whole slots): quality -> first quality step that reaches it
function rlQMap(t){if(!t._q){t._q=new Map();for(let q=0;q<=10;q++){const g=rlSQ(t,rlBase(t,q));if(!t._q.has(g))t._q.set(g,q)}}return t._q}
function rlSnap(t,v){let b=-1;for(const g of rlQMap(t).keys())if(b<0||Math.abs(g-v)<Math.abs(b-v)||(Math.abs(g-v)===Math.abs(b-v)&&g<b))b=g;return b}
function rlBQ(t,v){return rlBase(t,rlQMap(t).get(rlSnap(t,v)))}
function rlRelicQ(r,q){if(q.some(v=>v<0))return -1;let o=0,n=r.ab.length,s=0;
 r.ab.forEach(x=>{const qs=x.st.map((t,j)=>rlSnap(t,q[o+j]));o+=x.st.length;if(x.nq)n--;else s+=qs.length?Math.trunc(qs.reduce((p,c)=>p+c,0)/qs.length):0});
 return n>0?Math.max(0,Math.min(10,Math.trunc(s/n))):0}
function rlStars(q){return `<span class="rst" title="${q/2} of 5 stars">${[0,1,2,3,4].map(i=>`<i class="${q>=2*i+2?"f":q>=2*i+1?"h":""}">★</i>`).join("")}</span>`}
const RLQO=(q,t)=>`${q===-2?`<option value="-2" selected>mixed</option>`:""}<option value="-1"${q===-1?" selected":""}>any roll</option>${(t?[...rlQMap(t).keys()].sort((a,b)=>a-b):[...Array(11).keys()]).map(v=>`<option value="${v}"${v===q?" selected":""}>${v/2} ★</option>`).join("")}`;
function rlStat(t,z,q){const a=(q>=0?[rlVal(t,rlBQ(t,q),z)]:[rlVal(t,t.lo,z),rlVal(t,t.hi,z)].sort((p,c)=>p-c)).map(v=>rlFmt(t.p,v));if(!a[1])a[1]=a[0];
 return t.f.replace("%1$s",a[0]===a[1]?a[0]:a[0]+" ~ "+a[1]).replace(/%%/g,"%").replace(/\.$/,"")}
function rlXp(r,l){let t=0;for(let i=0;i<l;i++)t+=r.xp[0]+r.xp[1]*i;return t}
// tooltip: no spend is assumed, so each ability shows its base and the most this level could buy for it alone
function rlTip(d){const r=RL[d.id],l=Math.min(st.rl,r.mx),q=st.rq;
 return `<div class="trl"><b>Relic level ${l} / ${r.mx}</b> <small>${l} point${l===1?"":"s"} to spend${q>=0?` · every stat rolled near ${q/2} ★`:""}</small>${r.ab.map(x=>{if(x.rq>l)return `<p class="trlk">🔒 ${esc(x.n)}: unlocks at level ${x.rq}</p>`;
  const z=Math.min(x.mx,Math.floor(l/x.pt));return `<p><b>${esc(x.n)}</b>${x.st.length?` <small>${z?`up to ${z}/${x.mx}`:`0/${x.mx}`}</small>${x.st.map(t=>` · ${esc(t.n)} ${esc(rlStat(t,0,q))}${z?` → ${esc(rlStat(t,z,q))}`:""}`).join("")}`:" <small>passive</small>"}</p>`}).join("")}</div>`}
function rlBody(id,compact){const r=RL[id],s=rlState(id),free=rlFree(r,s),rq=rlRelicQ(r,s.q);let o=0;
 return `<p class="rls"><b>Level ${s.l} / ${r.mx}</b> · <span class="${free?"rlf":""}">${free} point${free===1?"":"s"} free</span> <button class="ghost" data-rlx="auto">Auto-spend</button>${s.a.some(Boolean)?` <button class="ghost" data-rlx="reset">Reset</button>`:""}</p>
 ${s.q.length?`<p class="rlq"><label>Roll quality <select data-rlq="all" aria-label="Set every stat's stars">${RLQO(s.q.every(v=>v===s.q[0])?s.q[0]:-2)}</select></label> ${rq>=0?`Relic ${rlStars(rq)} <small>${rq/2} / 5</small>`:`<small>pick stars to see the relic's rating</small>`}</p>`:""}
 ${r.ab.map((x,i)=>{const lock=x.rq>s.l;return `<div class="rla${lock?" lk":""}"><div class="rlah"><b>${esc(x.n)}</b>${lock?`<span>🔒 unlocks at relic level ${x.rq}</span>`:!x.mx?`<span>passive, no upgrades</span>`:`<span>level ${s.a[i]} / ${x.mx}${x.pt>1?` · ${x.pt} points each`:""}</span><button class="chip" data-rlx="-${i}"${s.a[i]?"":" disabled"} aria-label="Lower ${esc(x.n)}">−</button><button class="chip" data-rlx="+${i}"${s.a[i]<x.mx&&free>=x.pt?"":" disabled"} aria-label="Raise ${esc(x.n)}">+</button>`}</div>${x.st.length?`<ul>${x.st.map(t=>{const j=o++;return `<li>${esc(t.n)}: <b>${esc(rlStat(t,lock?0:s.a[i],s.q[j]))}</b>${t.lo===t.hi?"":` <select class="rlqs" data-rlq="${j}" aria-label="${esc(t.n)} stars">${RLQO(s.q[j],t)}</select>`}</li>`}).join("")}</ul>`:""}</div>`}).join("")}
 ${compact?"":`<p class="note">Each relic level gives 1 point; spend them with + and −, or let Auto-spend spread them evenly. Values follow this pack's config and the mod's own rounding: a new relic rolls a random base inside the range (its stars: 0 ★ is the worst roll, 5 ★ the best; the relic's rating averages its abilities), upgrades scale it, and some stats have a hard cap. Reaching level ${s.l} takes ${rlXp(r,s.l).toLocaleString()} relic XP.</p>`}`}
function rlPanel(id,compact){const r=RL[id],s=rlState(id);
 return `<div class="rlp${compact?" sm":""}" data-rl="${esc(id)}"><label class="rlh">${compact?esc(BYID[id].n):"Relic level"} <input type="range" min="0" max="${r.mx}" value="${s.l}" data-rlv aria-label="Relic level"></label><div class="rlb">${rlBody(id,compact)}</div></div>`}
function rlDraw(p){p.querySelector(".rlb").innerHTML=rlBody(p.dataset.rl,p.classList.contains("sm"))}
document.addEventListener("input",e=>{const v=e.target.closest("[data-rlv]");if(!v)return;const p=v.closest("[data-rl]"),id=p.dataset.rl;RLV[id]=rlFit(RL[id],+v.value,rlState(id).a,rlState(id).q);rlDraw(p)});
document.addEventListener("change",e=>{const g=e.target.closest("[data-rlq]");if(g){const p=g.closest("[data-rl]"),s=rlState(p.dataset.rl),v=+g.value;if(g.dataset.rlq==="all"){if(v>-2)s.q=rlStats(RL[p.dataset.rl]).map(t=>v<0?-1:rlSnap(t,v))}else s.q[+g.dataset.rlq]=v;location.hash.startsWith("#build")?bSave():rlDraw(p);return}
 if(e.target.closest("[data-rlv]")&&location.hash.startsWith("#build"))bSave()});
document.addEventListener("click",e=>{const b=e.target.closest("[data-rlx]");if(!b)return;const p=b.closest("[data-rl]"),id=p.dataset.rl,r=RL[id],s=rlState(id),x=b.dataset.rlx;
 if(x==="auto")s.a=rlAuto(r,s.l);else if(x==="reset")s.a=s.a.map(()=>0);else s.a[+x.slice(1)]+=x[0]==="+"?1:-1;
 location.hash.startsWith("#build")?bSave():rlDraw(p)});
// slots a levelled relic adds: the mod applies Math.round to the value; chosen roll, else the lowest (e.g. Leather Belt "Charms")
function rlSlots(id){const r=RL[id],s=rlState(id),o={};
 let n=0;r.ab.forEach((x,i)=>{const o0=n;n+=x.st.length;if(x.rq<=s.l)x.st.forEach((t,j)=>{const k=/slots?/i.test(t.f)&&Object.keys(SLOT_BASE).find(k=>k.toLowerCase()===t.n.toLowerCase().replace(/s$/,""));if(k)o[k]=(o[k]||0)+jround(s.q[o0+j]>=0?rlVal(t,rlBQ(t,s.q[o0+j]),s.a[i]):Math.min(rlVal(t,t.lo,s.a[i]),rlVal(t,t.hi,s.a[i])))})});return o}

/* ---------- duplicates: what a second copy does, read from the mods' bytecode (tools/stacking.py) ---------- */
const SKL={y:"Stacks",p:"Partly stacks",n:"Doesn't stack",u:"One per player"};
const SKW={u:"The game won't let you equip a second copy.",s:"Its stat bonus is tied to the slot it sits in, so each copy adds it again.",c:"Its effect counts how many copies you wear.",
 f:"Its stat bonus uses one fixed ID, so a second copy just replaces the first.",o:"Its effect only checks whether one is worn."};
const pct=v=>Math.round(v*100)+"%";
function skTag(id){const k=SK.i[id];return k?(k.s?`<span class="sk sk-${k.s}">${SKL[k.s]}</span>`:"")+(k.l?`<span class="sk sk-l">${esc(k.l[0])} ladder #${k.l[1]}</span>`:""):""}
function skLadderText(l){return `${esc(l[0])} set, place ${l[1]}. Linggango lets only the best ${esc(l[0])} curio you wear work in full; the next best keeps ${pct(SK.f[0])} of its effect (upsides and costs alike), the third ${pct(SK.f[1])}, and any more switch off.${l[2]?` This one switches off completely as soon as a better ${esc(l[0])} curio is worn.`:""} A copy of the same curio doesn't outrank it.`}
function skSec(d){const k=SK.i[d.id];if(!k)return"";
 const lad=k.l?D.filter(x=>SK.i[x.id]&&SK.i[x.id].l&&SK.i[x.id].l[0]===k.l[0]).sort((a,b)=>SK.i[a.id].l[1]-SK.i[b.id].l[1]):[];
 return `${k.s?`<p><b class="sk sk-${k.s}">${SKL[k.s]}</b> ${[...k.w].map(c=>SKW[c]).join(" ")}</p>`:""}${k.l?`<p><b class="sk sk-l">${esc(k.l[0])} ladder</b> ${skLadderText(k.l)}</p>
 <ol class="sklad">${lad.map(x=>`<li${x===d?' class="me"':""}>${img(x.id)}<a href="#i${x.ix}" data-t="${x.ix}">${esc(x.n)}</a>${SK.i[x.id].l[2]?' <small>switches off when outranked</small>':""}</li>`).join("")}</ol>`:""}
 <p class="note">Read from the mods' code by a script: it looks at how each curio's bonuses are keyed and how its effects check what you wear. Effects coded in unusual ways can be missed.</p>`}
// linggango_tweaks AccessoryStacking.factorFor: share of its effect each worn ladder curio keeps
function skLadder(ids){const out={};
 ids.forEach(id=>{const l=SK.i[id]&&SK.i[id].l;if(!l)return;let n=0;
  ids.map(j=>SK.i[j]&&SK.i[j].l).filter(m=>m&&m[0]===l[0]&&m[1]<l[1]).sort((a,b)=>a[1]-b[1]).forEach(m=>{if(!(m[2]&&n))n++});
  out[id]=!n?1:l[2]?0:n===1?SK.f[0]:n===2?SK.f[1]:0});
 return out}

/* ---------- evolutions: More Relics "evolves from", Somake Spells spellbook tiers ---------- */
var EVO=null;
function evo(){if(EVO)return EVO;EVO={from:{},to:{}};const byN={};D.forEach(d=>byN[d.n.toLowerCase()]=d);
 D.forEach(d=>{let p=null;for(const s of d.src){const m=s.match(/evolves from ([^.]+)\./i);if(m)p=byN[m[1].trim().toLowerCase()]}
  if(!p&&d.m==="Somake Spells"){const m=d.n.match(/^(.*) (II|III)$/);if(m)p=byN[(m[2]==="II"?m[1]:m[1]+" II").toLowerCase()]}
  if(p&&p!==d){EVO.from[d.id]=p.id;(EVO.to[p.id]=EVO.to[p.id]||[]).push(d.id)}});return EVO}
function evoChain(id){const E=evo();let r=id;while(E.from[r])r=E.from[r];const out=[];const walk=x=>{out.push(x);(E.to[x]||[]).forEach(walk)};walk(r);return out}
function evoSec(d){const c=evoChain(d.id);if(c.length<2)return "";
 return `<ol class="evo">${c.map((id,i)=>{const x=BYID[id];return `${i?`<li class="evh">↓ <span>${fmt(x.src[0]||"")}</span></li>`:""}<li class="evs${id===d.id?" cur":""}">${img(id)}${id===d.id?`<b>${esc(x.n)}</b>`:`<a href="#i${x.ix}" data-t="${x.ix}">${esc(x.n)}</a>`}<small>${esc(actL(x.t))}</small></li>`}).join("")}</ol>`}

/* ---------- field search: free words plus mod:x slot:y stat:z … ---------- */
var SOFT=false,IDXSIG="",FQT=0,FQS=null,FHINT=false,FKEY="mod",QP={raw:null};
var QK={mod:"m",slot:"s",stat:"st",stats:"st",effect:"fx",fx:"fx",source:"src",src:"src",drop:"src",path:"p",rarity:"r",role:"ro",type:"g",tag:"x",name:"n"};
var QOR={m:1,s:1,p:1,r:1,ro:1,g:1,x:1};
var QFIELDS=[["mod","Mod"],["slot","Slot"],["stat","Stat"],["effect","Effect"],["source","Source"],["path","Path"],["rarity","Rarity"],["role","Role"],["type","Craft or loot"],["tag","Element or mechanic"],["name","Name"]];
var QNAME={m:"Mod",s:"Slot",st:"Stat",fx:"Effect",src:"Source",p:"Path",r:"Rarity",ro:"Role",g:"Type",x:"Tag",n:"Name"};
function qNorm(s){return String(s||"").toLowerCase().replace(/[–—]/g,"-")}
function parseQ(q){const o={raw:q,t:[],k:{}};
 (q.match(/-?[a-z]+:"[^"]*"?|-?"[^"]*"?|\S+/gi)||[]).forEach(w=>{const raw=w;let neg=false;if(w[0]==="-"&&w.length>1){neg=true;w=w.slice(1)}
  const m=w.match(/^([a-z]+):(.*)$/i),k=m&&QK[m[1].toLowerCase()],v=qNorm((k?m[2]:w).replace(/"/g,"")).trim();if(!v)return;
  const e={v,neg,raw,k:k||""};k?(o.k[k]=o.k[k]||[]).push(e):o.t.push(e)});return o}
function qParsed(){if(QP.raw!==st.q)QP=parseQ(st.q);return QP}
function qTokens(){const P=qParsed();return [...P.t,...Object.values(P.k).flat()]}
function qLabel(e){return (e.neg?"not ":"")+(e.k?QNAME[e.k]+": ":"“")+e.v+(e.k?"":"”")}
function qDrop(raw){return st.q.split(raw).join(" ").replace(/\s+/g," ").trim()}
function qf(d){if(d._q)return d._q;const F=mf(d.m);
 return d._q={n:qNorm(d.n),m:qNorm(d.m+"|"+(F?F[2]:"")),s:qNorm(d.sl.join("|")),st:qNorm(d.st.join(" | ")),fx:qNorm(d.fx),src:qNorm(srcText(d)),
  p:qNorm(ACT[d.t][0]),pl:qNorm(actL(d.t)),r:qNorm(RN[d.r]+(isMust(d)?"|"+RN[d.br]:"")),ro:qNorm(d.ro.map(k=>ROLE[k]).join("|")),g:qNorm(d.g),
  x:qNorm(d.mt.map(t=>t.slice(2)).join("|")),all:qNorm(d.n+" "+d.fx+" "+srcText(d)+" "+d.m+" "+d.id+" "+d.st.join(" "))}}
function qHit(d,f,k,v){
 if(k==="p")return v===f.p||v===String(d.t)||v===f.pl||"path "+v===f.pl||(f.p==="0-i"&&(v==="0"||v==="i"))||(v.length>2&&f.pl.includes(v));
 if(k==="r"||k==="ro"||k==="g")return f[k].split("|").some(x=>x.startsWith(v));
 return qHas(f[k],v)}
function qHas(s,v){if(!/^[a-z0-9]/.test(v))return s.includes(v);for(let i=s.indexOf(v);i>=0;i=s.indexOf(v,i+1))if(!i||!/[a-z0-9]/.test(s[i-1]))return true;return false}
function qMatch(d){if(!st.q)return true;const P=qParsed(),f=qf(d);
 for(const e of P.t)if(qHas(f.all,e.v)===e.neg)return false;
 for(const k in P.k){const es=P.k[k],pos=es.filter(e=>!e.neg);
  if(es.some(e=>e.neg&&qHit(d,f,k,e.v)))return false;
  if(pos.length&&!(QOR[k]?pos.some(e=>qHit(d,f,k,e.v)):pos.every(e=>qHit(d,f,k,e.v))))return false}
 return true}
function fOn(){return !!(st.c.length||st.r.length||st.x.length||st.g.length||st.nw||st.m||st.s||st.a!==""||st.q)}
function fSug(k){const u=new Set(),add=x=>x&&u.add(x);
 if(k==="mod")MODS.forEach(([m])=>add(m));else if(k==="slot")SLOTS.forEach(([s])=>add(s));else if(k==="path")ORDER.forEach(a=>add(ACT[a][0]));
 else if(k==="rarity")RN.forEach(add);else if(k==="role")Object.values(ROLE).forEach(add);else if(k==="type"){add("Craft");add("Loot")}
 else if(k==="tag")D.forEach(d=>d.mt.forEach(t=>add(t.slice(2))));else if(k==="stat")D.forEach(d=>statsOf(d).forEach(s=>add(s.k)));
 return [...u].sort((a,b)=>String(a).localeCompare(String(b)))}
function fbar(n,total){
 return `<div class="fbar" role="search"><div class="fbr"><input id="fq" type="search" autocomplete="off" spellcheck="false" placeholder="Search, or filter: mod:terramity slot:ring stat:damage" aria-label="Search and filter curios" value="${esc(st.q)}"><span class="fn">${n===total?`${total} curios`:`${n} of ${total}`}</span></div>
<div class="fbr fadd"><select id="fk" aria-label="Filter field">${QFIELDS.map(([k,t])=>`<option value="${k}"${k===FKEY?" selected":""}>${t}</option>`).join("")}</select><input id="fv" list="fvl" autocomplete="off" placeholder="Value" aria-label="Filter value"><datalist id="fvl"></datalist><button class="chip" id="fgo">Add filter</button><button class="ghost" id="fhelp" aria-expanded="${FHINT}">How it works</button></div>
<p class="fhint" id="fhint"${FHINT?"":" hidden"}>Words search names, effects, stats and sources. Add <b>field:value</b> to narrow it down, e.g. <code>mod:terramity slot:ring stat:damage</code>. The same field twice means either one (<code>slot:ring slot:charm</code>); different fields must all match. Put <b>-</b> in front to exclude (<code>-mod:brutality</code>) and quotes around spaces (<code>stat:"attack speed"</code>). Fields: mod, slot, stat, effect, source, path, rarity, role, type, tag, name. Sidebar filters stack with these.</p>
<div class="fbr frl"><label for="frl">Relic level in tooltips</label><input id="frl" type="range" min="0" max="${RLMAX}" value="${Math.min(st.rl,RLMAX)}"><b id="frlv">${st.rl>=RLMAX?"Max":st.rl}</b><label class="frq">Stars <select id="frq">${RLQO(st.rq)}</select></label><span class="fn">${Object.keys(RL).length} Relics and More Relics curios; each stops at its own max</span></div>
${activeBar()}</div>`}
function fbind(){const q=el("fq");if(!q)return;
 const rl=el("frl");rl.oninput=()=>{st.rl=+rl.value;el("frlv").textContent=st.rl>=RLMAX?"Max":st.rl;TIPC.clear();save()};
 el("frq").onchange=e=>{st.rq=+e.target.value;TIPC.clear();save()};
 q.oninput=()=>{clearTimeout(FQT);FQT=setTimeout(()=>{st.q=q.value.trim();el("q").value=st.q;FQS=[q.selectionStart,q.selectionEnd];refresh()},220)};
 const k=el("fk"),v=el("fv"),sug=()=>{el("fvl").innerHTML=fSug(k.value).map(x=>`<option value="${esc(x)}">`).join("")};
 k.onchange=()=>{FKEY=k.value;sug();v.focus()};sug();
 const add=()=>{const val=v.value.trim().replace(/"/g,"");if(!val)return;st.q=(st.q+" "+k.value+":"+(/\s/.test(val)?`"${val}"`:val)).trim();el("q").value=st.q;refresh()};
 el("fgo").onclick=add;v.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();add()}};
 el("fhelp").onclick=()=>{FHINT=!FHINT;el("fhint").hidden=!FHINT;el("fhelp").setAttribute("aria-expanded",FHINT)};
 if(FQS){q.focus({preventScroll:true});q.setSelectionRange(FQS[0],FQS[1]);FQS=null}}
