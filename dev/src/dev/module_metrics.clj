(ns dev.module-metrics
  (:require
   [clojure.data.csv :as csv]
   [clojure.set :as set]
   [dev.deps-graph :as deps-graph]
   [flatland.ordered.map :as ordered-map]
   [metabase.util :as u]))

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

(defn- canonical-api-namespaces [module]
  (let [prefix (format (if (= (namespace module) "enterprise")
                         "metabase-enterprise.%s"
                         "metabase.%s")
                       (name module))]
    (into (sorted-set)
          (map (fn [suffix]
                 (symbol (format "%s.%s" prefix suffix))))
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

(defn- build-graph-context
  "Build all shared intermediate data structures needed by both per-module and repo-level metrics."
  [deps config]
  (let [modules'                 (modules deps config)
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
        all-test-files           (deps-graph/source-filenames->relevant-test-filenames deps all-source-files)]
    {:modules                  modules'
     :direct-deps-graph        direct-deps-graph
     :module->paths            module->paths
     :transitive-deps-graph    transitive-deps-graph
     :direct-dependents-graph  direct-dependents-graph
     :transitive-dependents    transitive-dependents
     :circular-deps-graph      circular-deps-graph
     :module->nses             module->nses
     :module->sources          module->sources
     :all-source-files         all-source-files
     :all-test-files           all-test-files}))

(defn- metrics*
  [deps config {:keys [modules direct-deps-graph module->paths transitive-deps-graph
                       direct-dependents-graph transitive-dependents circular-deps-graph
                       module->nses module->sources all-source-files all-test-files]}]
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
                     affected-test-files       (deps-graph/source-filenames->relevant-test-filenames deps source-files)
                     derived-api-namespaces    (deps-graph/externally-used-namespaces-ignoring-friends deps config module)
                     declared-api              (declared-api-namespaces config module)
                     unexpected-api-namespaces (set/difference derived-api-namespaces
                                                               (canonical-api-namespaces module))
                     undeclared-api-namespaces (if (= declared-api :any)
                                                 (sorted-set)
                                                 (set/difference derived-api-namespaces declared-api))
                     declared-friends          (into (sorted-set) (get-in config [module :friends]))
                     declared-uses             (declared-direct-uses config module)]
                 (ordered-map/ordered-map
                  :module module
                  :num-direct-deps (count direct-deps)
                  :num-transitive-deps (count transitive-deps)
                  :num-direct-dependents (count direct-dependents)
                  :num-transitive-dependents (count downstream-modules)
                  :max-dependency-depth (reduce max 0 dependency-depths)
                  :avg-dependency-path-length (safe-ratio (reduce + 0 dependency-depths)
                                                          (count dependency-depths))
                  :num-circular-dependencies (count circular-deps)
                  :leaf? (empty? direct-deps)
                  :root? (empty? direct-dependents)
                  :num-namespaces (count (get module->nses module))
                  :num-externally-used-namespaces (count derived-api-namespaces)
                  :num-declared-api-namespaces (if (= declared-api :any)
                                                 :any
                                                 (count declared-api))
                  :num-derived-api-namespaces (count derived-api-namespaces)
                  :num-unexpected-api-namespaces (count unexpected-api-namespaces)
                  :num-undeclared-api-namespaces (count undeclared-api-namespaces)
                  :num-declared-friends (count declared-friends)
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
        modules))

(defn metrics
  ([]
   (metrics (deps-graph/dependencies) (deps-graph/kondo-config)))
  ([deps config]
   (metrics* deps config (build-graph-context deps config))))

(defn repo-metrics
  ([]
   (repo-metrics (deps-graph/dependencies) (deps-graph/kondo-config)))
  ([deps config]
   (let [ctx                         (build-graph-context deps config)
         module-metrics              (metrics* deps config ctx)
         source-file->module         (into {} (map (juxt :filename :module)) deps)
         source-file-test-counts     (sort (map (fn [source-file]
                                                  (count (deps-graph/source-filenames->relevant-test-filenames deps [source-file])))
                                                (:all-source-files ctx)))
         source-file-downstream-mods (sort (map (fn [source-file]
                                                  (count (get (:transitive-dependents ctx)
                                                              (get source-file->module source-file)
                                                              #{})))
                                                (:all-source-files ctx)))
         num-modules                 (count (:modules ctx))
         num-direct-edges            (reduce + 0 (map count (vals (:direct-deps-graph ctx))))]
     (ordered-map/ordered-map
      :num-module-nodes num-modules
      :num-direct-edges num-direct-edges
      :avg-out-degree (safe-ratio num-direct-edges num-modules)
      :avg-in-degree (safe-ratio num-direct-edges num-modules)
      :density (if (< num-modules 2)
                 0.0
                 (safe-ratio num-direct-edges (* num-modules (dec num-modules))))
      :num-leaf-modules (count (filter :leaf? module-metrics))
      :num-root-modules (count (filter :root? module-metrics))
      :num-modules-in-cycles (count (filter seq (vals (:circular-deps-graph ctx))))
      :num-circular-edges (quot (reduce + 0 (map count (vals (:circular-deps-graph ctx)))) 2)
      :num-source-files (count (:all-source-files ctx))
      :num-test-files (count (:all-test-files ctx))
      :avg-tests-rerun-per-changed-source-file
      (safe-ratio (reduce + 0 source-file-test-counts) (count source-file-test-counts))
      :median-tests-rerun-per-changed-source-file
      (nearest-rank-percentile source-file-test-counts 0.5)
      :p90-tests-rerun-per-changed-source-file
      (nearest-rank-percentile source-file-test-counts 0.9)
      :avg-downstream-modules-affected-per-changed-source-file
      (safe-ratio (reduce + 0 source-file-downstream-mods) (count source-file-downstream-mods))))))

(defn csv
  ([]
   (csv (deps-graph/dependencies) (deps-graph/kondo-config)))
  ([deps config]
   (let [ks [:module
             :num-direct-deps
             :num-transitive-deps
             :num-direct-dependents
             :num-transitive-dependents
             :max-dependency-depth
             :avg-dependency-path-length
             :num-circular-dependencies
             :leaf?
             :root?
             :num-namespaces
             :num-externally-used-namespaces
             :num-declared-api-namespaces
             :num-derived-api-namespaces
             :num-unexpected-api-namespaces
             :num-undeclared-api-namespaces
             :num-declared-friends
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

(defn deps []
  (deps-graph/dependencies))

(defn config []
  (deps-graph/kondo-config))

(comment
  (metrics (deps) (config))
  (repo-metrics (deps) (config))
  (csv (deps) (config)))
