(ns dev.module-cycle-scan
  "Measure the cyclic clusters of the module graph and compare them with
  `.clj-kondo/config/modules/cycle-clusters.edn`.

  The measurement reuses the SCC analysis in [[dev.deps-graph]]; what the record means lives in
  [[dev.module-cycle-ratchet]]. `./bin/mage fix-module-cycles` and `metabase.core.module-cycle-ratchet-test`
  both come through here."
  {:clj-kondo/config '{:linters {:discouraged-var {clojure.core/println {:level :off}}}}}
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [dev.deps-graph :as deps-graph]
   [dev.kondo-ratchet :as kondo-ratchet]
   [dev.module-cycle-ratchet :as cycle-ratchet]
   [hooks.common.modules :as modules]))

(set! *warn-on-reflection* true)

(defn- top-level-root
  "The top-level module `module`'s subtree hangs from, itself for a top-level module.
  Cross-subtree edges are counted against these: a cycle inside one subtree is internal organization,
  while one crossing two top-level trees is coupling between parts of the product."
  [config module]
  (last (take-while some? (iterate #(modules/parent-module config %) module))))

(defn- component-facts
  "One cluster's recorded shape: its modules, the directed edges inside it, and how many of those edges
  cross from one top-level subtree into another.
  The edges themselves are kept for naming (see [[dev.module-cycle-ratchet/dominant-module]]) and dropped
  before anything is written."
  [graph config component]
  (let [root  (into {} (map (juxt identity #(top-level-root config %))) component)
        edges (into #{}
                    (for [from  component
                          to    (get graph from)
                          :when (contains? component to)]
                      [from to]))]
    {:modules             component
     :edges               edges
     :internal-edges      (count edges)
     :cross-subtree-edges (count (remove (fn [[from to]] (= (root from) (root to))) edges))}))

(defn graphs
  "The two graphs the record covers, keyed as in [[dev.module-cycle-ratchet/graph-keys]].
  `ownership` and `references` are as [[dev.deps-graph/model-import-dependencies]] takes them."
  [deps config ownership references]
  (let [module-graph (deps-graph/module-dependencies deps)]
    {:uses               module-graph
     :uses+model-imports (merge-with into
                                     module-graph
                                     (deps-graph/model-import-dependencies config ownership references))}))

(defn structure
  "The cyclic structure of the module graph: for each graph, its cyclic clusters, largest first."
  ([]
   (structure (deps-graph/dependencies)
              (deps-graph/kondo-config)
              (deps-graph/model-ownership)
              (deps-graph/model-references-by-module)))
  ([deps config ownership references]
   (let [graph (graphs deps config ownership references)]
     (into {}
           (map (fn [k]
                  [k (mapv #(component-facts (get graph k) config %)
                           (deps-graph/cyclic-components (get graph k)))]))
           cycle-ratchet/graph-keys))))

;;;; =============================================================================
;;;; Entry points
;;;; =============================================================================

(defn- summarize
  "One line per graph saying how much of the repo is tangled, for the fixer's output."
  [structure]
  (for [graph cycle-ratchet/graph-keys
        :let  [clusters (get structure graph)]]
    (format "%s: %d cyclic cluster(s), %d modules, %d internal edges"
            graph
            (count clusters)
            (transduce (map (comp count :modules)) + 0 clusters)
            (transduce (map :internal-edges) + 0 clusters))))

(defn fix!
  "Record the current cyclic structure in [[dev.module-cycle-ratchet/*clusters-file*]].
  In `:observe` mode that is the structure as it stands; in `:enforce` mode only an improvement, so a
  cluster that grew, two that merged, or a new cycle has to be broken or recorded by hand.
  `:seed true` creates the file, and only works when there is none: seeding over a record would throw its
  names away."
  [{:keys [seed]}]
  (let [file (io/file cycle-ratchet/*clusters-file*)]
    (when (and seed (.exists file))
      (throw (ex-info (str cycle-ratchet/*clusters-file* " already exists; seeding would discard its names")
                      {:file cycle-ratchet/*clusters-file*})))
    (let [snapshot (if seed cycle-ratchet/empty-snapshot (cycle-ratchet/read-snapshot))
          actual   (structure)
          recorded (cycle-ratchet/updated snapshot actual {:seed? seed})
          text     (cycle-ratchet/render recorded)]
      (run! println (summarize actual))
      (if (and (.exists file) (= text (slurp file)))
        (println (str cycle-ratchet/*clusters-file* " is already current."))
        (do (run! println (cycle-ratchet/changes snapshot recorded))
            (spit file text)
            (println (str "Recorded the cyclic module structure in " cycle-ratchet/*clusters-file*)))))))

(defn announce!
  "Print observed changes to the clusters, and under GitHub Actions also as a notice on the run, since they do
  not fail it."
  [lines]
  (println (str "Module cycles differ from " cycle-ratchet/*clusters-file*
                " (not a failure; the shrink workflow records master's structure):"))
  (run! println lines)
  (when (= "true" (System/getenv "GITHUB_ACTIONS"))
    (println (str "::notice title=Module cycles::"
                  (-> (str/join "\n" lines)
                      (str/replace "%" "%25")
                      (str/replace "\n" "%0A"))))))

(defn report
  "What CI says about the current tree: `{:enforce? _, :lines [...]}`, where the lines are the ceilings it
  breaks in `:enforce` mode and every change in `:observe` mode.
  Nil on a branch whose `.clj-kondo/ratchets.edn` is disabled, as a release branch's is."
  []
  (when-not (kondo-ratchet/disabled?)
    (let [snapshot (cycle-ratchet/read-snapshot)]
      {:enforce? (cycle-ratchet/enforce? snapshot)
       :lines    (vec (cycle-ratchet/report-lines snapshot (structure)))})))
