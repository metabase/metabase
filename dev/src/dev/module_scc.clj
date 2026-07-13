(ns dev.module-scc
  "Strongly-connected-component analysis of the module dependency graph.

  Closure-based metrics like median tests-invalidated are step functions over the giant SCC: they cannot
  move until the component is actually partitioned, so ten snapshots of refactoring showed a flat median.
  (The full blast-radius analysis lives with the planning docs, outside the repo.) The fns here measure the component itself — size, membership, condensation — and score
  candidate cuts by how much they fragment it, giving carving experiments a continuous metric and a ranked
  target list.

  Cut models, from least to most realistic:

    - [[edge-cut-impacts]]    — sever one module→module edge.
    - [[node-cut-impacts]]    — delete a module outright (upper bound on what removing it could buy).
    - [[upstream-cut-impacts]] — sever ALL of a module's out-edges that stay inside the SCC, making it a
      pure upstream module. This is what 'wrap `app-db`/`settings` behind a narrow seam and invert its
      back-references' looks like at the module-graph level."
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [clojure.tools.namespace.file :as ns.file]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]
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

(defn leaf-cut-impacts
  "For every member of the largest SCC, sever ALL of the SCC's in-edges into it — i.e. make it a pure
  downstream module that depends on the blob but that nothing in the blob depends on. The complement of
  [[upstream-cut-impacts]]: that shape suits foundational chokepoints (`util`, `settings`), this one suits
  feature modules (`metabot`, `transforms`), whose own blast radius collapses to their dependents outside
  the blob once they leave it. The realistic refactor behind a severed in-edge is usually nesting the
  dependent (a REST layer belongs inside the feature) or inverting it via events; high-churn feature
  modules are where this pays, so rank these against commit frequency, not alone."
  [graph]
  (let [giant (largest-scc graph)]
    (->> giant
         (map (fn [m]
                (let [in-deps (into (sorted-set)
                                    (for [[v ws] graph
                                          :when (and (contains? ws m) (contains? giant v) (not= v m))]
                                      v))]
                  (assoc (cut-impact (reduce (fn [g v] (update g v disj m)) graph in-deps) giant)
                         :module        m
                         :severed-edges (mapv (fn [v] [v m]) in-deps)
                         :num-severed   (count in-deps)))))
         (sort-by (juxt :fragmentation :new-largest-size)))))

;;;; ------------------------------------------------------------------------------------------------
;;;; Predicted blast radius
;;;; ------------------------------------------------------------------------------------------------

(defn- nearest-rank
  "Nearest-rank percentile: the value at 1-based rank ⌈p·n⌉ of `sorted-values`, nil when empty. Matches
  [[dev.module-metrics/nearest-rank-percentile]] semantics so predicted numbers line up with the reported metrics."
  [sorted-values p]
  (when (seq sorted-values)
    (nth sorted-values (max 0 (dec (long (Math/ceil (* p (count sorted-values)))))))))

(defn- count-stats
  "Mean, median, and p90 (nearest-rank) over an ascending sequence of counts; all nil when empty."
  [sorted-counts]
  {:mean   (when (seq sorted-counts) (double (/ (reduce + 0 sorted-counts) (count sorted-counts))))
   :median (nearest-rank sorted-counts 0.5)
   :p90    (nearest-rank sorted-counts 0.9)})

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
  module-granularity rule [[dev.deps-graph/source-filenames->relevant-test-filenames]] applies to the real graph,
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
     :median     (nearest-rank counts 0.5)
     :mean       (double (/ (reduce + 0 counts) (max 1 (count counts))))}))

(defn module->test-files
  "Map of module → set of its test files, via the same filesystem mapping the selective-CI helpers use.
  ([[dev.deps-graph/module->test-files]] is private; this is dev tooling, so we go through the var.)"
  [config modules]
  (into (sorted-map)
        (map (fn [m] [m (#'deps-graph/module->test-files config m)]))
        modules))

;;;; ------------------------------------------------------------------------------------------------
;;;; Churn-weighted blast radius
;;;; ------------------------------------------------------------------------------------------------

(defn commit-file-lists
  "Per-commit vectors of changed filenames over the last `days` days, from `git log`. Most-recent first."
  [days]
  (let [{:keys [out exit err]} (shell/sh "git" "log" (str "--since=" days ".days")
                                         "--name-only" "--pretty=format:@@COMMIT@@")]
    (when-not (zero? exit)
      (throw (ex-info "git log failed" {:exit exit, :err err})))
    (into []
          (comp (map str/split-lines)
                (map #(into [] (remove str/blank?) %))
                (remove empty?))
          (rest (str/split out #"@@COMMIT@@")))))

(defn expected-tests-per-commit
  "Churn-weighted blast radius under (possibly modified) `graph`: for each commit, map its changed files to
  modules and count the union of test files those modules and their transitive dependents own — i.e. the
  selective-CI bill for that commit. Weighting by real commits is what closure metrics miss: a module
  nobody touches contributes nothing to CI spend no matter how upstream it is. Commits touching no
  module-owned file (frontend, docs) are excluded from the distribution but reported in
  `:num-commits-skipped`. `file->module` maps source filename → module; `module->tests` maps module → set
  of its test files."
  [graph module->tests file->module commits]
  (let [dependents (transitive-dependents-graph graph)
        counts     (->> commits
                        (keep (fn [files]
                                (when-let [modules (not-empty (into #{} (keep file->module) files))]
                                  (count (transduce (map #(get module->tests % #{}))
                                                    into #{}
                                                    (into modules (mapcat dependents) modules))))))
                        sort
                        vec)]
    (assoc (count-stats counts)
           :num-commits         (count commits)
           :num-commits-skipped (- (count commits) (count counts)))))

;;;; ------------------------------------------------------------------------------------------------
;;;; Namespace-granularity test selection
;;;;
;;;; The namespace require graph is a DAG — Clojure forbids require cycles — so the module-level SCC
;;;; and its pegged blast radius do not exist at this granularity at all; they are artifacts of the
;;;; module partition. The fns here model selective CI at namespace granularity with the
;;;; methodologically correct rule: a test reruns iff its OWN require closure (test files parsed too)
;;;; reaches a changed namespace. Measured against 90 days of commits this is worth ~−21% CI spend
;;;; over the module-granularity rule with no code changes, and exposes `metabase.test`'s require
;;;; closure as the next binding constraint (see the granularity-experiment planning doc).
;;;;
;;;; Caveats: only ns declarations are parsed, so dynamic requires inside test bodies are unseen, and
;;;; defmethod registration via init chains is not modeled — a production version would keep an
;;;; always-run floor set (`.init` roots, driver matrices).
;;;; ------------------------------------------------------------------------------------------------

(defn source-ns-graph
  "Adjacency map of `source namespace -> set of required namespaces` from parsed `deps` rows."
  [deps]
  (into {}
        (map (fn [{ns-sym :namespace, required :deps}]
               [ns-sym (into #{} (map :namespace) required)]))
        deps))

(defn- default-test-roots
  "The OSS and EE test trees plus every driver's `test/` root — the same roots the test aliases put on
  the classpath."
  []
  (into [(io/file "test") (io/file "enterprise/backend/test")]
        (keep (fn [^java.io.File driver-dir]
                (let [test-dir (io/file driver-dir "test")]
                  (when (.isDirectory test-dir)
                    test-dir))))
        (.listFiles (io/file "modules/drivers"))))

(defn test-ns-info
  "Parse the test `roots` (default: `test/`, `enterprise/backend/test/`, `modules/drivers/*/test/`)
  and return a map of `test-ns -> {:files #{path}, :requires #{ns-sym}}`. A namespace defined in more
  than one root (the OSS and EE trees share a few test-ns names) keeps the union of files and
  requires, so a change reaching either definition selects both files. Files without an `ns`
  declaration are skipped; unparseable files throw with file context (same policy as the modules-test
  classpath checks)."
  ([]
   (test-ns-info (default-test-roots)))
  ([roots]
   (reduce (fn [acc ^java.io.File f]
             (if-let [decl (try
                             (ns.file/read-file-ns-decl f)
                             (catch Throwable e
                               (throw (ex-info (str "Failed to read ns declaration from " f)
                                               {:file (str f)}
                                               e))))]
               (update acc (ns.parse/name-from-ns-decl decl)
                       #(merge-with into %
                                    {:files    #{(.getPath f)}
                                     :requires (set (ns.parse/deps-from-ns-decl decl))}))
               acc))
           {}
           (mapcat ns.find/find-sources-in-dir roots))))

(defn honest-test-selection
  "Namespace-granularity selective-CI model: map of `source namespace -> set of test files` that must
  rerun when that namespace changes, where a test is selected iff its own require closure reaches the
  namespace. `test-info` comes from [[test-ns-info]].

  The `:narrow` opt takes a set of namespaces to treat as requiring nothing — for measuring
  hypotheticals such as 'what if `metabase.test` were split into narrow helpers', whose god-closure
  otherwise puts most of src upstream of nearly every test."
  ([deps test-info]
   (honest-test-selection deps test-info nil))
  ([deps test-info {:keys [narrow]}]
   (let [src-graph (source-ns-graph deps)
         combined  (reduce (fn [g n] (assoc g n #{}))
                           (merge src-graph (update-vals test-info :requires))
                           narrow)
         reverse-g (reduce-kv (fn [acc v ws]
                                (reduce (fn [a w] (update a w (fnil conj #{}) v)) acc ws))
                              {}
                              combined)
         ns->files (update-vals test-info :files)]
     (into {}
           (map (fn [src-ns]
                  [src-ns (loop [seen #{} frontier (get reverse-g src-ns #{}) hits #{}]
                            (if-let [v (first frontier)]
                              (if (seen v)
                                (recur seen (disj frontier v) hits)
                                (recur (conj seen v)
                                       (into (disj frontier v) (remove seen (get reverse-g v)))
                                       (into hits (ns->files v))))
                              hits))]))
           (keys src-graph)))))

(defn selection-summary
  "Distribution stats over a [[honest-test-selection]] map: how many test files a change to the
  median/p90 namespace invalidates."
  [selection]
  (count-stats (sort (map count (vals selection)))))

(defn expected-tests-per-commit-at-ns
  "Churn-weighted counterpart of [[selection-summary]]: replay `commits` (from [[commit-file-lists]])
  and count each commit's selected test files under namespace-granularity selection. `file->ns` maps
  source filename → namespace (build from parsed deps). Commits touching no parsed source file are
  excluded from the distribution but reported in `:num-commits-skipped`."
  [selection file->ns commits]
  (let [counts (->> commits
                    (keep (fn [files]
                            (when-let [nss (not-empty (into #{} (keep file->ns) files))]
                              (count (transduce (map #(get selection % #{})) into #{} nss)))))
                    sort
                    vec)]
    (assoc (count-stats counts)
           :num-commits         (count commits)
           :num-commits-skipped (- (count commits) (count counts)))))

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
  ;; sanity check: on the unmodified graph the median should be pegged at ~the full test-file count
  (dissoc (predicted-test-blast-radius graph* m->tests*) :per-module)
  ;; predicted payoff of the best carve candidate
  (let [{:keys [module severed-edges]} (first (upstream-cut-impacts graph*))
        graph' (update graph* module #(reduce disj % (map second severed-edges)))]
    (dissoc (predicted-test-blast-radius graph' m->tests*) :per-module))

  ;; namespace-granularity selection: the module SCC doesn't exist at this granularity
  (def test-info* (test-ns-info))
  (def selection* (honest-test-selection deps* test-info*))
  (selection-summary selection*)
  (expected-tests-per-commit-at-ns selection*
                                   (into {} (map (juxt :filename :namespace)) deps*)
                                   (commit-file-lists 90))
  ;; the 'what if metabase.test were split into narrow helpers' scenario
  (selection-summary
   (honest-test-selection deps* test-info* {:narrow '#{metabase.test metabase.test.util metabase.test.data}})))
