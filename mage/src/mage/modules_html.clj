(ns mage.modules-html
  "Standalone HTML explorer for the module hierarchy, emitted by `./bin/mage modules-tree --html`.
  The CSS/JS/markup below are inlined into one self-contained file — no external assets, works offline.
  The module data is embedded as JSON; everything interactive (tree building, filtering, dependency
  tracing) happens client-side in [[js]]."
  (:require
   ^:clj-kondo/ignore
   [cheshire.core :as json]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:private css "
:root{
  --bg:#f7f8fa; --panel:#ffffff; --panel-2:#fbfcfd; --ink:#1a1f27; --ink-soft:#5b6572;
  --line:#e4e8ee; --line-strong:#d2d8e0; --accent:#4a6fe8; --accent-soft:#e8eeff;
  --group:#8a94a3; --chip:#eef1f6; --chip-ink:#3a4350; --shadow:0 1px 2px rgba(20,30,50,.06),0 8px 24px rgba(20,30,50,.06);
  --uses:#e8892b; --usedby:#2fa36b;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0f1319; --panel:#161b23; --panel-2:#12161d; --ink:#e6eaf0; --ink-soft:#8b96a6;
  --line:#252c37; --line-strong:#323a48; --accent:#6d8bff; --accent-soft:#1c2740;
  --group:#5a6472; --chip:#1c222c; --chip-ink:#b9c3d1; --shadow:0 1px 2px rgba(0,0,0,.3),0 12px 32px rgba(0,0,0,.35);
  --uses:#e89a4d; --usedby:#4cc98a;
}}
:root[data-theme=light]{
  --bg:#f7f8fa; --panel:#ffffff; --panel-2:#fbfcfd; --ink:#1a1f27; --ink-soft:#5b6572;
  --line:#e4e8ee; --line-strong:#d2d8e0; --accent:#4a6fe8; --accent-soft:#e8eeff;
  --group:#8a94a3; --chip:#eef1f6; --chip-ink:#3a4350; --shadow:0 1px 2px rgba(20,30,50,.06),0 8px 24px rgba(20,30,50,.06);
  --uses:#e8892b; --usedby:#2fa36b;
}
:root[data-theme=dark]{
  --bg:#0f1319; --panel:#161b23; --panel-2:#12161d; --ink:#e6eaf0; --ink-soft:#8b96a6;
  --line:#252c37; --line-strong:#323a48; --accent:#6d8bff; --accent-soft:#1c2740;
  --group:#5a6472; --chip:#1c222c; --chip-ink:#b9c3d1; --shadow:0 1px 2px rgba(0,0,0,.3),0 12px 32px rgba(0,0,0,.35);
  --uses:#e89a4d; --usedby:#4cc98a;
}
:root[data-theme=solarized-light]{
  --bg:#eee8d5; --panel:#fdf6e3; --panel-2:#f4eeda; --ink:#586e75; --ink-soft:#93a1a1;
  --line:#e3ddc8; --line-strong:#d3ccb4; --accent:#268bd2; --accent-soft:#dceaf4;
  --group:#93a1a1; --chip:#e7e0cc; --chip-ink:#586e75; --shadow:0 1px 2px rgba(88,110,117,.12),0 10px 26px rgba(88,110,117,.14);
  --uses:#cb4b16; --usedby:#859900;
}
:root[data-theme=solarized-dark]{
  --bg:#002b36; --panel:#073642; --panel-2:#053039; --ink:#93a1a1; --ink-soft:#657b83;
  --line:#0a3f4c; --line-strong:#164955; --accent:#2aa7d8; --accent-soft:#0f4657;
  --group:#586e75; --chip:#08313c; --chip-ink:#93a1a1; --shadow:0 1px 2px rgba(0,0,0,.3),0 12px 32px rgba(0,0,0,.4);
  --uses:#cb4b16; --usedby:#859900;
}
:root[data-theme=gruvbox]{
  --bg:#282828; --panel:#32302f; --panel-2:#3c3836; --ink:#ebdbb2; --ink-soft:#a89984;
  --line:#3c3836; --line-strong:#504945; --accent:#8ec07c; --accent-soft:#3a4a3a;
  --group:#928374; --chip:#3c3836; --chip-ink:#d5c4a1; --shadow:0 1px 2px rgba(0,0,0,.3),0 12px 32px rgba(0,0,0,.4);
  --uses:#fe8019; --usedby:#b8bb26;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--ink);
  font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;display:flex;flex-direction:column;height:100vh;overflow:hidden}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
header{display:flex;align-items:center;gap:16px;padding:12px 20px;border-bottom:1px solid var(--line);
  background:var(--panel);flex-wrap:wrap}
header h1{font-size:15px;font-weight:650;margin:0;letter-spacing:-.01em;white-space:nowrap}
header h1 .dim{color:var(--ink-soft);font-weight:400}
.stats{color:var(--ink-soft);font-size:12.5px;display:flex;gap:14px;flex-wrap:wrap}
.stats b{color:var(--ink);font-weight:600}
.grow{flex:1}
.search{position:relative}
.search input{width:230px;padding:7px 11px 7px 30px;border:1px solid var(--line-strong);border-radius:8px;
  background:var(--panel-2);color:var(--ink);font-size:13px;outline:none}
.search input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.search svg{position:absolute;left:9px;top:8px;width:15px;height:15px;color:var(--ink-soft)}
.ghost{border:1px solid var(--line-strong);background:var(--panel-2);color:var(--ink-soft);
  border-radius:8px;padding:6px 11px;font-size:12.5px;cursor:pointer}
.ghost:hover{color:var(--ink);border-color:var(--accent)}
.themepick{display:inline-flex;align-items:center;gap:6px;padding:0 9px}
.themepick .ticon{color:var(--ink-soft);flex-shrink:0}
.themepick:hover .ticon,.themepick:hover .tchev{color:var(--ink)}
.themepick select{border:none;background:transparent;color:inherit;font:inherit;font-size:12.5px;
  padding:6px 0;cursor:pointer;-webkit-appearance:none;appearance:none;outline:none}
.themepick .tchev{color:var(--ink-soft);font-size:10px;pointer-events:none}
.legend{display:flex;gap:6px;flex-wrap:wrap;padding:10px 20px;border-bottom:1px solid var(--line);
  background:var(--panel-2);align-items:center}
.legend .lbl{color:var(--ink-soft);font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;margin-right:2px}
.tchip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:20px;font-size:12px;
  border:1px solid var(--line-strong);background:var(--panel);cursor:pointer;user-select:none;color:var(--ink)}
.tchip .dot{width:9px;height:9px;border-radius:50%}
.tchip.off{opacity:.4}
.tchip .ct{color:var(--ink-soft);font-size:11px}
main{flex:1;display:flex;min-height:0}
.tree{flex:1;overflow:auto;padding:10px 8px 40px;min-width:0;overflow-anchor:none}
.detail{width:380px;flex-shrink:0;border-left:1px solid var(--line);background:var(--panel);
  overflow:auto;padding:0}
.row{display:flex;align-items:center;gap:7px;padding:3px 6px;border-radius:7px;cursor:pointer;
  white-space:nowrap;position:relative}
.row:hover{background:var(--panel-2)}
.row.sel{background:var(--accent-soft)}
.row.dim{opacity:.32}
.caret{width:14px;height:14px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;
  color:var(--ink-soft);transition:transform .12s;font-size:10px}
.caret.none{visibility:hidden}
.row.open>.caret{transform:rotate(90deg)}
.dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.dot.group{background:transparent;border:1.5px solid var(--group)}
.name{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}
.name.group{color:var(--group)}
.badge{font-size:9.5px;font-weight:700;padding:1px 5px;border-radius:5px;letter-spacing:.03em}
.badge.ent{background:var(--accent-soft);color:var(--accent)}
.badge.star{color:var(--uses);border:1px solid var(--uses);padding:0 4px}
.badge.debt{background:transparent;border:1px solid var(--uses);color:var(--uses);padding:0 4px}
.badge.bypass{background:transparent;border:1px dashed var(--group);color:var(--group);padding:0 4px}
.submini{font-size:10px;color:var(--group);margin-left:5px}
.row.flat{padding-left:8px}
.ghost.on{color:var(--accent);border-color:var(--accent);background:var(--accent-soft)}
.mini{font-size:10.5px;color:var(--ink-soft);margin-left:2px}
.cnt-in{color:var(--usedby);font-weight:600}
.cnt-out{color:var(--uses);font-weight:600}
.dep-mark{display:inline-block;width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-left:3px;vertical-align:middle}
.dep-mark.uses{background:var(--uses)}
.dep-mark.usedby{background:var(--usedby)}
.kids{margin-left:15px;border-left:1px solid var(--line);padding-left:2px}
.kids.hidden{display:none}
/* detail panel */
.d-empty{padding:60px 26px;color:var(--ink-soft);text-align:center;font-size:13px}
.d-head{padding:18px 20px 14px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--panel);z-index:2}
.d-title{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:16px;font-weight:600;
  word-break:break-all;display:flex;align-items:center;gap:8px}
.d-title .dot{width:11px;height:11px}
.d-sub{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.d-body{padding:6px 20px 40px}
.d-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:16px}
.stat{background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:9px 5px;text-align:center}
.stat b{display:block;font-size:16px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.2}
.stat span{font-size:9px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.03em}
.sec{margin-top:18px}
.sec h3{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);margin:0 0 8px;
  display:flex;align-items:center;gap:7px}
.sec h3 .n{background:var(--chip);color:var(--chip-ink);border-radius:20px;padding:0 7px;font-size:10.5px;
  letter-spacing:0;font-weight:600}
.sec h3 .swatch{width:8px;height:8px;border-radius:50%}
.chips{display:flex;flex-wrap:wrap;gap:5px}
.chip{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;padding:3px 8px;
  border-radius:6px;background:var(--chip);color:var(--chip-ink);border:1px solid transparent}
.chip.link{cursor:pointer}
.chip.link:hover{border-color:var(--accent);color:var(--accent)}
.chip.model{background:transparent;border:1px dashed var(--line-strong)}
.empty-note{color:var(--ink-soft);font-size:12px;font-style:italic}
.d-team{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink)}
.nsnote{margin-top:10px;font-size:12px;color:var(--ink-soft);background:var(--panel-2);
  border:1px solid var(--line);border-radius:8px;padding:8px 10px;line-height:1.45}
.nsnote code{color:var(--uses)}
@media (max-width:820px){.detail{position:fixed;right:0;top:0;bottom:0;box-shadow:var(--shadow);width:min(380px,90vw);
  transform:translateX(100%);transition:transform .2s}.detail.show{transform:none}}
")

(def ^:private body-html "
<header>
  <h1>Metabase <span class=dim>module tree</span></h1>
  <div class=stats id=stats></div>
  <div class=grow></div>
  <div class=search>
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><circle cx='11' cy='11' r='7'/><path d='m21 21-4.3-4.3'/></svg>
    <input id=q type=search placeholder='Filter modules…' autocomplete=off spellcheck=false>
  </div>
  <button class=ghost id=debt title='Show only modules with an unfilled boundary (:any / :bypass)'>Debt only</button>
  <button class=ghost id=view title='Toggle flat coupling-hotspots view'>Hotspots</button>
  <button class=ghost id=expand>Expand all</button>
  <button class=ghost id=collapse>Collapse</button>
  <select class=ghost id=sortby title='Sort hotspots by'>
    <option value='used-by'>by used-by</option>
    <option value='uses'>by uses</option>
  </select>
  <label class='themepick ghost' title='Theme'>
    <svg class=ticon viewBox='0 0 24 24' width='15' height='15' fill='none' stroke='currentColor' stroke-width='2'><circle cx='12' cy='12' r='9'/><path d='M12 3a9 9 0 0 0 0 18' fill='currentColor' stroke='none'/></svg>
    <select id=theme>
      <option value=''>System</option>
      <option value='light'>Light</option>
      <option value='dark'>Dark</option>
      <option value='solarized-light'>Solarized Light</option>
      <option value='solarized-dark'>Solarized Dark</option>
      <option value='gruvbox'>Gruvbox</option>
    </select>
    <span class=tchev>▾</span>
  </label>
</header>
<div class=legend id=legend></div>
<main>
  <div class=tree id=tree></div>
  <aside class=detail id=detail><div class=d-empty>Select a module to see its team, API surface, and dependencies.</div></aside>
</main>
")

(def ^:private js "
'use strict';
const byId = Object.fromEntries(MODULES.map(m => [m.id, m]));
// team -> color (stable palette, assigned in first-seen order over sorted teams)
const TEAMS = [...new Set(MODULES.map(m => m.team).filter(Boolean))].sort();
const PALETTE = ['#4a6fe8','#e8892b','#2fa36b','#c0468a','#7d5fe0','#2fa8c0','#d0443b','#b0952f','#5a7a3a','#8a5a3a','#607080'];
const teamColor = {}; TEAMS.forEach((t,i)=>teamColor[t]=PALETTE[i%PALETTE.length]);
const teamCount = {}; MODULES.forEach(m=>{ if(m.team) teamCount[m.team]=(teamCount[m.team]||0)+1; });

// ---- build the display tree from each module's `path` --------------------
function makeNode(seg){ return {seg, children:new Map(), module:null}; }
const root = makeNode('');
for(const m of MODULES){
  let cur = root;
  m.path.forEach((seg,i)=>{
    if(!cur.children.has(seg)) cur.children.set(seg, makeNode(seg));
    cur = cur.children.get(seg);
    if(i===m.path.length-1) cur.module = m;
  });
}
// number of modules under each node (shown as a count on group/parent rows)
(function countSub(node){ let n=0; for(const k of node.children.values()){ n += (k.module?1:0)+countSub(k); } node.sub=n; return n; })(root);
function sortedKids(node){
  return [...node.children.values()].sort((a,b)=>{
    const ax=a.seg==='enterprise'?1:0, bx=b.seg==='enterprise'?1:0;   // enterprise sorts last
    return ax-bx || a.seg.localeCompare(b.seg);
  });
}

// ---- state ---------------------------------------------------------------
const open = new Set();            // node dom-path keys currently expanded
// team focus: empty = passive (every team shown); non-empty = show only these.
// toggling a team in/out; emptying the set returns to passive.
const focusTeams = new Set();
function teamActive(t){ return focusTeams.size===0 || focusTeams.has(t); }
function refreshTeamChips(){
  for(const el of legend.querySelectorAll('.tchip'))
    el.classList.toggle('off', focusTeams.size>0 && !focusTeams.has(el.dataset.team));
}
let selected = null;               // module id
let query = '';
let debtOnly = false, view = 'tree', sortBy = 'used-by';
function isDebt(m){ return !!(m && (m['uses-any'] || m['api-any'] || m['model-imports-bypass'])); }
function teamOk(m){ return !m || !m.team || teamActive(m.team); }

// ---- header stats + legend ----------------------------------------------
const ent = MODULES.filter(m=>m.enterprise).length;
const starred = MODULES.filter(m=>m['ns-prefix']).length;
const debtN = MODULES.filter(isDebt).length;
document.getElementById('stats').innerHTML =
  `<span><b>${MODULES.length}</b> modules</span><span><b>${ent}</b> enterprise</span>`+
  `<span><b>${starred}</b> ns-prefixed</span><span><b>${debtN}</b> unfilled</span><span><b>${TEAMS.length}</b> teams</span>`;

const legend = document.getElementById('legend');
legend.innerHTML = '<span class=lbl>Teams</span>';
for(const t of TEAMS){
  const el = document.createElement('span');
  el.className='tchip'; el.dataset.team=t;
  el.innerHTML=`<span class=dot style='background:${teamColor[t]}'></span>${t}<span class=ct>${teamCount[t]}</span>`;
  el.onclick=()=>{ focusTeams.has(t)?focusTeams.delete(t):focusTeams.add(t); refreshTeamChips(); render(); };
  legend.appendChild(el);
}
const hint=document.createElement('span');
hint.style.cssText='margin-left:auto;color:var(--ink-soft);font-size:11.5px';
hint.innerHTML=`each row: <span class=mono><span class=cnt-in>used-by</span> →●→ <span class=cnt-out>uses</span></span> (● = the module) · select one to trace deps`;
legend.appendChild(hint);

// ---- tree rendering ------------------------------------------------------
const treeEl = document.getElementById('tree');

// which module ids match the current query (module + its ancestors stay visible)
function matches(m){
  if(debtOnly && !isDebt(m)) return false;
  if(!query) return true;
  return m.id.toLowerCase().includes(query) || (m.team||'').toLowerCase().includes(query);
}
// precompute, for an active filter, the set of node-keys that must remain visible
function visibleKeys(){
  if(!query && !debtOnly) return null;
  const keep = new Set();
  (function walk(node, path){
    let any=false;
    for(const kid of sortedKids(node)){
      const kpath = path.concat(kid.seg);
      const key = kpath.join('/');
      const self = kid.module && matches(kid.module);
      const below = walk(kid, kpath);
      if(self||below){ keep.add(key); any=true; }
    }
    return any;
  })(root, []);
  return keep;
}

// Append dependency dots directly to the row as flex children (7px each). Wrapping them in a span
// would make that span a flex item whose line box inherits line-height:1.5 (~21px), taller than the
// row text — so related rows would grow/shrink by ~1px as selection moves. Direct children don't.
function appendDepMarks(row, m){
  if(!selected || !m) return;
  const s = byId[selected];
  const mark=(cls,title)=>{ const d=document.createElement('span'); d.className='dep-mark '+cls; d.title=title; row.appendChild(d); };
  if(s.uses.includes(m.id)) mark('uses', 'used by '+selected);
  if(s['used-by'].includes(m.id)) mark('usedby', 'uses '+selected);
}

let visibleIds = [];   // module ids currently rendered, in visual order (for keyboard nav)

function appendBadges(row, m){
  if(m.enterprise){ const b=document.createElement('span'); b.className='badge ent'; b.textContent='EE'; row.appendChild(b); }
  if(m['ns-prefix']){ const b=document.createElement('span'); b.className='badge star'; b.textContent='∗'; b.title='namespaces not yet moved: '+m['ns-prefix']; row.appendChild(b); }
  if(m['api-any']||m['uses-any']){ const b=document.createElement('span'); b.className='badge debt'; b.textContent='any';
    b.title=[m['api-any']?'no API namespace (:api :any)':'', m['uses-any']?'unrestricted deps (:uses :any)':''].filter(Boolean).join(' · '); row.appendChild(b); }
  if(m['model-imports-bypass']){ const b=document.createElement('span'); b.className='badge bypass'; b.textContent='bypass'; b.title='imports any model (:model-imports :bypass)'; row.appendChild(b); }
}
function appendCounts(row, m){
  const c=document.createElement('span'); c.className='mini';
  const inN=document.createElement('span'); inN.className='cnt-in'; inN.textContent=m['used-by'].length;
  const outN=document.createElement('span'); outN.className='cnt-out'; outN.textContent=m.uses.length;
  c.append(inN, ' →●→ ', outN);   // used-by → (this module) → uses
  c.title=`${m['used-by'].length} used by · uses ${m.uses.length}`; row.appendChild(c);
}
// Build a row's shared content (caret slot, team dot, name, badges, counts, dep-marks).
function buildRow(m, label, hasKids){
  const row=document.createElement('div');
  row.className='row'+(m&&m.id===selected?' sel':'')+((m&&!teamOk(m))?' dim':'');
  if(m) row.dataset.id=m.id;
  const caret=document.createElement('span'); caret.className='caret'+(hasKids?'':' none'); caret.textContent='▶'; row.appendChild(caret);
  const dot=document.createElement('span'); dot.className='dot'+(m?'':' group');
  if(m&&m.team) dot.style.background=teamColor[m.team]; else if(m) dot.style.background='var(--group)';
  row.appendChild(dot);
  const name=document.createElement('span'); name.className='name'+(m?'':' group'); name.textContent=label; row.appendChild(name);
  if(m){ appendBadges(row,m); appendCounts(row,m); }
  appendDepMarks(row,m);
  return {row, caret};
}

function render(){
  visibleIds=[];
  if(view==='hotspots') return renderHotspots();
  const scroll = treeEl.scrollTop;   // full rebuild resets scroll; restore it so selecting a node doesn't jump
  const keep = visibleKeys();
  treeEl.innerHTML='';
  const frag = document.createDocumentFragment();
  (function walk(node, path, container){
    for(const kid of sortedKids(node)){
      const kpath = path.concat(kid.seg);
      const key = kpath.join('/');
      if(keep && !keep.has(key)) continue;
      const m = kid.module;
      const hasKids = kid.children.size>0;
      const {row, caret} = buildRow(m, kid.seg, hasKids);
      const isOpen = open.has(key) || (keep && keep.has(key));
      if(hasKids && isOpen) row.classList.add('open');
      if(hasKids){ const sc=document.createElement('span'); sc.className='submini'; sc.textContent=kid.sub; sc.title=kid.sub+' modules below'; row.appendChild(sc); }
      if(m) visibleIds.push(m.id);
      const kidsBox=document.createElement('div');
      kidsBox.className='kids'+(hasKids&&isOpen?'':' hidden');
      const toggle=()=>{ if(open.has(key)) open.delete(key); else open.add(key); render(); };
      if(hasKids) caret.onclick=(e)=>{ e.stopPropagation(); toggle(); };
      row.onclick=(e)=>{ e.stopPropagation(); if(m) select(m.id); else if(hasKids) toggle(); };
      container.appendChild(row);
      container.appendChild(kidsBox);
      if(hasKids) walk(kid, kpath, kidsBox);
    }
  })(root, [], frag);
  treeEl.appendChild(frag);
  treeEl.scrollTop = scroll;
}

// Flat, sortable coupling view: rank modules by fan-in (used-by) or fan-out (uses).
function renderHotspots(){
  const scroll = treeEl.scrollTop;
  treeEl.innerHTML='';
  const frag = document.createDocumentFragment();
  const list = MODULES.filter(m => matches(m) && teamOk(m))
    .sort((a,b) => (sortBy==='uses' ? b.uses.length-a.uses.length : b['used-by'].length-a['used-by'].length)
                   || a.id.localeCompare(b.id));
  for(const m of list){
    const {row} = buildRow(m, m.id, false);
    row.classList.add('flat');
    row.onclick=(e)=>{ e.stopPropagation(); select(m.id); };
    visibleIds.push(m.id);
    frag.appendChild(row);
  }
  treeEl.appendChild(frag);
  treeEl.scrollTop = scroll;
}

// ---- detail panel --------------------------------------------------------
const detailEl=document.getElementById('detail');
function chip(text, link){
  const c=document.createElement('span');
  c.className='chip'+(link?' link':'');
  c.textContent=text;
  if(link&&byId[text]) c.onclick=()=>select(text);
  return c;
}
function section(title, items, opts={}){
  if(!items||!items.length) return null;
  const s=document.createElement('div'); s.className='sec';
  const h=document.createElement('h3');
  if(opts.swatch){ h.innerHTML=`<span class=swatch style='background:${opts.swatch}'></span>`; }
  h.append(title);
  const n=document.createElement('span'); n.className='n'; n.textContent=items.length; h.appendChild(n);
  s.appendChild(h);
  const box=document.createElement('div'); box.className='chips';
  for(const it of items) box.appendChild(chip(it, opts.link));
  s.appendChild(box);
  return s;
}
function expandAncestors(id){ const p=byId[id]&&byId[id].path; if(!p) return; for(let i=1;i<p.length;i++) open.add(p.slice(0,i).join('/')); }
function scrollToSelected(){ if(!selected) return; const el=treeEl.querySelector('[data-id='+JSON.stringify(selected)+']'); if(el) el.scrollIntoView({block:'center'}); }
function syncHash(){ history.replaceState(null,'', selected ? '#'+encodeURIComponent(selected) : location.pathname+location.search); }
function select(id){
  selected = (selected===id)?null:id;
  if(selected && view==='tree') expandAncestors(selected);   // reveal: open the path down to it
  render();
  syncHash();
  if(!selected){ detailEl.innerHTML='<div class=d-empty>Select a module to see its team, API surface, and dependencies.</div>'; return; }
  scrollToSelected();
  const m=byId[id];
  detailEl.classList.add('show');
  detailEl.innerHTML='';
  const head=document.createElement('div'); head.className='d-head';
  const t=document.createElement('div'); t.className='d-title';
  const dot=document.createElement('span'); dot.className='dot'; dot.style.background=m.team?teamColor[m.team]:'var(--group)';
  t.appendChild(dot); t.append(m.id); head.appendChild(t);
  const sub=document.createElement('div'); sub.className='d-sub';
  if(m.team){ const tm=document.createElement('span'); tm.className='d-team';
    tm.innerHTML=`<span class=dot style='width:9px;height:9px;background:${teamColor[m.team]}'></span>${m.team}`; sub.appendChild(tm); }
  if(m.enterprise){ const b=document.createElement('span'); b.className='badge ent'; b.textContent='ENTERPRISE'; sub.appendChild(b); }
  head.appendChild(sub);
  if(m['ns-prefix']){ const n=document.createElement('div'); n.className='nsnote';
    n.innerHTML=`Namespaces not yet moved to match the module name — still at <code>${m['ns-prefix']}</code>`; head.appendChild(n); }
  detailEl.appendChild(head);

  const body=document.createElement('div'); body.className='d-body';
  if(m.stats){
    const st=document.createElement('div'); st.className='d-stats';
    for(const [k,v] of [['namespaces',m.stats.namespaces],['lines',m.stats.loc],['tests',m.stats.tests],['commits',m.stats.commits]]){
      const d=document.createElement('div'); d.className='stat';
      d.innerHTML=`<b>${(v||0).toLocaleString()}</b><span>${k}</span>`;
      if(k==='tests'&&m.stats['test-files']) d.title=`${m.stats.tests} deftest across ${m.stats['test-files']} files`;
      st.appendChild(d);
    }
    body.appendChild(st);
  }
  const api = m['api-any']?['(any — no API namespace yet)']:m.api;
  const secs=[
    section('API namespaces', api),
    m['uses-any']
      ? section('Uses', ['(any — unrestricted)'])
      : section('Uses', m.uses, {link:true, swatch:'var(--uses)'}),
    section('Used by', m['used-by'], {link:true, swatch:'var(--usedby)'}),
    section('Friends', m.friends, {link:true}),
    section('Module exports', m['module-exports'], {link:true}),
    section('Model exports', m['model-exports']),
    section(m['model-imports-bypass']?'Model imports (bypass)':'Model imports',
            m['model-imports-bypass']?['(bypass — imports any model)']:m['model-imports']),
  ].filter(Boolean);
  if(secs.length) secs.forEach(s=>body.appendChild(s));
  else { const e=document.createElement('div'); e.className='empty-note'; e.textContent='No declared dependencies or surface.'; body.appendChild(e); }
  detailEl.appendChild(body);
}

// ---- controls ------------------------------------------------------------
document.getElementById('q').addEventListener('input', e=>{ query=e.target.value.trim().toLowerCase(); render(); });
function expandAll(){ (function all(node,path){ for(const kid of node.children.values()){ const kp=path.concat(kid.seg);
  if(kid.children.size) open.add(kp.join('/')); all(kid,kp); } })(root,[]); }
document.getElementById('expand').onclick=()=>{ expandAll(); render(); };
document.getElementById('collapse').onclick=()=>{ open.clear(); render(); };
const rootEl=document.documentElement;
const themeSel=document.getElementById('theme');
function applyTheme(v){ v ? rootEl.setAttribute('data-theme',v) : rootEl.removeAttribute('data-theme'); }
try{ const saved=localStorage.getItem('mb-modtree-theme'); if(saved!==null){ themeSel.value=saved; applyTheme(saved); } }catch(e){}
themeSel.onchange=()=>{ applyTheme(themeSel.value); try{ localStorage.setItem('mb-modtree-theme', themeSel.value); }catch(e){} };

// tech-debt lens + hotspots view + sort
const qInput=document.getElementById('q');
const debtBtn=document.getElementById('debt');
debtBtn.onclick=()=>{ debtOnly=!debtOnly; debtBtn.classList.toggle('on',debtOnly); render(); };
const viewBtn=document.getElementById('view');
const sortSel=document.getElementById('sortby');
function syncView(){
  viewBtn.textContent = view==='tree' ? 'Hotspots' : 'Tree';
  viewBtn.classList.toggle('on', view==='hotspots');
  document.getElementById('expand').style.display = view==='tree' ? '' : 'none';
  document.getElementById('collapse').style.display = view==='tree' ? '' : 'none';
  sortSel.style.display = view==='hotspots' ? '' : 'none';
}
viewBtn.onclick=()=>{ view = view==='tree'?'hotspots':'tree'; syncView();
  if(view==='tree'&&selected) expandAncestors(selected); render(); if(view==='tree'&&selected) scrollToSelected(); };
sortSel.onchange=()=>{ sortBy=sortSel.value; render(); };
syncView();

// keyboard: / focuses search, Esc clears/deselects, ↑/↓ move selection through visible rows
document.addEventListener('keydown', e=>{
  if(e.key==='/' && document.activeElement!==qInput){ e.preventDefault(); qInput.focus(); qInput.select(); return; }
  if(e.key==='Escape'){
    if(document.activeElement===qInput && qInput.value){ qInput.value=''; query=''; render(); qInput.blur(); }
    else if(selected){ select(selected); }
    return;
  }
  if((e.key==='ArrowDown'||e.key==='ArrowUp') && visibleIds.length){
    e.preventDefault();
    let i=visibleIds.indexOf(selected);
    if(e.key==='ArrowDown') i = i<0 ? 0 : Math.min(i+1, visibleIds.length-1);
    else                    i = i<0 ? visibleIds.length-1 : Math.max(i-1, 0);
    if(visibleIds[i] && visibleIds[i]!==selected) select(visibleIds[i]);
  }
});
// deep-link: reflect selection in the URL hash, and honor it on load / back-forward
window.addEventListener('hashchange', ()=>{ const h=decodeURIComponent(location.hash.slice(1)); if(byId[h] && h!==selected) select(h); });

// fully expanded by default
expandAll();
render();
{ const h=decodeURIComponent(location.hash.slice(1)); if(byId[h]) select(h); }
")

(def ^:private html-head
  "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>Metabase Module Tree</title>")

(defn page
  "Render the full standalone HTML document for `nodes` (a seq of the plain-data module maps built by
  [[mage.modules/modules->viz-data]]). `</` inside the embedded JSON is escaped so a stray closing tag
  in the data can never terminate the `<script>` early."
  [nodes]
  (str html-head
       "<style>" css "</style></head><body>"
       body-html
       "<script>const MODULES = " (str/replace (json/generate-string nodes) "</" "<\\/") ";</script>"
       "<script>" js "</script>"
       "</body></html>"))
