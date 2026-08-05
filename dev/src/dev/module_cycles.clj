(ns dev.module-cycles
  "Ratchet on circular dependencies between modules.

  The recorded state lives in `.clj-kondo/module-cycles.edn`.
  `metabase.core.module-cycles-test` fails when the tree drifts past it;
  `./bin/mage fix-module-cycles` tightens the record, never loosens it.
  Loaded by both the bb task and the JVM test, so keep it dependency-free.

  The dependency graph is read from the `:uses` sets in the modules config rather than by parsing
  source, which keeps this JVM-free. `metabase.core.modules-test/modules-config-up-to-date-test`
  is what makes that equivalent: it fails if `:uses` drifts from the requires in `src`."
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
  "The modules config the dependency graph is read from."
  ".clj-kondo/config/modules/config.edn")

;;;; ---------------------------------------------------------------------------
;;;; Reading the module graph
;;;; ---------------------------------------------------------------------------

(defn module-graph
  "Module => set of modules it depends on, from the `:uses` sets in `modules-config`.

  A module whose `:uses` is `:any` contributes no edges: the config records no dependencies for it,
  so cycles routed through it are invisible here. [[unconstrained-modules]] names them, and the
  ratchet keeps that set from growing."
  [modules-config]
  (into {}
        (map (fn [[module {:keys [uses]}]]
               [module (if (coll? uses) (set uses) #{})]))
        modules-config))

(defn unconstrained-modules
  "Modules declaring `:uses :any`, whose real dependencies the config does not record."
  [modules-config]
  (into (sorted-set)
        (keep (fn [[module {:keys [uses]}]] (when (= uses :any) module)))
        modules-config))

(defn read-module-graph
  "[[module-graph]] and [[unconstrained-modules]] for [[modules-config-file]]."
  []
  (let [modules (:metabase/modules (edn/read-string (slurp modules-config-file)))]
    {:graph         (module-graph modules)
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

(defn actual-state
  "The current cycle state of `graph`: `{:sccs #{{:modules _, :edges _}}}`."
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
  [actual-sccs recorded-scc]
  (filter #(every? (:modules recorded-scc) (:modules %)) actual-sccs))

(defn escaped-modules
  "Modules that are in a cycle but in no recorded SCC that covers their whole component.

  This is the assertion that catches every way the cycles can get worse: a module joining an
  existing SCC, two recorded SCCs merging, and a brand new SCC forming between modules that were
  previously acyclic. Shrinking and splitting produce subsets, which are fine."
  [recorded-sccs actual-sccs]
  (into (sorted-set)
        (comp (remove #(containing-scc recorded-sccs (:modules %)))
              (mapcat :modules))
        actual-sccs))

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
  [recorded-sccs actual-sccs]
  (into (sorted-map)
        (keep (fn [{:keys [modules edges] :as recorded-scc}]
                (let [actual (reduce + 0 (map :edges (pieces-of actual-sccs recorded-scc)))]
                  (when (> actual edges)
                    [(scc-label modules) {:recorded edges, :actual actual}]))))
        recorded-sccs))

(defn drift
  "Everything the ratchet objects to, or an empty map when the tree is within its recorded state.
  `{:escaped-modules #{...}, :edges {...}, :newly-unconstrained #{...}}`, sparse."
  [recorded {:keys [graph unconstrained]}]
  (let [actual-sccs (actual-state graph)
        escaped     (escaped-modules (:sccs recorded) actual-sccs)
        edges       (edge-drift (:sccs recorded) actual-sccs)
        widened     (into (sorted-set) (remove (set (:unconstrained-modules recorded))) unconstrained)]
    (cond-> {}
      (seq escaped) (assoc :escaped-modules escaped)
      (seq edges)   (assoc :edges edges)
      (seq widened) (assoc :newly-unconstrained widened))))

;;;; ---------------------------------------------------------------------------
;;;; Reading, tightening and rendering the record
;;;; ---------------------------------------------------------------------------

(defn read-cycles
  "Parsed contents of [[cycles-file]], with empty defaults when the file doesn't exist."
  []
  (merge {:sccs #{}, :unconstrained-modules #{}}
         (when (.exists (io/file cycles-file))
           (edn/read-string (slurp cycles-file)))))

(defn seeded
  "The tree's cycles recorded verbatim. Widens, so it is the explicit escape hatch: initial adoption,
  or accepting a cycle you have argued for in your PR."
  [{:keys [graph unconstrained]}]
  {:sccs (actual-state graph), :unconstrained-modules unconstrained})

(defn tightened
  "`recorded` narrowed to match the tree. Never widens: an SCC that grew, merged or appeared keeps
  its recorded shape so the test still fails, and an edge budget the tree exceeds is left alone."
  [recorded {:keys [graph unconstrained]}]
  (let [actual-sccs (actual-state graph)
        ;; A recorded SCC that grew or merged has no pieces, but so does one that is simply gone.
        ;; Only the second is an improvement, so tell them apart by whether any of its modules is
        ;; still in a cycle. Regressions keep their recorded shape and the test stays red.
        regressed?  (fn [{:keys [modules]}]
                      (some (fn [{actual-modules :modules}]
                              (and (some modules actual-modules)
                                   (not (every? modules actual-modules))))
                            actual-sccs))]
    {:sccs (into #{}
                 ;; An SCC that split becomes several records, one per piece; one that is gone
                 ;; becomes none. Each piece's budget is capped by the recorded one, so a split can
                 ;; never hand out more budget than it started with.
                 (mapcat (fn [{:keys [edges] :as recorded-scc}]
                           (if (regressed? recorded-scc)
                             [recorded-scc]
                             (for [piece (pieces-of actual-sccs recorded-scc)]
                               {:modules (:modules piece)
                                :edges   (min edges (:edges piece))}))))
                 (:sccs recorded))
     :unconstrained-modules (into (sorted-set)
                                  (filter (set (:unconstrained-modules recorded)))
                                  unconstrained)}))

(def ^:private header
  (str ";; Recorded circular dependencies between modules. This file only ever shrinks.\n"
       ";; metabase.core.module-cycles-test fails when the tree drifts past it; `./bin/mage\n"
       ";; fix-module-cycles` tightens it to match, and local test runs do that automatically.\n"
       ";;\n"
       ";; :sccs -- each strongly connected component of the module graph, i.e. a set of modules\n"
       ";; that can all reach each other. :edges is how many dependencies run between members.\n"
       ";; A module may not join an SCC, two SCCs may not merge, and a new SCC may not appear.\n"
       ";; Splitting an SCC or dropping out of one is the whole point and always passes.\n"
       ";;\n"
       ";; :unconstrained-modules -- modules declaring `:uses :any`, whose real dependencies the\n"
       ";; modules config does not record. Cycles routed through them are invisible to this check,\n"
       ";; so the set may not grow.\n"))

(defn- render-modules
  "One module per line, so that a module joining an SCC is a one-line diff.
  `column` is where the first module lands, which the rest align under."
  [column modules]
  (str "#{" (str/join (str "\n" (apply str (repeat column \space))) (sort modules)) "}"))

(defn- render-scc
  "An SCC entry, laid out to sit at column 3 inside the ` #{` that opens `:sccs`."
  [{:keys [modules edges]}]
  (str "{:edges   " edges "\n"
       "    :modules " (render-modules 15 modules) "}"))

(defn render
  "Text of [[cycles-file]] for `cycles`.
  Byte-stable: [[fix!]] idempotency and the normalization test depend on it."
  [{:keys [sccs unconstrained-modules]}]
  (str header
       "{:sccs\n"
       (if (empty? sccs)
         " #{}"
         (str " #{"
              (str/join "\n\n   " (map render-scc (sort-by (comp vec sort :modules) sccs)))
              "}"))
       "\n\n :unconstrained-modules\n "
       (if (empty? unconstrained-modules)
         "#{}"
         (render-modules 3 unconstrained-modules))
       "}\n"))

(defn change-report
  "The lines [[fix!]] prints."
  [recorded actual]
  (let [{:keys [escaped-modules edges newly-unconstrained]} (drift recorded actual)
        before (into {} (map (juxt :modules :edges)) (:sccs recorded))
        after  (into {} (map (juxt :modules :edges)) (:sccs (tightened recorded actual)))]
    (concat
     (for [[modules edges] (sort-by (comp vec sort key) before)
           :let            [now (get after modules)]
           :when           (not= edges now)]
       (if (nil? now)
         (format "dropped an SCC of %d module(s): %s" (count modules) (str/join ", " (sort modules)))
         (format "lowered edges for the %d-module SCC: %d -> %d" (count modules) edges now)))
     (when (seq escaped-modules)
       [(format "WARNING: %d module(s) are in a cycle no recorded SCC covers: %s"
                (count escaped-modules)
                (str (str/join ", " (take 10 escaped-modules))
                     (when (> (count escaped-modules) 10)
                       (format " ... and %d more" (- (count escaped-modules) 10)))))
        "         Break the new cycle, or accept it with `./bin/mage fix-module-cycles --seed` and defend it in your PR."])
     (for [[label {:keys [recorded actual]}] edges]
       (format "WARNING: the %s is over budget (%d edges recorded, %d actual) -- remove a dependency between its members"
               label recorded actual))
     (when (seq newly-unconstrained)
       [(format "WARNING: module(s) newly declaring `:uses :any`: %s -- this hides their cycles from this check"
                (str/join ", " newly-unconstrained))]))))

(defn fix!
  "Rewrite [[cycles-file]] to match the tree, tightening only.
  `--seed` (`{:seed true}` here) records the tree's cycles verbatim, widening if it has to.
  Prints the [[change-report]], or `unchanged` on a no-op."
  ([]
   (fix! nil))
  ([{:keys [seed]}]
   (let [recorded (read-cycles)
         actual   (read-module-graph)
         text     (render (if seed (seeded actual) (tightened recorded actual)))
         file     (io/file cycles-file)
         old      (when (.exists file) (slurp file))]
     (run! println (change-report recorded actual))
     (if (= old text)
       (println "unchanged")
       (do (spit file text)
           (println (str "wrote " cycles-file)))))))
