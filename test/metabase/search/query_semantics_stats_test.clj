(ns metabase.search.query-semantics-stats-test
  "Checks of how the search engines' results relate, and how closely they match the correct results.
  The corpus is hand-picked, so these numbers say nothing about production traffic or ranking quality."
  (:require
   [clojure.test :refer :all]
   [metabase.search.query-semantics :as fixtures]
   [metabase.search.query-semantics-stats :as stats]))

(deftest result-set-relation-test
  (are [expected left right] (= expected (stats/relation left right))
    :equal         #{}      #{}
    :equal         #{:A :B} #{:B :A}
    :left-superset #{:A :B} #{:A}
    :left-subset   #{:A}    #{:A :B}
    :incomparable  #{:A :B} #{:B :C}))

(deftest correct-score-test
  (are [expected correct hits] (= expected (stats/score correct hits))
    {:precision 1,   :recall 1,   :f1 1}   #{}      #{}
    {:precision 0,   :recall 0,   :f1 0}   #{:A}    #{}
    {:precision 0,   :recall 0,   :f1 0}   #{}      #{:A}
    {:precision 1,   :recall 1/2, :f1 2/3} #{:A :B} #{:A}
    {:precision 1/2, :recall 1,   :f1 2/3} #{:A}    #{:A :B}
    {:precision 0,   :recall 0,   :f1 0}   #{:A}    #{:B}))

(deftest translated-comparisons-change-a-query-test
  (doseq [{:keys [scenario-id focus specs]} (stats/translation-rows fixtures/cases)]
    (is (< 1 (count (set (map (comp :query specs) stats/engines))))
        (str scenario-id " / " focus " does not adapt any query"))))

(deftest alternatives-score-no-worse-test
  ;; An adapted query that scores below the scenario query would understate the engine.
  (doseq [{:keys [id comparisons] :as scenario} fixtures/cases
          {:keys [focus correct alternatives]}    comparisons
          :let [f1 #(:f1 (stats/score (set correct) (set %)))]
          [engine {:keys [hits]}]                 alternatives]
    (is (<= (f1 (fixtures/expected-hits scenario engine)) (f1 hits))
        (str id " / " focus " / " (name engine) " scores worse than the scenario query"))))

(deftest corpus-statistics-test
  (let [{:keys [same-query translations]} (stats/summary fixtures/cases)]
    (testing "same query, with pairwise direction relative to the first engine"
      (is (= {:count     56
              :all-equal 9
              :mean-hits {:in-place       18/7
                          :appdb-h2       19/14
                          :appdb-postgres 43/28
                          :semantic       139/56}
              :pairwise  {[:in-place :appdb-h2]       {:equal 30, :left-superset 26, :left-subset 0,  :incomparable 0}
                          [:in-place :appdb-postgres] {:equal 14, :left-superset 33, :left-subset 6,  :incomparable 3}
                          [:in-place :semantic]       {:equal 18, :left-superset 22, :left-subset 13, :incomparable 3}
                          [:appdb-h2 :appdb-postgres] {:equal 25, :left-superset 13, :left-subset 15, :incomparable 3}
                          [:appdb-h2 :semantic]       {:equal 13, :left-superset 10, :left-subset 30, :incomparable 3}
                          [:appdb-postgres :semantic] {:equal 17, :left-superset 6,  :left-subset 31, :incomparable 2}}}
             same-query)))
    (testing "translated queries, scored against each comparison's correct result set"
      (is (= {:count     20
              :all-equal 2
              :mean-hits {:in-place       69/20
                          :appdb-h2       59/20
                          :appdb-postgres 13/5
                          :semantic       17/5}
              :pairwise  {[:in-place :appdb-h2]       {:equal 10, :left-superset 10, :left-subset 0,  :incomparable 0}
                          [:in-place :appdb-postgres] {:equal 6,  :left-superset 14, :left-subset 0,  :incomparable 0}
                          [:in-place :semantic]       {:equal 10, :left-superset 5,  :left-subset 2,  :incomparable 3}
                          [:appdb-h2 :appdb-postgres] {:equal 8,  :left-superset 8,  :left-subset 4,  :incomparable 0}
                          [:appdb-h2 :semantic]       {:equal 7,  :left-superset 3,  :left-subset 8,  :incomparable 2}
                          [:appdb-postgres :semantic] {:equal 8,  :left-superset 1,  :left-subset 10, :incomparable 1}}
              :scores    {:in-place       {:precision 877/1200, :recall 1,      :f1 114397/138600, :exact 6}
                          :appdb-h2       {:precision 511/600,  :recall 47/50,  :f1 17147/19800,   :exact 8}
                          :appdb-postgres {:precision 29/30,    :recall 59/60,  :f1 73/75,         :exact 18}
                          :semantic       {:precision 457/600,  :recall 99/100, :f1 114991/138600, :exact 9}}}
             translations)))))
