(ns dev.module-history-report
  "The history of the backend module graph as CSV files, for charting how its cycles and boundaries changed.

  [[update!]] measures a fixed sample of master commits with [[dev.module-history]] and writes these files:

  - `history.csv`: one row per sampled commit since the first one, with cycle, exposure, `:friends` and
    upward-require counts
  - `structure.csv`: every recent backend-touching commit, thinned to the ends of each run of unchanged metrics
  - `cycles.csv`: one row per commit and module cycle, named after the cluster it is today
  - `history.json`: the commits of `history.csv` with each named cluster's size, for a page that charts them
  - `upward-pairs.csv` and `cuts.csv`: at the latest commit, the module pairs whose upward requires close a cycle,
    and the cheapest ways to split the largest cycle; see [[dev.module-cuts]]. Both are in `history.json` too.

  The sample depends only on the history of `origin/master`, so two runs at the same commit write the same files.
  A later run adds rows and keeps the earlier ones, except the tip of an earlier run, which stays only when the
  sample picks it for another reason. `./bin/mage module-history` runs it.

  This is a separate namespace because the source of [[dev.module-history]] is part of its cache key: a change to
  how rows are reported should not measure every commit again."
  (:require
   [clojure.data.csv :as csv]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.java.shell :as sh]
   [clojure.string :as str]
   [dev.module-cuts :as module-cuts]
   [dev.module-cycle-names :as cycle-names]
   [dev.module-history :as module-history]
   [metabase.util.json :as json])
  (:import
   (java.io File)
   (java.nio.file CopyOption Files StandardCopyOption)
   (java.time Instant LocalDate OffsetDateTime)
   (java.util Locale)))

(set! *warn-on-reflection* true)

;;;; The sample

(def ^:private default-ref "origin/master")

(def ^:private history-sample
  "Commits in `history.csv`, besides the [[quarterly-commits]] before it: one a month from before the first module
  linter (#42250), one a week since that linter, and every commit that changed the module config since the dense
  sample starts."
  {:monthly-since "2023-12-01"
   :weekly-since  "2024-05-08"
   :since         "2025-10-01"})

(def ^:private first-quarter
  "The first quarter [[quarterly-commits]] takes the last commit before."
  "2015-04-01")

(def ^:private structure-sample
  "Commits in `structure.csv`: every one that touched the backend since the structure dashboard was first built."
  {:backend-since "2026-08-08"})

(def key-commits
  "Commits that changed the module system or the shape of the graph, by short sha. Each is measured along with its
  parent, so the step it made shows, and labelled in `history.csv`."
  {"1e9e60a0fb4" "#42250 Module linter 1.0"
   "f88dafb8be2" "#53583 Module linter 2.0"
   "734949f2676" "#65236 Halloween decoupling"
   "94d2daaafd9" "#65681 Detangling pre-Conj"
   "30616565b45" "#65144 OpenAPI→TS (regression)"
   "119487b1ccc" "#67650 Fix api→api-routes"
   "ee9ba657624" "#67292 :friends introduced"
   "c2ad36cccbd" "#71068 ee/llm into OSS"
   "ff335470e72" "#81824 Per-module db.clj"
   "eff3209a34b" "#82301 Module hierarchy"
   "4f02379e40d" "#82367 Domain subtrees"
   "30346d6a64a" "#82011 Break requiring-resolve cycles"
   "f35a8a0077b" "#77954 Untangle util"
   "ca08e86675b" "#83441 Decouple foundation modules"
   "06b78789e31" "#83453 Feature modules out of the cycle"
   "e902d2623c7" "#82386 Name module cycles"})

(def ^:private gone-clusters
  "Names for cycles that were gone before `cycle-clusters.edn` existed, so they have no anchor there: cluster name
  and a module only that cycle held."
  ;; magellanic-cloud: segments and xrays drifted beside galactic-center from #65681 until #82447 pulled them back in,
  ;; as the Magellanic Clouds are being pulled into the Milky Way.
  ;; sub-etha: the EE Metabot and Slackbot cycle, Metabot talking over Slack, named after the Hitchhiker's messaging
  ;; network to sit beside deep-thought. It lasted six days, until #71068 moved ee/llm into OSS.
  '[[magellanic-cloud xrays]
    [sub-etha enterprise/slackbot]])

;;;; Git

(defn- git-lines
  "Output lines of git run with `args`, throwing when it fails."
  [args]
  (let [{:keys [exit out err]} (apply sh/sh "git" args)]
    (when-not (zero? exit)
      (throw (ex-info (format "git %s failed: %s" (str/join " " args) err) {:args args})))
    (remove str/blank? (str/split-lines out))))

(defn- positions
  "First-parent position of every commit of `ref`, oldest first, by sha. This is `seq` in the files."
  ;; Commit timestamps carry mixed UTC offsets and two commits can share one, so rows are ordered by this and never
  ;; by timestamp.
  [ref]
  (zipmap (git-lines ["rev-list" "--first-parent" "--reverse" ref])
          (range)))

(defn- quarter-starts
  "The first day of each quarter from the ISO date `from`, which starts one, up to but not including `until`."
  [from until]
  (let [until (LocalDate/parse until)]
    (take-while #(.isBefore ^LocalDate % until)
                (iterate #(.plusMonths ^LocalDate % 3) (LocalDate/parse from)))))

(defn- quarterly-commits
  "The first commit of `ref` and the last one before each quarter until the monthly sample starts: a sparse view of
  the years before there were modules."
  [ref]
  (cons (first (git-lines ["rev-list" "--max-parents=0" "--first-parent" ref]))
        (mapcat #(git-lines ["rev-list" "-1" "--first-parent" (str "--before=" % "T00:00:00Z") ref])
                (quarter-starts first-quarter (:monthly-since history-sample)))))

(defn- key-commits-with-parents
  "Full shas of each of [[key-commits]] and its first parent."
  []
  (git-lines (into ["rev-parse"] (mapcat (juxt #(str % "^{commit}") #(str % "^"))) (keys key-commits))))

(defn- cluster-anchors
  "Cluster name -> anchor module, as `ref` has them."
  [ref]
  (->> (git-lines ["show" (str ref ":" cycle-names/clusters-file)])
       (str/join "\n")
       edn/read-string
       cycle-names/validate-anchors))

;;;; Rows

(defn- short-sha [row]
  (subs (:sha row) 0 11))

(defn- in-order
  "`rows` that have a position, one per commit, oldest first."
  [position rows]
  (->> rows
       (filter (comp position :sha))
       (into {} (map (juxt :sha identity)))
       vals
       (sort-by (comp position :sha))
       vec))

(defn- module-system?
  "Whether `row` is from a commit that has the module system."
  [row]
  (not (false? (:module-system? row))))

(defn- with-modules
  "A function that is `f` of a row with the module system, and nil of a row from before it."
  [f]
  #(when (module-system? %) (f %)))

(defn- whole-backend?
  "Whether `cycle` is the one tangle that [[as-one-tangle]] reports before the module system."
  [cycle]
  (= #{'backend} (set (:modules cycle))))

(defn- as-one-tangle
  "The `row`, with one cycle holding every namespace when it is from before the module system."
  [row]
  ;; Before the module system the whole backend is one module, which a module graph cannot show as a cycle.
  ;; Every later cycle split from that one tangle.
  (if-not (module-system? row)
    (merge row {:scc-largest-modules           1
                :scc-largest-namespaces        (:namespaces row)
                :scc-cyclic-modules            1
                :scc-cyclic-namespaces         (:namespaces row)
                :scc-components                1
                :scc-static-largest-namespaces (:namespaces row)
                :scc-dynamic-only-namespaces   0
                :cycles                        [{:modules        '[backend]
                                                 :namespaces     (:namespaces row)
                                                 :edges          0
                                                 :density        nil
                                                 :cycle-rank     0
                                                 :strong-bridges 0}]})
    row))

(defn- report-rows
  "The `rows` [[in-order]], each through [[as-one-tangle]] and carrying its `:position`."
  [position rows]
  (mapv #(assoc (as-one-tangle %) :position (position (:sha %))) (in-order position rows)))

(defn- cells
  "The value of each of `columns` of `[name compute]` for `row`."
  [columns row]
  (mapv (fn [[_ compute]] (compute row)) columns))

(defn- percent
  "`part` of `whole` as a percentage with one decimal, in the same form under every locale."
  [part whole]
  (String/format Locale/ROOT "%.1f" (to-array [(if (zero? whole) 0.0 (* 100.0 (/ part whole)))])))

;;;; history.csv

(def ^:private history-columns
  "Column of `history.csv` -> how to compute it from one of the [[report-rows]]."
  [[:date                                #(subs (:committed-at %) 0 10)]
   [:module_system                       module-system?]
   [:committed_at                        :committed-at]
   [:seq                                 :position]
   [:sha                                 short-sha]
   [:key_commit                          #(get key-commits (short-sha %) "")]
   [:namespaces                          :namespaces]
   [:modules                             :modules]
   [:top_level_modules                   :top-level-modules]
   [:nested_modules                      :nested-modules]
   [:scc_largest_modules                 :scc-largest-modules]
   [:scc_largest_namespaces              :scc-largest-namespaces]
   [:scc_largest_pct                     #(percent (:scc-largest-namespaces %) (:namespaces %))]
   [:scc_cyclic_modules                  :scc-cyclic-modules]
   [:scc_cyclic_namespaces               :scc-cyclic-namespaces]
   [:scc_cyclic_pct                      #(percent (:scc-cyclic-namespaces %) (:namespaces %))]
   [:scc_components                      :scc-components]
   [:scc_static_largest_namespaces       :scc-static-largest-namespaces]
   [:scc_dynamic_only_namespaces         :scc-dynamic-only-namespaces]
   [:module_edges                        :module-edges]
   [:top_level_edges                     :top-level-edges]
   [:upward_requires                     :upward-requires]
   [:upward_module_edges                 :upward-module-edges]
   [:upward_internal_requires            :upward-internal-requires]
   [:upward_cycle_requires               :upward-cycle-requires]
   ;; With one module there are no boundaries, so exposure means nothing before #42250.
   [:exposed_namespaces                  (with-modules :exposed-namespaces)]
   [:exposed_pct                         (with-modules #(percent (:exposed-namespaces %) (:namespaces %)))]
   [:hidden_modules                      :hidden-modules]
   [:hidden_namespaces                   :hidden-namespaces]
   [:cross_top_level_required_namespaces :cross-top-level-required-namespaces]
   [:api_any_modules                     :api-any-modules]
   [:api_any_namespaces                  :api-any-namespaces]
   [:uses_any_modules                    :uses-any-modules]
   [:friend_grants                       :friend-grants]
   [:cross_top_level_friend_grants       :cross-top-level-friend-grants]
   [:friend_exposed_namespaces           :friend-exposed-namespaces]
   [:friend_access_paths                 :friend-access-paths]
   [:largest_ns_level_scc                :largest-ns-level-scc]
   [:mutual_dependency_pairs             :mutual-dependency-pairs]
   [:non_api_cross_module_requires       :non-api-cross-module-requires]
   [:friend_internal_requires            :friend-internal-requires]
   [:subject                             :subject]])

(defn- table
  "A header and one line per row, from `columns` of `[name compute]`."
  [columns rows]
  (cons (mapv (comp name first) columns)
        (map #(cells columns %) rows)))

(defn history-table
  "Header and lines of `history.csv` for measured `rows`. `position` gives a commit's place on master by sha; a row
  without one is left out."
  [position rows]
  (table history-columns (report-rows position rows)))

;;;; structure.csv

(defn- rounded-percent [part whole]
  (if (zero? whole) 0.0 (/ (Math/round (* 1000.0 (/ part whole))) 10.0)))

(def ^:private structure-id-columns
  [[:committed_at :committed-at]
   [:sha          :sha]
   [:pr           #(some->> (re-find #"\(#(\d+)\)\s*$" (:subject %)) second)]
   [:subject      :subject]])

(def ^:private structure-metric-columns
  [[:modules                             :configured-modules]
   [:top_level_modules                   :configured-top-level-modules]
   [:namespaces                          :distinct-namespaces]
   [:module_edges                        :module-edges]
   [:cyclic_clusters                     :scc-components]
   [:scc1_modules                        :scc1-modules]
   [:scc1_namespaces                     :scc1-namespaces]
   [:scc2_modules                        :scc2-modules]
   [:scc2_namespaces                     :scc2-namespaces]
   [:scc3_modules                        :scc3-modules]
   [:scc3_namespaces                     :scc3-namespaces]
   [:modules_in_cycles                   :scc-cyclic-modules]
   [:namespaces_in_cycles                :scc-cyclic-namespaces]
   [:pct_namespaces_in_cycles            #(rounded-percent (:scc-cyclic-namespaces %) (:distinct-namespaces %))]
   [:largest_ns_level_scc                :largest-ns-level-scc]
   [:mutual_dependency_pairs             :mutual-dependency-pairs]
   [:api_any                             :api-any-modules]
   [:uses_any                            :uses-any-modules]
   [:friend_edges                        :friend-grants]
   [:ns_prefixes                         :ns-prefixes]
   [:model_imports_bypass                :model-imports-bypass]
   [:friend_internal_namespaces          :friend-internal-namespaces]
   [:friend_internal_requires            :friend-internal-requires]
   [:non_api_cross_module_requires       :non-api-cross-module-requires]
   [:total_api_namespaces                :total-api-namespaces]
   [:legacy_rest_modules                 :legacy-rest-modules]
   [:upward_requires                     :upward-requires]
   [:upward_cycle_requires               :upward-cycle-requires]
   [:upward_internal_requires            :upward-internal-requires]
   [:upward_module_edges                 :upward-module-edges]
   [:exposed_namespaces                  :exposed-namespaces]
   [:cross_top_level_required_namespaces :cross-top-level-required-namespaces]])

(defn- ends-of-unchanged-runs
  "The rows whose `values` differ from either neighbour's, plus the first and last: both ends of every run of
  commits that changed nothing."
  [values rows]
  (let [rows   (vec rows)
        values (mapv values rows)
        n      (count rows)]
    (for [i     (range n)
          :when (or (zero? i)
                    (= i (dec n))
                    (not= (values i) (values (dec i)))
                    (not= (values i) (values (inc i))))]
      (rows i))))

(defn structure-table
  "Header and lines of `structure.csv` for measured `rows`: most commits move no metric, so each run of unchanged
  commits keeps only its first and last."
  [position rows]
  (table (concat structure-id-columns structure-metric-columns)
         (ends-of-unchanged-runs #(cells structure-metric-columns %) (in-order position rows))))

;;;; cycles.csv

(defn- cluster-names
  "Cluster names of `anchors`, the one whose cycle has the most namespaces at `latest-row` first. A cluster that is
  no longer a cycle there sorts last."
  [anchors latest-row]
  (let [size (fn [cluster]
               (or (some (fn [cycle]
                           (when (some #{(anchors cluster)} (:modules cycle))
                             (:namespaces cycle)))
                         (:cycles latest-row))
                   0))]
    (sort-by (juxt (comp - size) str) (keys anchors))))

(defn- cluster-name
  "The first of `names` whose anchor `cycle` holds, else its [[gone-clusters]] entry, else `unnamed`.
  A cycle that holds several anchors is those clusters before they split, and it takes the name of the largest.
  The one tangle from before the module system takes the first of `names`."
  [anchors names cycle]
  (let [members (set (:modules cycle))]
    (or (when (whole-backend? cycle) (str (first names)))
        (some-> (first (filter #(contains? members (anchors %)) names)) str)
        (some (fn [[cluster anchor]] (when (contains? members anchor) (str cluster))) gone-clusters)
        "unnamed")))

(defn- instant ^Instant [row]
  (.toInstant (OffsetDateTime/parse (:committed-at row))))

(defn- last-commit-of-each-instant
  "The `rows` with only the last of any commits that share an instant."
  [rows]
  ;; A merge queue can land two commits in the same second, and a chart stacked over time would add them together.
  (map last (partition-by instant rows)))

(defn cycles-table
  "Header and lines of `cycles.csv`: one line for each module cycle at each of `rows`, named by `anchors`, a map of
  cluster name to anchor module. The `anchors` column counts the anchors a cycle holds, so a merge of today's
  clusters shows."
  [anchors position rows]
  (let [rows  (last-commit-of-each-instant (report-rows position rows))
        names (cluster-names anchors (last rows))]
    (cons ["committed_at" "seq" "sha" "cluster" "anchors" "modules" "namespaces" "edges" "density" "cycle_rank"
           "strong_bridges" "members" "subject"]
          (for [row   rows
                cycle (:cycles row)
                :let  [members (set (:modules cycle))]]
            [(:committed-at row)
             (:position row)
             (short-sha row)
             (cluster-name anchors names cycle)
             (if (whole-backend? cycle)
               (count anchors)
               (count (filter (comp members anchors) names)))
             (count members)
             (:namespaces cycle)
             (:edges cycle)
             (:density cycle)
             (:cycle-rank cycle)
             (:strong-bridges cycle)
             (str/join " " (:modules cycle))
             (:subject row)]))))

;;;; history.json

(defn- cycle-holding
  "The cycle at `row` that holds `module`. Before the module system that is the one tangle, whatever the module."
  [row module]
  (first (filter #(or (whole-backend? %) (some #{module} (:modules %))) (:cycles row))))

(def ^:private commit-keys
  "Key of a commit in `history.json` -> how to compute it from one of the [[report-rows]] that carries its
  `:largest-cycle` and `:lanes`. Page templates kept outside this repository read these keys by name."
  [;; When it was committed, with its UTC offset.
   [:at      :committed-at]
   ;; The day it was committed.
   [:date    #(subs (:committed-at %) 0 10)]
   ;; Short sha.
   [:sha     short-sha]
   ;; Label of one of the [[key-commits]], else an empty string.
   [:key     #(get key-commits (short-sha %) "")]
   ;; First line of the commit message.
   [:subject :subject]
   ;; Backend namespaces.
   [:ns      :namespaces]
   ;; Namespaces in the largest cycle.
   [:scc     :scc-largest-namespaces]
   ;; Modules in the largest cycle.
   [:sccm    :scc-largest-modules]
   ;; Share of the namespaces that the largest cycle holds, as a percentage.
   [:pct     #(parse-double (percent (:scc-largest-namespaces %) (:namespaces %)))]
   ;; Namespaces in any cycle.
   [:cyc     :scc-cyclic-namespaces]
   ;; Namespaces that only dynamic requires keep in the largest cycle.
   [:dyn     :scc-dynamic-only-namespaces]
   ;; Strong bridges of the largest cycle.
   [:bridges (comp :strong-bridges :largest-cycle)]
   ;; Cycle rank of the largest cycle.
   [:rank    (comp :cycle-rank :largest-cycle)]
   ;; Mean share of the backend a change retests, selecting tests by module.
   [:rtm     :retest-module-mean]
   ;; The same, selecting tests by namespace.
   [:rtn     :retest-namespace-mean]
   ;; Leaf modules, which nothing else requires. Before modules existed the one module is not a leaf worth counting.
   [:lfm     (with-modules :leaf-modules)]
   ;; Namespaces in leaf modules.
   [:lfmn    (with-modules :leaf-module-namespaces)]
   ;; Leaf namespaces, which nothing else requires.
   [:lfn     :leaf-namespaces]
   ;; Requires from a module into one of its ancestors.
   [:up      :upward-requires]
   ;; Those of them that close a cycle.
   [:upcyc   :upward-cycle-requires]
   ;; Those of them that reach past the ancestor's API.
   [:upint   :upward-internal-requires]
   ;; Namespaces another top-level module may require. With one module there are no boundaries to expose them.
   [:exp     (with-modules :exposed-namespaces)]
   ;; Non-API namespaces that a `:friends` grant opens to another top-level module.
   [:fx      :friend-exposed-namespaces]
   ;; Non-API namespaces that a friend really requires.
   [:fxu     :friend-internal-namespaces]
   ;; Namespaces required from another top-level module.
   [:xreq    :cross-top-level-required-namespaces]
   ;; Top-level modules.
   [:top     :top-level-modules]
   ;; Nested modules.
   [:nested  :nested-modules]
   ;; Namespaces in the largest cycle of the namespace graph.
   [:nslvl   :largest-ns-level-scc]
   ;; Pairs of modules that require each other, leaving out a module and its ancestor.
   [:mutual  :mutual-dependency-pairs]
   ;; Requires of another module's non-API namespace.
   [:nonapi  :non-api-cross-module-requires]
   ;; Cluster name -> the `[namespaces label]` of the cycle that holds its anchor, `[0 nil]` when there is none.
   [:lanes   :lanes]])

(defn page-data
  "What a page needs to chart measured `rows`, as a map ready for JSON:

  - `:clusters`: every cluster name, today's largest first, then those that are gone
  - `:commits`: one map per commit, under the short keys that [[commit-keys]] lists
  - `:today`: the cycles at the latest commit, largest first
  - `:retest`: at the latest commit, the namespaces in each tenth of retest share, selecting tests by `:module`
    and by `:namespace`"
  [anchors position rows]
  (let [rows    (report-rows position rows)
        names   (cluster-names anchors (last rows))
        named   (concat (map (juxt str anchors) names)
                        (map (fn [[cluster anchor]] [(str cluster) anchor]) gone-clusters))
        lanes   (fn [row]
                  (into {}
                        (for [[cluster anchor] named
                              :let [cycle (cycle-holding row anchor)]]
                          [cluster (if cycle [(:namespaces cycle) (cluster-name anchors names cycle)] [0 nil])])))
        ;; The cycle with the most namespaces, which the `:scc-largest-*` counts describe.
        largest #(when-let [cycles (seq (:cycles %))] (apply max-key :namespaces cycles))]
    {:clusters (mapv first named)
     :commits  (for [row rows]
                 (zipmap (map first commit-keys)
                         (cells commit-keys (assoc row :largest-cycle (largest row), :lanes (lanes row)))))
     :retest   (:retest-histogram (last rows))
     :today    (for [cycle (sort-by (comp - :namespaces) (:cycles (last rows)))]
                 {:cluster    (cluster-name anchors names cycle)
                  :modules    (count (:modules cycle))
                  :namespaces (:namespaces cycle)
                  :edges      (:edges cycle)
                  :density    (:density cycle)
                  :rank       (:cycle-rank cycle)
                  :bridges    (:strong-bridges cycle)
                  :members    (str/join " " (sort (map str (:modules cycle))))})}))

;;;; Files

(defn- write-atomically!
  "Write `file` with `write`, a function of a writer, through a temporary file, so a reader never sees half a file."
  [^File file write]
  (io/make-parents file)
  (let [tmp (File/createTempFile (.getName file) ".tmp" (.getParentFile file))]
    (with-open [writer (io/writer tmp)]
      (write writer))
    (Files/move (.toPath tmp) (.toPath file)
                (into-array CopyOption [StandardCopyOption/ATOMIC_MOVE StandardCopyOption/REPLACE_EXISTING]))))

(defn- write-csv!
  "Write `lines` to `file` and return how many follow the header. Nil is an empty cell."
  [file lines]
  (write-atomically! file #(csv/write-csv % (map (fn [line] (map (fn [cell] (if (nil? cell) "" (str cell))) line))
                                                 lines)))
  (dec (count lines)))

;;;; upward-pairs.csv and cuts.csv

(def ^:private cut-require-limit
  "A cut that severs more requires than this is not offered."
  30)

(defn tip-tables
  "The two tables about one commit's `deps` and `modules`, as maps ready for JSON:

  - `:pairs`: [[module-cuts/upward-pairs]], with names as strings
  - `:cuts`: [[module-cuts/cut-candidates]], each as `{:base, :of, :requires, :after, :pct, :freed, :edges,
    :severed}`, where `:pct` is `:after` as a share of all namespaces, `:edges` has names as strings and
    `:severed` lists each require as `from-namespace -> to-namespace`"
  [deps modules]
  {:pairs (for [pair (module-cuts/upward-pairs deps modules)]
            (-> pair (update :module str) (update :ancestor str)))
   :cuts  (for [{:keys [base-modules cycle-modules requires edges largest-after freed]}
                (module-cuts/cut-candidates deps cut-require-limit)]
            {:base     base-modules
             :of       cycle-modules
             :requires (count requires)
             :after    largest-after
             :pct      (rounded-percent largest-after (count deps))
             :freed    freed
             :edges    (mapv (fn [[from to n]] [(str from) (str to) n]) edges)
             :severed  (mapv (fn [[from to]] (str from " -> " to)) requires)})})

(defn- pairs-table [sha pairs]
  (cons ["sha" "module" "ancestor" "requires" "internal"]
        (for [{:keys [module ancestor requires internal]} pairs]
          [sha module ancestor requires internal])))

(defn- cuts-table [sha cuts]
  (cons ["sha" "base_modules" "cycle_modules" "requires" "largest_cycle_after" "share_after_pct" "namespaces_freed"
         "severed"]
        (for [{:keys [base of requires after pct freed severed]} cuts]
          [sha base of requires after pct freed (str/join "; " severed)])))

(defn update!
  "Measure the sample on `:ref` (default `origin/master`, as last fetched) and write `history.csv`,
  `structure.csv`, `cycles.csv`, `upward-pairs.csv`, `cuts.csv` and `history.json` into `:dir`.
  Commits measured before come from the cache.

    clojure -X:dev dev.module-history-report/update! :dir '\"target/module-history\"'"
  [{:keys [dir ref], :or {ref default-ref}}]
  (when (str/blank? (str dir))
    (throw (ex-info "update! needs :dir, the directory to write the files into" {})))
  (let [dir       (io/file (str dir))
        ;; Every step reads this one commit, so a fetch during a long run cannot mix two tips in the files.
        tip       (first (git-lines ["rev-parse" (str ref "^{commit}")]))
        history   (module-history/backfill! (assoc history-sample
                                                   :ref   tip
                                                   :extra (concat (quarterly-commits tip) (key-commits-with-parents))))
        structure (module-history/backfill! (assoc structure-sample :ref tip))
        position  (positions tip)
        anchors   (cluster-anchors tip)
        sha       (subs tip 0 11)
        tables    (let [{:keys [deps modules]} (module-history/snapshot tip)] (tip-tables deps modules))
        page      (merge (page-data anchors position history) tables)]
    (doseq [[file-name lines] [["history.csv"      (history-table position history)]
                               ["structure.csv"    (structure-table position structure)]
                               ["cycles.csv"       (cycles-table anchors position (concat history structure))]
                               ["upward-pairs.csv" (pairs-table sha (:pairs tables))]
                               ["cuts.csv"         (cuts-table sha (:cuts tables))]]]
      (println (format "%-16s %5d rows" file-name (write-csv! (io/file dir file-name) lines))))
    (write-atomically! (io/file dir "history.json") #(json/encode-to page % {}))
    (println (format "%-16s %5d commits" "history.json" (count (:commits page))))
    (println "Written to" (.getCanonicalPath dir))))
