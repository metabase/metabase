(ns metabase.core.module-history-report-test
  (:require
   [clojure.test :refer :all]
   [dev.module-history-report :as report]
   [metabase.util.json :as json]))

(defn- lines->maps
  "Each line after the header as a map of column name to value."
  [[header & lines]]
  (mapv #(zipmap (map keyword header) %) lines))

(def ^:private position
  "Places on master for the commits these tests use. `off-master` has none."
  {"aaaaaaaaaaaa1" 10
   "bbbbbbbbbbbb2" 11
   "cccccccccccc3" 12
   "dddddddddddd4" 13})

(deftest ^:parallel quarter-starts-test
  (testing "a quarter that starts on the end date is left out"
    (is (= ["2015-04-01" "2015-07-01" "2015-10-01" "2016-01-01"]
           (map str (#'report/quarter-starts "2015-04-01" "2016-04-01")))))
  (testing "a quarter that starts before the end date is kept"
    (is (= ["2015-04-01" "2015-07-01"]
           (map str (#'report/quarter-starts "2015-04-01" "2015-07-02"))))))

(deftest ^:parallel history-table-test
  (let [rows [{:sha                    "bbbbbbbbbbbb2"
               :committed-at           "2026-01-02T10:00:00Z"
               :subject                "Carve \"x\", then y (#2)"
               :module-system?         true
               :namespaces             200
               :scc-largest-namespaces 50
               :scc-cyclic-namespaces  75
               :exposed-namespaces     30}
              ;; Later on the clock than the commit above, but earlier on master.
              {:sha            "aaaaaaaaaaaa1"
               :committed-at   "2026-01-02T23:00:00+13:00"
               :subject        "Before the module system"
               :module-system? false
               :namespaces     120}
              {:sha          "off-master"
               :committed-at "2026-01-03T00:00:00Z"
               :subject      "On a branch"
               :namespaces   1}]]
    (testing "rows follow master, not the clock, and a commit that is not on master is left out"
      (is (=? [;; Before the module system the backend is one tangle of every namespace, with no exposure to report.
               {:seq                    10
                :sha                    "aaaaaaaaaaa"
                :date                   "2026-01-02"
                :subject                "Before the module system"
                :module_system          false
                :scc_largest_modules    1
                :scc_largest_namespaces 120
                :scc_largest_pct        "100.0"
                :scc_cyclic_pct         "100.0"
                :scc_components         1
                :exposed_namespaces     nil
                :exposed_pct            nil}
               ;; Percentages have one decimal.
               {:seq             11
                :sha             "bbbbbbbbbbb"
                :date            "2026-01-02"
                :subject         "Carve \"x\", then y (#2)"
                :module_system   true
                :scc_largest_pct "25.0"
                :scc_cyclic_pct  "37.5"
                :exposed_pct     "15.0"}]
              (lines->maps (report/history-table position rows)))))))

(deftest ^:parallel key-commit-label-test
  (let [[sha label] (first report/key-commits)]
    (is (=? [{:key_commit label} {:key_commit ""}]
            (lines->maps (report/history-table {(str sha "0000") 1, "bbbbbbbbbbbb2" 2}
                                               (for [commit [(str sha "0000") "bbbbbbbbbbbb2"]]
                                                 {:sha                    commit
                                                  :committed-at           "2026-01-01T00:00:00Z"
                                                  :namespaces             10
                                                  :scc-largest-namespaces 0
                                                  :scc-cyclic-namespaces  0
                                                  :exposed-namespaces     0})))))))

(deftest ^:parallel structure-table-test
  (let [row  (fn [sha subject namespaces]
               {:sha                   sha
                :committed-at          "2026-09-01T00:00:00Z"
                :subject               subject
                :distinct-namespaces   namespaces
                :scc-cyclic-namespaces 0})
        rows [(row "aaaaaaaaaaaa1" "Start a run (#1)" 100)
              (row "bbbbbbbbbbbb2" "Change nothing (#2)" 100)
              (row "cccccccccccc3" "End the run" 100)
              (row "dddddddddddd4" "Add a namespace (#4)" 101)]]
    (testing "a run of commits that move no metric keeps its two ends, and the PR number comes from the subject"
      (is (=? [{:sha "aaaaaaaaaaaa1", :pr "1", :namespaces 100}
               {:sha "cccccccccccc3", :pr nil, :namespaces 100}
               {:sha "dddddddddddd4", :pr "4", :namespaces 101}]
              (lines->maps (report/structure-table position (reverse rows))))))))

(deftest ^:parallel cycles-table-test
  (let [anchors '{galactic-center query-processor
                  deep-thought    metabot
                  tardis          lib}
        cycle   (fn [modules namespaces]
                  {:modules        modules
                   :namespaces     namespaces
                   :edges          9
                   :density        0.5
                   :cycle-rank     2
                   :strong-bridges 1})
        rows    [{:sha            "aaaaaaaaaaaa1"
                  :committed-at   "2026-01-01T00:00:00Z"
                  :subject        "No modules yet"
                  :module-system? false
                  :namespaces     700}
                 {:sha          "bbbbbbbbbbbb2"
                  :committed-at "2026-01-02T00:00:00Z"
                  :subject      "One big cycle"
                  :cycles       [(cycle '[lib metabot query-processor] 600)
                                 (cycle '[segments xrays] 20)
                                 (cycle '[a b] 5)]}
                 ;; The same second as the commit after it, written with another offset.
                 {:sha          "cccccccccccc3"
                  :committed-at "2026-01-03T02:00:00+02:00"
                  :subject      "Dropped"
                  :cycles       [(cycle '[lib metabot query-processor] 600)]}
                 {:sha          "dddddddddddd4"
                  :committed-at "2026-01-03T00:00:00Z"
                  :subject      "Split"
                  ;; metabot's cycle is the largest at the latest commit, so its name goes first in a merge.
                  :cycles       [(cycle '[metabot slackbot] 300)
                                 (cycle '[lib query-processor] 200)]}]]
    (is (=? [{:seq        10
              :cluster    "deep-thought"
              :anchors    3
              :modules    1
              :namespaces 700
              :members    "backend"}
             {:seq            11
              :cluster        "deep-thought"
              :anchors        3
              :modules        3
              :namespaces     600
              :members        "lib metabot query-processor"
              :density        0.5
              :cycle_rank     2
              :strong_bridges 1
              :edges          9}
             {:seq     11
              :cluster "magellanic-cloud"
              :anchors 0
              :members "segments xrays"}
             {:seq     11
              :cluster "unnamed"
              :anchors 0
              :members "a b"}
             {:seq     13
              :cluster "deep-thought"
              :anchors 1
              :sha     "ddddddddddd"
              :subject "Split"}
             ;; tardis ties with galactic-center on this cycle's size, and the names then sort by letter.
             {:seq     13
              :cluster "galactic-center"
              :anchors 2
              :members "lib query-processor"}]
            (lines->maps (report/cycles-table anchors position rows))))))

(def ^:private page-anchors
  '{galactic-center query-processor
    tardis          lib})

(def ^:private page-rows
  "A commit from before the module system and one after it, for [[report/page-data]]."
  (let [counts {:namespaces                 100
                :scc-largest-namespaces     60
                :exposed-namespaces         40
                :retest-module-mean         70.0
                :retest-namespace-mean      20.0
                :retest-histogram           {:module [1 0 0 0 0 0 0 0 0 9], :namespace [9 1]}
                :leaf-modules               3
                :leaf-module-namespaces     12
                :leaf-namespaces            30
                :friend-internal-namespaces 4}]
    [(merge counts {:sha            "aaaaaaaaaaaa1"
                    :committed-at   "2026-01-01T00:00:00Z"
                    :subject        "No modules yet"
                    :module-system? false})
     (merge counts {:sha          "bbbbbbbbbbbb2"
                    :committed-at "2026-01-02T00:00:00Z"
                    :subject      "Split (#2)"
                    :cycles       [{:modules        '[lib lib.schema]
                                    :namespaces     20
                                    :density        0.5
                                    :cycle-rank     1
                                    :strong-bridges 2
                                    :edges          2}
                                   {:modules        '[query-processor b a]
                                    :namespaces     60
                                    :density        0.4
                                    :cycle-rank     3
                                    :strong-bridges 0
                                    :edges          5}]})]))

(deftest ^:parallel page-data-test
  (is (=? {:clusters ["galactic-center" "tardis" "magellanic-cloud" "sub-etha"]
           :retest   {:module [1 0 0 0 0 0 0 0 0 9], :namespace [9 1]}
           :commits  [{:sha     "aaaaaaaaaaa"
                       :pct     100.0
                       :lfm     nil
                       :lfn     30
                       :exp     nil
                       :bridges 0
                       :rank    0
                       ;; Every cluster was inside the one tangle.
                       :lanes   {"galactic-center"  [100 "galactic-center"]
                                 "tardis"           [100 "galactic-center"]
                                 "magellanic-cloud" [100 "galactic-center"]}}
                      {:sha     "bbbbbbbbbbb"
                       :date    "2026-01-02"
                       :subject "Split (#2)"
                       :ns      100
                       :scc     60
                       :pct     60.0
                       :rtm     70.0
                       :rtn     20.0
                       :fxu     4
                       :lfm     3
                       :lfmn    12
                       :lfn     30
                       :exp     40
                       ;; Of the cycle with the most namespaces.
                       :bridges 0
                       :rank    3
                       :lanes   {"galactic-center"  [60 "galactic-center"]
                                 "tardis"           [20 "tardis"]
                                 "magellanic-cloud" [0 nil]
                                 "sub-etha"         [0 nil]}}]
           :today    [{:cluster    "galactic-center"
                       :modules    3
                       :namespaces 60
                       :members    "a b query-processor"
                       :rank       3
                       :bridges    0}
                      {:cluster    "tardis"
                       :modules    2
                       :namespaces 20
                       :members    "lib lib.schema"}]}
          (report/page-data page-anchors position page-rows))))

(deftest ^:parallel page-data-json-test
  (testing "the page data has exactly the keys page templates read, before the tip tables are added"
    (let [page (json/decode (json/encode (report/page-data page-anchors position page-rows)))]
      (is (= {:page   #{"clusters" "commits" "retest" "today"}
              :commit #{"at"
                        "bridges"
                        "cyc"
                        "date"
                        "dyn"
                        "exp"
                        "fx"
                        "fxu"
                        "key"
                        "lanes"
                        "lfm"
                        "lfmn"
                        "lfn"
                        "mutual"
                        "nested"
                        "nonapi"
                        "ns"
                        "nslvl"
                        "pct"
                        "rank"
                        "rtm"
                        "rtn"
                        "scc"
                        "sccm"
                        "sha"
                        "subject"
                        "top"
                        "up"
                        "upcyc"
                        "upint"
                        "xreq"}}
             {:page   (set (keys page))
              :commit (set (keys (first (get page "commits"))))})))))

(deftest ^:parallel tip-tables-test
  ;; x requires its child x.y, which requires x's API and one internal namespace back. Cutting the one require
  ;; from x into x.y leaves no cycle.
  (let [dep     (fn [namespace module] {:namespace namespace, :module module})
        deps    [{:namespace 'metabase.x.core, :module 'x, :deps [(dep 'metabase.x.y.core 'x.y)]}
                 {:namespace 'metabase.x.impl, :module 'x, :deps []}
                 {:namespace 'metabase.x.y.core
                  :module    'x.y
                  :deps      [(dep 'metabase.x.core 'x) (dep 'metabase.x.impl 'x)]}
                 {:namespace 'metabase.z.core, :module 'z, :deps []}]]
    (is (= {:pairs [{:module "x.y", :ancestor "x", :requires 2, :internal 1}]
            :cuts  [{:base     1
                     :of       2
                     :requires 1
                     :after    0
                     :pct      0.0
                     :freed    3
                     :edges    [["x" "x.y" 1]]
                     :severed  ["metabase.x.core -> metabase.x.y.core"]}]}
           (report/tip-tables deps '{x {}, x.y {}, z {}})))))

(deftest ^:parallel tip-table-columns-test
  (testing "the two tip tables keep the columns their uploads were created with"
    (is (= [{:sha "abc", :module "x.y", :ancestor "x", :requires 2, :internal 1}]
           (lines->maps (#'report/pairs-table "abc" [{:module "x.y", :ancestor "x", :requires 2, :internal 1}]))))
    (is (= [{:sha                 "abc"
             :base_modules        1
             :cycle_modules       2
             :requires            2
             :largest_cycle_after 0
             :share_after_pct     0.0
             :namespaces_freed    3
             :severed             "a.core -> b.core; a.impl -> b.core"}]
           (lines->maps (#'report/cuts-table "abc" [{:base     1
                                                     :of       2
                                                     :requires 2
                                                     :after    0
                                                     :pct      0.0
                                                     :freed    3
                                                     :severed  ["a.core -> b.core" "a.impl -> b.core"]}]))))))
