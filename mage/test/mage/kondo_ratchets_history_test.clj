(ns mage.kondo-ratchets-history-test
  (:require
   [babashka.json :as json]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.color :as c]
   [mage.kondo-ratchets-history :as history]))

;;; ------------------------------------------------- Budgets --------------------------------------------------

(defn- changes
  "[[history/budget-changes]] between the ratchet files `before` and `after`, where the commit added the linters
  and discouraged symbols in `added`."
  [before after added]
  (history/budget-changes (history/budget-view before after)
                          {:new-linter? added
                           :new-symbol? (fn [_linter sym] (added sym))}))

(deftest budget-changes-test
  (testing "each kind of change to a budget"
    (is (= [{:measure [:prod :config :shrunk], :old 2, :new nil, :kind :shrink, :delta -2}
            {:measure [:prod :ignore :capped], :old :unlimited, :new 4, :kind :limit}
            {:measure [:prod :ignore :first-budget], :old nil, :new 6, :kind :grow, :delta 6}
            {:measure [:prod :ignore :grown], :old 1, :new 3, :kind :grow, :delta 2}
            {:measure [:prod :ignore :new-linter], :old nil, :new 7, :kind :introduce}
            {:measure [:prod :ignore :shrunk], :old 5, :new 2, :kind :shrink, :delta -3}
            {:measure [:prod :ignore :uncapped], :old 9, :new :unlimited, :kind :unlimit}]
           (changes {:prod {:ignore-counts {:capped   :unlimited
                                            :grown    1
                                            :same     1
                                            :shrunk   5
                                            :uncapped 9}
                            :config-counts {:shrunk 2}}}
                    {:prod {:ignore-counts {:capped       4
                                            :first-budget 6
                                            :grown        3
                                            :new-linter   7
                                            :same         1
                                            :shrunk       2
                                            :uncapped     :unlimited}}}
                    #{:new-linter}))))
  (testing "a whole new ratchet for linters that already existed is growth"
    (is (= [{:measure [:modules :module :uses-any], :old nil, :new 4, :kind :grow, :delta 4}]
           (changes {} {:modules {:uses-any 4}} #{}))))
  (testing "a newly discouraged symbol is an introduction, and the rest of its linter's budget still moves"
    (is (= [{:measure [:prod :ignore :discouraged-var], :kind :introduce, :key :clojure.core/eval, :new 6}
            {:measure [:prod :ignore :discouraged-var], :old 3, :new 2, :kind :shrink, :delta -1}]
           (changes {:prod {:discouraged-var-counts {:clojure.core/prn 3}}}
                    {:prod {:discouraged-var-counts {:clojure.core/prn 2, :clojure.core/eval 6}}}
                    #{:clojure.core/eval}))))
  (testing "moving a linter's budget to per-symbol budgets, or test budgets to their own file, changes nothing"
    (is (= []
           (changes {:prod {:ignore-counts {:discouraged-var 5, :deprecated-var 9}}}
                    {:prod {:ignore-counts {:deprecated-var 6}, :discouraged-var-counts {:clojure.core/prn 3}}
                     :test {:ignore-counts {:deprecated-var 3}, :discouraged-var-counts {:clojure.core/prn 2}}}
                    #{})))))

;;; ------------------------------------------------ Attribution -----------------------------------------------

(deftest attribute-test
  (testing "walks back until the shrink is explained, netting the growth that hid in its slack"
    (is (= {:open   {}
            :causes {:a [{:sha "hid", :delta 1} {:sha "removed", :delta -3}]}}
           (history/attribute {:a -2}
                              [[{:sha "tighten"} {}]
                               [{:sha "hid"} {:a 1, :other -4}]
                               [{:sha "removed"} {:a -3}]
                               [{:sha "earlier"} {:a -5}]]))))
  (testing "reports what no commit explains"
    (is (= {:open {:a -1, :b -4}, :causes {:a [{:sha "removed", :delta -2}]}}
           (history/attribute {:a -3, :b -4} [[{:sha "removed"} {:a -2}]])))))

(deftest parse-log-test
  (testing "reads each commit, the PR number from its subject, and the blobs of the files it changed"
    (is (= [{:sha     "aaa"
             :author  "Ada"
             :email   "ada@example.com"
             :date    "2026-10-01T00:00:00Z"
             :subject "Fix it (#12)"
             :pr      12
             :files   [{:path "src/a.clj", :old "111", :new "222"}
                       {:path "test/b c.clj", :old "000", :new "333"}]}
            {:sha     "bbb"
             :author  "Bob"
             :email   "bob@example.com"
             :date    "2026-09-30T00:00:00Z"
             :subject "No PR here"
             :pr      nil
             :files   []}]
           (history/parse-log
            ["\u0001aaa\u001fAda\u001fada@example.com\u001f2026-10-01T00:00:00Z\u001fFix it (#12)"
             ""
             ":100644 100644 111 222 M\tsrc/a.clj"
             ":000000 100644 000 333 A\ttest/b c.clj"
             "\u0001bbb\u001fBob\u001fbob@example.com\u001f2026-09-30T00:00:00Z\u001fNo PR here"])))))

(deftest tightening-test
  (testing "holds only for a commit that changed ratchet files alone and did nothing but lower budgets"
    (is (= [true true false false false false]
           (map (fn [[paths kinds]] (history/tightening? paths kinds))
                [[[".clj-kondo/ratchets.edn"] [:shrink]]
                 [[".clj-kondo/ratchets.edn" ".clj-kondo/ratchets-test.edn"] [:shrink :limit]]
                 ;; a feature commit that also shrinks
                 [[".clj-kondo/ratchets.edn" "src/metabase/a.clj"] [:shrink]]
                 ;; a seeding commit that also shrinks
                 [[".clj-kondo/ratchets.edn"] [:shrink :grow]]
                 ;; a ratchet commit that lowers nothing
                 [[".clj-kondo/ratchets.edn"] [:limit]]
                 ;; a merge commit, which lists no paths without a merge diff mode
                 [[] [:shrink]]])))))

(deftest counts-test
  (testing "counts each linter of an ignore, on the side the path belongs to, when the vector spans lines"
    (let [source "#_{:clj-kondo/ignore [:deprecated-var
                      :unused-binding]}
(foo)
"]
      (is (= [{[:prod :ignore :deprecated-var] 1, [:prod :ignore :unused-binding] 1}
              {[:test :ignore :deprecated-var] 1, [:test :ignore :unused-binding] 1}
              {}]
             [(history/counts "src/metabase/a.clj" source)
              (history/counts "test/metabase/a_test.clj" source)
              (history/counts "docs/a.clj" source)])))))

(deftest actual-delta-test
  (let [before "#_{:clj-kondo/ignore [:deprecated-var
                      :unused-binding]}
(foo)
"
        after  "#_{:clj-kondo/ignore [:deprecated-var
                      :type-mismatch]}
(foo)
"
        path   "src/metabase/a.clj"
        commit {:files [{:path path, :old "old", :new "new"}]}]
    (testing "sees an edit to the continuation line of an ignore vector alone"
      (is (= {[:prod :ignore :unused-binding] -1, [:prod :ignore :type-mismatch] 1}
             (history/actual-delta {"old" {path (history/counts path before)}
                                    "new" {path (history/counts path after)}}
                                   commit))))
    (testing "counts nothing for a file that cannot be read on one side"
      (is (= {}
             (history/actual-delta {"old" {path (history/counts path before)}
                                    "new" {path ::history/unreadable}}
                                   commit))))))

;;; -------------------------------------------------- Verdicts ------------------------------------------------

(deftest suspects-test
  (testing "flags a raise beyond the suppressions its commit added, unless the commit has a verdict"
    (is (= [{:sha "stale", :changes [{:measure [:prod :ignore :a], :kind :grow, :delta 8, :added 0}]}]
           (history/suspects
            #{"settled"}
            [{:sha "stale", :changes [{:measure [:prod :ignore :a], :kind :grow, :delta 8, :added 0}
                                      {:measure [:prod :ignore :b], :kind :grow, :delta 2, :added 2}
                                      {:measure [:prod :ignore :c], :kind :shrink, :delta -1}]}
             {:sha "honest", :changes [{:measure [:prod :ignore :a], :kind :grow, :delta 1, :added 1}]}
             {:sha "settled", :changes [{:measure [:prod :ignore :a], :kind :grow, :delta 5, :added 0}]}])))))

(deftest pardon-test
  (testing "a pardoned raise is no growth, and the commit's other raises still are"
    (is (= [{:sha "stale", :changes [{:measure :a, :kind :pardon, :delta 3} {:measure :c, :kind :grow, :delta 1}]}
            {:sha "ratchet", :changes [{:measure :d, :kind :pardon, :delta 9}]}]
           (history/pardon
            {:pardons {"stale" {:a 3}, "ratchet" {:d 9}}}
            [{:sha "stale", :changes [{:measure :a, :kind :grow, :delta 3} {:measure :c, :kind :grow, :delta 1}]}
             {:sha "ratchet", :changes [{:measure :d, :kind :grow, :delta 9}]}]))))
  (testing "a shrink that takes a pardoned raise back loses that part, and the credit for it"
    (is (= [{:sha     "tighten"
             :changes [{:measure :a, :kind :shrink, :delta -2}]
             :causes  {:a [{:sha "fix", :delta -2}], :b []}}]
           (history/pardon
            {:pardons {"stale" {:a 3, :b 4}}}
            [{:sha     "tighten"
              :changes [{:measure :a, :kind :shrink, :delta -5} {:measure :b, :kind :shrink, :delta -4}]
              :causes  {:a [{:sha "stale", :delta -3} {:sha "fix", :delta -2}]
                        :b [{:sha "stale", :delta -4}]}}]))))
  (testing "a pardoned commit keeps the credit for what it removed beyond its own raise"
    (is (= [{:sha     "tighten"
             :changes [{:measure :a, :kind :shrink, :delta -2}]
             :causes  {:a [{:sha "stale", :delta -2}]}}]
           (history/pardon
            {:pardons {"stale" {:a 5}}}
            [{:sha     "tighten"
              :changes [{:measure :a, :kind :shrink, :delta -7}]
              :causes  {:a [{:sha "stale", :delta -7}]}}]))))
  (testing "a recount loses its own shrinks as well as its raises"
    (is (= [{:sha     "regroup"
             :changes [{:measure :f, :kind :pardon, :delta 5}]
             :causes  {:e [{:sha "regroup", :delta -4}]}}]
           (history/pardon
            {:pardons {"regroup" {:f 5}}, :recounts #{"regroup"}}
            [{:sha     "regroup"
              :changes [{:measure :e, :kind :shrink, :delta -4} {:measure :f, :kind :grow, :delta 5}]
              :causes  {:e [{:sha "regroup", :delta -4}]}}])))))

(deftest counted-test
  (testing "budgets of linters that are not counted drop out, with the commits that changed nothing else"
    (is (= [{:sha "mixed", :changes [{:measure [:prod :ignore :deprecated-var], :kind :grow, :delta 1}]}]
           (history/counted
            [{:sha "mixed", :changes [{:measure [:prod :ignore :deprecated-var], :kind :grow, :delta 1}
                                      {:measure [:prod :config :metabase/prefer-with-dynamic-fn-redefs]
                                       :kind    :grow
                                       :delta   1}]}
             {:sha "only", :changes [{:measure [:test :ignore :metabase/prefer-with-dynamic-fn-redefs]
                                      :kind    :shrink
                                      :delta   -2}]}])))))

(deftest render-verdicts-test
  (testing "the verdicts file reads back as the verdicts written to it"
    (let [verdicts [{:sha "aaa", :pr 12, :subject "Say \"hi\" (#12)", :verdict :pardon, :why "A stale budget."}
                    {:sha "bbb", :subject "No PR or reason", :verdict :confirm}]]
      (is (= verdicts
             (edn/read-string (history/render-verdicts verdicts)))))))

;;; -------------------------------------------------- Report --------------------------------------------------

(deftest unify-authors-test
  (testing "commits and causes that share an author email take the newest name used with it"
    ;; the older commit has the later clock time, in a zone ahead of UTC
    (let [newer {:sha "new", :email "b@x", :date "2026-10-02T01:00:00Z"}
          older {:sha "old", :email "b@x", :date "2026-10-02T02:30:00+02:00"}
          other {:sha "other", :author "Ada", :email "a@x", :date "2026-09-02T00:00:00Z"}
          as    (fn [author commit] (assoc commit :author author))]
      (is (= [(assoc (as "Bryan Maass" newer) :causes {:a [(as "Bryan Maass" older) other]})
              (as "Bryan Maass" older)]
             (history/unify-authors
              [(assoc (as "Bryan Maass" newer) :causes {:a [(as "bryan" older) other]})
               (as "bryan" older)]))))))

(def ^:private a [:prod :ignore :a])
(def ^:private b [:test :ignore :b])
(def ^:private new-linter [:prod :config :new-linter])

(def ^:private records
  "Three commits, newest first: the automation, a feature that grows one budget and introduces a linter, and a
  commit that lowers a budget by more than anything explains."
  [{:sha         "tighten"
    :author      "automation"
    :subject     "Tighten ratchets"
    :date        "2026-10-06T10:00:00Z"
    :tighten?    true
    :changes     [{:measure a, :kind :shrink, :delta -5} {:measure b, :kind :shrink, :delta -1}]
    :causes      {a [{:sha "fix", :author "Ada", :subject "Fix", :delta -4}]
                  b [{:sha "fix", :author "Ada", :subject "Fix", :delta -2}
                     {:sha "hid", :author "Bob", :subject "Hide", :delta 1}]}
    :unaccounted {a -1}}
   {:sha     "feature"
    :author  "Bob"
    :subject "Feature"
    :date    "2026-10-05T10:00:00Z"
    :changes [{:measure a, :kind :grow, :delta 3, :added 3, :old 4, :new 7}
              {:measure new-linter, :kind :introduce, :old nil, :new 9}]}
   {:sha         "recount"
    :author      "Cy"
    :subject     "Count fewer things"
    :date        "2026-09-30T23:00:00Z"
    :changes     [{:measure b, :kind :shrink, :delta -7, :old 9, :new 2}]
    :causes      {b [{:sha "recount", :author "Cy", :subject "Count fewer things", :delta -2}]}
    :unaccounted {b -5}}])

(deftest attribution-test
  (testing "credits a shrink to its causes, a grow to its commit, and the unexplained rest to the commit that shrank"
    (is (= {:totals      {a {:shrink -5, :grow 3}, b {:shrink -8}}
            :by-commit   [["recount" -7] ["fix" -6] ["hid" 1] ["feature" 3]]
            :leaderboard [[nil true -1 0 -1 0 0]
                          ["Ada" nil -6 0 -6 0 0]
                          ["Bob" nil 0 4 4 1 9]
                          ["Cy" nil -7 0 -7 0 0]]}
           {:totals      (history/totals records)
            :by-commit   (map (juxt :sha :net) (history/by-commit (history/attributions records)))
            :leaderboard (map (juxt :author :unattributed? :shrunk :grown :net :linters :ignores)
                              (history/leaderboard records))}))))

(deftest pardoned-shrink-test
  (testing "a shrink that is a net raise once a pardoned raise is taken out of it still goes to its causes"
    (is (= [["hid" "Bob" 3]]
           (map (juxt :sha :author :delta)
                (history/attributions
                 (history/pardon
                  {:pardons {"stale" {a 5}}}
                  [{:sha      "tighten"
                    :author   "automation"
                    :tighten? true
                    :changes  [{:measure a, :kind :shrink, :delta -2}]
                    :causes   {a [{:sha "hid", :author "Bob", :delta 3}
                                  {:sha "stale", :author "Cy", :delta -5}]}}])))))))

(deftest report-test
  (testing "names measures and picks out the commits behind the biggest changes"
    (is (= {:commits     3
            :total       {:shrunk -13, :grown 3, :net -10}
            :totals      [[":b (test)" -8 0 -8] [":a" -5 3 -2]]
            :best        ["recount" -7 [{:measure ":b (test)", :delta -7}]]
            :worst       ["feature" 3 [{:measure ":a", :delta 3}]]
            :introduced  [["feature" [{:measure ":new-linter (config)", :budget "9"}]]]
            :unaccounted [["tighten" [{:measure ":a", :delta -1}]]]
            :suspects    []}
           (let [report  (history/report {:settled #{}} records)
                 biggest (juxt (comp :sha :commit) :net :measures)
                 groups  (partial map (juxt (comp :sha :commit) :items))]
             (-> (select-keys report [:commits :total])
                 (assoc :totals      (map (juxt :measure :shrunk :grown :net) (:totals report))
                        :best        (biggest (:best report))
                        :worst       (biggest (:worst report))
                        :introduced  (groups (:introduced report))
                        :unaccounted (groups (:unaccounted report))
                        :suspects    (groups (:suspects report)))))))))

(deftest approximate-credit-test
  (testing "names the measures that are budgeted per symbol, whose credit is approximate"
    (is (= [":discouraged-namespace (test)" ":discouraged-var"]
           (:approximate
            (history/report
             {:settled #{}}
             [{:sha     "mixed"
               :author  "Ada"
               :changes [{:measure [:prod :ignore :discouraged-var], :kind :grow, :delta 1, :added 1}
                         {:measure [:test :ignore :discouraged-namespace], :kind :grow, :delta 2, :added 2}
                         {:measure a, :kind :grow, :delta 3, :added 3}]}]))))))

(deftest series-test
  (testing "gives each commit's counted change and the total budget after it, oldest first"
    (is (= [["seed" 0 0 5] ["mixed" 0 0 9] ["tighten" -2 0 7]]
           (map (juxt :sha :shrunk :grown :level)
                (history/series
                 {:pardons {"seed" {a 5}}}
                 [{:sha "tighten", :changes [{:measure a, :kind :shrink, :delta -2, :old 5, :new 3}]}
                  {:sha     "mixed"
                   :changes [{:measure [:prod :ignore :discouraged-var], :kind :introduce, :key :x/y, :new 4}
                             {:measure [:prod :ignore :metabase/prefer-with-dynamic-fn-redefs]
                              :kind    :grow
                              :delta   8
                              :old     1
                              :new     9}]}
                  {:sha "seed", :changes [{:measure a, :kind :grow, :delta 5, :old nil, :new 5}]}]))))))

(deftest periods-test
  (testing "covers all time, then each week from its Monday and each month, back to the first commit"
    (is (= [["all" "All time" nil nil 3 -10]
            ["week-2026-10-05" "5 Oct to 11 Oct 2026" "2026-10-05" "2026-10-12" 2 -3]
            ["week-2026-09-28" "28 Sep to 4 Oct 2026" "2026-09-28" "2026-10-05" 1 -7]
            ["month-2026-10" "October 2026" "2026-10-01" "2026-11-01" 2 -3]
            ["month-2026-09" "September 2026" "2026-09-01" "2026-10-01" 1 -7]]
           (map (juxt :id :label :from :to (comp :commits :report) (comp :net :total :report))
                (history/periods {:settled #{}} "2026-10-10" records))))))

(deftest script-json-test
  (testing "data that could end or hide the end of a script element reads back unchanged, with no `<` in it"
    (let [data {:subject "<!--<script> and </script>"}
          text (history/script-json data)]
      (is (= [false data]
             [(str/includes? text "<") (json/read-str text)])))))

;;; ------------------------------------------------- Terminal -------------------------------------------------

(defn- headlines
  "The lines of `lines` that are not indented or blank: the title and the section headings."
  [lines]
  (remove #(or (str/blank? %) (str/starts-with? % " ")) lines))

(deftest summary-test
  (binding [c/*disable-colors* true]
    (let [lines (history/summary "of all time" (history/report {:settled #{}} records))]
      (testing "has a section for each part of the report that holds something"
        (is (= ["Ratchet changes of all time: 3 commits"
                "Total deltas"
                "Biggest improvement"
                "Biggest regression"
                "New linters"
                "Most shrunk"
                "Most grown"
                "Net, from most shrunk to most grown"
                "Most introduced, by the ignores the new linters started with"
                "Shrinks no commit accounts for"]
               (headlines lines))))
      (testing "ranks authors by net change and names what no commit explains"
        (is (= ["                shrunk  grown  net"
                "Cy                  -7      0   -7"
                "Ada                 -6      0   -6"
                "(unattributed)      -1      0   -1"
                "Bob                  0     +4   +4"]
               (->> lines
                    (drop-while #(not= "Net, from most shrunk to most grown" %))
                    rest
                    (take-while #(str/starts-with? % " "))
                    (map #(subs % 2)))))))))

;;; ---------------------------------------------------- Task --------------------------------------------------

(defn- exits?
  "Does asking for `since` and `options` make the task exit?"
  [[since options]]
  (try
    (with-out-str (history/request since options))
    false
    (catch clojure.lang.ExceptionInfo e
      (some? (:babashka/exit (ex-data e))))))

(deftest request-test
  (testing "reads what to do from the commit and the options"
    (is (= [[:days 7] [:days 3] [:all] [:since "abc"] [:html "page.html"] [:verdict [:recount "12"]]]
           (map (fn [[since options]] (history/request since options))
                [[nil {}]
                 [nil {:days 3}]
                 [nil {:all true}]
                 ["abc" {}]
                 [nil {:html "page.html"}]
                 [nil {:recount "12", :why "The same ignores."}]]))))
  (testing "exits when asked for two things at once, or for a reason with no verdict"
    (is (= [true true true true]
           (map exits? [[nil {:all true, :days 3}]
                        ["abc" {:html "page.html"}]
                        [nil {:pardon "12", :confirm "13"}]
                        [nil {:days 3, :why "No verdict to explain."}]])))))
