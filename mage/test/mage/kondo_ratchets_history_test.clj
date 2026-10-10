(ns mage.kondo-ratchets-history-test
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [babashka.process :as p]
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
                          {:new-measure? (comp added peek)
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
  (testing "the first budgets of a new ratchet file or a new kind of budget are seeds, unless the linter is new"
    (is (= [{:measure [:modules :module :uses-any], :old nil, :new 4, :kind :seed}
            {:measure [:prod :config :existing], :old nil, :new 2, :kind :seed}
            {:measure [:prod :config :new-linter], :old nil, :new 3, :kind :introduce}]
           (changes {:prod {:ignore-counts {:existing 5}}}
                    {:prod    {:ignore-counts {:existing 5}, :config-counts {:existing 2, :new-linter 3}}
                     :modules {:uses-any 4}}
                    #{:new-linter}))))
  (testing "a first budget in a ratchet that exists but holds nothing yet is growth, not a seed"
    (is (= [{:measure [:prod :config :existing], :old nil, :new 2, :kind :grow, :delta 2}]
           (changes {:prod {:ignore-counts {}, :config-counts {}}}
                    {:prod {:ignore-counts {}, :config-counts {:existing 2}}}
                    #{}))))
  (testing "a newly discouraged symbol is an introduction, and the rest of its linter's budget still moves"
    (is (= [{:measure [:prod :ignore :discouraged-var], :kind :introduce, :key :clojure.core/eval, :new 6}
            {:measure     [:prod :ignore :discouraged-var]
             :old         3
             :new         2
             :per-symbol? true
             :kind        :shrink
             :delta       -1}]
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

(def ^:private a* [:prod :ignore :a])

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
  (testing "a pardoned raise is taken back once, by the oldest shrinks after it"
    (is (= [[:shrink -4 [{:sha "stale", :delta -3} {:sha "fix", :delta -1}]] nil nil]
           (map (fn [{:keys [changes causes]}]
                  (when-let [{:keys [kind delta]} (first changes)]
                    [kind delta (:a causes)]))
                (history/pardon
                 {:pardons {"stale" {:a 5}}}
                 ;; newest first: the raise of 5 comes back as 2 and then 3
                 ;; what the same commit explains after that is a real removal
                 [{:sha     "third"
                   :changes [{:measure :a, :kind :shrink, :delta -4}]
                   :causes  {:a [{:sha "stale", :delta -3} {:sha "fix", :delta -1}]}}
                  {:sha     "second"
                   :changes [{:measure :a, :kind :shrink, :delta -3}]
                   :causes  {:a [{:sha "stale", :delta -3}]}}
                  {:sha     "first"
                   :changes [{:measure :a, :kind :shrink, :delta -2}]
                   :causes  {:a [{:sha "stale", :delta -2}]}}])))))
  (testing "a recount keeps no credit for a later shrink, even of a budget it did not raise"
    (is (= [{:sha "tighten", :changes [], :causes {:a []}}]
           (history/pardon
            {:pardons {"regroup" {:f 5}}, :recounts #{"regroup"}}
            [{:sha     "tighten"
              :changes [{:measure :a, :kind :shrink, :delta -4}]
              :causes  {:a [{:sha "regroup", :delta -4}]}}]))))
  (testing "a recount loses its own shrinks as well as its raises"
    (is (= [{:sha     "regroup"
             :changes [{:measure :f, :kind :pardon, :delta 5}]
             :causes  {:e [{:sha "regroup", :delta -4}]}}]
           (history/pardon
            {:pardons {"regroup" {:f 5}}, :recounts #{"regroup"}}
            [{:sha     "regroup"
              :changes [{:measure :e, :kind :shrink, :delta -4} {:measure :f, :kind :grow, :delta 5}]
              :causes  {:e [{:sha "regroup", :delta -4}]}}])))))

(deftest slack-test
  (let [raise   (fn [sha delta added] {:sha sha, :changes [{:measure a*, :kind :grow, :delta delta, :added added}]})
        tighten (fn [sha delta cause]
                  {:sha      sha
                   :tighten? true
                   :changes  [{:measure a*, :kind :shrink, :delta delta}]
                   :causes   {a* [{:sha cause, :delta delta}]}})
        kinds   (fn [records]
                  (for [{:keys [sha changes doubted]} records]
                    [sha (map (juxt :kind :delta :slack) changes) (boolean doubted)]))]
    (testing "a raise that nothing used and a later commit took back is slack, and neither side counts"
      (is (= [["stale" [[:slack 8 nil]] false]]
             (kinds (history/settle {:settled #{}} [(tighten "tighten" -8 "stale") (raise "stale" 8 0)])))))
    (testing "only the part that was taken back is slack; what was added is growth, and the rest is still doubted"
      (is (= [["mixed" [[:grow 3 2]] true]]
             (kinds (history/settle {:settled #{}} [(tighten "tighten" -2 "mixed") (raise "mixed" 5 1)])))))
    (testing "a raise nobody has taken back yet stays growth and is doubted"
      (is (= [["fresh" [[:grow 8 nil]] true]]
             (kinds (history/settle {:settled #{}} [(raise "fresh" 8 0)])))))
    (testing "a commit that removed suppressions while raising the budget gives back the raise as slack, and
             keeps the credit for what it removed"
      (is (= [["tighten" [[:shrink -3 nil]] false] ["odd" [[:slack 5 nil]] false]]
             (kinds (history/settle {:settled #{}} [(tighten "tighten" -8 "odd") (raise "odd" 5 -3)])))))
    (testing "a raise of a budget kept per symbol is never slack or doubted, since its count is approximate"
      (is (= [["tighten" [[:shrink -1 nil]] false] ["symbols" [[:grow 2 nil]] false]]
             (kinds (history/settle {:settled #{}}
                                    [(tighten "tighten" -1 "symbols")
                                     (update-in (raise "symbols" 2 1) [:changes 0] assoc :per-symbol? true)])))))
    (testing "a raise by the commit that repaired a broken ratchet file is never slack or doubted"
      (is (= [["tighten" [[:shrink -8 nil]] false] ["repair" [[:grow 8 nil]] false]]
             (kinds (history/settle {:settled #{}}
                                    [(tighten "tighten" -8 "repair")
                                     (update-in (raise "repair" 8 0) [:changes 0] assoc :bridged? true)])))))
    (testing "a confirmed raise is left as growth, and its return as a shrink"
      (is (= [["tighten" [[:shrink -8 nil]] false] ["kept" [[:grow 8 nil]] false]]
             (kinds (history/settle {:settled #{"kept"}} [(tighten "tighten" -8 "kept") (raise "kept" 8 0)])))))))

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
           (let [report  (history/report (history/settle {:settled #{}} records))
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
             [{:sha     "mixed"
               :author  "Ada"
               :changes [{:measure [:prod :ignore :discouraged-var], :kind :grow, :delta 1, :per-symbol? true}
                         {:measure [:test :ignore :discouraged-namespace], :kind :shrink, :delta -2, :per-symbol? true}
                         ;; exact: a config-level budget, and a flat one from before per-symbol budgets
                         {:measure [:prod :config :discouraged-var], :kind :grow, :delta 4}
                         {:measure [:test :ignore :discouraged-var], :kind :grow, :delta 5}
                         {:measure a, :kind :grow, :delta 3}]}]))))))

(deftest series-test
  (testing "gives each commit's counted change and the total budget after it, oldest first"
    (let [records [{:sha "tighten", :changes [{:measure a, :kind :shrink, :delta -2, :old 5, :new 3}]}
                   {:sha     "mixed"
                    :changes [{:measure [:prod :ignore :discouraged-var], :kind :introduce, :key :x/y, :new 4}
                              {:measure [:prod :ignore :metabase/prefer-with-dynamic-fn-redefs]
                               :kind    :grow
                               :delta   8
                               :old     1
                               :new     9}]}
                   {:sha "seed", :changes [{:measure a, :kind :grow, :delta 5, :old nil, :new 5}]}]
          settled (history/settle {:pardons {"seed" {a 5}}, :settled #{}} records)]
      (is (= [["seed" 0 0 5] ["mixed" 0 0 9] ["tighten" -2 0 7]]
             (map (juxt :sha :shrunk :grown :level) (history/series records settled)))))))

(deftest periods-test
  (testing "covers all time, then each week from its Monday and each month, back to the first commit"
    (is (= [["all" "All time" nil nil 3 -10]
            ["week-2026-10-05" "5 Oct to 11 Oct 2026" "2026-10-05" "2026-10-12" 2 -3]
            ["week-2026-09-28" "28 Sep to 4 Oct 2026" "2026-09-28" "2026-10-05" 1 -7]
            ["month-2026-10" "October 2026" "2026-10-01" "2026-11-01" 2 -3]
            ["month-2026-09" "September 2026" "2026-09-01" "2026-10-01" 1 -7]]
           (map (juxt :id :label :from :to (comp :commits :report) (comp :net :total :report))
                (history/periods "2026-10-10" (history/settle {:settled #{}} records)))))))

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
    (let [lines (history/summary "of all time" (history/report (history/settle {:settled #{}} records)))]
      (testing "has a section for each part of the report that holds something"
        (is (= ["Ratchet changes of all time: 3 commits"
                "Total deltas"
                "Biggest improvement"
                "Biggest regression"
                "New linters and measures"
                "Most shrunk"
                "Most grown"
                "Net, from most shrunk to most grown"
                "Most introduced, by the budgets the new linters and measures started with"
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

;;; ---------------------------------------------- Against a repository ----------------------------------------

(def ^:private isolated
  "Environment that keeps the user's and the system's git configuration out of the fixture."
  {"GIT_CONFIG_GLOBAL" "/dev/null", "GIT_CONFIG_NOSYSTEM" "1"})

(defn- commit!
  "Write `files`, a map from path to content, in the repository at `dir` and commit them as `author` on `day` of
  September 2026."
  [dir author day subject files]
  (doseq [[path content] files]
    (fs/create-dirs (fs/parent (fs/path dir path)))
    (spit (str (fs/path dir path)) content))
  (let [date  (format "2026-09-%02dT10:00:00Z" day)
        email (str (str/lower-case author) "@example.com")
        git   (fn [& args]
                (apply p/shell {:dir       (str dir)
                                :out       :string
                                :err       :string
                                :extra-env (merge isolated
                                                  {"GIT_AUTHOR_NAME"     author
                                                   "GIT_AUTHOR_EMAIL"    email
                                                   "GIT_AUTHOR_DATE"     date
                                                   "GIT_COMMITTER_NAME"  author
                                                   "GIT_COMMITTER_EMAIL" email
                                                   "GIT_COMMITTER_DATE"  date})}
                       "git" "-c" "commit.gpgsign=false" "-c" "core.hooksPath=/dev/null" args))]
    (git "add" "-A")
    (git "commit" "-q" "-m" subject)))

(defn- with-repo!
  "Call `f` with a [[history/repo]] over a new repository holding `commits`, then delete it.
  Each commit is `[author day subject files]`, as [[commit!]] takes them."
  [commits f]
  (let [root (fs/create-temp-dir {:prefix "ratchets-history"})
        dir  (fs/create-dirs (fs/path root "repo"))]
    (try
      (p/shell {:dir (str dir), :out :string, :extra-env isolated} "git" "init" "-q" "-b" "master")
      (doseq [[author day subject files] commits]
        (commit! dir author day subject files))
      (f (history/repo {:dir      (str dir)
                        :cache    (fs/path root "cache")
                        :verdicts (fs/file (str root) "verdicts.edn")
                        :env      isolated}))
      (finally
        (fs/delete-tree root)))))

(defn- lines [& lines]
  (str (str/join "\n" lines) "\n"))

(def ^:private ratchets ".clj-kondo/ratchets.edn")

(def ^:private story
  "Chris adds a ratchet over three ignores. Ada removes an ignore, and Bob edits only the continuation line of a
  multi-line ignore to drop a linter. The automation tightens. Cy raises one budget by 2 for 1 new ignore and
  gives another linter a first budget of 5 for no ignores at all. The automation tightens again."
  (let [source "src/app/a.clj"]
    [["Chris" 1 "Add ratchets (#1)"
      {ratchets "{:ignore-counts {:deprecated-var 2, :unused-binding 1}}\n"
       source   (lines "(ns app.a)"
                       "#_{:clj-kondo/ignore [:deprecated-var]}"
                       "(a)"
                       "#_{:clj-kondo/ignore [:deprecated-var"
                       "                      :unused-binding]}"
                       "(b)")}]
     ["Ada" 2 "Stop using a (#2)"
      {source (lines "(ns app.a)"
                     "(a)"
                     "#_{:clj-kondo/ignore [:deprecated-var"
                     "                      :unused-binding]}"
                     "(b)")}]
     ["Bob" 3 "Use the binding (#3)"
      {source (lines "(ns app.a)"
                     "(a)"
                     "#_{:clj-kondo/ignore [:deprecated-var"
                     "                      ]}"
                     "(b)")}]
     ["automation" 4 "Tighten ratchets (#4)"
      {ratchets "{:ignore-counts {:deprecated-var 1}}\n"}]
     ["Cy" 5 "Add a feature (#5)"
      {ratchets        "{:ignore-counts {:deprecated-var 3, :type-mismatch 5}}\n"
       "src/app/b.clj" (lines "(ns app.b)" "#_{:clj-kondo/ignore [:deprecated-var]}" "(c)")}]
     ["automation" 6 "Tighten ratchets (#6)"
      {ratchets "{:ignore-counts {:deprecated-var 2}}\n"}]]))

(defn- with-fixture-repo! [f]
  (with-repo! story f))

(def ^:private deprecated [:prod :ignore :deprecated-var])
(def ^:private mismatch [:prod :ignore :type-mismatch])
(def ^:private unused [:prod :ignore :unused-binding])

(deftest records-test
  (testing "reads a repository's history: seeds, tightens credited to the commits before them, and raises"
    (is (= [[6 "automation" true
             [[:shrink deprecated -1 nil] [:shrink mismatch -5 nil]]
             ;; both only take back what Cy's commit raised beyond what it added
             {deprecated [["Cy" 5 -1]], mismatch [["Cy" 5 -5]]}]
            ;; a first budget in a ratchet that already existed is growth
            [5 "Cy" nil [[:grow deprecated 2 1] [:grow mismatch 5 0]] {}]
            [4 "automation" true
             [[:shrink deprecated -1 nil] [:shrink unused -1 nil]]
             ;; Bob's commit touched no line that names the ignore marker
             {deprecated [["Ada" 2 -1]], unused [["Bob" 3 -1]]}]
            [1 "Chris" nil [[:seed deprecated nil nil] [:seed unused nil nil]] {}]]
           (with-fixture-repo!
             (fn [repo]
               (vec (for [{:keys [pr author tighten? changes causes]} (history/records repo)]
                      [pr author tighten?
                       (map (juxt :kind :measure :delta :added) changes)
                       (update-vals (or causes {}) #(map (juxt :author :pr :delta) %))]))))))))

(deftest run-test
  (binding [c/*disable-colors* true]
    (with-fixture-repo!
      (fn [repo]
        (let [summary #(str/split-lines (with-out-str (history/run repo {:options {:all true}, :arguments []})))
              total   (fn [lines] (some #(when (str/starts-with? % "  total ") (str/split (str/trim %) #"\s+")) lines))
              warned? (fn [lines] (boolean (some #{"Raises beyond the suppressions added, with no verdict"} lines)))]
          (testing "counts the ignore that was added as growth, and the spare budget that was taken back as nothing"
            (is (= [["total" "-2" "+1" "-1"] false]
                   ((juxt total warned?) (summary)))))
          (testing "a verdict on a PR that changed no ratchet file is refused"
            (is (= 1
                   (try
                     (with-out-str
                       (history/run repo {:options {:pardon "2", :why "Not a ratchet commit."}, :arguments []}))
                     (catch clojure.lang.ExceptionInfo e
                       (:babashka/exit (ex-data e)))))))
          (testing "a pardon, given by PR number, is recorded and takes out the raises and what took them back"
            (with-out-str (history/run repo {:options {:pardon "5", :why "A stale budget."}, :arguments []}))
            (is (= {:verdicts [[5 "Add a feature (#5)" :pardon "A stale budget."]]
                    :total    ["total" "-2" "0" "-2"]
                    :warned?  false}
                   {:verdicts (map (juxt :pr :subject :verdict :why) (edn/read-string (slurp (:verdicts-file repo))))
                    :total    (total (summary))
                    :warned?  (warned? (summary))}))))))))

(deftest unreadable-ratchet-test
  (testing "a ratchet file that does not parse is unreadable, with a warning"
    (let [err (java.io.StringWriter.)]
      (is (= [::history/unreadable true]
             [(binding [*err* err]
                (#'history/read-ratchet "abc123" ".clj-kondo/ratchets.edn" "{:ignore-counts {:a 1}"))
              (str/includes? (str err) "WARNING: .clj-kondo/ratchets.edn at abc123 does not parse")]))))
  (testing "nothing changes across an unreadable ratchet file, in either direction"
    (is (= [[] []]
           [(changes {:prod ::history/unreadable} {:prod {:ignore-counts {:a 1}}} #{})
            (changes {:prod {:ignore-counts {:a 1}}} {:prod ::history/unreadable} #{})]))))

(deftest unreadable-gap-and-module-measure-test
  (testing "the commit that repairs a broken ratchet file carries what changed across it, and a module measure
           is new only when the commit also adds what counts it"
    (let [counter "dev/src/dev/kondo_ratchet.clj"
          modules ".clj-kondo/config/modules/ratchets.edn"]
      (is (= [[4 "Cy" [[:introduce [:modules :module :ns-prefixes] nil nil]
                       [:seed [:modules :module :uses-any] nil nil]]]
              [3 "Bob" [[:grow [:prod :ignore :a] 3 true]]]
              [2 "Ada" []]
              [1 "Chris" [[:seed [:prod :ignore :a] nil nil]]]]
             (binding [*err* (java.io.StringWriter.)]
               (with-repo!
                 [["Chris" 1 "Add a ratchet (#1)"
                   {ratchets "{:ignore-counts {:a 2}}\n"
                    counter  "{:uses-any (count uses)}\n"}]
                  ["Ada" 2 "Break the ratchet file (#2)"
                   {ratchets "{:ignore-counts {:a 2\n"}]
                  ["Bob" 3 "Repair it, with a raise (#3)"
                   {ratchets "{:ignore-counts {:a 5}}\n"}]
                  ["Cy" 4 "Ratchet the modules (#4)"
                   {modules "{:ns-prefixes 3, :uses-any 1}\n"
                    counter "{:uses-any (count uses), :ns-prefixes (count prefixes)}\n"}]]
                 (fn [repo]
                   (vec (for [{:keys [pr author changes]} (history/records repo)]
                          [pr author (map (juxt :kind :measure :delta :bridged?) changes)]))))))))))

(deftest newly-discouraged-symbol-test
  (testing "the first budget of a newly discouraged symbol is where it starts, not slack that a shrink takes back"
    (let [config ".clj-kondo/config.edn"
          ignore "#_{:clj-kondo/ignore [:discouraged-var]}"
          source (fn [& forms] (apply lines "(ns app.a)" (interleave (repeat ignore) forms)))
          budget (fn [counts] (str {:ignore-counts {}, :discouraged-var-counts counts} "\n"))]
      (is (= [[4 [[:shrink nil]] {[:prod :ignore :discouraged-var] [["Bob" 2 -1]]}]
              [3 [[:introduce :clojure.core/eval]] {}]]
             (with-repo!
               [["Chris" 1 "Add a ratchet (#1)"
                 {ratchets        (budget {:clojure.core/prn 2})
                  config          "{:linters {:discouraged-var {clojure.core/prn {}}}}\n"
                  "src/app/a.clj" (source "(prn 1)" "(prn 2)" "(eval 1)")}]
                ["Bob" 2 "Stop one prn (#2)"
                 {"src/app/a.clj" (source "(prn 1)" "(eval 1)")}]
                ["Ada" 3 "Discourage eval (#3)"
                 {ratchets (budget {:clojure.core/prn 2, :clojure.core/eval 1})
                  config   "{:linters {:discouraged-var {clojure.core/prn {}, clojure.core/eval {}}}}\n"}]
                ["automation" 4 "Tighten ratchets (#4)"
                 {ratchets (budget {:clojure.core/prn 1, :clojure.core/eval 1})}]]
               (fn [repo]
                 (vec (for [{:keys [pr changes causes]} (take 2 (history/records repo))]
                        [pr
                         (map (juxt :kind :key) changes)
                         (update-vals (or causes {}) #(map (juxt :author :pr :delta) %))])))))))))
