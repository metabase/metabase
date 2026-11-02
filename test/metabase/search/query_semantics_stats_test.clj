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
      (is (= {:count     40
              :all-equal 5
              :mean-hits {:in-place       29/10
                          :appdb-h2       31/20
                          :appdb-postgres 67/40
                          :semantic       23/8}
              :pairwise  {[:in-place :appdb-h2]       {:equal 20, :left-superset 20, :left-subset 0,  :incomparable 0}
                          [:in-place :appdb-postgres] {:equal 6,  :left-superset 28, :left-subset 4,  :incomparable 2}
                          [:in-place :semantic]       {:equal 21, :left-superset 11, :left-subset 8,  :incomparable 0}
                          [:appdb-h2 :appdb-postgres] {:equal 11, :left-superset 13, :left-subset 13, :incomparable 3}
                          [:appdb-h2 :semantic]       {:equal 8,  :left-superset 8,  :left-subset 24, :incomparable 0}
                          [:appdb-postgres :semantic] {:equal 8,  :left-superset 3,  :left-subset 28, :incomparable 1}}}
             same-query)))
    (testing "translated queries, scored against each comparison's correct result set"
      (is (= {:count     18
              :all-equal 1
              :mean-hits {:in-place       11/3
                          :appdb-h2       26/9
                          :appdb-postgres 41/18
                          :semantic       10/3}
              :pairwise  {[:in-place :appdb-h2]       {:equal 10, :left-superset 8,  :left-subset 0,  :incomparable 0}
                          [:in-place :appdb-postgres] {:equal 4,  :left-superset 13, :left-subset 0,  :incomparable 1}
                          [:in-place :semantic]       {:equal 9,  :left-superset 6,  :left-subset 2,  :incomparable 1}
                          [:appdb-h2 :appdb-postgres] {:equal 5,  :left-superset 8,  :left-subset 3,  :incomparable 2}
                          [:appdb-h2 :semantic]       {:equal 6,  :left-superset 3,  :left-subset 8,  :incomparable 1}
                          [:appdb-postgres :semantic] {:equal 4,  :left-superset 2,  :left-subset 12, :incomparable 0}}
              :scores    {:in-place       {:precision 2623/3780, :recall 1,       :f1 426677/540540, :exact 6}
                          :appdb-h2       {:precision 223/270,   :recall 103/108, :f1 35779/41580,   :exact 8}
                          :appdb-postgres {:precision 89/108,    :recall 23/27,   :f1 2449/2970,     :exact 11}
                          :semantic       {:precision 83/120,    :recall 95/108,  :f1 9643/13860,    :exact 4}}}
             translations)))))
