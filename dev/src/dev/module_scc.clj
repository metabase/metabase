(ns dev.module-scc
  "Strongly-connected-component analysis of the module dependency graph.

  Closure-based metrics like median tests-invalidated (see sadness.md) are step functions over the giant
  SCC: they cannot move until the component is actually partitioned, so ten snapshots of refactoring showed
  a flat median. The fns here measure the component itself — size, membership, condensation — and score
  candidate cuts by how much they fragment it, giving carving experiments a continuous metric and a ranked
  target list.

  Cut models, from least to most realistic:

    - [[edge-cut-impacts]]    — sever one module→module edge.
    - [[node-cut-impacts]]    — delete a module outright (upper bound on what removing it could buy).
    - [[upstream-cut-impacts]] — sever ALL of a module's out-edges that stay inside the SCC, making it a
      pure upstream module. This is what 'wrap `app-db`/`settings` behind a narrow seam and invert its
      back-references' looks like at the module-graph level."
  (:require
   [dev.deps-graph :as deps-graph]))

(set! *warn-on-reflection* true)

;;;; ------------------------------------------------------------------------------------------------
;;;; SCC computation (Tarjan)
;;;; ------------------------------------------------------------------------------------------------

(defn- graph-nodes [graph]
  (into (set (keys graph)) (mapcat val) graph))

(defn strongly-connected-components
  "Tarjan's algorithm over an adjacency map of `node -> coll of successor nodes`. Returns a vector of sets,
  one per SCC, including singletons. Recursive; fine for graphs a few thousand nodes deep."
  [graph]
  (let [index    (volatile! {})
        lowlink  (volatile! {})
        on-stack (volatile! #{})
        stack    (volatile! [])
        counter  (volatile! 0)
        sccs     (volatile! [])]
    (letfn [(strongconnect [v]
              (vswap! index assoc v @counter)
              (vswap! lowlink assoc v @counter)
              (vswap! counter inc)
              (vswap! stack conj v)
              (vswap! on-stack conj v)
              (doseq [w (get graph v)]
                (cond
                  (not (contains? @index w))
                  (do (strongconnect w)
                      (vswap! lowlink update v min (get @lowlink w)))

                  (contains? @on-stack w)
                  (vswap! lowlink update v min (get @index w))))
              (when (= (get @lowlink v) (get @index v))
                (loop [component #{}]
                  (let [w (peek @stack)]
                    (vswap! stack pop)
                    (vswap! on-stack disj w)
                    (let [component (conj component w)]
                      (if (= w v)
                        (vswap! sccs conj component)
                        (recur component)))))))]
      (doseq [v (sort (graph-nodes graph))]
        (when-not (contains? @index v)
          (strongconnect v))))
    @sccs))

(defn largest-scc
  "The largest SCC of `graph` (ties broken arbitrarily). With two args, picks from precomputed `sccs`."
  ([graph] (largest-scc graph (strongly-connected-components graph)))
  ([_graph sccs] (apply max-key count sccs)))

(defn condensation
  "Condense `graph` by its SCCs. Returns `{:node->scc {node scc-index}, :graph {scc-index #{scc-index}}}`
  where `:graph` is the (acyclic) DAG of inter-SCC edges."
  [graph sccs]
  (let [node->scc (into {}
                        (for [[i component] (map-indexed vector sccs)
                              node          component]
                          [node i]))
        cgraph    (reduce-kv (fn [acc v ws]
                               (let [sv (node->scc v)]
                                 (reduce (fn [acc w]
                                           (let [sw (node->scc w)]
                                             (cond-> acc
                                               (not= sv sw) (update sv (fnil conj #{}) sw))))
                                         acc
                                         ws)))
                             {}
                             graph)]
    {:node->scc node->scc
     :graph     cgraph}))

(defn- sum-squared-scc-sizes
  "Σ|C|² over SCCs — the continuous fragmentation score. The number of ordered pairs (u, v) that are
  mutually reachable; unlike largest-SCC size it moves even when a cut only shaves a few members off the
  giant component. Lower is better."
  [sccs]
  (transduce (map (fn [c] (let [n (count c)] (* n n)))) + 0 sccs))

(defn scc-summary
  "Repo-level SCC stats for `graph`."
  [graph]
  (let [sccs       (strongly-connected-components graph)
        nontrivial (filter #(> (count %) 1) sccs)
        giant      (largest-scc graph sccs)]
    {:num-sccs              (count sccs)
     :num-nontrivial-sccs   (count nontrivial)
     :nontrivial-scc-sizes  (sort > (map count nontrivial))
     :largest-scc-size      (count giant)
     :largest-scc-members   (into (sorted-set) giant)
     :sum-squared-scc-sizes (sum-squared-scc-sizes sccs)}))

;;;; ------------------------------------------------------------------------------------------------
;;;; Cut scoring
;;;; ------------------------------------------------------------------------------------------------

(defn- cut-impact
  "Score `graph'` (a modified copy of `graph`) against the original `giant` SCC. `:num-freed` counts former
  giant members that fell out of the new largest SCC."
  [graph' giant]
  (let [sccs'    (strongly-connected-components graph')
        largest' (apply max-key count sccs')]
    {:new-largest-size (count largest')
     :num-freed        (count (remove largest' giant))
     :fragmentation    (sum-squared-scc-sizes sccs')}))

(defn- intra-scc-edges
  "Directed edges of `graph` with both endpoints inside `component`."
  [graph component]
  (for [v     component
        w     (get graph v)
        :when (contains? component w)]
    [v w]))

(defn edge-cut-impacts
  "For every directed edge inside the largest SCC, sever it and recompute. Returns maps of
  `:edge :new-largest-size :num-freed :fragmentation`, best cuts first. Single edges rarely split a dense
  SCC — rank by `:fragmentation`, which still distinguishes them."
  [graph]
  (let [giant (largest-scc graph)]
    (->> (intra-scc-edges graph giant)
         (map (fn [[v w :as edge]]
                (assoc (cut-impact (update graph v disj w) giant)
                       :edge edge)))
         (sort-by (juxt :fragmentation :new-largest-size)))))

(defn node-cut-impacts
  "For every member of the largest SCC, delete the module outright (all in- and out-edges) and recompute.
  An unrealistic cut, but an upper bound on what any refactor of that one module could buy."
  [graph]
  (let [giant (largest-scc graph)]
    (->> giant
         (map (fn [m]
                (let [graph' (reduce-kv (fn [acc v ws] (assoc acc v (disj ws m)))
                                        {}
                                        (dissoc graph m))]
                  (assoc (cut-impact graph' (disj giant m))
                         :module m))))
         (sort-by (juxt :fragmentation :new-largest-size)))))

(defn upstream-cut-impacts
  "For every member of the largest SCC, sever ALL of its out-edges that stay inside the SCC — i.e. make it
  a pure upstream module that the blob depends on but that depends on nothing in the blob. This is the
  module-graph shape of the carving experiment: invert the chokepoint's back-references and keep everything
  else. `:severed-edges` lists the requires that would need inverting; fewer severed edges with more
  modules freed = better experiment."
  [graph]
  (let [giant (largest-scc graph)]
    (->> giant
         (map (fn [m]
                (let [back-deps (into (sorted-set) (filter giant) (get graph m))]
                  (assoc (cut-impact (update graph m #(reduce disj % back-deps)) giant)
                         :module        m
                         :severed-edges (mapv (fn [w] [m w]) back-deps)
                         :num-severed   (count back-deps)))))
         (sort-by (juxt :fragmentation :new-largest-size)))))

;;;; ------------------------------------------------------------------------------------------------
;;;; Predicted blast radius
;;;; ------------------------------------------------------------------------------------------------

(defn- transitive-dependents-graph
  "Map of `module -> set of modules that transitively depend on it` for an adjacency map of direct deps."
  [graph]
  (let [nodes      (graph-nodes graph)
        dependents (reduce-kv (fn [acc v ws]
                                (reduce (fn [acc w] (update acc w (fnil conj #{}) v)) acc ws))
                              {}
                              graph)
        reach      (fn [m]
                     (loop [seen #{} frontier (get dependents m #{})]
                       (if-let [v (first frontier)]
                         (if (seen v)
                           (recur seen (disj frontier v))
                           (recur (conj seen v) (into (disj frontier v) (remove seen (get dependents v)))))
                         seen)))]
    (into {} (map (fn [m] [m (reach m)])) nodes)))

(defn predicted-test-blast-radius
  "Predicted per-module tests-invalidated under (possibly modified) `graph`: a change to module `m`
  invalidates the test files owned by `m` and by every transitive dependent. This is the same
  module-granularity rule `deps-graph/source-filenames->relevant-test-filenames` applies to the real graph,
  so running it on the unmodified graph reproduces today's numbers and running it on a cut graph predicts a
  carve's payoff, apples to apples. `module->tests` maps module → set of its test files. Returns
  `{:per-module {m count}, :median n, :mean n}`."
  [graph module->tests]
  (let [dependents (transitive-dependents-graph graph)
        per-module (into (sorted-map)
                         (map (fn [m]
                                [m (count (into (set (get module->tests m))
                                                (mapcat module->tests)
                                                (get dependents m)))]))
                         (graph-nodes graph))
        counts     (sort (vals per-module))]
    {:per-module per-module
     :median     (nth counts (quot (count counts) 2))
     :mean       (double (/ (reduce + 0 counts) (max 1 (count counts))))}))

(defn module->test-files
  "Map of module → set of its test files, via the same filesystem mapping the selective-CI helpers use.
  (`deps-graph/module->test-files` is private; this is dev tooling, so we go through the var.)"
  [config modules]
  (into (sorted-map)
        (map (fn [m] [m (#'deps-graph/module->test-files config m)]))
        modules))

(comment
  (def config*  (deps-graph/kondo-config))
  (def prefix*  (deps-graph/build-prefix->module config*))
  (def deps*    (deps-graph/dependencies prefix*))
  (def graph*   (deps-graph/module-dependencies deps*))

  (dissoc (scc-summary graph*) :largest-scc-members)
  (take 10 (upstream-cut-impacts graph*))
  (take 10 (node-cut-impacts graph*))
  (take 10 (edge-cut-impacts graph*))

  (def m->tests* (module->test-files config* (sort (into (set (keys graph*)) (mapcat val) graph*))))
  ;; sanity check: on the unmodified graph this should reproduce sadness.md's pegged median (~1190)
  (dissoc (predicted-test-blast-radius graph* m->tests*) :per-module)
  ;; predicted payoff of the best carve candidate
  (let [{:keys [module severed-edges]} (first (upstream-cut-impacts graph*))
        graph' (update graph* module #(reduce disj % (map second severed-edges)))]
    (dissoc (predicted-test-blast-radius graph' m->tests*) :per-module)))
