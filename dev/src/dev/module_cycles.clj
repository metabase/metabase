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
;;;; Naming SCCs
;;;;
;;;; Names exist so that a failure can say "amber-harbor gained 3 modules" instead of printing a
;;;; hundred module names. They are minted at seed time and inherited across runs by module
;;;; overlap, so an SCC keeps its name while it grows, shrinks, or sheds a piece.
;;;;
;;;; Naming is presentation only. Whether the tree has regressed is decided by whether a component
;;;; is still wholly inside a recorded SCC, never by which name it ended up with.
;;;; ---------------------------------------------------------------------------

(def ^:private name-adjectives
  ["amber" "brisk" "candid" "dusky" "eager" "fabled" "gilded" "hollow" "ivory" "jaunty"
   "keen" "lucid" "mellow" "nimble" "opal" "placid" "quiet" "rustic" "somber" "tidal"
   "umber" "vivid" "windy" "zesty"])

(def ^:private name-nouns
  ["anchor" "basin" "canyon" "delta" "ember" "fjord" "grove" "harbor" "isthmus" "junction"
   "kelp" "lagoon" "meadow" "narrows" "orchard" "prairie" "quarry" "ridge" "summit" "thicket"
   "upland" "vale" "willow" "yardarm"])

(defn generate-name
  "A random `adjective-noun` name not already in `taken`.
  Random on purpose: a name must carry no meaning, so that nobody reads significance into an SCC
  keeping or losing one. Only ever called when a genuinely new SCC appears, and then persisted."
  [taken]
  (or (first (remove taken
                     (repeatedly 200 #(str (rand-nth name-adjectives) "-" (rand-nth name-nouns)))))
      ;; 576 combinations against a handful of SCCs, so this is unreachable in practice
      (first (remove taken (map #(str "scc-" %) (range))))))

(defn incumbent
  "The recorded SCC that `modules` is the continuation of, or nil.

  A recorded SCC hands its name on when *more* than half of its modules are still together in the
  new one -- so an SCC that grows or shrinks keeps its name, and when one splits, only a piece
  holding a majority of the original inherits. Strictly more than half is what makes that
  unambiguous: two disjoint components cannot both hold a majority of the same recorded SCC, so an
  even split leaves both halves unnamed rather than needing a tie broken.

  A merge is the one case with several candidates, since the merged component holds all of each
  SCC it absorbed. It takes the name of the largest, by module count then alphabetically, so the
  failure reads as that SCC having grown."
  [recorded-sccs modules]
  (->> recorded-sccs
       (keep (fn [{recorded-modules :modules :as scc}]
               (let [shared (count (filter modules recorded-modules))]
                 (when (> (* 2 shared) (count recorded-modules))
                   [shared scc]))))
       (sort-by (fn [[shared scc]] [(- shared) (vec (sort (:modules scc)))]))
       first
       second))

(defn named-sccs
  "`actual` with a `:name` on each: inherited from its [[incumbent]], or newly minted.
  Minting is deterministic in which SCCs get a fresh name, random only in what that name is."
  [recorded-sccs actual]
  ;; No two components can inherit the same name -- see [[incumbent]] -- so the only bookkeeping
  ;; here is keeping minted names distinct. A fresh name also avoids every recorded name, so it can
  ;; never look like a rename of an SCC that is actually gone.
  (let [reserved (into #{} (keep :name) recorded-sccs)]
    (first
     (reduce (fn [[named taken] scc]
               (let [scc-name (or (:name (incumbent recorded-sccs (:modules scc)))
                                  (generate-name (into reserved taken)))]
                 [(conj named (assoc scc :name scc-name)) (conj taken scc-name)]))
             [#{} #{}]
             actual))))

;;;; ---------------------------------------------------------------------------
;;;; Comparing actual against recorded
;;;; ---------------------------------------------------------------------------

(defn- containing-scc
  "The recorded SCC that `modules` sits wholly inside, or nil.

  The correctness rule. Growth, merges and brand-new SCCs have no container; shrinking and
  splitting produce subsets and do. Deliberately independent of [[incumbent]]: a minority piece of
  a split inherits no name, but it is still a subset and still fine -- and its edge budget still
  belongs to the SCC it broke off from."
  [recorded-sccs modules]
  (first (filter #(every? (:modules %) modules) recorded-sccs)))

(defn- pieces-of
  "Every actual SCC that `recorded-scc`'s edge budget has to cover.

  That is the components it split into (subsets of it) *and* the one that inherited its name,
  which after growth is not a subset. Counting both means a split cannot let each half spend the
  full budget, and growth is still measured against it rather than reading as zero."
  [recorded-sccs actual recorded-scc]
  (filter (fn [{:keys [modules]}]
            (or (every? (:modules recorded-scc) modules)
                (= recorded-scc (incumbent recorded-sccs modules))))
          actual))

(defn scc-label
  "Fallback name for an SCC that has no incumbent to inherit from, so that a failure about a brand
  new cycle still has something readable to key on."
  [modules]
  (format "%d-module SCC (%s)"
          (count modules)
          (str/join ", " (cond-> (vec (take 3 (sort modules)))
                           (> (count modules) 3) (conj "...")))))

(defn graph-drift
  "What one graph has regressed on, keyed by SCC name, or an empty map when it is within budget.

  Each entry carries the whole story for that SCC -- which modules it gained and lost against its
  incumbent, and what its edge count was and is -- so a reader never has to diff two hundred-module
  sets by eye. An entry appears only when something got worse: modules appearing in a cycle that no
  recorded SCC covers, or more edges than the recorded budget."
  [recorded-sccs actual]
  (let [named (named-sccs recorded-sccs actual)]
    (into (sorted-map)
          (keep (fn [{:keys [modules edges] :as scc}]
                  ;; Which recorded SCC this one is answerable to: the one it inherited its name
                  ;; from, or -- for a piece that split off without a majority, so inherited no
                  ;; name -- the one it broke off from. Only a component that is neither is new.
                  (let [prev            (or (incumbent recorded-sccs modules)
                                            (containing-scc recorded-sccs modules))
                        ;; an SCC that split shares its parent's budget, so measure every piece
                        ;; together rather than letting each spend the whole thing again
                        edges-actual    (if prev
                                          (reduce + 0 (map :edges (pieces-of recorded-sccs actual prev)))
                                          edges)
                        edges-recorded  (:edges prev 0)
                        modules-added   (into (sorted-set) (remove (:modules prev #{})) modules)
                        modules-removed (into (sorted-set) (remove modules) (:modules prev #{}))]
                    (when (or (seq modules-added) (> edges-actual edges-recorded))
                      [(or (:name scc) (scc-label modules))
                       (cond-> {:edges-recorded edges-recorded
                                :edges-actual   edges-actual}
                         (seq modules-added)   (assoc :modules-added modules-added)
                         (seq modules-removed) (assoc :modules-removed modules-removed)
                         (not prev)            (assoc :new-cycle? true))]))))
          named)))

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
  budget it came from; one that is gone is dropped. Surviving SCCs keep their names."
  [recorded-sccs actual]
  (let [;; A recorded SCC that grew or merged has no pieces, but so does one that is simply gone.
        ;; Only the second is an improvement, so tell them apart by whether any of its modules is
        ;; still in a cycle that reaches outside it.
        regressed? (fn [{:keys [modules]}]
                     (some (fn [{actual-modules :modules}]
                             (and (some modules actual-modules)
                                  (not (every? modules actual-modules))))
                           actual))
        kept       (into #{}
                         (mapcat (fn [{:keys [edges] :as recorded-scc}]
                                   (if (regressed? recorded-scc)
                                     [recorded-scc]
                                     (for [piece (pieces-of recorded-sccs actual recorded-scc)]
                                       {:modules (:modules piece)
                                        :edges   (min edges (:edges piece))}))))
                         recorded-sccs)]
    ;; re-name against the *old* record, so a surviving piece inherits and a split-off one is minted
    (named-sccs recorded-sccs kept)))

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
  "The tree's cycles recorded verbatim, names and all. Widens, so it is the explicit escape hatch:
  initial adoption, or accepting a cycle you have argued for in your PR. SCCs that survive from the
  previous record keep their names."
  [recorded {:keys [graphs unconstrained]}]
  (into {:unconstrained-modules unconstrained}
        (map (fn [graph-key]
               [graph-key {:sccs (named-sccs (get-in recorded [graph-key :sccs])
                                             (actual-sccs (get graphs graph-key)))}]))
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
       ";; :name is a meaningless random label, so that failures can say \"amber-harbor gained 3\n"
       ";; modules\" rather than printing a hundred module names. An SCC keeps its name as long as\n"
       ";; half its modules stay together; a piece that splits off with less than half gets a new\n"
       ";; one. Do not read anything into a name.\n"
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
  [{:keys [modules edges] scc-name :name}]
  (str "{:name    " (pr-str scc-name) "\n"
       "     :edges   " edges "\n"
       "     :modules " (render-modules 16 modules) "}"))

(defn- render-graph
  "A graph's entry, with no leading indent -- [[render]] supplies it when joining."
  [graph-key {:keys [sccs]}]
  (str graph-key "\n"
       " {:sccs\n"
       (if (empty? sccs)
         "  #{}}"
         (str "  #{"
              (str/join "\n\n    " (map render-scc (sort-by :name sccs)))
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

(defn- module-list
  "`modules` as a comma-separated string, truncated -- the count is the useful part once a list runs
  past a screenful, and the full membership is in the file."
  [modules]
  (let [shown (sort modules)]
    (str (str/join ", " (take 10 shown))
         (when (> (count shown) 10)
           (format " ... and %d more" (- (count shown) 10))))))

(defn change-report
  "The lines [[fix!]] prints."
  [recorded actual]
  (let [after (tightened recorded actual)
        d     (drift recorded actual)]
    (concat
     (for [graph-key graph-keys
           :let      [before-sccs (into {} (map (juxt :name identity)) (get-in recorded [graph-key :sccs]))
                      after-sccs  (into {} (map (juxt :name identity)) (get-in after [graph-key :sccs]))]
           scc-name  (sort (keys before-sccs))
           :let      [before (get before-sccs scc-name)
                      now    (get after-sccs scc-name)]
           :when     (not= (:edges before) (:edges now))]
       (if (nil? now)
         (format "%s: dropped %s, an SCC of %d module(s)" graph-key scc-name (count (:modules before)))
         (format "%s: %s lost %d module(s) and %d edge(s)"
                 graph-key scc-name
                 (- (count (:modules before)) (count (:modules now)))
                 (- (:edges before) (:edges now)))))
     (for [graph-key graph-keys
           [scc-name {:keys [modules-added modules-removed edges-recorded edges-actual new-cycle?]}]
           (get d graph-key)
           line (cond-> []
                  new-cycle?
                  (conj (format "WARNING: %s: new cycle %s (%d edges): %s"
                                graph-key scc-name edges-actual
                                (module-list modules-added)))

                  (and (not new-cycle?) (seq modules-added))
                  (conj (format "WARNING: %s: %s gained %d module(s): %s"
                                graph-key scc-name (count modules-added)
                                (module-list modules-added)))

                  (seq modules-removed)
                  (conj (format "         %s: %s also lost %d module(s): %s"
                                graph-key scc-name (count modules-removed)
                                (module-list modules-removed)))

                  (> edges-actual edges-recorded)
                  (conj (format "WARNING: %s: %s is over budget by %d edge(s) (%d recorded, %d actual)"
                                graph-key scc-name (- edges-actual edges-recorded)
                                edges-recorded edges-actual)))]
       line)
     (when (seq d)
       ["         Break the new cycle, or accept it with `./bin/mage fix-module-cycles --seed` and defend it in your PR."])
     (for [[kind modules] (:newly-unconstrained d)]
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
         text     (render (if seed (seeded recorded actual) (tightened recorded actual)))
         file     (io/file cycles-file)
         old      (when (.exists file) (slurp file))]
     (run! println (change-report recorded actual))
     (if (= old text)
       (println "unchanged")
       (do (spit file text)
           (println (str "wrote " cycles-file)))))))
