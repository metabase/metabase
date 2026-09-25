(ns metabase.search.query-semantics-stats-test
  "Fixture-level contracts for search-engine divergence and target-gold fidelity.

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

(deftest gold-score-test
  (are [expected gold hits] (= expected (stats/score gold hits))
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
    (testing "translated queries, scored against each comparison's target engine"
      (is (= 26 (:count translations)))
      (is (= 1 (:all-equal translations)))
      (is (= {:in-place 4, :appdb-h2 4, :appdb-postgres 16, :semantic 2}
             (:target-counts translations)))
      (is (= {[:in-place :appdb-h2]       {:equal 15, :left-superset 11, :left-subset 0, :incomparable 0}
              [:in-place :appdb-postgres] {:equal 5, :left-superset 16, :left-subset 4, :incomparable 1}
              [:in-place :semantic]       {:equal 4, :left-superset 16, :left-subset 4, :incomparable 2}
              [:appdb-h2 :appdb-postgres] {:equal 5, :left-superset 11, :left-subset 8, :incomparable 2}
              [:appdb-h2 :semantic]       {:equal 3, :left-superset 12, :left-subset 9, :incomparable 2}
              [:appdb-postgres :semantic] {:equal 24, :left-superset 1, :left-subset 1, :incomparable 0}}
             (:pairwise translations)))
      (is (= {:in-place       {:precision 517/728, :recall 131/156, :f1 2091/2860, :balanced-f1 5479/7040, :exact 8}
              :appdb-h2       {:precision 4/5, :recall 199/260, :f1 6317/8580, :balanced-f1 16087/19712, :exact 7}
              :appdb-postgres {:precision 12/13, :recall 47/52, :f1 349/390, :balanced-f1 191/240, :exact 20}
              :semantic       {:precision 73/78, :recall 12/13, :f1 119/130, :balanced-f1 69/80, :exact 22}}
             (:scores translations))))))
