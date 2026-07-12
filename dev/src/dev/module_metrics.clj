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

(defn- declared-direct-uses [config module]
  (let [uses (get-in config [module :uses])]
    (if (= uses :any)
      :any
      (into (sorted-set) uses))))

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
  "Min / p10 / p25 / mean / median / p90 / max / total over a collection of numeric `values`.
  The low percentiles (p10, p25) and mean move as soon as a few modules are carved out of the blob,
  well before the blob-pegged median and max budge."
  [values]
  (let [sorted (vec (sort values))
        n      (count sorted)]
    (ordered-map/ordered-map
     :min    (if (zero? n) 0 (first sorted))
     :p10    (nearest-rank-percentile sorted 0.1)
     :p25    (nearest-rank-percentile sorted 0.25)
     :mean   (safe-ratio (reduce + 0 sorted) n)
     :median (nearest-rank-percentile sorted 0.5)
     :p90    (nearest-rank-percentile sorted 0.9)
     :max    (if (zero? n) 0 (peek sorted))
     :total  (reduce + 0 sorted))))

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
        circular-deps-graph      (merge (zipmap modules' (repeat (sorted-set)))
                                        (deps-graph/circular-dependencies deps))
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
        sccs                     (module-scc/strongly-connected-components direct-deps-graph)
        module->scc              (into {} (for [component sccs, m component] [m component]))]
    {:prefix->mod              prefix->mod
     :modules                  modules'
     :direct-deps-graph        direct-deps-graph
     :module->paths            module->paths
     :transitive-deps-graph    transitive-deps-graph
     :direct-dependents-graph  direct-dependents-graph
     :transitive-dependents    transitive-dependents
     :circular-deps-graph      circular-deps-graph
     :module->nses             module->nses
     :module->sources          module->sources
     :all-source-files         all-source-files
     :all-test-files           all-test-files
     :module->relevant-test-files module->relevant-test-files
     :sccs                     sccs
     :module->scc              module->scc}))

(defn- metrics*
  [deps config {:keys [modules direct-deps-graph module->paths transitive-deps-graph
                       direct-dependents-graph transitive-dependents circular-deps-graph
                       module->nses module->sources all-source-files all-test-files
                       module->relevant-test-files sccs module->scc]}]
  (let [largest-scc (apply max-key count sccs)]
    (into []
          (map (fn [module]
                 (let [direct-deps               (get direct-deps-graph module)
                       transitive-deps           (get transitive-deps-graph module)
                       direct-dependents         (get direct-dependents-graph module)
                       downstream-modules        (get transitive-dependents module)
                       circular-deps             (get circular-deps-graph module)
                       dependency-depths         (map (comp inc count) (vals (get module->paths module)))
                       source-files              (get module->sources module)
                       downstream-source-files   (into (sorted-set)
                                                       (mapcat #(get module->sources %))
                                                       downstream-modules)
                       affected-source-files     (into source-files downstream-source-files)
                       affected-test-files       (get module->relevant-test-files module)
                       derived-api-namespaces    (deps-graph/externally-used-namespaces-ignoring-friends deps config module)
                       declared-api              (declared-api-namespaces config module)
                       unexpected-api-namespaces (set/difference derived-api-namespaces
                                                                 (canonical-api-namespaces config module))
                       undeclared-api-namespaces (if (= declared-api :any)
                                                   (sorted-set)
                                                   (set/difference derived-api-namespaces declared-api))
                       declared-friends          (into (sorted-set) (get-in config [module :friends]))
                       declared-uses             (declared-direct-uses config module)
                       num-nses                  (count (get module->nses module))
                       ;; `:any` api means the whole module is public, so its internal (non-api)
                       ;; surface is empty; otherwise non-api = namespaces minus the declared api.
                       api-ns-count              (if (= declared-api :any) num-nses (count declared-api))
                       num-friend-exposed        (if (seq declared-friends)
                                                   (- num-nses api-ns-count)
                                                   0)
                       num-lines                 (reduce + 0 (map file-loc source-files))
                       ;; Namespaces in every module this one can transitively reach through its declared
                       ;; `:uses` — the compile/load closure its boundary permits, not just module count.
                       num-transitive-nses       (reduce + 0 (map #(count (get module->nses %)) transitive-deps))]
                   (ordered-map/ordered-map
                    :module module
                    :top-level? (top-level-module? module)
                    :num-direct-deps (count direct-deps)
                    :num-transitive-deps (count transitive-deps)
                    :num-transitive-namespaces-reachable num-transitive-nses
                    :num-direct-dependents (count direct-dependents)
                    :num-transitive-dependents (count downstream-modules)
                    :max-dependency-depth (reduce max 0 dependency-depths)
                    :avg-dependency-path-length (safe-ratio (reduce + 0 dependency-depths)
                                                            (count dependency-depths))
                    :num-circular-dependencies (count circular-deps)
                    :scc-size (count (get module->scc module #{module}))
                    :in-largest-scc? (contains? largest-scc module)
                    :leaf? (empty? direct-deps)
                    :root? (empty? direct-dependents)
                    :num-namespaces (count (get module->nses module))
                    :num-lines num-lines
                    :num-externally-used-namespaces (count derived-api-namespaces)
                    :num-declared-api-namespaces (if (= declared-api :any)
                                                   :any
                                                   (count declared-api))
                    :num-derived-api-namespaces (count derived-api-namespaces)
                    :num-unexpected-api-namespaces (count unexpected-api-namespaces)
                    :num-undeclared-api-namespaces (count undeclared-api-namespaces)
                    :num-declared-friends (count declared-friends)
                    ;; Internal namespaces a friend grant exposes: friends bypass `:api` entirely,
                    ;; so this is the encapsulation still bypassed on this module (0 if no friends).
                    :num-friend-exposed-namespaces num-friend-exposed
                    :num-direct-uses (if (= declared-uses :any)
                                       :any
                                       (count declared-uses))
                    :num-source-files (count source-files)
                    :num-downstream-modules-affected (count downstream-modules)
                    :num-downstream-source-files-affected (count downstream-source-files)
                    :num-affected-source-files (count affected-source-files)
                    :num-test-files-affected (count affected-test-files)
                    :percent-of-repo-source-files-affected (safe-ratio (count affected-source-files)
                                                                       (count all-source-files))
                    :percent-of-repo-test-files-affected (safe-ratio (count affected-test-files)
                                                                     (count all-test-files))))))
          modules)))

(defn metrics
  "Per-module dependency, API, size, and selective-test metrics."
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
         num-modules                 (count (:modules ctx))
         num-direct-edges            (reduce + 0 (map count (vals (:direct-deps-graph ctx))))
         module->nses                (:module->nses ctx)
         api-ns-count                (fn [m]
                                       (let [a (get-in config [m :api])]
                                         (if (= a :any) (count (get module->nses m)) (count a))))
         total-namespaces            (reduce + 0 (map count (vals module->nses)))
         total-declared-api          (reduce + 0 (map api-ns-count (:modules ctx)))
         friend-holding-modules      (filter #(seq (get-in config [% :friends])) (:modules ctx))
         in-degrees                  (sort > (map :num-direct-dependents module-metrics))
         top-decile-n                (long (Math/ceil (/ num-modules 10.0)))
         majority-test-threshold     (* 0.5 (count (:all-test-files ctx)))
         ;; Namespaces living in modules trapped in a nontrivial SCC. Unlike the module-count SCC
         ;; metrics, this is invariant to config-only node-splitting (splitting a cyclic module keeps
         ;; its namespaces in the cycle) — so it stays flat under re-bucketing and only drops when a
         ;; real carve pulls namespaces out of the blob. This is the honest coupling number.
         cyclic-modules              (into #{} (mapcat identity) (filter #(> (count %) 1) (:sccs ctx)))
         namespaces-in-cyclic        (reduce + 0 (map #(count (get module->nses %)) cyclic-modules))
         non-api-ns                  (fn [m] (- (count (get module->nses m)) (api-ns-count m)))
         ;; Internal namespaces reachable past a module's public API through a friend grant.
         friend-exposed              (reduce + 0 (map non-api-ns friend-holding-modules))
         ;; Every distinct (outside module, private namespace) access a friend grant opens up: the
         ;; grant count times the internal surface it exposes. This is the encapsulation-leak headline.
         friend-access-paths         (reduce + 0 (map (fn [m] (* (count (get-in config [m :friends]))
                                                                 (non-api-ns m)))
                                                      friend-holding-modules))]
     (ordered-map/ordered-map
      ;; ---- graph structure ----
      :num-module-nodes num-modules
      :num-direct-edges num-direct-edges
      :avg-out-degree (safe-ratio num-direct-edges num-modules)
      ;; Biggest fan-in hub and how concentrated fan-in is. Replaces avg-in-degree (≡ avg-out-degree,
      ;; redundant) and density (~0.05 here, doesn't discriminate at this node count).
      :max-in-degree (reduce max 0 in-degrees)
      :top-decile-fan-in-share (safe-ratio (reduce + 0 (take top-decile-n in-degrees)) num-direct-edges)
      :num-leaf-modules (count (filter :leaf? module-metrics))
      :num-root-modules (count (filter :root? module-metrics))
      ;; Top-level modules only (no dotted children, no enterprise/*): the objective-#4 grouping count.
      :num-top-level-modules (count (filter :top-level? module-metrics))
      ;; ---- cycles (SCC-truth vs the pairwise view) ----
      ;; `*-2cycle-*` count only mutual pairs; they undercount the giant component ~2×. Read
      ;; num-modules-in-any-scc (Σ sizes of nontrivial SCCs) for the true trapped-module count.
      :num-modules-in-2cycles (count (filter seq (vals (:circular-deps-graph ctx))))
      :num-2cycle-edges (quot (reduce + 0 (map count (vals (:circular-deps-graph ctx)))) 2)
      :num-nontrivial-sccs (count (filter #(> (count %) 1) (:sccs ctx)))
      :num-modules-in-any-scc (reduce + 0 (map count (filter #(> (count %) 1) (:sccs ctx))))
      :largest-scc-size (count (apply max-key count (:sccs ctx)))
      ;; Σ|C|² over SCCs — the continuous fragmentation score. Unlike largest-scc-size or the pegged
      ;; tests-rerun median, this moves every time a cut shaves members off the giant component.
      :sum-squared-scc-sizes (reduce + (map #(let [n (count %)] (* n n)) (:sccs ctx)))
      ;; Namespace-weighted cycle mass — node-split-invariant; the coupling metric that only real carves move.
      :namespaces-in-cyclic-modules namespaces-in-cyclic
      :frac-namespaces-in-cyclic-modules (safe-ratio namespaces-in-cyclic total-namespaces)
      ;; ---- encapsulation health (what config-only friend/api work moves) ----
      :num-friend-edges (reduce + 0 (map (fn [m] (count (get-in config [m :friends]))) (:modules ctx)))
      :num-modules-with-friends (count friend-holding-modules)
      ;; Total internal surface still reachable through a friend backdoor (Σ non-api nss of friend holders).
      :friend-exposed-namespaces friend-exposed
      ;; (outside module, private namespace) access pairs opened by friend grants — the encapsulation-leak headline.
      :privileged-internal-access-paths friend-access-paths
      ;; Share of namespaces NOT reachable through a friend backdoor (1 = no friend leaks). Scoped to
      ;; friends; undeclared cross-boundary access is tracked separately as :num-undeclared-api-leaks.
      :encapsulation-index (- 1.0 (safe-ratio friend-exposed total-namespaces))
      :total-declared-api-namespaces total-declared-api
      :api-surface-ratio (safe-ratio total-declared-api total-namespaces)
      ;; Namespaces used across a module boundary but not declared in any `:api` — hidden coupling debt.
      :num-undeclared-api-leaks (reduce + 0 (map :num-undeclared-api-namespaces module-metrics))
      ;; ---- module size ----
      :namespaces-per-module (distribution-stats (map :num-namespaces module-metrics))
      :lines-per-module (distribution-stats (map :num-lines module-metrics))
      ;; Weight of each module's declared dependency closure, counted in reachable namespaces.
      :transitive-namespaces-reachable-per-module
      (distribution-stats (map :num-transitive-namespaces-reachable module-metrics))
      ;; ---- blast radius ----
      :num-source-files (count (:all-source-files ctx))
      :num-test-files (count (:all-test-files ctx))
      :avg-tests-rerun-per-changed-source-file
      (safe-ratio (reduce + 0 source-file-test-counts) (count source-file-test-counts))
      :median-tests-rerun-per-changed-source-file
      (nearest-rank-percentile source-file-test-counts 0.5)
      ;; Saturation replaces the pegged p90: fraction of source files whose change reruns a majority of
      ;; the test suite. Unlike the percentiles, this moves as cuts shrink the giant component.
      :frac-source-files-rerunning-majority-of-tests
      (safe-ratio (count (filter #(> % majority-test-threshold) source-file-test-counts))
                  (count source-file-test-counts))
      :avg-downstream-modules-affected-per-changed-source-file
      (safe-ratio (reduce + 0 source-file-downstream-mods) (count source-file-downstream-mods))))))

(defn csv
  "Write [[metrics]] as CSV to `*out*`."
  ([]
   (let [config (deps-graph/kondo-config)]
     (csv (deps-graph/dependencies (deps-graph/build-prefix->module config)) config)))
  ([deps config]
   (let [ks [:module
             :top-level?
             :num-direct-deps
             :num-transitive-deps
             :num-transitive-namespaces-reachable
             :num-direct-dependents
             :num-transitive-dependents
             :max-dependency-depth
             :avg-dependency-path-length
             :num-circular-dependencies
             :scc-size
             :in-largest-scc?
             :leaf?
             :root?
             :num-namespaces
             :num-lines
             :num-externally-used-namespaces
             :num-declared-api-namespaces
             :num-derived-api-namespaces
             :num-unexpected-api-namespaces
             :num-undeclared-api-namespaces
             :num-declared-friends
             :num-friend-exposed-namespaces
             :num-direct-uses
             :num-source-files
             :num-downstream-modules-affected
             :num-downstream-source-files-affected
             :num-affected-source-files
             :num-test-files-affected
             :percent-of-repo-source-files-affected
             :percent-of-repo-test-files-affected]
         rows (cons (map name ks)
                    (->> (metrics deps config)
                         (sort-by (juxt (comp - :num-test-files-affected)
                                        (comp - :num-downstream-modules-affected)
                                        :module))
                         (map (apply juxt ks))
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
