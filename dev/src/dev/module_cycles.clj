(ns dev.module-cycles
  "Ratchet on circular dependencies between modules.

  The recorded state lives in `.clj-kondo/module-cycles.edn`.
  `metabase.core.module-cycles-test` fails when the tree drifts past it;
  `./bin/mage fix-module-cycles` tightens the record, never loosens it.
  Loaded by both the bb task and the JVM test, so keep it dependency-free.

  Two graphs are measured, because there are two ways one module can depend on another:

  `:uses`               -- the `require` graph, read from the `:uses` sets in the modules config.
  `:uses+model-imports` -- the same, plus an edge from a module to whichever module exports each
                           `:model/X` it imports. A `:model/X` reference resolves through Toucan's
                           global registry at runtime rather than via a `require`, so it is
                           invisible to `:uses` -- but the model's namespace still has to be loaded
                           first, which makes it a real dependency for loading or testing a module
                           on its own.

  Reading both from the modules config keeps this JVM-free.
  `metabase.core.modules-test/modules-config-up-to-date-test` is what makes that equivalent to
  parsing source: it fails if the config drifts from `src`."
  {:clj-kondo/config '{:linters {:discouraged-var {clojure.core/println {:level :off}}}}}
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def cycles-file
  "The recorded-state file, relative to the repo root."
  ".clj-kondo/module-cycles.edn")

(def modules-config-file
  "The modules config both graphs are read from."
  ".clj-kondo/config/modules/config.edn")

(def graph-keys
  "The graphs the ratchet measures, in the order they are recorded and reported."
  [:uses :uses+model-imports])

;;;; ---------------------------------------------------------------------------
;;;; Reading the module graphs
;;;; ---------------------------------------------------------------------------

(defn uses-graph
  "Module => set of modules it requires, from the `:uses` sets in `modules-config`.

  A module whose `:uses` is `:any` contributes no edges: the config records no dependencies for it,
  so cycles routed through it are invisible here. [[unconstrained-modules]] names them."
  [modules-config]
  (into {}
        (map (fn [[module {:keys [uses]}]]
               [module (if (coll? uses) (set uses) #{})]))
        modules-config))

(defn model-owners
  "`:model/X` => the module that exports it."
  [modules-config]
  (into {}
        (for [[module {:keys [model-exports]}] modules-config
              :when (coll? model-exports)
              model model-exports]
          [model module])))

(defn model-import-graph
  "Module => set of modules that export a `:model/X` it imports.

  A module whose `:model-imports` is `:bypass` contributes no edges. It really does import models
  from all over, but the config does not say which, and models referenced outside their home module
  only by bypassed modules are deliberately left out of `:model-exports` -- so there is nothing here
  to resolve. [[unconstrained-modules]] names them."
  [modules-config]
  (let [owners (model-owners modules-config)]
    (into {}
          (map (fn [[module {:keys [model-imports]}]]
                 [module (if (coll? model-imports)
                           (disj (into #{} (keep owners) model-imports) module)
                           #{})]))
          modules-config)))

(defn unconstrained-modules
  "Modules whose real dependencies the config does not record, by the kind of dependency hidden:
  `:uses :any` hides requires, `:model-imports :bypass` hides model references.
  Cycles routed through them are invisible to this check, so the ratchet keeps these sets
  from growing."
  [modules-config]
  {:uses          (into (sorted-set)
                        (keep (fn [[module {:keys [uses]}]] (when (= uses :any) module)))
                        modules-config)
   :model-imports (into (sorted-set)
                        (keep (fn [[module {:keys [model-imports]}]]
                                (when (= model-imports :bypass) module))
                              modules-config))})

(defn read-module-graphs
  "Both graphs and both blind spots, from [[modules-config-file]]."
  []
  (let [modules (:metabase/modules (edn/read-string (slurp modules-config-file)))
        uses    (uses-graph modules)]
    {:graphs        {:uses               uses
                     :uses+model-imports (merge-with into uses (model-import-graph modules))}
     :unconstrained (unconstrained-modules modules)}))

;;;; ---------------------------------------------------------------------------
;;;; Cycle detection
;;;; ---------------------------------------------------------------------------

(defn- stack-index
  "Index of `v` in `stack`. Hand-rolled because babashka cannot reflectively call
  `.lastIndexOf` on a Clojure vector."
  [stack v]
  (first (keep-indexed (fn [i x] (when (= x v) i)) stack)))

(defn strongly-connected-components
  "Every strongly connected component of `graph`, as a set of module sets (Tarjan).
  Components of one module are included; [[cyclic-components]] is usually what you want."
  [graph]
  (let [index   (atom 0)
        indexes (atom {})
        lowlink (atom {})
        on      (atom #{})
        stack   (atom [])
        out     (atom #{})]
    (letfn [(visit [v]
              (swap! indexes assoc v @index)
              (swap! lowlink assoc v @index)
              (swap! index inc)
              (swap! stack conj v)
              (swap! on conj v)
              (doseq [w (get graph v)]
                (cond
                  (not (contains? @indexes w)) (do (visit w)
                                                   (swap! lowlink assoc v (min (@lowlink v) (@lowlink w))))
                  (contains? @on w)            (swap! lowlink assoc v (min (@lowlink v) (@indexes w)))))
              (when (= (@lowlink v) (@indexes v))
                (let [i         (stack-index @stack v)
                      component (set (subvec @stack i))]
                  (swap! stack subvec 0 i)
                  (swap! on #(reduce disj % component))
                  (swap! out conj component))))]
      (doseq [v (keys graph)]
        (when-not (contains? @indexes v)
          (visit v)))
      @out)))

(defn cyclic-components
  "The strongly connected components of `graph` holding more than one module -- i.e. the cycles.
  Every pair of modules within one is mutually reachable."
  [graph]
  (into #{} (filter #(> (count %) 1)) (strongly-connected-components graph)))

(defn edges-within
  "How many edges of `graph` run between two modules of `modules`."
  [graph modules]
  (reduce + 0 (for [module modules]
                (count (filter modules (get graph module))))))

(defn actual-sccs
  "The cycles of `graph` as `#{{:modules _, :edges _}}`."
  [graph]
  (into #{}
        (map (fn [component] {:modules component
                              :edges   (edges-within graph component)}))
        (cyclic-components graph)))

;;;; ---------------------------------------------------------------------------
;;;; Comparing actual against recorded
;;;; ---------------------------------------------------------------------------

(defn- containing-scc
  "The recorded SCC that `modules` fits inside, or nil when it fits none."
  [recorded-sccs modules]
  (first (filter #(every? (:modules %) modules) recorded-sccs)))

(defn- pieces-of
  "The actual SCCs that fit inside `recorded-scc` -- itself, or the components it has split into."
  [actual recorded-scc]
  (filter #(every? (:modules recorded-scc) (:modules %)) actual))

(defn escaped-modules
  "Modules that are in a cycle but in no recorded SCC that covers their whole component.

  This is the assertion that catches every way the cycles can get worse: a module joining an
  existing SCC, two recorded SCCs merging, and a brand new SCC forming between modules that were
  previously acyclic. Shrinking and splitting produce subsets, which are fine."
  [recorded-sccs actual]
  (into (sorted-set)
        (comp (remove #(containing-scc recorded-sccs (:modules %)))
              (mapcat :modules))
        actual))

(defn scc-label
  "Short name for an SCC, for failure messages. The full membership is in [[cycles-file]]; printing
  a hundred module names as a map key makes the assertion output unreadable."
  [modules]
  (format "%d-module SCC (%s)"
          (count modules)
          (str/join ", " (cond-> (vec (take 3 (sort modules)))
                           (> (count modules) 3) (conj "...")))))

(defn edge-drift
  "Recorded SCCs whose edge budget the tree now exceeds, keyed by [[scc-label]].

  Actual SCCs are grouped by the recorded SCC that contains them, so a recorded SCC that has since
  split is still measured as a whole and its halves cannot each spend the original budget.
  Returns `{label {:recorded _, :actual _}}`."
  [recorded-sccs actual]
  (into (sorted-map)
        (keep (fn [{:keys [modules edges] :as recorded-scc}]
                (let [n (reduce + 0 (map :edges (pieces-of actual recorded-scc)))]
                  (when (> n edges)
                    [(scc-label modules) {:recorded edges, :actual n}]))))
        recorded-sccs))

(defn graph-drift
  "What one graph has regressed on, or an empty map when it is within its recorded SCCs."
  [recorded-sccs actual]
  (let [escaped (escaped-modules recorded-sccs actual)
        edges   (edge-drift recorded-sccs actual)]
    (cond-> {}
      (seq escaped) (assoc :escaped-modules escaped)
      (seq edges)   (assoc :edges edges))))

(defn drift
  "Everything the ratchet objects to, or an empty map when the tree is within its recorded state.
  Keyed by graph, plus `:newly-unconstrained`. Sparse: a graph within its budget is absent."
  [recorded {:keys [graphs unconstrained]}]
  (let [widened (into (sorted-map)
                      (keep (fn [[kind modules]]
                              (let [new-modules (into (sorted-set)
                                                      (remove (set (get-in recorded [:unconstrained-modules kind])))
                                                      modules)]
                                (when (seq new-modules) [kind new-modules]))))
                      unconstrained)]
    (cond-> (into (sorted-map)
                  (keep (fn [graph-key]
                          (let [d (graph-drift (get-in recorded [graph-key :sccs])
                                               (actual-sccs (get graphs graph-key)))]
                            (when (seq d) [graph-key d]))))
                  graph-keys)
      (seq widened) (assoc :newly-unconstrained widened))))

;;;; ---------------------------------------------------------------------------
;;;; Reading, tightening and rendering the record
;;;; ---------------------------------------------------------------------------

(defn read-cycles
  "Parsed contents of [[cycles-file]], with empty defaults when the file doesn't exist."
  []
  (merge (into {:unconstrained-modules {:uses #{}, :model-imports #{}}}
               (map (fn [graph-key] [graph-key {:sccs #{}}]))
               graph-keys)
         (when (.exists (io/file cycles-file))
           (edn/read-string (slurp cycles-file)))))

(defn tightened-sccs
  "`recorded-sccs` narrowed to match `actual`. Never widens: an SCC that grew or merged keeps its
  recorded shape so the test still fails; one that split becomes its pieces, each capped at the
  budget it came from; one that is gone is dropped."
  [recorded-sccs actual]
  (let [;; A recorded SCC that grew or merged has no pieces, but so does one that is simply gone.
        ;; Only the second is an improvement, so tell them apart by whether any of its modules is
        ;; still in a cycle that reaches outside it.
        regressed? (fn [{:keys [modules]}]
                     (some (fn [{actual-modules :modules}]
                             (and (some modules actual-modules)
                                  (not (every? modules actual-modules))))
                           actual))]
    (into #{}
          (mapcat (fn [{:keys [edges] :as recorded-scc}]
                    (if (regressed? recorded-scc)
                      [recorded-scc]
                      (for [piece (pieces-of actual recorded-scc)]
                        {:modules (:modules piece)
                         :edges   (min edges (:edges piece))}))))
          recorded-sccs)))

(defn tightened
  "`recorded` narrowed to match the tree, in every graph. Never widens."
  [recorded {:keys [graphs unconstrained]}]
  (into {:unconstrained-modules
         (into {} (map (fn [[kind modules]]
                         [kind (into (sorted-set)
                                     (filter (set (get-in recorded [:unconstrained-modules kind])))
                                     modules)]))
               unconstrained)}
        (map (fn [graph-key]
               [graph-key {:sccs (tightened-sccs (get-in recorded [graph-key :sccs])
                                                 (actual-sccs (get graphs graph-key)))}]))
        graph-keys))

(defn seeded
  "The tree's cycles recorded verbatim. Widens, so it is the explicit escape hatch: initial adoption,
  or accepting a cycle you have argued for in your PR."
  [{:keys [graphs unconstrained]}]
  (into {:unconstrained-modules unconstrained}
        (map (fn [graph-key] [graph-key {:sccs (actual-sccs (get graphs graph-key))}]))
        graph-keys))

(def ^:private header
  (str ";; Recorded circular dependencies between modules. This file only ever shrinks.\n"
       ";; metabase.core.module-cycles-test fails when the tree drifts past it; `./bin/mage\n"
       ";; fix-module-cycles` tightens it to match, and local test runs do that automatically.\n"
       ";;\n"
       ";; Two graphs are recorded:\n"
       ";;   :uses               -- the `require` graph, from the :uses sets in the modules config.\n"
       ";;   :uses+model-imports -- the same, plus an edge to whichever module exports each\n"
       ";;                          :model/X a module imports. Those resolve through Toucan's\n"
       ";;                          registry rather than a `require`, so :uses cannot see them --\n"
       ";;                          but the model's namespace still has to load first, which makes\n"
       ";;                          them real dependencies for loading a module on its own.\n"
       ";;\n"
       ";; Within each graph, :sccs holds every strongly connected component -- a set of modules\n"
       ";; that can all reach each other -- and :edges is how many dependencies run between members.\n"
       ";; A module may not join an SCC, two SCCs may not merge, and a new SCC may not appear.\n"
       ";; Splitting an SCC or dropping out of one is the whole point and always passes.\n"
       ";;\n"
       ";; :unconstrained-modules -- modules whose dependencies the config does not record:\n"
       ";; `:uses :any` hides requires, `:model-imports :bypass` hides model references. Cycles\n"
       ";; routed through them are invisible here, so neither set may grow.\n"))

(defn- render-modules
  "One module per line, so that a module joining an SCC is a one-line diff.
  `column` is where the first module lands, which the rest align under."
  [column modules]
  (str "#{" (str/join (str "\n" (apply str (repeat column \space))) (sort modules)) "}"))

(defn- render-scc
  "An SCC entry, laid out to sit at column 4 inside the `  #{` that opens a graph's `:sccs`."
  [{:keys [modules edges]}]
  (str "{:edges   " edges "\n"
       "     :modules " (render-modules 16 modules) "}"))

(defn- render-graph
  "A graph's entry, with no leading indent -- [[render]] supplies it when joining."
  [graph-key {:keys [sccs]}]
  (str graph-key "\n"
       " {:sccs\n"
       (if (empty? sccs)
         "  #{}}"
         (str "  #{"
              (str/join "\n\n    " (map render-scc (sort-by (comp vec sort :modules) sccs)))
              "}}"))))

(defn render
  "Text of [[cycles-file]] for `cycles`.
  Byte-stable: [[fix!]] idempotency and the normalization test depend on it."
  [cycles]
  (str header
       "{"
       (str/join "\n\n " (map #(render-graph % (get cycles %)) graph-keys))
       "\n\n :unconstrained-modules\n {"
       (str/join "\n\n  "
                 (for [kind [:uses :model-imports]
                       :let [modules (get-in cycles [:unconstrained-modules kind])]]
                   (str kind " " (if (empty? modules)
                                   "#{}"
                                   (render-modules (+ 5 (count (str kind))) modules)))))
       "}}\n"))

(defn change-report
  "The lines [[fix!]] prints."
  [recorded actual]
  (let [after (tightened recorded actual)
        {:keys [newly-unconstrained]} (drift recorded actual)]
    (concat
     (for [graph-key graph-keys
           :let      [before-sccs (into {} (map (juxt :modules :edges)) (get-in recorded [graph-key :sccs]))
                      after-sccs  (into {} (map (juxt :modules :edges)) (get-in after [graph-key :sccs]))]
           [modules edges] (sort-by (comp vec sort key) before-sccs)
           :let      [now (get after-sccs modules)]
           :when     (not= edges now)]
       (if (nil? now)
         (format "%s: dropped an SCC of %d module(s): %s" graph-key (count modules) (str/join ", " (sort modules)))
         (format "%s: lowered edges for the %s: %d -> %d" graph-key (scc-label modules) edges now)))
     (for [graph-key graph-keys
           :let      [{:keys [escaped-modules edges]} (get (drift recorded actual) graph-key)]
           line      (concat
                      (when (seq escaped-modules)
                        [(format "WARNING: %s: %d module(s) are in a cycle no recorded SCC covers: %s"
                                 graph-key
                                 (count escaped-modules)
                                 (str (str/join ", " (take 10 escaped-modules))
                                      (when (> (count escaped-modules) 10)
                                        (format " ... and %d more" (- (count escaped-modules) 10)))))
                         "         Break the new cycle, or accept it with `./bin/mage fix-module-cycles --seed` and defend it in your PR."])
                      (for [[label {:keys [recorded actual]}] edges]
                        (format "WARNING: %s: the %s is over budget (%d edges recorded, %d actual) -- remove a dependency between its members"
                                graph-key label recorded actual)))]
       line)
     (for [[kind modules] newly-unconstrained]
       (format "WARNING: module(s) newly hiding dependencies via %s: %s -- this hides their cycles from this check"
               (case kind :uses "`:uses :any`" :model-imports "`:model-imports :bypass`")
               (str/join ", " modules))))))

(defn fix!
  "Rewrite [[cycles-file]] to match the tree, tightening only.
  `--seed` (`{:seed true}` here) records the tree's cycles verbatim, widening if it has to.
  Prints the [[change-report]], or `unchanged` on a no-op."
  ([]
   (fix! nil))
  ([{:keys [seed]}]
   (let [recorded (read-cycles)
         actual   (read-module-graphs)
         text     (render (if seed (seeded actual) (tightened recorded actual)))
         file     (io/file cycles-file)
         old      (when (.exists file) (slurp file))]
     (run! println (change-report recorded actual))
     (if (= old text)
       (println "unchanged")
       (do (spit file text)
           (println (str "wrote " cycles-file)))))))
