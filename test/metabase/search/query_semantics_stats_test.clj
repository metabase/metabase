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
      (is (= {:count     37
              :all-equal 5
              :mean-hits {:in-place       108/37
                          :appdb-h2       57/37
                          :appdb-postgres 65/37
                          :semantic       108/37}
              :pairwise  {[:in-place :appdb-h2]       {:equal 18, :left-superset 19, :left-subset 0,  :incomparable 0}
                          [:in-place :appdb-postgres] {:equal 6,  :left-superset 25, :left-subset 4,  :incomparable 2}
                          [:in-place :semantic]       {:equal 19, :left-superset 10, :left-subset 8,  :incomparable 0}
                          [:appdb-h2 :appdb-postgres] {:equal 11, :left-superset 11, :left-subset 12, :incomparable 3}
                          [:appdb-h2 :semantic]       {:equal 7,  :left-superset 7,  :left-subset 23, :incomparable 0}
                          [:appdb-postgres :semantic] {:equal 8,  :left-superset 3,  :left-subset 25, :incomparable 1}}}
             same-query)))
    (testing "translated queries, scored against each comparison's correct result set"
      (is (= {:count     16
              :all-equal 1
              :mean-hits {:in-place       31/8
                          :appdb-h2       3
                          :appdb-postgres 41/16
                          :semantic       57/16}
              :pairwise  {[:in-place :appdb-h2]       {:equal 8, :left-superset 8,  :left-subset 0,  :incomparable 0}
                          [:in-place :appdb-postgres] {:equal 4, :left-superset 11, :left-subset 0,  :incomparable 1}
                          [:in-place :semantic]       {:equal 8, :left-superset 5,  :left-subset 2,  :incomparable 1}
                          [:appdb-h2 :appdb-postgres] {:equal 5, :left-superset 6,  :left-subset 3,  :incomparable 2}
                          [:appdb-h2 :semantic]       {:equal 5, :left-superset 2,  :left-subset 8,  :incomparable 1}
                          [:appdb-postgres :semantic] {:equal 4, :left-superset 2,  :left-subset 10, :incomparable 0}}
              :scores    {:in-place       {:precision 4511/6720, :recall 1,     :f1 53191/68640, :exact 4}
                          :appdb-h2       {:precision 787/960,   :recall 91/96, :f1 10533/12320, :exact 6}
                          :appdb-postgres {:precision 91/96,     :recall 23/24, :f1 1241/1320,   :exact 12}
                          :semantic       {:precision 107/160,   :recall 43/48, :f1 25519/36960, :exact 3}}}
             translations)))))
