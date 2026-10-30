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

(deftest translated-comparisons-change-a-query-test
  (doseq [{:keys [scenario-id focus specs]} (stats/translation-rows fixtures/cases)]
    (is (< 1 (count (set (map (comp :query specs) stats/engines))))
        (str scenario-id " / " focus " does not adapt any query"))))

(deftest alternatives-score-no-worse-test
  ;; An adapted query that scores below the scenario query would understate the engine.
  (doseq [{:keys [id comparisons] :as case} fixtures/cases
          {:keys [focus correct alternatives]} comparisons
          [engine {:keys [hits]}] alternatives
          :let [f1 #(:f1 (stats/score (set correct) (set %)))]]
    (is (<= (f1 (fixtures/expected-hits case engine)) (f1 hits))
        (str id " / " focus " / " (name engine) " scores worse than the scenario query"))))

(deftest correct-score-test
  (are [expected correct hits] (= expected (stats/score correct hits))
    {:precision 1,   :recall 1,   :f1 1}   #{}      #{}
    {:precision 0,   :recall 0,   :f1 0}   #{:A}    #{}
    {:precision 0,   :recall 0,   :f1 0}   #{}      #{:A}
    {:precision 1,   :recall 1/2, :f1 2/3} #{:A :B} #{:A}
    {:precision 1/2, :recall 1,   :f1 2/3} #{:A}    #{:A :B}
    {:precision 0,   :recall 0,   :f1 0}   #{:A}    #{:B}))

(deftest corpus-statistics-test
  (let [{:keys [same-query translations]} (stats/summary fixtures/cases)]
    (testing "same query, with pairwise direction relative to the first engine"
      (is (= {:count     43
              :all-equal 6
              :mean-hits {:in-place       121/43
                          :appdb-h2       62/43
                          :appdb-postgres 67/43
                          :semantic       103/43}
              :pairwise  {[:in-place :appdb-h2]       {:equal 21, :left-superset 22, :left-subset 0,  :incomparable 0}
                          [:in-place :appdb-postgres] {:equal 7,  :left-superset 29, :left-subset 4,  :incomparable 3}
                          [:in-place :semantic]       {:equal 13, :left-superset 20, :left-subset 9,  :incomparable 1}
                          [:appdb-h2 :appdb-postgres] {:equal 14, :left-superset 13, :left-subset 13, :incomparable 3}
                          [:appdb-h2 :semantic]       {:equal 9,  :left-superset 10, :left-subset 22, :incomparable 2}
                          [:appdb-postgres :semantic] {:equal 15, :left-superset 5,  :left-subset 23, :incomparable 0}}}
             same-query)))
    (testing "translated queries, scored against each comparison's correct result set"
      (is (= {:count     13
              :all-equal 1
              :mean-hits {:in-place       50/13
                          :appdb-h2       42/13
                          :appdb-postgres 38/13
                          :semantic       4}
              :pairwise  {[:in-place :appdb-h2]       {:equal 5, :left-superset 8, :left-subset 0, :incomparable 0}
                          [:in-place :appdb-postgres] {:equal 4, :left-superset 9, :left-subset 0, :incomparable 0}
                          [:in-place :semantic]       {:equal 7, :left-superset 2, :left-subset 2, :incomparable 2}
                          [:appdb-h2 :appdb-postgres] {:equal 6, :left-superset 4, :left-subset 3, :incomparable 0}
                          [:appdb-h2 :semantic]       {:equal 6, :left-superset 0, :left-subset 6, :incomparable 1}
                          [:appdb-postgres :semantic] {:equal 4, :left-superset 1, :left-subset 8, :incomparable 0}}
              :scores    {:in-place       {:precision 171/260, :recall 1,       :f1 1101/1430,   :exact 3}
                          :appdb-h2       {:precision 157/195, :recall 123/130, :f1 14999/18018, :exact 5}
                          :appdb-postgres {:precision 181/195, :recall 1,       :f1 433/455,     :exact 11}
                          :semantic       {:precision 127/195, :recall 64/65,   :f1 9601/12870,  :exact 3}}}
             translations)))))
