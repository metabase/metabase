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

(def ^:private github-base "https://github.com/metabase/metabase/blob/master/")

(defn- ns->github-path
  "Translate a Clojure namespace symbol into the most likely repo-relative path."
  [ns-symb]
  (let [s    (str ns-symb)
        path (-> s (str/replace "-" "_") (str/replace "." "/"))]
    (cond
      (str/starts-with? s "metabase-enterprise.")
      (str "enterprise/backend/src/" path ".clj")

      ;; driver namespaces live under modules/drivers/<driver>/src/...
      (re-find #"^metabase\.driver\.([^.]+)" s)
      (let [drv (second (re-find #"^metabase\.driver\.([^.]+)" s))]
        (str "modules/drivers/" drv "/src/" path ".clj"))

      :else
      (str "src/" path ".clj"))))

(defn- module->github-path
  "Best-effort source directory for a module symbol."
  [module-symb]
  (let [s (str module-symb)]
    (cond
      (str/starts-with? s "enterprise/")
      (str "enterprise/backend/src/metabase_enterprise/" (subs s (count "enterprise/")))

      :else
      (str "src/metabase/" s))))

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
                                  [m {:data {:id        (module-id m)
                                             :label     (str m)
                                             :type      "module"
                                             :module    (str m)
                                             :team      (or team "?")
                                             :apiCount  (cond
                                                          (= api :any) 0
                                                          (set? api)   (count api)
                                                          :else        0)
                                             :friends   (mapv str (or friends []))
                                             :githubUrl (str github-base (module->github-path m))}}]))
                           kondo)
        api-children (into {}
                           (map (fn [[m {:keys [api]}]]
                                  [m (when (set? api)
                                       (mapv (fn [ns-symb]
                                               {:data {:id        (ns-id m ns-symb)
                                                       :label     (str ns-symb)
                                                       :type      "ns"
                                                       :parent    (module-id m)
                                                       :module    (str m)
                                                       :githubUrl (str github-base (ns->github-path ns-symb))}})
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
  "[{:label :team :apiCount :edgeCount}] for the picker dropdown. `edgeCount` = number of distinct
  edges touching this module (in or out), used by the client to pick a sensible default focus."
  []
  (let [{:keys [module-nodes edges-by-mod]} (ensure-cache!)]
    (->> (vals module-nodes)
         (map (fn [n]
                (let [label (get-in n [:data :label])]
                  {:label     label
                   :team      (get-in n [:data :team])
                   :apiCount  (get-in n [:data :apiCount])
                   :edgeCount (count (get edges-by-mod (symbol label) []))})))
         (sort-by :label))))

(defn- bfs-neighbors
  "Return modules within `degree` hops of `start` over the undirected module-edge graph, skipping
  any module that fails the optional `keep?` predicate."
  ([edges-by-mod start degree]
   (bfs-neighbors edges-by-mod start degree (constantly true)))
  ([edges-by-mod start degree keep?]
   (loop [frontier #{start}
          visited  #{start}
          hops     0]
     (if (or (zero? (count frontier)) (>= hops degree))
       visited
       (let [next-frontier (into #{}
                                 (comp
                                  (mapcat (fn [m] (get edges-by-mod m [])))
                                  (mapcat (fn [e]
                                            [(symbol (get-in e [:data :sourceModule]))
                                             (symbol (get-in e [:data :targetModule]))]))
                                  (remove visited)
                                  (filter keep?))
                                 frontier)]
         (recur next-frontier (into visited next-frontier) (inc hops)))))))

(defn- parse-hidden
  "Parse the `hidden` query string into a predicate `(fn [module-symbol] -> hide?)`. Tokens that
  start with `re:` are treated as regex patterns; everything else is an exact label match."
  [hidden-str]
  (if (str/blank? hidden-str)
    (constantly false)
    (let [tokens (remove str/blank? (str/split hidden-str #","))
          {regex-toks true literal-toks false} (group-by #(str/starts-with? % "re:") tokens)
          literals (set literal-toks)
          regexes  (into []
                         (keep (fn [tok]
                                 (let [pat (subs tok 3)]
                                   (try (re-pattern pat)
                                        (catch Exception _ nil)))))
                         regex-toks)]
      (fn [m]
        (let [s (str m)]
          (or (contains? literals s)
              (some #(re-find % s) regexes)))))))

(defn- aggregate-edges
  "Collapse per-ns edges between `expanded-set` complement modules into one edge per (consumer,
  producer) pair. Edges where the *producer* (target side) is expanded keep their api-ns target so
  the user can see which exact namespace the consumer is pulling in. Otherwise we fall back to the
  producer module id so the edge never references a node we didn't ship."
  [edges expanded-set]
  (let [{disag true aggregable false}
        (group-by (fn [e]
                    (let [s (symbol (get-in e [:data :sourceModule]))
                          t (symbol (get-in e [:data :targetModule]))]
                      (boolean (or (contains? expanded-set s)
                                   (contains? expanded-set t)))))
                  edges)
        ;; Rewrite disaggregated edges so endpoints only reference nodes the client actually has.
        keep-as-is (mapv (fn [e]
                           (let [s-mod (symbol (get-in e [:data :sourceModule]))
                                 t-mod (symbol (get-in e [:data :targetModule]))
                                 ;; Always start with the safe module-id target; only point to the
                                 ;; ns child when the producer module is expanded.
                                 t-id (if (contains? expanded-set t-mod)
                                        (get-in e [:data :target])
                                        (str "mod:" t-mod))
                                 s-id (if (contains? expanded-set s-mod)
                                        (get-in e [:data :source])
                                        (str "mod:" s-mod))]
                             (-> e
                                 (assoc-in [:data :source] s-id)
                                 (assoc-in [:data :target] t-id))))
                         disag)
        pair->edges (group-by (fn [e]
                                [(get-in e [:data :sourceModule])
                                 (get-in e [:data :targetModule])])
                              aggregable)
        agg (for [[[s t] es] pair->edges
                  :let [target-nss (into (sorted-set) (map #(get-in % [:data :targetNs])) es)]]
              {:data {:id           (str "agg:" s "->" t)
                      :source       (str "mod:" s)
                      :target       (str "mod:" t)
                      :sourceModule s
                      :targetModule t
                      :weight       (count es)
                      :aggregate    true
                      :nsList       (vec target-nss)}})]
    (into (vec agg) keep-as-is)))

(defn focus-subgraph
  "Subgraph centered on `module-label` out to `degree` hops (default 1).

  When `expanded` is empty we aggregate edges so each (consumer, producer) module pair becomes one
  weighted edge instead of many per-ns lines. Pass `expanded` as a set of module symbols that should
  remain disaggregated. `hide?` is an optional predicate `(fn [module-symbol] -> hide?)` used to
  prune unwanted modules from the visible set."
  ([module-label] (focus-subgraph module-label 1 #{} (constantly false)))
  ([module-label degree] (focus-subgraph module-label degree #{} (constantly false)))
  ([module-label degree expanded] (focus-subgraph module-label degree expanded (constantly false)))
  ([module-label degree expanded hide?]
   (let [{:keys [module-nodes api-children edges-by-mod all-edges]} (ensure-cache!)
         m-sym    (symbol module-label)
         degree   (max 1 (min 3 (or degree 1)))
         expanded (set (map symbol (or expanded #{})))
         hide?    (or hide? (constantly false))]
     (if-not (contains? module-nodes m-sym)
       {:error (str "unknown module: " module-label) :nodes [] :edges []}
       (let [;; We let the focused module itself stay visible even if it matches a hide rule —
             ;; otherwise focusing it makes the page go blank.
             keep? (fn [m] (or (= m m-sym) (not (hide? m))))
             visible (bfs-neighbors edges-by-mod m-sym degree keep?)
             nodes (vec
                    (mapcat (fn [label]
                              (when-let [mn (get module-nodes label)]
                                (if (contains? expanded label)
                                  (cons mn (get api-children label []))
                                  [mn])))
                            visible))
             raw-edges (filterv (fn [e]
                                  (let [s (symbol (get-in e [:data :sourceModule]))
                                        t (symbol (get-in e [:data :targetModule]))]
                                    (and (contains? visible s) (contains? visible t))))
                                all-edges)
             edges (aggregate-edges raw-edges expanded)]
         {:focus    module-label
          :degree   degree
          :expanded (mapv str expanded)
          :nodes    nodes
          :edges    edges
          :stats    {:moduleCount (count visible)
                     :edgeCount   (count edges)
                     :rawEdges    (count raw-edges)}})))))

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
</head>
<body>
<div id=\"app\">
  <div id=\"wrap\">
    <div id=\"toolbar\">
      <input id=\"focus\" type=\"text\" list=\"modlist\" placeholder=\"focus module…\"/>
      <datalist id=\"modlist\"></datalist>
      <label class=\"muted\">degree
        <select id=\"degree\">
          <option value=\"1\" selected>1</option>
          <option value=\"2\">2</option>
        </select>
      </label>
      <button id=\"clear-focus\">clear focus</button>
      <button id=\"collapse-all\">collapse all</button>
      <button id=\"expand-all\">expand all</button>
      <button id=\"relayout\">re-layout (cola)</button>
      <span class=\"muted\" id=\"stats\"></span>
      <span class=\"muted\" id=\"debug\" style=\"color:#c33\"></span>
      <span class=\"muted\">shift-click a module to refocus · right-click for menu · double-click to expand api ns</span>
    </div>
    <div id=\"cy\"></div>
  </div>
  <div id=\"side\">
    <h2>Metabase Modules</h2>
    <div class=\"muted\">Select a module to focus its 1-degree neighborhood.</div>
    <details id=\"hiddenWrap\" style=\"margin:8px 0;\">
      <summary class=\"muted\" style=\"cursor:pointer\">hidden modules (<span id=\"hiddenCount\">0</span>)</summary>
      <div id=\"hiddenPanel\" style=\"margin-top:6px;\"></div>
      <div class=\"muted\" style=\"margin-top:4px\">one entry per line; lines starting <code>re:</code> are regex (e.g. <code>re:^enterprise/</code>)</div>
      <textarea id=\"hiddenEditor\" rows=\"5\" style=\"width:100%; box-sizing:border-box; font:12px/1.4 monospace;\"></textarea>
      <button id=\"hiddenSave\" style=\"margin-top:4px\">save</button>
      <button id=\"hiddenClear\">clear all</button>
    </details>
    <div id=\"detail\"></div>
  </div>
</div>
<script>
try { cytoscape.use(cytoscapeCola); } catch (e) {}

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
        'background-opacity': 0.22,
        'border-width': 1,
        'border-color': (ele) => colorFor(ele.data('team')),
        'label': 'data(label)',
        'font-size': 18,
        'font-weight': 700,
        'color': '#111',
        'text-outline-width': 3,
        'text-outline-color': '#fff',
        'text-outline-opacity': 1,
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -6,
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
        'curve-style': 'unbundled-bezier',
        // single control point offset ~tan(20°)/2 of chord length; use a constant proxy that
        // looks like ~20° bend at typical edge lengths.
        'control-point-distances': [50],
        'control-point-weights':   [0.5],
        'width': 1,
        'line-color': '#aaa',
        'target-arrow-color': '#aaa',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1.8,
        'opacity': 0.7,
      } },
    { selector: 'edge[?aggregate]',
      style: {
        'width': (ele) => Math.min(10, 1 + Math.log2((ele.data('weight') || 1) + 1) * 1.6),
        'line-color': '#666',
        'target-arrow-color': '#666',
        'opacity': 0.85,
        'label': (ele) => (ele.data('weight') > 1 ? String(ele.data('weight')) : ''),
        'font-size': 9,
        'color': '#444',
        'text-background-color': '#fff',
        'text-background-opacity': 0.85,
        'text-background-padding': 2,
      } },
    { selector: '.focused', style: { 'border-color': '#e25', 'border-width': 3 } },
    { selector: 'edge.focused',
      style: { 'line-color': '#e25', 'target-arrow-color': '#e25', 'width': 2, 'opacity': 1 } },
  ],
});

// Expand/collapse is fully server-side now (focusOn refetches based on `expandedModules`).
// Skipping the expand-collapse plugin removes the +/- cue + the cxttap interceptor it installs.

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

function focusOnAt(label, deg) {
  document.getElementById('degree').value = String(deg);
  focusOn(label);
}

function toggleExpanded(label) {
  if (expandedModules.has(label)) expandedModules.delete(label);
  else expandedModules.add(label);
  if (currentFocus) focusOn(currentFocus);
}

function openGithub(url) { if (url) window.open(url, '_blank', 'noopener'); }

function hideLabel(label) {
  hiddenLabels.add(label);
  saveHidden();
  renderHiddenPanel();
  if (currentFocus) focusOn(currentFocus);
}

function handleModuleCxt(evt) {
  const n = evt.target;
  const label = n.data('label');
  const pos = evt.originalEvent;
  console.log('cxt module', label);
  const expanded = expandedModules.has(label);
  showCtxMenu(pos.clientX, pos.clientY, [
    ['focus  (1°)', () => focusOnAt(label, 1)],
    ['focus  (2°)', () => focusOnAt(label, 2)],
    [expanded ? 'collapse api namespaces' : 'expand api namespaces',
     () => toggleExpanded(label)],
    ['hide this module', () => hideLabel(label)],
    ['show details', () => renderDetail(n)],
    ['open on github ↗', () => openGithub(n.data('githubUrl'))],
  ]);
}
cy.on('cxttapstart', 'node[type=\"module\"]', (e) => console.log('cxttapstart', e.target.data('label')));
cy.on('cxttap',      'node[type=\"module\"]', (e) => console.log('cxttap',      e.target.data('label')));
cy.on('cxttapend',   'node[type=\"module\"]', handleModuleCxt);

// Fallback: native contextmenu on the canvas. Cytoscape's cxttap detection sometimes wedges after
// a drag (the renderer keeps a stale grab state). The native event always fires.
document.getElementById('cy').addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  const rect = ev.currentTarget.getBoundingClientRect();
  const pos  = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  // Convert page coords to cytoscape model coords via pan/zoom.
  const pan = cy.pan(), zoom = cy.zoom();
  const model = { x: (pos.x - pan.x) / zoom, y: (pos.y - pan.y) / zoom };
  // Walk nodes from top to find the one under the cursor (small N, cheap).
  const hit = cy.nodes().filter(n => {
    const bb = n.boundingBox();
    return model.x >= bb.x1 && model.x <= bb.x2 && model.y >= bb.y1 && model.y <= bb.y2;
  }).last();
  if (hit && !hit.empty()) {
    console.log('native ctx -> ', hit.data('label'));
    if (hit.data('type') === 'module') {
      handleModuleCxt({target: hit, originalEvent: ev});
    } else if (hit.data('type') === 'ns') {
      handleNsCxt({target: hit, originalEvent: ev});
    }
  } else {
    hideCtxMenu();
  }
});

function handleNsCxt(evt) {
  const n = evt.target;
  const parentLabel = n.data('module');
  const pos = evt.originalEvent;
  console.log('cxt ns', n.data('label'));
  showCtxMenu(pos.clientX, pos.clientY, [
    ['focus parent module  (1°)', () => focusOnAt(parentLabel, 1)],
    ['focus parent module  (2°)', () => focusOnAt(parentLabel, 2)],
    ['show details', () => renderDetail(n)],
    ['open on github ↗', () => openGithub(n.data('githubUrl'))],
  ]);
}
cy.on('cxttapend', 'node[type=\"ns\"]', handleNsCxt);

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
      animate: true,
      maxSimulationTime: 4000,
      refresh: 1,
      // bigger nodeSpacing = more repulsion / breathing room between nodes
      nodeSpacing: (node) => (node.data('type') === 'module' ? 80 : 20),
      // Heavily-used pairs sit closer (shorter spring); rare pairs sit farther apart.
      edgeLength: (edge) => {
        const w = edge.data('weight') || 1;
        return Math.max(220, 500 - Math.log2(w + 1) * 50);
      },
      randomize: true,
      fit: true,
      padding: 80,
      avoidOverlap: true,
      handleDisconnected: true,
    });
    currentLayout.one('layoutstop', () => {
      pendingSurvivors.forEach(n => { try { n.unlock(); } catch (_) {} });
      pendingSurvivors = [];
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
let expandedModules = new Set();   // module labels w/ api-ns children visible
let modulesIndex = {};   // label -> {label, team, apiCount}
let pendingSurvivors = [];         // nodes locked for the current layout run
let inflightFocus = null;          // AbortController for the current /api/focus fetch
// Hidden modules: exact-match labels + regex strings. Persisted to localStorage so it survives
// reloads. The server applies these as a pre-BFS filter so 2-degree views don't sprout via a
// module the user explicitly hid.
let hiddenLabels   = new Set();
let hiddenPatterns = [];           // array of {pattern: string, re: RegExp}

function loadHidden() {
  try {
    const raw = JSON.parse(localStorage.getItem('moduleVizHidden') || '{}');
    hiddenLabels   = new Set(raw.labels   || []);
    hiddenPatterns = (raw.patterns || []).map(p => ({pattern: p, re: new RegExp(p)}));
  } catch (e) { console.warn('loadHidden failed', e); }
}
function saveHidden() {
  localStorage.setItem('moduleVizHidden', JSON.stringify({
    labels:   [...hiddenLabels],
    patterns: hiddenPatterns.map(p => p.pattern),
  }));
}
function hiddenQueryParam() {
  // Combined comma-separated list. Regex entries are prefixed with `re:` so the server can tell.
  return [
    ...[...hiddenLabels],
    ...hiddenPatterns.map(p => 're:' + p.pattern),
  ].join(',');
}
loadHidden();

function hiddenLines() {
  return [
    ...[...hiddenLabels],
    ...hiddenPatterns.map(p => 're:' + p.pattern),
  ];
}

function renderHiddenPanel() {
  const panel = document.getElementById('hiddenPanel');
  const editor = document.getElementById('hiddenEditor');
  const count = document.getElementById('hiddenCount');
  if (!panel) return;
  clear(panel);
  const lines = hiddenLines();
  count.textContent = String(lines.length);
  editor.value = lines.join('\\n');
  if (lines.length === 0) {
    panel.appendChild(mk('div', {class: 'muted'}, 'nothing hidden'));
    return;
  }
  const ul = mk('ul', {style: 'list-style:none; padding-left:0; margin:0;'});
  lines.forEach(line => {
    const li = mk('li', {style: 'display:flex; gap:6px; align-items:center; padding:2px 0;'});
    const btn = mk('button', {style: 'font-size:11px; padding:0 4px; cursor:pointer;'}, '×');
    btn.onclick = () => {
      if (line.startsWith('re:')) {
        const pat = line.slice(3);
        hiddenPatterns = hiddenPatterns.filter(p => p.pattern !== pat);
      } else {
        hiddenLabels.delete(line);
      }
      saveHidden();
      renderHiddenPanel();
      if (currentFocus) focusOn(currentFocus);
    };
    li.appendChild(btn);
    li.appendChild(mk('code', null, line));
    ul.appendChild(li);
  });
  panel.appendChild(ul);
}

function applyHiddenEditor() {
  const editor = document.getElementById('hiddenEditor');
  const lines = editor.value.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean);
  hiddenLabels = new Set();
  hiddenPatterns = [];
  lines.forEach(line => {
    if (line.startsWith('re:')) {
      const pat = line.slice(3);
      try { hiddenPatterns.push({pattern: pat, re: new RegExp(pat)}); }
      catch (e) { console.warn('bad regex', pat, e); }
    } else {
      hiddenLabels.add(line);
    }
  });
  saveHidden();
  renderHiddenPanel();
  if (currentFocus) focusOn(currentFocus);
}

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
    // Auto-focus a module whose edge count is closest to 50 so the first paint shows a
    // representative neighborhood instead of a blank canvas.
    if (!currentFocus) {
      const pick = list.slice().sort((a, b) =>
        Math.abs((a.edgeCount || 0) - 50) - Math.abs((b.edgeCount || 0) - 50))[0];
      if (pick) {
        console.log('auto-focus', pick.label, 'edgeCount', pick.edgeCount);
        focusOn(pick.label);
      }
    }
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

function currentDegree() {
  return parseInt(document.getElementById('degree').value, 10) || 1;
}

async function focusOn(moduleLabel) {
  if (!modulesIndex[moduleLabel]) { console.warn('unknown module:', moduleLabel); return; }
  // Snapshot positions of every node currently in cy so survivors stay put across the refetch.
  const oldPositions = {};
  cy.nodes().forEach(n => {
    const p = n.position();
    oldPositions[n.data('id')] = { x: p.x, y: p.y };
  });

  currentFocus = moduleLabel;
  document.getElementById('focus').value = moduleLabel;
  try {
    const deg = currentDegree();
    const exp = [...expandedModules].join(',');
    const hid = hiddenQueryParam();
    const url = '/api/focus?m=' + encodeURIComponent(moduleLabel) + '&degree=' + deg +
                (exp ? '&expanded=' + encodeURIComponent(exp) : '') +
                (hid ? '&hidden='   + encodeURIComponent(hid) : '');
    if (inflightFocus) inflightFocus.abort();
    inflightFocus = new AbortController();
    const r = await fetch(url, {signal: inflightFocus.signal});
    inflightFocus = null;
    const sub = await r.json();
    console.log('focus', moduleLabel, 'degree', deg, 'expanded=', exp, 'nodes=', sub.nodes.length, 'edges=', sub.edges.length);
    cy.batch(() => {
      cy.elements().remove();
      const modNodes = sub.nodes.filter(n => n.data.type === 'module');
      const nsNodes  = sub.nodes.filter(n => n.data.type === 'ns');
      cy.add(modNodes);
      cy.add(nsNodes);
      cy.add(sub.edges);
    });
    // Unlock any leftover survivors from a prior interrupted layout before we lock the new set.
    pendingSurvivors.forEach(n => { try { if (n && n.unlock) n.unlock(); } catch (_) {} });
    pendingSurvivors = [];

    // Restore positions for survivors; new nodes get whatever cola decides. Re-query by id since
    // cy.elements().remove() + cy.add() produces fresh node refs.
    const survivors = [];
    Object.keys(oldPositions).forEach(id => {
      const n = cy.getElementById(id);
      if (!n.empty()) {
        n.position(oldPositions[id]);
        n.lock();
        survivors.push(n);
      }
    });
    pendingSurvivors = survivors;
    document.getElementById('debug').textContent =
      'cy: ' + cy.nodes().length + ' nodes · ' + cy.edges().length + ' edges';
    console.log('cy now has', cy.nodes().length, 'nodes', cy.edges().length, 'edges');
    // Expand/collapse is server-side now — what we got back IS already collapsed except for the
    // modules the user explicitly expanded.
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
      sub.stats.moduleCount + ' modules · ' + sub.stats.edgeCount + ' edges' +
      (sub.stats.rawEdges ? ' (raw ' + sub.stats.rawEdges + ')' : '') +
      ' · ' + sub.degree + '-deg · expanded: ' + (sub.expanded.length || 0);
  } catch (e) {
    if (e.name === 'AbortError') return;   // user clicked again before we finished
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

cy.on('tap', 'node', (evt) => {
  const n = evt.target;
  // Shift-tap or tap on a non-focused module re-centers the view on that module.
  if (n.data('type') === 'module' && currentFocus &&
      n.data('label') !== currentFocus &&
      (evt.originalEvent && evt.originalEvent.shiftKey)) {
    focusOn(n.data('label'));
    return;
  }
  renderDetail(n);
});
cy.on('dbltap', 'node[type=\"module\"]', (evt) => {
  toggleExpanded(evt.target.data('label'));
});

document.getElementById('focus').addEventListener('change', (e) => {
  const v = e.target.value.trim();
  if (!v) clearFocus(); else focusOn(v);
});
document.getElementById('clear-focus').onclick = clearFocus;
document.getElementById('degree').addEventListener('change', () => {
  if (currentFocus) focusOn(currentFocus);
});
document.getElementById('collapse-all').onclick = () => {
  expandedModules.clear();
  if (currentFocus) focusOn(currentFocus);
};
document.getElementById('expand-all').onclick = () => {
  // Expand every currently visible module.
  cy.nodes('[type=\"module\"]').forEach(n => expandedModules.add(n.data('label')));
  if (currentFocus) focusOn(currentFocus);
};
document.getElementById('relayout').onclick     = () => runLayout();

document.getElementById('hiddenSave').onclick  = applyHiddenEditor;
document.getElementById('hiddenClear').onclick = () => {
  hiddenLabels = new Set(); hiddenPatterns = [];
  saveHidden(); renderHiddenPanel();
  if (currentFocus) focusOn(currentFocus);
};
renderHiddenPanel();

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
      "/api/focus"    (json-response
                       (focus-subgraph (get q "m")
                                       (try (Integer/parseInt (or (get q "degree") "1"))
                                            (catch Exception _ 1))
                                       (when-let [exp (get q "expanded")]
                                         (set (remove str/blank? (str/split exp #","))))
                                       (parse-hidden (get q "hidden"))))
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
