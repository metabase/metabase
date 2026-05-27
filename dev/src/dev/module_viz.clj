(ns dev.module-viz
  "Interactive Cytoscape.js visualization of the Metabase modules graph.

  Backed by a small Ring/Jetty server so the browser only fetches the *pruned* subgraph for the
  module currently in focus instead of the full 600+ node hairball. Endpoints:

    GET /                  -> HTML shell
    GET /api/modules       -> [{:label :team :apiCount}] for the picker
    GET /api/focus?m=NAME  -> {:nodes [...] :edges [...]} 1-degree neighborhood of NAME
    GET /api/full          -> full graph (escape hatch / debugging)

  Usage:

    (require '[dev.module-viz :as v])
    (v/start!)            ;; default port 4321, opens browser
    (v/stop!)"
  (:require
   [cheshire.core :as json]
   [clojure.java.shell :as sh]
   [clojure.string :as str]
   [dev.deps-graph :as deps-graph]
   [ring.adapter.jetty :as jetty]))

(set! *warn-on-reflection* true)

(defn- module-id [m] (str "mod:" m))
(defn- ns-id [m ns-symb] (str "ns:" m "/" ns-symb))

;; --- data ---------------------------------------------------------------------------------------

(def ^:private cache
  "Cache the expensive `deps-graph/dependencies` + `kondo-config` results across requests so refocus
  is near-instant. Reset with `(reset-cache!)` if you edit the kondo config."
  (atom nil))

(defn reset-cache! [] (reset! cache nil))

(defn- build-cache []
  (let [kondo (deps-graph/kondo-config)
        deps  (deps-graph/dependencies)
        ;; Build module node + child api-ns node list once.
        module-nodes (into {}
                           (map (fn [[m {:keys [team api friends]}]]
                                  [m {:data {:id       (module-id m)
                                             :label    (str m)
                                             :type     "module"
                                             :module   (str m)
                                             :team     (or team "?")
                                             :apiCount (cond
                                                         (= api :any) 0
                                                         (set? api)   (count api)
                                                         :else        0)
                                             :friends  (mapv str (or friends []))}}]))
                           kondo)
        api-children (into {}
                           (map (fn [[m {:keys [api]}]]
                                  [m (when (set? api)
                                       (mapv (fn [ns-symb]
                                               {:data {:id     (ns-id m ns-symb)
                                                       :label  (str ns-symb)
                                                       :type   "ns"
                                                       :parent (module-id m)
                                                       :module (str m)}})
                                             api))]))
                           kondo)
        ;; Collapse all external usages into distinct (consumer, producer, producer-ns) triples
        ;; once. Indexed by both consumer and producer for fast 1-degree lookup.
        all-edges    (into []
                           (comp
                            (mapcat (fn [m] (deps-graph/external-usages deps m)))
                            (map (fn [{:keys [module depends-on-module depends-on-namespace]}]
                                   [module depends-on-module depends-on-namespace]))
                            (distinct)
                            (keep (fn [[consumer producer producer-ns]]
                                    (when (and consumer producer (not= consumer producer))
                                      (let [producer-api (get-in kondo [producer :api])
                                            target (if (and (set? producer-api)
                                                            (contains? producer-api producer-ns))
                                                     (ns-id producer producer-ns)
                                                     (module-id producer))]
                                        {:data {:id           (str "e:" consumer "->" producer "/" producer-ns)
                                                :source       (module-id consumer)
                                                :target       target
                                                :sourceModule (str consumer)
                                                :targetModule (str producer)
                                                :targetNs     (str producer-ns)}})))))
                           (keys kondo))
        ;; Index for 1-degree lookups: module-symbol -> edges touching it.
        edges-by-mod (reduce
                      (fn [m e]
                        (let [s (symbol (get-in e [:data :sourceModule]))
                              t (symbol (get-in e [:data :targetModule]))]
                          (-> m
                              (update s (fnil conj []) e)
                              (cond-> (not= s t) (update t (fnil conj []) e)))))
                      {}
                      all-edges)]
    {:kondo        kondo
     :module-nodes module-nodes
     :api-children api-children
     :all-edges    all-edges
     :edges-by-mod edges-by-mod}))

(defn- ensure-cache! []
  (or @cache (reset! cache (build-cache))))

(defn modules-list
  "[{:label :team :apiCount}] for the picker dropdown."
  []
  (let [{:keys [module-nodes]} (ensure-cache!)]
    (->> (vals module-nodes)
         (map (fn [n] {:label    (get-in n [:data :label])
                       :team     (get-in n [:data :team])
                       :apiCount (get-in n [:data :apiCount])}))
         (sort-by :label))))

(defn focus-subgraph
  "1-degree neighborhood for module-label."
  [module-label]
  (let [{:keys [module-nodes api-children edges-by-mod]} (ensure-cache!)
        m-sym (symbol module-label)]
    (if-not (contains? module-nodes m-sym)
      {:error (str "unknown module: " module-label)
       :nodes [] :edges []}
      (let [incident (get edges-by-mod m-sym [])
            neighbor-labels (into #{m-sym}
                                  (mapcat (fn [e]
                                            [(symbol (get-in e [:data :sourceModule]))
                                             (symbol (get-in e [:data :targetModule]))]))
                                  incident)
            nodes (vec
                   (mapcat (fn [label]
                             (when-let [mn (get module-nodes label)]
                               (cons mn (get api-children label []))))
                           neighbor-labels))
            ;; Only edges touching focused module (1-degree view).
            edges (filterv (fn [e]
                             (let [s (symbol (get-in e [:data :sourceModule]))
                                   t (symbol (get-in e [:data :targetModule]))]
                               (and (contains? neighbor-labels s)
                                    (contains? neighbor-labels t)
                                    (or (= s m-sym) (= t m-sym)))))
                           incident)]
        {:focus module-label
         :nodes nodes
         :edges edges
         :stats {:moduleCount (count neighbor-labels)
                 :edgeCount   (count edges)}}))))

(defn full-graph []
  (let [{:keys [module-nodes api-children all-edges]} (ensure-cache!)
        nodes (vec
               (mapcat (fn [[m mn]]
                         (cons mn (get api-children m [])))
                       module-nodes))]
    {:nodes nodes :edges all-edges}))

;; --- HTML ---------------------------------------------------------------------------------------

(def ^:private html-page
  "<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\"/>
<title>Metabase Modules Graph</title>
<style>
  html, body { margin:0; padding:0; height:100%; overflow:hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  #app { display:flex; height:100vh; overflow:hidden; }
  #cy { flex:1 1 auto; min-height:0; min-width:0; background:#fafafa; }
  #side { width:340px; height:100vh; box-sizing:border-box; border-left:1px solid #ddd; background:#fff; padding:12px; overflow:auto; font-size:13px; }
  #side h2 { margin:8px 0 4px; font-size:14px; }
  #side h3 { margin:10px 0 4px; font-size:12px; color:#666; text-transform:uppercase; letter-spacing:.04em; }
  #side .pill { display:inline-block; padding:2px 6px; background:#eef; border-radius:4px; margin-right:4px; font-size:11px; }
  #toolbar { padding:8px; border-bottom:1px solid #ddd; background:#fff; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  #toolbar input[type=text] { padding:4px 8px; border:1px solid #ccc; border-radius:4px; min-width:240px; }
  #toolbar button { padding:4px 10px; border:1px solid #ccc; background:#f7f7f7; border-radius:4px; cursor:pointer; }
  #toolbar button:hover { background:#eee; }
  #wrap { display:flex; flex-direction:column; flex:1 1 auto; min-height:0; min-width:0; overflow:hidden; }
  .muted { color:#888; font-size:11px; }
  ul { margin:4px 0; padding-left:18px; }
  li { margin:2px 0; cursor:pointer; }
  li:hover { background:#f4f4f4; }
  code { background:#f4f4f4; padding:1px 4px; border-radius:3px; font-size:12px; }
</style>
<script src=\"https://unpkg.com/cytoscape@3.30.1/dist/cytoscape.min.js\"></script>
<script src=\"https://unpkg.com/webcola@3.4.0/WebCola/cola.min.js\"></script>
<script src=\"https://unpkg.com/cytoscape-cola@2.5.1/cytoscape-cola.js\"></script>
<script src=\"https://unpkg.com/cytoscape-expand-collapse@4.1.1/cytoscape-expand-collapse.js\"></script>
</head>
<body>
<div id=\"app\">
  <div id=\"wrap\">
    <div id=\"toolbar\">
      <input id=\"focus\" type=\"text\" list=\"modlist\" placeholder=\"focus module (1-degree neighborhood)…\"/>
      <datalist id=\"modlist\"></datalist>
      <button id=\"clear-focus\">clear focus</button>
      <button id=\"collapse-all\">collapse all</button>
      <button id=\"expand-all\">expand all</button>
      <button id=\"relayout\">re-layout (cola)</button>
      <span class=\"muted\" id=\"stats\"></span>
      <span class=\"muted\" id=\"debug\" style=\"color:#c33\"></span>
      <span class=\"muted\">right-click for menu · double-click to expand api ns</span>
    </div>
    <div id=\"cy\"></div>
  </div>
  <div id=\"side\">
    <h2>Metabase Modules</h2>
    <div class=\"muted\">Select a module to focus its 1-degree neighborhood.</div>
    <div id=\"detail\"></div>
  </div>
</div>
<script>
try { cytoscape.use(cytoscapeCola); } catch (e) {}
if (!cytoscape.prototype.__ecReg) {
  try { cytoscapeExpandCollapse(cytoscape); cytoscape.prototype.__ecReg = true; } catch (e) {}
}

const teamColors = {};
const palette = ['#6aa7e8','#e8a06a','#7bcf8a','#cf7bba','#cfc27b','#7bcfc6','#cf7b7b','#a07bcf','#9ccf7b','#cfb37b'];
function colorFor(team) {
  if (!teamColors[team]) teamColors[team] = palette[Object.keys(teamColors).length % palette.length];
  return teamColors[team];
}

const cy = cytoscape({
  container: document.getElementById('cy'),
  elements: { nodes: [], edges: [] },
  wheelSensitivity: 0.2,
  style: [
    { selector: 'node[type=\"module\"]',
      style: {
        'background-color': (ele) => colorFor(ele.data('team')),
        'background-opacity': 0.18,
        'border-width': 1,
        'border-color': (ele) => colorFor(ele.data('team')),
        'label': 'data(label)',
        'font-size': 11,
        'font-weight': 'bold',
        'text-valign': 'top',
        'text-halign': 'center',
        'padding': '12px',
        'shape': 'round-rectangle',
        'min-width': 30,
        'min-height': 30,
      } },
    { selector: 'node[type=\"module\"]:childless',
      style: { 'background-opacity': 0.85, 'width': 40, 'height': 40 } },
    { selector: 'node[type=\"ns\"]',
      style: {
        'background-color': '#fff', 'border-width': 1, 'border-color': '#888',
        'label': 'data(label)', 'font-size': 9, 'text-valign': 'center', 'text-halign': 'center',
        'shape': 'round-rectangle', 'padding': '4px', 'width': 160, 'height': 18,
      } },
    { selector: 'edge',
      style: {
        'curve-style': 'bezier', 'width': 1, 'line-color': '#aaa',
        'target-arrow-color': '#aaa', 'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8, 'opacity': 0.6,
      } },
    { selector: '.focused', style: { 'border-color': '#e25', 'border-width': 3 } },
    { selector: 'edge.focused',
      style: { 'line-color': '#e25', 'target-arrow-color': '#e25', 'width': 2, 'opacity': 1 } },
  ],
});

let api;
try {
  api = cy.expandCollapse({
    // Skip the global re-layout — it was throwing the focused node halfway off-screen each toggle.
    // expand-collapse keeps the parent in place and just lays children out *inside* the compound.
    layoutBy: null,
    fisheye: false, animate: false, undoable: false,
    cueEnabled: true, expandCollapseCuePosition: 'top-left', expandCollapseCueSize: 10,
  });
} catch (e) { console.warn('expandCollapse init failed', e); }

// Local layout helper: rearrange children of one compound w/o disturbing global positions.
function relayoutCompound(node) {
  const kids = node.children();
  if (kids.length === 0) return;
  kids.layout({
    name: 'grid', fit: false, avoidOverlap: true, padding: 4,
    boundingBox: node.boundingBox({includeOverlays: false}),
  }).run();
}

// DIY right-click context menu. Lighter than cytoscape-context-menus plugin and avoids the
// double-register noise across hot reloads.
const ctxMenu = document.createElement('div');
ctxMenu.id = 'ctxmenu';
ctxMenu.style.cssText = 'position:fixed;display:none;background:#fff;border:1px solid #ccc;' +
  'box-shadow:0 2px 8px rgba(0,0,0,.15);font-size:13px;z-index:9999;min-width:180px;';
document.body.appendChild(ctxMenu);

function showCtxMenu(x, y, items) {
  clear(ctxMenu);
  items.forEach(([label, fn]) => {
    const item = mk('div', null, label);
    item.style.cssText = 'padding:6px 12px;cursor:pointer;';
    item.onmouseenter = () => item.style.background = '#eef';
    item.onmouseleave = () => item.style.background = '';
    item.onclick = () => { hideCtxMenu(); fn(); };
    ctxMenu.appendChild(item);
  });
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  ctxMenu.style.display = 'block';
}
function hideCtxMenu() { ctxMenu.style.display = 'none'; }
document.addEventListener('click', hideCtxMenu);
document.getElementById('cy').addEventListener('contextmenu', (e) => e.preventDefault());

cy.on('cxttap', 'node[type=\"module\"]', (evt) => {
  const n = evt.target;
  const label = n.data('label');
  const pos = evt.originalEvent;
  showCtxMenu(pos.clientX, pos.clientY, [
    ['focus 1-degree neighborhood', () => focusOn(label)],
    [api && api.isExpandable(n) ? 'expand api namespaces' :
     (api && api.isCollapsible(n) ? 'collapse api namespaces' : 'expand/collapse'),
     () => {
       if (!api) return;
       if (api.isExpandable(n)) { api.expand(n); relayoutCompound(n); }
       else if (api.isCollapsible(n)) api.collapse(n);
     }],
    ['show details', () => renderDetail(n)],
  ]);
});

function runLayout() {
  const rect = document.getElementById('cy').getBoundingClientRect();
  const dbg = document.getElementById('debug');
  dbg.textContent = '[cy ' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ', ' +
    cy.nodes().length + 'n ' + cy.edges().length + 'e]';
  if (rect.width < 10 || rect.height < 10) {
    dbg.textContent += ' container too small';
    return;
  }
  try {
    if (currentLayout) { try { currentLayout.stop(); } catch (_) {} }
    currentLayout = cy.layout({
      name: 'cola',
      animate: false,
      maxSimulationTime: 1500,
      nodeSpacing: 14,
      edgeLength: 180,
      randomize: true,
      fit: true,
      padding: 60,
      avoidOverlap: true,
    });
    currentLayout.run();
  } catch (e) {
    console.error('layout failed', e);
    dbg.textContent = 'layout failed: ' + e.message + ' — falling back to grid';
    try { cy.layout({name: 'grid', fit: true, padding: 30}).run(); } catch (e2) { console.error(e2); }
  }
}
let currentLayout = null;

function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
function mk(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in (attrs || {})) {
    if (k === 'class') el.className = attrs[k];
    else if (k.startsWith('on')) el[k] = attrs[k];
    else el.setAttribute(k, attrs[k]);
  }
  for (const kid of kids) {
    if (kid == null) continue;
    el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return el;
}

let currentFocus = null;
let modulesIndex = {};   // label -> {label, team, apiCount}

async function fetchModules() {
  console.log('fetchModules start');
  try {
    const r = await fetch('/api/modules');
    console.log('fetchModules response status', r.status);
    const list = await r.json();
    console.log('fetchModules got', list.length, 'modules');
    modulesIndex = Object.fromEntries(list.map(m => [m.label, m]));
    const dl = document.getElementById('modlist');
    clear(dl);
    list.forEach(m => dl.appendChild(mk('option', {value: m.label})));
    renderModuleList(list);
    console.log('fetchModules done');
  } catch (e) {
    console.error('fetchModules failed', e);
  }
}

function renderModuleList(list) {
  const el = document.getElementById('detail');
  clear(el);
  el.appendChild(mk('h3', null, 'all modules (' + list.length + ')'));
  const ul = mk('ul');
  list.forEach(m => {
    ul.appendChild(mk('li', {onclick: () => focusOn(m.label)},
      m.label + ' ', mk('span', {class:'muted'}, m.team)));
  });
  el.appendChild(ul);
}

async function focusOn(moduleLabel) {
  if (!modulesIndex[moduleLabel]) { console.warn('unknown module:', moduleLabel); return; }
  currentFocus = moduleLabel;
  document.getElementById('focus').value = moduleLabel;
  try {
    const r = await fetch('/api/focus?m=' + encodeURIComponent(moduleLabel));
    const sub = await r.json();
    console.log('focus payload', moduleLabel, 'nodes=', sub.nodes.length, 'edges=', sub.edges.length);
    cy.batch(() => {
      cy.elements().remove();
      const modNodes = sub.nodes.filter(n => n.data.type === 'module');
      const nsNodes  = sub.nodes.filter(n => n.data.type === 'ns');
      cy.add(modNodes);
      cy.add(nsNodes);
      cy.add(sub.edges);
    });
    document.getElementById('debug').textContent =
      'cy: ' + cy.nodes().length + ' nodes · ' + cy.edges().length + ' edges';
    console.log('cy now has', cy.nodes().length, 'nodes', cy.edges().length, 'edges');
    // Collapse compounds so each module is a single node again — otherwise the 75 ns children of
    // query-processor blow up the layout. Wrap in try because expand-collapse can be flaky on add.
    try { api && api.collapseAll(); console.log('collapsed ok'); }
    catch (e) { console.warn('collapseAll threw', e); }
    const focusedNode = cy.getElementById('mod:' + moduleLabel);
    if (focusedNode.empty()) console.warn('focused node not found in cy after add');
    else focusedNode.addClass('focused');
    cy.edges().forEach(e => {
      if (e.data('sourceModule') === moduleLabel || e.data('targetModule') === moduleLabel) {
        e.addClass('focused');
      }
    });
    runLayout();
    if (!focusedNode.empty()) renderDetail(focusedNode);
    document.getElementById('stats').textContent =
      sub.stats.moduleCount + ' modules · ' + sub.stats.edgeCount + ' edges (1-degree)';
  } catch (e) {
    console.error('focusOn failed', e);
  }
}

function clearFocus() {
  currentFocus = null;
  document.getElementById('focus').value = '';
  document.getElementById('stats').textContent = '';
  cy.elements().remove();
  // Don't auto-load the full graph — it's the hairball we're trying to avoid.
  fetchModules();
}

function renderDetail(node) {
  const el = document.getElementById('detail');
  clear(el);
  const d = node.data();
  if (d.type === 'module') {
    const consumers = cy.edges('[targetModule=\"' + d.module + '\"]');
    const producers = cy.edges('[sourceModule=\"' + d.module + '\"]');
    const byNs = {};
    consumers.forEach(e => {
      const ns = e.data('targetNs') || '(module)';
      (byNs[ns] ||= new Set()).add(e.data('sourceModule'));
    });
    const usesBy = {};
    producers.forEach(e => {
      const m = e.data('targetModule');
      (usesBy[m] ||= new Set()).add(e.data('targetNs') || '(any)');
    });

    el.appendChild(mk('h2', null, d.label));
    el.appendChild(mk('div', null,
      mk('span', {class:'pill'}, 'team: ' + d.team),
      mk('span', {class:'pill'}, 'api: ' + d.apiCount)));

    el.appendChild(mk('h3', null, 'used by → which api ns'));
    if (Object.keys(byNs).length === 0) {
      el.appendChild(mk('p', {class:'muted'}, 'no external consumers'));
    } else {
      Object.entries(byNs).sort().forEach(([ns, set]) => {
        el.appendChild(mk('div', null, mk('code', null, ns)));
        const ul = mk('ul');
        [...set].sort().forEach(m => {
          ul.appendChild(mk('li', {onclick: () => focusOn(m)}, m));
        });
        el.appendChild(ul);
      });
    }

    el.appendChild(mk('h3', null, 'uses → others'));
    if (Object.keys(usesBy).length === 0) {
      el.appendChild(mk('p', {class:'muted'}, 'depends on nothing external'));
    } else {
      Object.entries(usesBy).sort().forEach(([m, set]) => {
        el.appendChild(mk('div', null, mk('strong', {onclick: () => focusOn(m)}, m)));
        const ul = mk('ul');
        [...set].sort().forEach(ns => ul.appendChild(mk('li', null, mk('code', null, ns))));
        el.appendChild(ul);
      });
    }

    if (d.friends && d.friends.length) {
      el.appendChild(mk('h3', null, 'friends'));
      const ul = mk('ul');
      d.friends.forEach(f => ul.appendChild(mk('li', null, f)));
      el.appendChild(ul);
    }
  } else if (d.type === 'ns') {
    const consumers = cy.edges('[targetNs=\"' + d.label + '\"][targetModule=\"' + d.module + '\"]');
    const set = new Set();
    consumers.forEach(e => set.add(e.data('sourceModule')));
    el.appendChild(mk('h2', null, mk('code', null, d.label)));
    el.appendChild(mk('div', {class:'muted'}, 'API namespace of ', mk('strong', null, d.module)));
    el.appendChild(mk('h3', null, 'used by'));
    if (set.size === 0) {
      el.appendChild(mk('p', {class:'muted'}, 'no external consumers'));
    } else {
      const ul = mk('ul');
      [...set].sort().forEach(m => ul.appendChild(mk('li', {onclick: () => focusOn(m)}, m)));
      el.appendChild(ul);
    }
  }
}

cy.on('tap', 'node', (evt) => renderDetail(evt.target));
cy.on('dbltap', 'node[type=\"module\"]', (evt) => {
  if (!api) return;
  const n = evt.target;
  if (api.isCollapsible(n)) {
    api.collapse(n);
  } else if (api.isExpandable(n)) {
    api.expand(n);
    relayoutCompound(n);
  }
});

document.getElementById('focus').addEventListener('change', (e) => {
  const v = e.target.value.trim();
  if (!v) clearFocus(); else focusOn(v);
});
document.getElementById('clear-focus').onclick = clearFocus;
document.getElementById('collapse-all').onclick = () => { try { api && api.collapseAll(); } catch (_) {} runLayout(); };
document.getElementById('expand-all').onclick   = () => { try { api && api.expandAll();   } catch (_) {} runLayout(); };
document.getElementById('relayout').onclick     = () => runLayout();

fetchModules();
</script>
</body>
</html>")

;; --- ring handler -------------------------------------------------------------------------------

(defn- json-response [body]
  {:status  200
   :headers {"Content-Type" "application/json"
             "Cache-Control" "no-store"}
   :body    (json/generate-string body)})

(defn- html-response [body]
  {:status  200
   :headers {"Content-Type" "text/html; charset=utf-8"
             "Cache-Control" "no-store"}
   :body    body})

(defn- parse-query [qs]
  (when qs
    (into {}
          (for [pair (str/split qs #"&")
                :let [[k v] (str/split pair #"=" 2)]
                :when k]
            [k (some-> v java.net.URLDecoder/decode)]))))

(defn handler [req]
  (let [uri (:uri req)
        q   (parse-query (:query-string req))]
    (case uri
      "/"             (html-response html-page)
      "/api/modules"  (json-response (modules-list))
      "/api/focus"    (json-response (focus-subgraph (get q "m")))
      "/api/full"     (json-response (full-graph))
      {:status 404 :body "not found"})))

;; --- server lifecycle ---------------------------------------------------------------------------

(defonce ^:private server (atom nil))

(defn stop! []
  (when-let [s @server]
    (.stop s)
    (reset! server nil)
    (println "module-viz server stopped"))
  nil)

(defn start!
  "Start the visualization server. `:port` defaults to 4321. Opens browser unless `:open?` is false."
  [& {:keys [port open?] :or {port 4321 open? true}}]
  (stop!)
  (reset-cache!)
  (let [s (jetty/run-jetty #'handler {:port port :join? false})]
    (reset! server s)
    (let [url (str "http://localhost:" port "/")]
      (println "module-viz running at" url)
      (when open? (sh/sh "open" url))
      url)))

(comment
  (start!)
  (stop!)
  (reset-cache!))
