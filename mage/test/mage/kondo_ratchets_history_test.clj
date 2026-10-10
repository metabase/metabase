(ns mage.kondo-ratchets-history-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.kondo-ratchets-history :as history]))

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
           (changes {:prod {:ignore-counts {:capped :unlimited, :grown 1, :shrunk 5, :uncapped 9, :same 1}
                            :config-counts {:shrunk 2}}}
                    {:prod {:ignore-counts {:capped 4, :first-budget 6, :grown 3, :new-linter 7, :shrunk 2,
                                            :uncapped :unlimited, :same 1}}}
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

(def ^:private records
  [{:sha "tighten", :author "automation", :subject "Tighten ratchets", :tighten? true
    :changes     [{:measure :a, :kind :shrink, :delta -5} {:measure :b, :kind :shrink, :delta -1}]
    :causes      {:a [{:sha "fix", :author "Ada", :delta -4}]
                  :b [{:sha "fix", :author "Ada", :delta -2} {:sha "hid", :author "Bob", :delta 1}]}
    :unaccounted {:a -1}}
   {:sha "feature", :author "Bob", :subject "Feature"
    :changes [{:measure :a, :kind :grow, :delta 3} {:measure :c, :kind :introduce, :new 9}]}
   {:sha "recount", :author "Cy", :subject "Count fewer things"
    :changes     [{:measure :b, :kind :shrink, :delta -7}]
    :causes      {:b [{:sha "recount", :author "Cy", :delta -2}]}
    :unaccounted {:b -5}}])

(deftest summary-data-test
  (testing "a shrink is credited to its causes, with what they leave unexplained going to the commit that
           lowered the budget unless it only tightened, and a grow to the commit that raised the budget"
    (is (= {:totals      {:a {:shrink -5, :grow 3}, :b {:shrink -8}}
            :by-commit   [["recount" -7] ["fix" -6] ["hid" 1] ["feature" 3]]
            :leaderboard [["(unattributed)" -1 0 -1 0 0] ["Ada" -6 0 -6 0 0] ["Bob" 0 4 4 1 9] ["Cy" -7 0 -7 0 0]]}
           {:totals      (history/totals records)
            :by-commit   (map (juxt :sha :net) (history/by-commit (history/attributions records)))
            :leaderboard (map (juxt :author :shrunk :grown :net :linters :ignores) (history/leaderboard records))}))))

(deftest counted-test
  (testing "budgets of linters that are not counted drop out, with the commits that changed nothing else"
    (is (= [{:sha "mixed", :changes [{:measure [:prod :ignore :deprecated-var], :kind :grow, :delta 1}]}]
           (history/counted
            [{:sha "mixed", :changes [{:measure [:prod :ignore :deprecated-var], :kind :grow, :delta 1}
                                      {:measure [:prod :config :metabase/prefer-with-dynamic-fn-redefs]
                                       :kind    :grow, :delta 1}]}
             {:sha "only", :changes [{:measure [:test :ignore :metabase/prefer-with-dynamic-fn-redefs]
                                      :kind    :shrink, :delta -2}]}])))))

(deftest pardon-test
  (testing "a pardoned raise is no growth, and the shrink that takes it back is no shrink and credits nobody"
    (is (= [{:sha     "tighten"
             :changes [{:measure :a, :kind :shrink, :delta -2}]
             :causes  {:a [{:sha "fix", :delta -2}], :b []}}
            {:sha "stale", :changes [{:measure :a, :kind :pardon, :delta 3} {:measure :c, :kind :grow, :delta 1}]}
            {:sha "ratchet", :changes [{:measure :d, :kind :pardon, :delta 9}]}]
           (history/pardon
            {"stale" #{:a :b}, "ratchet" :all}
            [{:sha     "tighten"
              :changes [{:measure :a, :kind :shrink, :delta -5} {:measure :b, :kind :shrink, :delta -4}]
              :causes  {:a [{:sha "stale", :delta -3} {:sha "fix", :delta -2}]
                        :b [{:sha "stale", :delta -4}]}}
             {:sha "stale", :changes [{:measure :a, :kind :grow, :delta 3} {:measure :c, :kind :grow, :delta 1}]}
             {:sha "ratchet", :changes [{:measure :d, :kind :grow, :delta 9}]}])))))

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

(deftest periods-test
  (testing "covers all time, then each week from its Monday and each month, back to the first commit"
    (is (= [["all" "All time" 2 -1]
            ["week-2026-10-05" "5 Oct to 11 Oct 2026" 1 2]
            ["week-2026-09-28" "28 Sep to 4 Oct 2026" 1 -3]
            ["month-2026-10" "October 2026" 1 2]
            ["month-2026-09" "September 2026" 1 -3]]
           (map (juxt :id :label (comp :commits :report) (comp :net :total :report))
                (history/periods
                 {:pardons {}, :settled #{}}
                 "2026-10-10"
                 [{:sha "new", :date "2026-10-06T10:00:00Z", :author "Ada"
                   :changes [{:measure [:prod :ignore :a], :kind :grow, :delta 2, :added 2}]}
                  {:sha "old", :date "2026-09-30T23:00:00Z", :author "Bob"
                   :changes [{:measure [:prod :ignore :a], :kind :shrink, :delta -3}]
                   :causes  {[:prod :ignore :a] [{:sha "old", :author "Bob", :delta -3}]}}]))))))

(deftest unify-authors-test
  (testing "commits and causes that share an author email take the newest name used with it"
    (is (= [{:sha "new", :author "Bryan Maass", :email "b@x", :date "2026-10-02"
             :causes {:a [{:sha "old", :author "Bryan Maass", :email "b@x", :date "2026-09-01", :delta -1}
                          {:sha "other", :author "Ada", :email "a@x", :date "2026-09-02", :delta -2}]}}
            {:sha "old", :author "Bryan Maass", :email "b@x", :date "2026-09-01"}]
           (history/unify-authors
            [{:sha "new", :author "Bryan Maass", :email "b@x", :date "2026-10-02"
              :causes {:a [{:sha "old", :author "bryan", :email "b@x", :date "2026-09-01", :delta -1}
                           {:sha "other", :author "Ada", :email "a@x", :date "2026-09-02", :delta -2}]}}
             {:sha "old", :author "bryan", :email "b@x", :date "2026-09-01"}])))))
