(ns dev.module-viz
  "Interactive Cytoscape.js visualization of the Metabase modules graph.

  Backed by a small Ring/Jetty server so the browser only fetches the *pruned* subgraph for the
  module(s) currently in focus instead of the full 600+ node hairball. Multi-focus unions and
  configurable hop degree (1-3) are supported. Endpoints:

    GET /                  -> HTML shell
    GET /api/modules       -> [{:label :team :apiCount :edgeCount}] for the picker
    GET /api/focus?m=LABEL1,LABEL2,...        {:focus [...] :nodes [...] :edges [...] :stats {...}}
                       &degree=N
                       &expanded=MOD1,MOD2,...
                       &hidden=re:pat1,team:T1,LABEL3,...
    GET /api/full          -> full graph (escape hatch / debugging)

  Usage:

    (require '[dev.module-viz :as v])
    (v/start!)            ;; default port 4321, opens browser
    (v/stop!)"
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
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
  "Best-effort repo-relative source path for a module symbol."
  [module-symb]
  (let [s (str module-symb)]
    (cond
      (str/starts-with? s "enterprise/")
      (str "enterprise/backend/src/metabase_enterprise/" (subs s (count "enterprise/")))

      :else
      (str "src/metabase/" s))))

(defn- module-source-dir
  "`java.io.File` for the module's source directory (relative to project root), or nil if it doesn't exist."
  [module-symb]
  (let [rel (module->github-path module-symb)
        f   (io/file rel)]
    (when (.isDirectory f) f)))

(defn- module-loc
  "Sum of non-blank lines across `.clj`, `.cljc`, `.cljs` files under the module's source dir."
  [module-symb]
  (if-let [dir (module-source-dir module-symb)]
    (->> (file-seq dir)
         (filter (fn [^java.io.File f]
                   (and (.isFile f)
                        (let [n (.getName f)]
                          (or (.endsWith n ".clj")
                              (.endsWith n ".cljc")
                              (.endsWith n ".cljs"))))))
         (map (fn [^java.io.File f]
                (with-open [r (io/reader f)]
                  (count (remove str/blank? (line-seq r))))))
         (reduce + 0))
    0))

;; --- data ---------------------------------------------------------------------------------------

(def ^:private cache
  "Cache the expensive `deps-graph/dependencies` + `kondo-config` results across requests so refocus
  is near-instant. Reset with `(reset-cache!)` if you edit the kondo config."
  (atom nil))

(defn reset-cache! [] (reset! cache nil))

(defn- build-cache
  "Build the full modules cache — a map with keys :kondo, :module-nodes, :api-children, :all-edges,
  :edges-by-mod. Called once on first request and memoized via the `cache` atom."
  []
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
                                             :loc       (module-loc m)
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
  "Parse the `hidden` query string into a predicate `(fn [module-symbol] -> hide?)`. Tokens:
    * plain string        -> exact label match
    * `re:<pattern>`      -> regex match against the label
    * `team:<team>`       -> match every module whose `:team` equals `<team>`
  The team match needs the kondo config to resolve label -> team, so the returned predicate is a
  closure over `module-nodes`."
  [hidden-str module-nodes]
  (if (str/blank? hidden-str)
    (constantly false)
    (let [tokens   (remove str/blank? (str/split hidden-str #","))
          literals (into #{}
                         (remove #(or (str/starts-with? % "re:")
                                      (str/starts-with? % "team:")))
                         tokens)
          regexes  (into []
                         (keep (fn [tok]
                                 (when (str/starts-with? tok "re:")
                                   (try (re-pattern (subs tok 3))
                                        (catch Exception _ nil)))))
                         tokens)
          teams    (into #{}
                         (keep (fn [tok]
                                 (when (str/starts-with? tok "team:")
                                   (subs tok 5))))
                         tokens)
          team-of  (fn [m] (get-in module-nodes [m :data :team]))]
      (fn [m]
        (let [s (str m)]
          (or (contains? literals s)
              (contains? teams (team-of m))
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
  "Subgraph for one or more focused modules.

  `focus-labels` is a non-empty seq of module label strings; the visible set is the union of each
  label's `degree`-hop BFS neighborhood, minus anything matched by `hide?`. `expanded` is the set of
  module symbols whose api-ns children should render (and whose edges stay disaggregated)."
  [focus-labels degree expanded hide?]
  (let [{:keys [module-nodes api-children edges-by-mod all-edges]} (ensure-cache!)
        degree     (max 1 (min 3 (or degree 1)))
        expanded   (set (map symbol (or expanded #{})))
        hide?      (or hide? (constantly false))
        focus-syms (into [] (comp (remove str/blank?) (map symbol)) (or focus-labels []))
        unknown    (remove #(contains? module-nodes %) focus-syms)
        known      (filter #(contains? module-nodes %) focus-syms)]
    (if (empty? known)
      {:error (str "no known focus modules in " (pr-str focus-labels))
       :nodes [] :edges [] :focus [] :unknown (mapv str unknown)}
      (let [focus-set (set known)
            ;; Focused modules stay visible even if they match a hide rule.
            keep?     (fn [m] (or (contains? focus-set m) (not (hide? m))))
            visible   (reduce (fn [acc start]
                                (into acc (bfs-neighbors edges-by-mod start degree keep?)))
                              #{}
                              known)
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
        {:focus    (mapv str known)
         :unknown  (mapv str unknown)
         :degree   degree
         :expanded (mapv str expanded)
         :nodes    nodes
         :edges    edges
         :stats    {:moduleCount (count visible)
                    :edgeCount   (count edges)
                    :rawEdges    (count raw-edges)}}))))

(defn full-graph
  "Return the full module graph with all nodes (modules + api namespaces) and all edges, unfiltered.
  Escape hatch for debugging; the normal interactive path is `focus-subgraph`."
  []
  (let [{:keys [module-nodes api-children all-edges]} (ensure-cache!)
        nodes (vec
               (mapcat (fn [[m mn]]
                         (cons mn (get api-children m [])))
                       module-nodes))]
    {:nodes nodes :edges all-edges}))

;; --- HTML ---------------------------------------------------------------------------------------

;; served from dev/resources/dev/module_viz.html — see that file for the full HTML/JS/CSS
(def ^:private html-page
  (slurp (io/resource "dev/module_viz.html")))

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
            [k (try (java.net.URLDecoder/decode v)
                    (catch IllegalArgumentException _
                      v))]))))

(defn handler
  "Ring handler. See ns-level docstring for endpoint contracts."
  [req]
  (try
    (let [uri (:uri req)
          q   (parse-query (:query-string req))]
      (case uri
        "/"             (html-response html-page)
        "/api/modules"  (json-response (modules-list))
        "/api/focus"    (json-response
                         (focus-subgraph (some-> (get q "m") (str/split #","))
                                         (try (Integer/parseInt (or (get q "degree") "1"))
                                              (catch Exception _ 1))
                                         (when-let [exp (get q "expanded")]
                                           (set (remove str/blank? (str/split exp #","))))
                                         (parse-hidden (get q "hidden")
                                                       (:module-nodes (ensure-cache!)))))
        "/api/full"     (json-response (full-graph))
        {:status 404 :body "not found"}))
    (catch Exception e
      {:status 500
       :headers {"Content-Type" "application/json"}
       :body    (json/generate-string {:error (.getMessage e)})})))

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
