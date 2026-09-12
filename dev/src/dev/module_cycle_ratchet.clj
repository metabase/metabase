(ns dev.module-cycle-ratchet
  "Named cyclic clusters of the module graph, and the ratchet on them.

  Each cyclic strongly connected component is a durable object with a name, and
  `.clj-kondo/config/modules/cycle-clusters.edn` records which modules are in it. A cluster keeps its name
  while it shrinks and splits, so it can be discussed, and its history read, over years.

  Membership is a ceiling: a cluster that gains a module, two that merge, and a brand new cycle all fail, so
  adding to the tangle is a deliberate act with a justification in the PR. Shrinking, splitting and dissolving
  pass silently, and the shrink workflow records them on master afterwards, so no feature branch has to
  rewrite a file every other branch also holds.

  Only membership is recorded. The edges inside a cluster move whenever anyone adds or removes one require
  between two modules already in it, which says nothing about whether the tangle got worse and would churn
  the record daily. They are measured and printed, not kept.

  `:mode :observe` reports the same changes without failing, for when a subtree is being reorganized.

  Babashka loads this namespace to summarize the record's changes in the shrink PR, so keep it
  dependency-free."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:dynamic *clusters-file*
  "The recorded clusters, relative to the repo root. Rebind it to read a file elsewhere."
  ".clj-kondo/config/modules/cycle-clusters.edn")

(def graph-keys
  "The two graphs the record covers, in file order.
  `:uses` is the ordinary module dependency graph.
  `:uses+model-imports` adds an edge from each module to the module defining a model it imports, which
  is coupling the `:uses` graph does not show."
  [:uses :uses+model-imports])

(def ^:private modes
  #{:enforce :observe})

(def empty-snapshot
  "No clusters recorded in either graph. The starting point for seeding."
  (into {:mode :enforce} (map (juxt identity (constantly {}))) graph-keys))

;;;; =============================================================================
;;;; Reading the record
;;;; =============================================================================

(defn- read-snapshot-form
  "The one EDN map in `file`.
  An empty file, a non-map, or a second form is an error rather than an empty record, which would permit
  every cycle."
  [^java.io.File file]
  (with-open [reader (java.io.PushbackReader. (io/reader file))]
    (let [eof  (Object.)
          form (edn/read {:eof eof} reader)]
      (when (identical? eof form)
        (throw (ex-info (str *clusters-file* " is empty; expected one map of recorded clusters")
                        {:file *clusters-file*})))
      (when-not (map? form)
        (throw (ex-info (str *clusters-file* " must hold a map of recorded clusters, not " (pr-str form))
                        {:file *clusters-file*, :form form})))
      (when-not (identical? eof (edn/read {:eof eof} reader))
        (throw (ex-info (str *clusters-file* " holds more than one form; expected one map of recorded clusters")
                        {:file *clusters-file*})))
      form)))

(defn- validate-cluster! [graph cluster-name modules]
  (when-not (and (simple-symbol? cluster-name) (seq (name cluster-name)))
    (throw (ex-info (format "%s is not a cluster name; clusters are keyed by simple symbol" (pr-str cluster-name))
                    {:graph graph, :cluster cluster-name})))
  (when-not (and (set? modules) (< 1 (count modules)) (every? symbol? modules))
    (throw (ex-info (format "%s %s must be a set of at least two module symbols, not %s"
                            graph cluster-name (pr-str modules))
                    {:graph graph, :cluster cluster-name, :modules modules}))))

(defn- validate-disjoint!
  "Throw when two clusters of one graph claim the same module.
  Strongly connected components partition the graph, so overlapping memberships describe a structure that
  cannot exist, and identity resolution would have to guess its way through one. Clusters are visited in
  name order, so the same overlap always names the same pair."
  [graph clusters]
  (reduce (fn [owner [cluster-name modules]]
            (reduce (fn [owner module]
                      (when-let [other (get owner module)]
                        (throw (ex-info (format (str "%s records %s in both %s and %s; a module belongs to"
                                                     " at most one cyclic component")
                                                graph module other cluster-name)
                                        {:graph graph, :module module, :clusters [other cluster-name]})))
                      (assoc owner module cluster-name))
                    owner
                    (sort modules)))
          {}
          (sort-by key clusters)))

(defn validate-snapshot
  "`snapshot` with every graph in [[graph-keys]] present, when its `:mode` is `:enforce` or `:observe` and
  each graph maps cluster names to sets of at least two modules, no two clusters of a graph sharing one.
  Throws otherwise, so a damaged record never reads as one with no clusters."
  [snapshot]
  (when-not (map? snapshot)
    (throw (ex-info (str *clusters-file* " must hold a map, not " (pr-str snapshot)) {:snapshot snapshot})))
  (when-let [extra (seq (sort-by pr-str (remove (conj (set graph-keys) :mode) (keys snapshot))))]
    (throw (ex-info (str *clusters-file* " records unknown keys " (pr-str extra)) {:keys extra})))
  (when-not (contains? modes (:mode snapshot))
    (throw (ex-info (str *clusters-file* " must set :mode to :enforce or :observe, not " (pr-str (:mode snapshot)))
                    {:mode (:mode snapshot)})))
  (let [snapshot (merge empty-snapshot snapshot)]
    (doseq [graph graph-keys
            :let  [clusters (get snapshot graph)]]
      (when-not (map? clusters)
        (throw (ex-info (format "%s must hold a map of named clusters, not %s" graph (pr-str clusters))
                        {:graph graph, :clusters clusters})))
      (doseq [[cluster-name modules] clusters]
        (validate-cluster! graph cluster-name modules))
      (validate-disjoint! graph clusters))
    snapshot))

(defn read-snapshot
  "Parsed and validated contents of [[*clusters-file*]]. Throws when the file is missing or malformed."
  []
  (let [file (io/file *clusters-file*)]
    (when-not (.exists file)
      (throw (ex-info (str *clusters-file* " is missing -- seed it with `./bin/mage fix-module-cycles --seed`")
                      {:file *clusters-file*})))
    (validate-snapshot (read-snapshot-form file))))

(defn enforce?
  "Whether `snapshot` fails a branch that grows a cluster, rather than only reporting it."
  [snapshot]
  (= :enforce (:mode snapshot)))

;;;; =============================================================================
;;;; Cluster identity
;;;; =============================================================================

(defn- degree
  "How many of `edges` touch `module`."
  [edges module]
  (count (filter (fn [[from to]] (or (= from module) (= to module))) edges)))

(defn dominant-module
  "The module holding a cluster together: the member with the most internal edges, ties broken
  alphabetically so the choice never depends on set ordering."
  [{:keys [modules edges]}]
  (first (sort-by (juxt #(- (degree edges %)) str) modules)))

(defn propose-name
  "A name for a cluster that has none yet, derived from its [[dominant-module]] so the name says which
  part of the tree the cluster is about: `sync` gives `sync-knot`, `enterprise/transforms.python` gives
  `enterprise-transforms-python-knot`.
  Numbered when `taken` already holds it, which happens when a cluster keeps a name whose dominant module
  has since left it."
  [cluster taken]
  (let [stem       (str (str/replace (str (dominant-module cluster)) #"[/.]" "-") "-knot")
        candidates (cons stem (map #(str stem "-" %) (iterate inc 2)))]
    (symbol (first (remove (comp taken symbol) candidates)))))

(defn- overlaps
  "For each actual cluster, the recorded clusters it shares modules with and how many:
  `{index {recorded-name shared}}`."
  [recorded actual]
  (into {}
        (map-indexed (fn [i {:keys [modules]}]
                       [i (into {}
                                (keep (fn [[cluster-name recorded-modules]]
                                        (let [shared (count (set/intersection modules recorded-modules))]
                                          (when (pos? shared)
                                            [cluster-name shared]))))
                                recorded)]))
        actual))

(defn- unique-max
  "The key of the single largest entry of `pairs`, or nil when the top two tie -- an identity we refuse to
  guess at."
  [pairs]
  (let [ranked (sort-by (comp - second) pairs)]
    (when (or (= 1 (count ranked))
              (and (seq ranked)
                   (> (second (first ranked)) (second (second ranked)))))
      (first (first ranked)))))

(defn resolve-clusters
  "Match the `actual` clusters of one graph against the `recorded` ones and say what happened to each.

  Returns `{:clusters [...], :resolved [names]}`, where `:resolved` names the recorded clusters that are
  no longer cyclic at all and each entry of `:clusters` is its actual cluster plus:

  - `:name` — the recorded name it carries, nil when it needs a new one
  - `:from` — the recorded clusters it draws modules from, largest share first
  - `:status` — one of
    - `:continued`, inherited a name from the one recorded cluster it comes from
    - `:split-off`, a component of a recorded cluster that did not keep the name
    - `:new`, holds modules no recorded cluster had
    - `:merged`, joins two recorded clusters
    - `:ambiguous`, two candidates tie, so continuity would be a guess

  A cluster keeps its name while it shrinks and while it splits: the component inheriting the most of its
  modules stays the incumbent and the others become new clusters.
  A merge preserves the dominant incumbent's identity and reports the rest as absorbed."
  [recorded actual]
  (let [shared    (overlaps recorded actual)
        preferred (into {} (keep (fn [[i o]] (when-let [n (unique-max o)] [i n]))) shared)
        claimants (reduce-kv (fn [acc i cluster-name]
                               (update acc cluster-name (fnil conj []) [i (get-in shared [i cluster-name])]))
                             {}
                             preferred)
        winners   (into {} (keep (fn [[cluster-name cs]] (when-let [i (unique-max cs)] [i cluster-name])))
                        claimants)
        contested (into #{} (keep (fn [[cluster-name cs]] (when-not (unique-max cs) cluster-name))) claimants)
        clusters  (vec (map-indexed
                        (fn [i cluster]
                          (let [o (get shared i)]
                            (merge cluster
                                   {:from (mapv key (sort-by (juxt (comp - val) (comp str key)) o))}
                                   (cond
                                     (empty? o)                              {:name nil, :status :new}
                                     (nil? (get preferred i))                {:name nil, :status :ambiguous}
                                     (contains? contested (get preferred i)) {:name nil, :status :ambiguous}
                                     (< 1 (count o))                         {:name (get winners i), :status :merged}
                                     (contains? winners i)                   {:name (get winners i), :status :continued}
                                     :else                                   {:name nil, :status :split-off}))))
                        actual))]
    {:clusters clusters
     :resolved (vec (sort (remove (set (keep :name clusters)) (keys recorded))))}))

(defn- with-proposals
  "`clusters` with a `:proposed` name on every entry that inherited none, avoiding the names in `taken`, so
  the report and the fixer agree on what a new cluster would be called."
  [taken clusters]
  (first (reduce (fn [[acc taken] cluster]
                   (if (:name cluster)
                     [(conj acc cluster) taken]
                     (let [proposed (propose-name cluster taken)]
                       [(conj acc (assoc cluster :proposed proposed)) (conj taken proposed)])))
                 [[] (set taken)]
                 clusters)))

(defn identify
  "[[resolve-clusters]] for one graph, with a proposed name on each cluster that inherited none."
  [recorded actual]
  (update (resolve-clusters recorded actual) :clusters #(with-proposals (keys recorded) %)))

(defn- by-name
  "`clusters` as the record holds them: name => members."
  [clusters]
  (into (sorted-map) (map (juxt #(or (:name %) (:proposed %)) :modules)) clusters))

(defn- seed-names
  "The clusters of one graph's first recording, named: the largest is `galactic-center`, and the rest are
  named after their [[dominant-module]]."
  [actual]
  (let [[largest & others] (sort-by (comp - count :modules) actual)]
    (by-name (when largest
               (with-proposals '#{galactic-center} (cons (assoc largest :name 'galactic-center) others))))))

(defn- named-graph
  "One graph's `actual` clusters named against its `recorded` ones: `:named` as the record would hold them,
  and the `:ambiguous` clusters that no name can be given without guessing."
  [recorded actual]
  (let [{:keys [clusters]} (identify recorded actual)
        ambiguous?         #(= :ambiguous (:status %))]
    {:named     (by-name (remove ambiguous? clusters))
     :ambiguous (filterv ambiguous? clusters)}))

;;;; =============================================================================
;;;; Reporting
;;;; =============================================================================

(defn- module-list
  "`modules`, sorted, on one line -- truncated so one runaway cluster cannot bury the rest of the report."
  [modules]
  (let [sorted (sort modules)
        shown  (take 8 sorted)]
    (str (str/join ", " shown)
         (when (< (count shown) (count sorted))
           (format " (and %d more)" (- (count sorted) (count shown)))))))

(defn- ambiguous-line [{:keys [modules from]}]
  (format "  %s could continue any of %s -- record the intended identity by hand"
          (module-list modules) (str/join ", " from)))

(defn- survivors
  "Recorded cluster name => the actual clusters that came out of it, the incumbent and anything that split
  off it.
  Clusters that inherit no name (new, merged, ambiguous) are reported on their own and are not here."
  [clusters]
  (dissoc (group-by (fn [{cluster-name :name, :keys [from status]}]
                      (case status
                        :continued cluster-name
                        :split-off (first from)
                        nil))
                    clusters)
          nil))

(defn- growth-line
  "How one recorded cluster grew, taking everything that survives of it together, or nil when it did not.
  A split may move modules between its components but may not add any, so a component splitting off cannot
  bring a module that was never cyclic in under cover of the improvement."
  [cluster-name recorded components]
  (let [gained (set/difference (into #{} (mapcat :modules) components) recorded)]
    (when (seq gained)
      (format "  %s gained %d module(s): %s -- break the cycle, or add them to the cluster by hand and say why in the PR"
              cluster-name (count gained) (module-list gained)))))

(defn- ceiling-line
  "The failure for a cluster that inherits no recorded name, given every module `recorded-modules` already
  had in some cluster. A cluster that does inherit a name is checked with its whole family by [[survivors]]."
  [recorded-modules {cluster-name :name, :keys [from modules proposed status]}]
  (case status
    :new       (format "  new cycle among %s -- break it, or record it as %s and say why in the PR"
                       (module-list modules) proposed)
    ;; A cluster that draws from two recorded ones but inherits neither name -- one of them continued
    ;; elsewhere -- is reported under the name it would be given, not as absorbing the name it lost.
    :merged    (if cluster-name
                 (format "  %s absorbed %s -- %d modules in one cluster: %s"
                         cluster-name (str/join ", " (rest from)) (count modules) (module-list modules))
                 (format "  %s joins parts of %s -- %d modules in one cluster: %s"
                         proposed (str/join ", " from) (count modules) (module-list modules)))
    ;; A tie splits a cluster into halves that inherit its name equally. Nothing grew, so the branch passes
    ;; and [[updated]] refuses to record it until someone says which half keeps the name. A module that was
    ;; never in any cluster still fails, ambiguous identity or not.
    :ambiguous (when-let [gained (not-empty (set/difference modules recorded-modules))]
                 (format (str "  %s became cyclic in %s, which could continue any of %s -- break the cycle, or"
                              " record the intended split by hand")
                         (module-list gained) (module-list modules) (str/join ", " from)))
    nil))

(defn- with-graph-headers
  "`graph->lines` flattened, each non-empty graph's lines under a header naming it."
  [graph->lines]
  (mapcat (fn [graph]
            (when-let [lines (seq (graph->lines graph))]
              (cons (format "%s graph:" graph) lines)))
          graph-keys))

(defn check-report
  "The lines describing how `actual` exceeds what `snapshot` records, empty when it does not.
  Growth, a merge and a new cycle fail; shrinking, splitting and dissolving are silent."
  [snapshot actual]
  (with-graph-headers
    (fn [graph]
      (let [recorded           (get snapshot graph)
            recorded-modules   (into #{} (mapcat val) recorded)
            {:keys [clusters]} (identify recorded (get actual graph))]
        (concat
         (keep (fn [[cluster-name components]]
                 (growth-line cluster-name (get recorded cluster-name) components))
               (sort-by key (survivors clusters)))
         (keep (partial ceiling-line recorded-modules) clusters))))))

(defn- change-line
  "How one named cluster's membership differs between two records, nil when it does not."
  [cluster-name before after]
  (cond
    (nil? before) (format "  %s: new, %d modules: %s" cluster-name (count after) (module-list after))
    (nil? after)  (format "  %s: dissolved" cluster-name)
    :else
    (let [gained (set/difference after before)
          lost   (set/difference before after)]
      (when (or (seq gained) (seq lost))
        (str "  " cluster-name ": "
             (str/join "; " (concat (when (seq gained) [(format "+%d module(s) %s" (count gained) (module-list gained))])
                                    (when (seq lost) [(format "-%d module(s) %s" (count lost) (module-list lost))])))
             (format "; now %d" (count after)))))))

(defn- graph-changes [before after]
  (keep (fn [cluster-name] (change-line cluster-name (get before cluster-name) (get after cluster-name)))
        (sort (into (set (keys before)) (keys after)))))

(defn changes
  "Lines describing how each named cluster differs between two records, empty when none does."
  [before after]
  (with-graph-headers #(graph-changes (get before %) (get after %))))

(defn observe-report
  "Lines describing how the `actual` structure differs from what `snapshot` records, cluster by cluster,
  empty when it does not. Clusters are named as [[updated]] would name them."
  [snapshot actual]
  (with-graph-headers
    (fn [graph]
      (let [{:keys [named ambiguous]} (named-graph (get snapshot graph) (get actual graph))]
        (concat (graph-changes (get snapshot graph) named)
                (map ambiguous-line ambiguous))))))

(defn report-lines
  "What CI says about `actual` against `snapshot`: the ceilings it breaks in `:enforce` mode, and every
  change in `:observe` mode."
  [snapshot actual]
  (if (enforce? snapshot)
    (check-report snapshot actual)
    (observe-report snapshot actual)))

(defn pr-summary
  "Markdown summarizing how the record changed from `before` to `after`, for the shrink PR; nil when it did
  not."
  [before after]
  (when-let [lines (seq (changes before after))]
    (str "### Module cycles\n\n"
         "`./bin/mage fix-module-cycles` recorded these in `" *clusters-file* "`."
         " It only ever records a cluster shrinking, splitting or dissolving.\n\n"
         "```text\n" (str/join "\n" lines) "\n```\n")))

;;;; =============================================================================
;;;; Recording
;;;; =============================================================================

(defn updated
  "`snapshot` rewritten to the `actual` structure, keeping its `:mode`.
  Clusters keep the names they inherit (see [[resolve-clusters]]), components that split off take a
  [[propose-name]] name, and dissolved ones go.
  In `:enforce` mode `actual` must be an improvement, so the fixer can never bless a regression: growing a
  cluster is a hand edit, justified in the PR that makes it.
  Throws when a cluster's identity is ambiguous rather than guessing at continuity.
  `seed?` names the structure from scratch, for the one commit that creates the file."
  ([snapshot actual]
   (updated snapshot actual nil))
  ([snapshot actual {:keys [seed?]}]
   (when (and (enforce? snapshot) (not seed?))
     (when-let [lines (seq (check-report snapshot actual))]
       (throw (ex-info (str "refusing to record a worse structure:\n" (str/join "\n" lines))
                       {:lines (vec lines)}))))
   (into {:mode (:mode snapshot)}
         (map (fn [graph]
                [graph (if seed?
                         (seed-names (get actual graph))
                         (let [{:keys [named ambiguous]} (named-graph (get snapshot graph) (get actual graph))]
                           (when (seq ambiguous)
                             (throw (ex-info (format "%s holds %d cluster(s) whose identity is ambiguous:\n%s"
                                                     graph (count ambiguous)
                                                     (str/join "\n" (map ambiguous-line ambiguous)))
                                             {:graph graph, :clusters (mapv :modules ambiguous)})))
                           named))]))
         graph-keys)))

;;;; =============================================================================
;;;; Rendering
;;;; =============================================================================

(def ^:private header
  (str ";; Cyclic clusters of the module graph: which modules are tangled together, and under what name.\n"
       ";; Every cluster is a strongly connected component, so no cut short of breaking the cycle removes a\n"
       ";; module from one. A cluster keeps its name while it shrinks and splits.\n"
       ";;\n"
       ";; Membership is a ceiling. Adding a module to a cluster, merging two, or forming a new cycle fails;\n"
       ";; shrinking, splitting and dissolving pass, and the shrink workflow records them on master.\n"
       ";; `./bin/mage fix-module-cycles` writes this file and never widens it: that is a hand edit, and the\n"
       ";; PR making it has to say why. :mode :observe reports the same changes without failing.\n"))

(defn- render-cluster
  "One named cluster, its name at `indent` and its members below, one per line."
  [cluster-name modules indent]
  (str cluster-name "\n" indent
       "#{" (str/join (str "\n" indent "  ") (sort modules)) "}"))

(defn render
  "The text of the clusters file for `snapshot`.
  One module per line, clusters and graphs in a fixed order: every structural movement diffs on its own."
  [snapshot]
  (str header
       "{:mode " (:mode snapshot)
       (str/join (for [graph graph-keys
                       :let  [clusters (into (sorted-map) (get snapshot graph))]]
                   (str "\n " graph "\n "
                        (if (empty? clusters)
                          "{}"
                          (str "{"
                               (str/join "\n  " (for [[cluster-name modules] clusters]
                                                  (render-cluster cluster-name modules "  ")))
                               "}")))))
       "}\n"))
