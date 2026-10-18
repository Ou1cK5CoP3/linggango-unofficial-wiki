
/* ---------- build planner, boss guides, pack mechanics, recipe trees ---------- */
// Player curio slots: merged curios/slots data from the base pack jars (Scroll, Spellstone, Focus are registered in code: assumed 1)
var SLOT_BASE={Head:1,Necklace:2,Back:1,Body:1,Belt:1,Hands:2,Ring:2,Bracelet:2,Glove:2,Anklet:2,Feet:2,Charm:6,Accessory:6,Heart:1,Spellbook:1,Scroll:1,Spellstone:1,Talent:2,Focus:1,"Hostility Curse":1,Curio:1,Elytra:1,"Binding Key":1,Magnetizer:1,Bundle:1};
var SLOT_MAIN=["Head","Necklace","Back","Body","Belt","Hands","Ring","Bracelet","Glove","Anklet","Feet","Charm","Accessory","Heart"];
var STAT_ALIAS={"Knockback Res":"Knockback Resistance","Knockback resistance":"Knockback Resistance","Increased reach":"Reach","Increased block reach":"Block Reach","Step Height Addition":"Step Height"};
var BS={p:12,s:{}},BPICK=null;

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
function bAvail(d){return ORDER.indexOf(d.t)<=ORDER.indexOf(BS.p)}
function bCaps(){const c={...SLOT_BASE};Object.values(BS.s).flat().forEach(id=>{const a=slotAdds(BYID[id]);for(const k in a)c[k]+=a[k]});return c}
function bParse(h){
 const [,p,c]=decodeURIComponent(h).split("/");BS={p:p!==undefined&&p!==""&&ACT[p]&&ORDER.includes(+p)?+p:ORDER[ORDER.length-1],s:{}};
 (c||"").split("|").filter(Boolean).forEach(part=>{const [k,ids]=part.split("=");if(k in SLOT_BASE)BS.s[k]=(ids||"").split(",").filter(i=>BYID[i]&&BYID[i].sl.includes(k))})}
function bHash(){return "#build/"+BS.p+"/"+Object.entries(BS.s).filter(([,v])=>v.length).map(([k,v])=>k+"="+v.join(",")).join("|")}
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
 return D.filter(d=>d.sl.includes(k)&&bAvail(d)&&!eq.has(d.id)&&(!q||d.n.toLowerCase().includes(q)||d.fx.toLowerCase().includes(q)||d.m.toLowerCase().includes(q)))
  .sort((a,b)=>(isMust(b)-isMust(a))||(b.r-a.r)||((+b.sc||0)-(+a.sc||0))).slice(0,150)}
function bPickHtml(){
 if(!BPICK)return"";const xs=bOpts(BPICK,el("bq")?el("bq").value:"");
 return xs.map(d=>`<button class="bopt r${d.r}" data-add="${esc(BPICK)}|${esc(d.id)}" data-t="${d.ix}">${img(d.id)}<span><b>${esc(d.n)}</b><small>${esc(actL(d.t))} · ${isMust(d)?"★ Must-Have":RN[d.r]} · ${esc(d.m)}</small></span></button>`).join("")||`<p class="note">Nothing for this slot on this path${el("bq")&&el("bq").value?" matches the search":""}.</p>`}
function buildPage(h){
 if(h!==undefined){bParse(h);BPICK=null}
 document.title="Build planner · Linggango Relic Wiki";
 const caps=bCaps(),eq=Object.values(BS.s).flat(),tot={};
 eq.forEach(id=>statsOf(BYID[id]).forEach(s=>tot[s.k]=Math.round(((tot[s.k]||0)+s.v)*100)/100));
 const late=eq.filter(id=>!bAvail(BYID[id])).length;
 const row=k=>{const have=BS.s[k]||[],cap=caps[k],n=Math.max(cap,have.length);let b="";
  for(let i=0;i<n;i++){const id=have[i];if(id){const d=BYID[id];b+=`<button class="bx on${bAvail(d)?"":" late"}${i>=cap?" over":""}" data-rm="${esc(k)}|${esc(id)}" data-t="${d.ix}" title="Remove">${img(id)}<span>${esc(d.n)}</span></button>`}
   else b+=`<button class="bx${BPICK===k?" sel":""}" data-pick="${esc(k)}" aria-label="Add ${esc(k)} curio">+</button>`}
  return `<div class="bslot"><div class="bsh"><b>${esc(k)}</b><span class="${have.length>cap?"bad":""}">${have.length}/${cap}</span>${caps[k]>SLOT_BASE[k]?`<em>+${caps[k]-SLOT_BASE[k]}</em>`:""}</div><div class="bsb">${b}</div></div>`};
 const extra=Object.keys(SLOT_BASE).filter(k=>!SLOT_MAIN.includes(k));
 const stats=Object.entries(tot).filter(([,v])=>v).sort((a,b)=>a[0].localeCompare(b[0]));
 el("main").innerHTML=`${crumb("Build planner")}<h1>Build planner</h1>
<p class="lede">Pick the furthest Path you've reached, then fill your curio slots. Slot counts are the base pack's player slots; curios that add slots raise them. Click a filled slot to remove it, and hover any curio for its tooltip.</p>
<div class="bbar"><label>Progress <select id="bp">${ORDER.map(a=>`<option value="${a}"${a===BS.p?" selected":""}>${esc(actL(a))}${a?" · "+esc(ACT[a][1]):""}</option>`).join("")}</select></label>
<span class="bpre">Starter build: ${Object.entries(ROLE).map(([k,v])=>`<button class="chip" data-preset="${k}">${v}</button>`).join("")}</span>
<span class="bact"><button class="chip" id="bcopy">Copy link</button><button class="chip" id="bclr">Clear</button></span></div>
${late?`<p class="bwarn">${late} curio${late>1?"s are":" is"} past your selected Path (marked red).</p>`:""}
<div class="bgrid"><div class="bslots">${SLOT_MAIN.map(row).join("")}<details class="bmore"${extra.some(k=>(BS.s[k]||[]).length)||extra.includes(BPICK)?" open":""}><summary>More slots (spellbook, scroll, talent…)</summary>${extra.map(row).join("")}</details></div>
<aside class="bside">${BPICK?`<div class="bpick"><div class="bph"><b>Add to ${esc(BPICK)}</b><button class="ghost" id="bpx">Close</button></div><input id="bq" type="search" placeholder="Search name, effect or mod" autocomplete="off"><div id="bopts" class="bopts">${bPickHtml()}</div></div>`:""}
<div class="bstats"><h2>Stat totals</h2>${stats.length?`<table>${stats.map(([k,v])=>`<tr><td>${esc(k.replace(/ %$/,""))}</td><td class="num ${v<0?"neg":""}">${v>0?"+":""}${v}${/ %$/.test(k)?"%":""}</td></tr>`).join("")}</table>`:`<p class="note">Add curios to see totals.</p>`}
<p class="note">Only flat "+N Stat" lines are added up. Effects, conditions, relic levels and multipliers are listed below instead.</p></div>
${eq.length?`<div class="bfx"><h2>Effects</h2><ul>${eq.map(id=>{const d=BYID[id];return `<li><a href="#i${d.ix}" data-t="${d.ix}">${esc(d.n)}</a>: ${esc(d.fx)}</li>`}).join("")}</ul></div>`:""}</aside></div>`;
 el("bp").onchange=e=>{BS.p=+e.target.value;bSave()};
 el("bclr").onclick=()=>{BS.s={};BPICK=null;bSave()};
 el("bcopy").onclick=()=>{const u=location.href;(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>{el("bcopy").textContent="Link copied"},()=>prompt("Copy this link:",u))};
 if(el("bq")){el("bq").oninput=()=>{el("bopts").innerHTML=bPickHtml()};el("bpx").onclick=()=>{BPICK=null;buildPage()};el("bq").focus({preventScroll:true})}
 el("main").querySelector(".bgrid").onclick=e=>{
  const p=e.target.closest("[data-pick]"),rm=e.target.closest("[data-rm]"),ad=e.target.closest("[data-add]");
  if(p){BPICK=p.dataset.pick;buildPage()}
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

function recipeTree(d){
 const host=el("s-recipe");if(!host||!d.gr)return;
 const ingr=x=>{const c={};x.gr.c.forEach(e=>{if(e&&e[0])c[e[0]]=(c[e[0]]||0)+1});return Object.entries(c)};
 if(!ingr(d).some(([i])=>BYID[i]&&BYID[i].gr))return;
 const seen=new Set();
 const node=(id,n,depth)=>{const x=BYID[id],sub=x&&x.gr&&depth<6&&!seen.has(id)?(seen.add(id),ingr(x)):[];
  return `<li><span class="rn">${img(id)}${n>1?`<i>${n}×</i>`:""}${x?`<a href="#i${x.ix}" data-t="${x.ix}">${esc(x.n)}</a><small>${esc(actL(x.t))}</small>`:`<span>${esc(nmI(id.replace(/^#/,"")))}</span>`}</span>${sub.length?`<ul>${sub.map(([i,c])=>node(i,c,depth+1)).join("")}</ul>`:""}</li>`};
 host.insertAdjacentHTML("afterend",`<section class="s ip-sec" id="s-tree"><h2>Recipe tree</h2><ul class="rtree">${node(d.id,1,0)}</ul><p class="note">Curio ingredients open into their own recipes. Counts are per craft.</p></section>`)}
