(ns metabase.search.query-semantics-stats-test
  "Fixture-level contracts for search-engine divergence and fidelity to correct result sets.

  These statistics describe the deliberately selected corpus, not a production
  query distribution or a ranking evaluation."
  (:require
   [clojure.test :refer :all]
   [metabase.search.query-semantics :as fixtures]
   [metabase.search.query-semantics-stats :as stats]))

(deftest result-set-relation-test
  (are [expected left right] (= expected (stats/relation left right))
    :equal         #{}       #{}
    :equal         #{:A :B}  #{:B :A}
    :left-superset #{:A :B}  #{:A}
    :left-subset   #{:A}     #{:A :B}
    :incomparable  #{:A :B}  #{:B :C}))

(deftest matching-pair-count-test
  (are [expected hits] (= expected (stats/matching-pair-count (zipmap stats/engines hits)))
    6 [#{} #{} #{} #{}]
    3 [#{} #{} #{} #{:A}]
    2 [#{} #{} #{:A} #{:A}]
    1 [#{} #{} #{:A} #{:B}]
    0 [#{} #{:A} #{:B} #{:C}]))

(deftest translated-comparisons-change-a-query-test
  (doseq [{:keys [scenario-id focus specs]} (stats/translation-rows fixtures/cases)]
    (is (< 1 (count (set (map (comp :query specs) stats/engines))))
        (str scenario-id " / " focus " does not adapt any query"))))

(deftest conforming-engines-test
  (are [expected hits] (= expected (stats/conforming-engines #{:A} (zipmap stats/engines hits)))
    stats/engines         [#{:A} #{:A} #{:A} #{:A}]
    [:appdb-h2 :semantic] [#{} #{:A} #{:A :B} #{:A}]
    []                    [#{} #{:B} #{:A :B} #{}]))

(deftest correct-score-test
  (are [expected correct hits] (= expected (stats/score correct hits))
    {:precision 1, :recall 1, :f1 1}       #{}       #{}
    {:precision 0, :recall 0, :f1 0}       #{:A}     #{}
    {:precision 0, :recall 0, :f1 0}       #{}       #{:A}
    {:precision 1, :recall 1/2, :f1 2/3}   #{:A :B}  #{:A}
    {:precision 1/2, :recall 1, :f1 2/3}   #{:A}     #{:A :B}
    {:precision 0, :recall 0, :f1 0}       #{:A}     #{:B}))

(deftest corpus-statistics-test
  (let [{:keys [same-query translations]} (stats/summary fixtures/cases)]
    (testing "same query, with pairwise direction relative to the first engine"
      (is (= 37 (:count same-query)))
      (is (= 5 (:all-equal same-query)))
      (is (= {:in-place       108/37
              :appdb-h2       53/37
              :appdb-postgres 65/37
              :semantic       70/37}
             (:mean-hits same-query)))
      (is (= {[:in-place :appdb-h2]       {:equal 16, :left-superset 21, :left-subset 0, :incomparable 0}
              [:in-place :appdb-postgres] {:equal 6, :left-superset 25, :left-subset 4, :incomparable 2}
              [:in-place :semantic]       {:equal 6, :left-superset 23, :left-subset 5, :incomparable 3}
              [:appdb-h2 :appdb-postgres] {:equal 12, :left-superset 9, :left-subset 12, :incomparable 4}
              [:appdb-h2 :semantic]       {:equal 9, :left-superset 9, :left-subset 15, :incomparable 4}
              [:appdb-postgres :semantic] {:equal 33, :left-superset 0, :left-subset 4, :incomparable 0}}
             (:pairwise same-query))))
    (testing "translated queries, scored against each comparison's correct result set"
      (is (= 15 (:count translations)))
      (is (= 1 (:all-equal translations)))
      (is (= {[:in-place :appdb-h2]       {:equal 8, :left-superset 7, :left-subset 0, :incomparable 0}
              [:in-place :appdb-postgres] {:equal 5, :left-superset 10, :left-subset 0, :incomparable 0}
              [:in-place :semantic]       {:equal 4, :left-superset 11, :left-subset 0, :incomparable 0}
              [:appdb-h2 :appdb-postgres] {:equal 4, :left-superset 7, :left-subset 3, :incomparable 1}
              [:appdb-h2 :semantic]       {:equal 3, :left-superset 8, :left-subset 3, :incomparable 1}
              [:appdb-postgres :semantic] {:equal 14, :left-superset 1, :left-subset 0, :incomparable 0}}
             (:pairwise translations)))
      (is (= {:in-place       {:precision 507/700, :recall 1,       :f1 899/1100,  :exact 5}
              :appdb-h2       {:precision 241/300, :recall 139/150, :f1 1598/1925, :exact 4}
              :appdb-postgres {:precision 44/45,   :recall 43/45,   :f1 143/150,   :exact 13}
              :semantic       {:precision 1,       :recall 43/45,   :f1 29/30,     :exact 14}}
             (:scores translations))))))
