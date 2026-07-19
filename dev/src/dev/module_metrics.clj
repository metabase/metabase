(ns dev.module-metrics
  (:require
   [clojure.data.csv :as csv]
   [clojure.set :as set]
   [clojure.string :as str]
   [dev.deps-graph :as deps-graph]
   [dev.module-scc :as module-scc]
   [flatland.ordered.map :as ordered-map]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- modules [deps config]
  (into (sorted-set)
        (concat (keep :module deps)
                (keys config))))

(defn- invert-graph [graph]
  (reduce-kv
   (fn [acc module dep-modules]
     (reduce (fn [acc dep-module]
               (update acc dep-module (fnil conj (sorted-set)) module))
             (update acc module #(or % (sorted-set)))
             dep-modules))
   (sorted-map)
   graph))

(defn- module->namespaces [deps]
  (reduce (fn [acc {:keys [module namespace]}]
            (update acc module (fnil conj (sorted-set)) namespace))
          (sorted-map)
          deps))

(defn- module->source-files [deps]
  (reduce (fn [acc {:keys [module filename]}]
            (update acc module (fnil conj (sorted-set)) filename))
          (sorted-map)
          deps))

(defn- canonical-api-namespaces
  "The default API namespaces for `module`, derived from its effective `:ns-prefix` so that
  explicit-prefix modules like `actions.rest` (prefix `metabase.actions-rest`) get
  `metabase.actions-rest.api` rather than a name-derived guess."
  [config module]
  (let [prefix (deps-graph/module-ns-prefix config module)]
    (into (sorted-set)
          (map (fn [suffix]
                 (symbol (str prefix "." suffix))))
          ['api 'core 'init])))

(defn- declared-api-namespaces [config module]
  (let [api (get-in config [module :api])]
    (if (= api :any)
      :any
      (into (sorted-set) api))))

(defn- api-namespace-count
  "Count of a module's public API namespaces: its full namespace count when `:api` is `:any`, else the
  number of declared `:api` entries."
  [config module->nses m]
  (let [a (get-in config [m :api])]
    (if (= a :any)
      (count (get module->nses m))
      (count a))))

(defn- non-api-namespace-count
  "Internal (non-`:api`) namespace count for a module. Clamped at 0: a module whose declared `:api` lists
  more namespaces than were scanned (stale config, synthetic test namespaces) would otherwise go negative."
  [config module->nses m]
  (max 0 (- (count (get module->nses m))
            (api-namespace-count config module->nses m))))

(defn- safe-ratio [numerator denominator]
  (if (zero? denominator)
    0.0
    (double (/ numerator denominator))))

(defn- nearest-rank-percentile [sorted-values p]
  (if (empty? sorted-values)
    0
    (let [idx (-> (* p (count sorted-values))
                  Math/ceil
                  long
                  dec
                  (max 0))]
      (nth sorted-values idx))))

(defn- top-level-module?
  "True if `m` is a top-level module — no namespace part (rules out `enterprise/x`) and no dot in its
  name (rules out nested children like `lib.schema`). Matches the hook's `top-level-oss-module?`."
  [m]
  (and (nil? (namespace m))
       (not (str/includes? (name m) "."))))

(defn- file-loc
  "Line count of source `filename`, or 0 if it can't be read (e.g. synthetic filenames in tests)."
  [filename]
  (try
    (count (str/split-lines (slurp filename)))
    (catch Exception _ 0)))

(defn- distribution-stats
  "Compact distribution summary over numeric `values`."
  [values]
  (let [sorted (vec (sort values))
        n      (count sorted)]
    (ordered-map/ordered-map
     :p25    (nearest-rank-percentile sorted 0.25)
     :mean   (safe-ratio (reduce + 0 sorted) n)
     :median (nearest-rank-percentile sorted 0.5)
     :p90    (nearest-rank-percentile sorted 0.9)
     :max    (if (zero? n) 0 (peek sorted)))))

(defn- largest-cyclic-component
  "Largest nontrivial strongly connected component, or an empty set when the graph is acyclic."
  [graph sccs]
  (let [component (deps-graph/largest-scc graph sccs)]
    (if (> (count component) 1) component #{})))

(defn- build-graph-context
  "Build all shared intermediate data structures needed by both per-module and repo-level metrics."
  [deps config]
  (let [prefix->mod              (deps-graph/build-prefix->module config)
        modules'                 (modules deps config)
        direct-deps-graph        (merge (zipmap modules' (repeat (sorted-set)))
                                        (deps-graph/module-dependencies deps))
        module->paths            (into (sorted-map)
                                       (map (fn [module]
                                              [module (deps-graph/all-module-deps-paths deps module)]))
                                       modules')
        transitive-deps-graph    (into (sorted-map)
                                       (map (fn [module]
                                              [module (into (sorted-set) (keys (get module->paths module)))]))
                                       modules')
        direct-dependents-graph  (merge (zipmap modules' (repeat (sorted-set)))
                                        (invert-graph direct-deps-graph))
        transitive-dependents    (merge (zipmap modules' (repeat (sorted-set)))
                                        (invert-graph transitive-deps-graph))
        module->nses             (merge (zipmap modules' (repeat (sorted-set)))
                                        (module->namespaces deps))
        module->sources          (merge (zipmap modules' (repeat (sorted-set)))
                                        (module->source-files deps))
        all-source-files         (into (sorted-set) (comp (filter :module) (map :filename)) deps)
        ;; Relevant tests per module, resolved once. Every source file in a module shares this set and it
        ;; also feeds the module's downstream test count, so we resolve ~180 times (per module) instead of
        ;; ~1800 (per source file). This is the hot path — resolving per file re-globs the test tree ~10x.
        module->relevant-test-files (into (sorted-map)
                                          (map (fn [module]
                                                 [module (deps-graph/source-filenames->relevant-test-filenames
                                                          deps config prefix->mod (get module->sources module))]))
                                          modules')
        all-test-files           (into (sorted-set) (mapcat val) module->relevant-test-files)
        sccs                     (deps-graph/strongly-connected-components direct-deps-graph)
        module->scc              (into {} (for [component sccs, m component] [m component]))]
    {:prefix->mod              prefix->mod
     :modules                  modules'
     :direct-deps-graph        direct-deps-graph
     :module->paths            module->paths
     :transitive-deps-graph    transitive-deps-graph
     :direct-dependents-graph  direct-dependents-graph
     :transitive-dependents    transitive-dependents
     :module->nses             module->nses
     :module->sources          module->sources
     :all-source-files         all-source-files
     :all-test-files           all-test-files
     :module->relevant-test-files module->relevant-test-files
     :sccs                     sccs
     :module->scc              module->scc}))

(defn- metrics*
  [deps config {:keys [modules direct-deps-graph module->paths transitive-deps-graph
                       direct-dependents-graph transitive-dependents module->nses module->sources
                       module->relevant-test-files sccs module->scc]}]
  (let [largest-cycle (largest-cyclic-component direct-deps-graph sccs)]
    (into []
          (map (fn [module]
                 (let [direct-deps               (get direct-deps-graph module)
                       transitive-deps           (get transitive-deps-graph module)
                       direct-dependents         (get direct-dependents-graph module)
                       downstream-modules        (get transitive-dependents module)
                       dependency-depths         (map (comp inc count) (vals (get module->paths module)))
                       source-files              (get module->sources module)
                       downstream-source-files   (into (sorted-set)
                                                       (mapcat #(get module->sources %))
                                                       downstream-modules)
                       affected-source-files     (into source-files downstream-source-files)
                       affected-test-files       (get module->relevant-test-files module)
                       used-api                  (deps-graph/externally-used-namespaces-ignoring-friends
                                                  deps config module)
                       declared-api              (declared-api-namespaces config module)
                       noncanonical-api          (set/difference used-api (canonical-api-namespaces config module))
                       undeclared-api            (if (= declared-api :any)
                                                   (sorted-set)
                                                   (set/difference used-api declared-api))
                       declared-friends          (into (sorted-set) (get-in config [module :friends]))
                       ;; `:any` api means the whole module is public, so its internal (non-api)
                       ;; surface is empty; otherwise non-api = namespaces minus the declared api.
                       friend-exposed-count      (if (seq declared-friends)
                                                   (non-api-namespace-count config module->nses module)
                                                   0)
                       line-count                (reduce + 0 (map file-loc source-files))
                       ;; Namespaces in every module this one can transitively reach through its declared
                       ;; `:uses` — the compile/load closure its boundary permits, not just module count.
                       reachable-namespace-count (reduce + 0 (map #(count (get module->nses %)) transitive-deps))]
                   (ordered-map/ordered-map
                    :module module
                    :top-level? (top-level-module? module)
                    :dependencies
                    (ordered-map/ordered-map
                     :direct-count (count direct-deps)
                     :transitive-count (count transitive-deps)
                     :reachable-namespace-count reachable-namespace-count
                     :max-depth (reduce max 0 dependency-depths))
                    :dependents
                    (ordered-map/ordered-map
                     :direct-count (count direct-dependents)
                     :transitive-count (count downstream-modules))
                    :cycles
                    (ordered-map/ordered-map
                     :component-size (count (get module->scc module #{module}))
                     :in-largest-component? (contains? largest-cycle module))
                    :size
                    (ordered-map/ordered-map
                     :namespace-count (count (get module->nses module))
                     :line-count line-count)
                    :api
                    (ordered-map/ordered-map
                     :declared-namespace-count (if (= declared-api :any)
                                                 :any
                                                 (count declared-api))
                     :used-namespace-count (count used-api)
                     :noncanonical-namespace-count (count noncanonical-api)
                     :undeclared-namespace-count (count undeclared-api))
                    :friends
                    (ordered-map/ordered-map
                     :count (count declared-friends)
                     ;; Friends bypass `:api`, exposing this module's entire internal surface.
                     :exposed-namespace-count friend-exposed-count)
                    :blast-radius
                    (ordered-map/ordered-map
                     :source-file-count (count affected-source-files)
                     :test-file-count (count affected-test-files))))))
          modules)))

(defn metrics
  "Per-module dependency, cycle, boundary, size, and blast-radius metrics, grouped by concern."
  ([]
   (let [config (deps-graph/kondo-config)]
     (metrics (deps-graph/dependencies (deps-graph/build-prefix->module config)) config)))
  ([deps config]
   (metrics* deps config (build-graph-context deps config))))

(defn repo-metrics
  "Repository-wide summaries derived from [[metrics]]."
  ([]
   (let [config (deps-graph/kondo-config)]
     (repo-metrics (deps-graph/dependencies (deps-graph/build-prefix->module config)) config)))
  ([deps config]
   (let [ctx                         (build-graph-context deps config)
         module-metrics              (metrics* deps config ctx)
         source-file->module         (into {} (map (juxt :filename :module)) deps)
         source-file-test-counts     (sort (map (fn [source-file]
                                                  (count (get (:module->relevant-test-files ctx)
                                                              (get source-file->module source-file)
                                                              #{})))
                                                (:all-source-files ctx)))
         source-file-downstream-mods (sort (map (fn [source-file]
                                                  (count (get (:transitive-dependents ctx)
                                                              (get source-file->module source-file)
                                                              #{})))
                                                (:all-source-files ctx)))
         module-count                (count (:modules ctx))
         edge-count                  (reduce + 0 (map count (vals (:direct-deps-graph ctx))))
         module->nses                (:module->nses ctx)
         total-namespaces            (reduce + 0 (map count (vals module->nses)))
         total-lines                 (reduce + 0 (map #(get-in % [:size :line-count]) module-metrics))
         total-declared-api          (reduce + 0 (map #(api-namespace-count config module->nses %) (:modules ctx)))
         friend-holding-modules      (filter #(seq (get-in config [% :friends])) (:modules ctx))
         in-degrees                  (sort > (map #(get-in % [:dependents :direct-count]) module-metrics))
         top-decile-n                (long (Math/ceil (/ module-count 10.0)))
         majority-test-threshold     (* 0.5 (count (:all-test-files ctx)))
         ;; Namespaces living in modules trapped in a nontrivial SCC. Unlike the module-count SCC
         ;; metrics, this is invariant to config-only node-splitting (splitting a cyclic module keeps
         ;; its namespaces in the cycle) — so it stays flat under re-bucketing and only drops when a
         ;; real carve pulls namespaces out of the blob. This is the honest coupling number.
         cyclic-modules              (into #{} (mapcat identity) (filter #(> (count %) 1) (:sccs ctx)))
         cyclic-namespace-count      (reduce + 0 (map #(count (get module->nses %)) cyclic-modules))
         ;; Internal namespaces reachable past a module's public API through a friend grant.
         friend-exposed-count        (reduce + 0 (map #(non-api-namespace-count config module->nses %)
                                                      friend-holding-modules))
         ;; Every distinct (outside module, private namespace) access a friend grant opens up: the
         ;; grant count times the internal surface it exposes. This is the encapsulation-leak headline.
         privileged-access-path-count (reduce + 0 (map (fn [m] (* (count (get-in config [m :friends]))
                                                                  (non-api-namespace-count config module->nses m)))
                                                       friend-holding-modules))]
     (ordered-map/ordered-map
      :graph
      (ordered-map/ordered-map
       :module-count module-count
       :top-level-module-count (count (filter :top-level? module-metrics))
       :edge-count edge-count
       :mean-out-degree (safe-ratio edge-count module-count)
       :max-in-degree (reduce max 0 in-degrees)
       :top-decile-in-degree-share
       (safe-ratio (reduce + 0 (take top-decile-n in-degrees)) edge-count))
      :cycles
      (ordered-map/ordered-map
       :cyclic-module-count (count cyclic-modules)
       :largest-component-module-count
       (count (largest-cyclic-component (:direct-deps-graph ctx) (:sccs ctx)))
       ;; Namespace weighting prevents config-only node splits from looking like real decoupling.
       :cyclic-namespace-count cyclic-namespace-count
       :cyclic-namespace-ratio (safe-ratio cyclic-namespace-count total-namespaces))
      :encapsulation
      (ordered-map/ordered-map
       :friend-edge-count
       (reduce + 0 (map (fn [m] (count (get-in config [m :friends]))) (:modules ctx)))
       :friend-exposed-namespace-count friend-exposed-count
       :privileged-access-path-count privileged-access-path-count
       :api-namespace-count total-declared-api
       :api-surface-ratio (safe-ratio total-declared-api total-namespaces)
       :undeclared-api-namespace-count
       (reduce + 0 (map #(get-in % [:api :undeclared-namespace-count]) module-metrics)))
      :size
      (ordered-map/ordered-map
       :namespace-count total-namespaces
       :line-count total-lines
       :namespaces-per-module
       (distribution-stats (map #(get-in % [:size :namespace-count]) module-metrics))
       :lines-per-module
       (distribution-stats (map #(get-in % [:size :line-count]) module-metrics))
       :reachable-namespaces-per-module
       (distribution-stats (map #(get-in % [:dependencies :reachable-namespace-count]) module-metrics)))
      :blast-radius
      (ordered-map/ordered-map
       :source-file-count (count (:all-source-files ctx))
       :test-file-count (count (:all-test-files ctx))
       :mean-test-files-per-source-file
       (safe-ratio (reduce + 0 source-file-test-counts) (count source-file-test-counts))
       :majority-test-suite-source-file-ratio
       (safe-ratio (count (filter #(> % majority-test-threshold) source-file-test-counts))
                   (count source-file-test-counts))
       :mean-downstream-modules-per-source-file
       (safe-ratio (reduce + 0 source-file-downstream-mods) (count source-file-downstream-mods)))))))

(defn csv
  "Write [[metrics]] as CSV to `*out*`."
  ([]
   (let [config (deps-graph/kondo-config)]
     (csv (deps-graph/dependencies (deps-graph/build-prefix->module config)) config)))
  ([deps config]
   (let [paths [[:module]
                [:top-level?]
                [:dependencies :direct-count]
                [:dependencies :transitive-count]
                [:dependencies :reachable-namespace-count]
                [:dependencies :max-depth]
                [:dependents :direct-count]
                [:dependents :transitive-count]
                [:cycles :component-size]
                [:cycles :in-largest-component?]
                [:size :namespace-count]
                [:size :line-count]
                [:api :declared-namespace-count]
                [:api :used-namespace-count]
                [:api :noncanonical-namespace-count]
                [:api :undeclared-namespace-count]
                [:friends :count]
                [:friends :exposed-namespace-count]
                [:blast-radius :source-file-count]
                [:blast-radius :test-file-count]]
         rows (cons (map #(str/join "." (map name %)) paths)
                    (->> (metrics deps config)
                         (sort-by (juxt (comp - #(get-in % [:blast-radius :test-file-count]))
                                        (comp - #(get-in % [:dependents :transitive-count]))
                                        :module))
                         (map (fn [metric]
                                (map #(get-in metric %) paths)))
                         (map (fn [row]
                                (map (fn [value]
                                       (cond->> value
                                         (double? value) (u/round-to-decimals 4)
                                         (float? value) (u/round-to-decimals 4)))
                                     row)))))]
     (csv/write-csv *out* rows))))

(defn config
  "Read the current module config."
  []
  (deps-graph/kondo-config))

(defn deps
  "Scan source dependencies using the config's effective namespace prefixes."
  ([]
   (deps (config)))
  ([config]
   (deps-graph/dependencies (deps-graph/build-prefix->module config))))

(defn churn-weighted-blast-radius
  "Churn-weighted selective-CI cost: replay the last `days` days of commits (default 90) and, per commit,
  count the test files a module-granularity selection reruns. This is the honest CI-spend metric — the
  unweighted percentiles in `repo-metrics` stay pegged on the giant SCC and overstate the payoff of a
  cut. Git-dependent, so it lives outside the pure `repo-metrics`. Returns mean/median/p90 plus commit
  counts (see `module-scc/expected-tests-per-commit`)."
  ([] (churn-weighted-blast-radius (deps) (config) 90))
  ([deps config days]
   (let [modules      (modules deps config)
         graph        (merge (zipmap modules (repeat #{}))
                             (deps-graph/module-dependencies deps))
         module->tests (module-scc/module->test-files config modules)
         file->module (into {} (map (juxt :filename :module)) deps)
         commits      (module-scc/commit-file-lists days)]
     (module-scc/expected-tests-per-commit graph module->tests file->module commits))))

(comment
  (metrics (deps) (config))
  (repo-metrics (deps) (config))
  (churn-weighted-blast-radius)
  (csv (deps) (config)))
