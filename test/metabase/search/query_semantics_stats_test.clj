(ns metabase.search.query-semantics-stats-test
  "Checks of how the search engines' results relate, and how closely they match the correct results.
  The corpus is hand-picked, so these numbers say nothing about production traffic or ranking quality."
  (:require
   [clojure.test :refer :all]
   [metabase.search.query-semantics :as fixtures]
   [metabase.search.query-semantics-stats :as stats]))

(deftest ^:parallel result-set-relation-test
  ;; Equal sets, containment in either direction, and overlapping sets.
  (are [expected left right] (= expected (stats/relation left right))
    :equal         #{}      #{}
    :equal         #{:A :B} #{:B :A}
    :left-superset #{:A :B} #{:A}
    :left-subset   #{:A}    #{:A :B}
    :incomparable  #{:A :B} #{:B :C}))

(deftest ^:parallel result-groups-test
  ;; Every grouping six engines can form, including distinct groupings with the same number of matching pairs.
  (are [pairs groups hits] (let [results (zipmap stats/engines hits)]
                             (and (= pairs (stats/matching-pair-count results))
                                  (= groups (stats/result-group-sizes results))))
    15 [6]             [#{} #{}   #{}   #{}   #{}   #{}]
    10 [5 1]           [#{} #{}   #{}   #{}   #{}   #{:A}]
    7  [4 2]           [#{} #{}   #{}   #{}   #{:A} #{:A}]
    6  [4 1 1]         [#{} #{}   #{}   #{}   #{:A} #{:B}]
    6  [3 3]           [#{} #{}   #{}   #{:A} #{:A} #{:A}]
    4  [3 2 1]         [#{} #{}   #{}   #{:A} #{:A} #{:B}]
    3  [3 1 1 1]       [#{} #{}   #{}   #{:A} #{:B} #{:C}]
    3  [2 2 2]         [#{} #{}   #{:A} #{:A} #{:B} #{:B}]
    2  [2 2 1 1]       [#{} #{}   #{:A} #{:A} #{:B} #{:C}]
    1  [2 1 1 1 1]     [#{} #{}   #{:A} #{:B} #{:C} #{:D}]
    0  [1 1 1 1 1 1]   [#{} #{:A} #{:B} #{:C} #{:D} #{:E}]))

(deftest ^:parallel conforming-engines-test
  ;; Every engine, selected engines, and no engines return the correct set.
  (are [expected hits] (= expected (stats/conforming-engines #{:A} (zipmap stats/engines hits)))
    stats/engines                         [#{:A} #{:A} #{:A} #{:A}    #{:A} #{:A}]
    [:appdb-h2 :appdb-mysql :semantic-only] [#{}   #{:A} #{:A} #{:A :B} #{:A} #{:A :B}]
    []                                   [#{}   #{:B} #{:B} #{:A :B} #{}   #{:B}]))

(deftest ^:parallel correct-score-test
  ;; Empty sets, missing and extra hits, and disjoint sets.
  (are [expected correct hits] (= expected (stats/score correct hits))
    {:precision 1,   :recall 1,   :f1 1}   #{}      #{}
    {:precision 0,   :recall 0,   :f1 0}   #{:A}    #{}
    {:precision 0,   :recall 0,   :f1 0}   #{}      #{:A}
    {:precision 1,   :recall 1/2, :f1 2/3} #{:A :B} #{:A}
    {:precision 1/2, :recall 1,   :f1 2/3} #{:A}    #{:A :B}
    {:precision 0,   :recall 0,   :f1 0}   #{:A}    #{:B}))

(deftest ^:parallel translation-row-scores-test
  (let [scenario {:id          "case"
                  :query       "typed"
                  :expect      {:in-place       [:A :B]
                                :appdb-h2       [:A]
                                :appdb-mysql    [:B]
                                :appdb-postgres []
                                :semantic       {:vector [:B]}}
                  :comparisons [{:focus        "goal"
                                 :kind         :or
                                 :correct      [:A]
                                 :alternatives {:in-place    {:query "adapted", :hits [:A]}
                                                :appdb-mysql {:query "adapted mysql", :hits [:A]}}}]}]
    (is (=? [{:scores {:in-place               {:typed {:f1 2/3}, :best {:f1 1}}
                       :appdb-h2               {:typed {:f1 1}, :best {:f1 1}}
                       :appdb-mysql            {:typed {:f1 0}, :best {:f1 1}}
                       :appdb-postgres         {:typed {:f1 0}, :best {:f1 0}}
                       :semantic-only          {:typed {:f1 0}, :best {:f1 0}}
                       :semantic-with-fallback {:typed {:f1 0}, :best {:f1 0}}}}]
            (stats/translation-rows [scenario])))))

(deftest ^:parallel alternatives-score-no-worse-test
  ;; An adapted query that scores below the scenario query would understate the engine.
  (doseq [{:keys [scenario-id focus scores]} (stats/translation-rows fixtures/cases)
          engine                             stats/engines
          :let [{:keys [best typed]} (scores engine)]]
    (is (<= (:f1 typed) (:f1 best))
        (str scenario-id " / " focus " / " (name engine) " scores worse than the scenario query"))))

(defn- compact
  "The summary with each pairwise count and score map as a vector, so the snapshot fits one row per entry."
  [summary]
  (let [rows #(update-vals % (apply juxt %2))]
    (cond-> (update summary :pairwise rows [:equal :left-superset :left-subset :incomparable])
      (:scores summary) (-> (update :scores rows [:precision :recall :f1 :exact])
                            (update :typed-scores rows [:precision :recall :f1 :exact])))))

(deftest ^:parallel corpus-statistics-test
  ;; Pairwise counts are [equal left-superset left-subset incomparable].
  ;; Scores are [precision recall f1 exact].
  (let [{:keys [same-query translations]} (stats/summary fixtures/cases)]
    (testing "same query"
      (is (= {:count     70
              :all-equal 8
              :mean-hits {:in-place               89/35
                          :appdb-h2               3/2
                          :appdb-mysql            61/35
                          :appdb-postgres         117/70
                          :semantic-only          94/35
                          :semantic-with-fallback 207/70}
              :pairwise  {[:in-place :appdb-h2]                     [42 28 0 0]
                          [:in-place :appdb-mysql]                  [16 41 12 1]
                          [:in-place :appdb-postgres]               [18 39 10 3]
                          [:in-place :semantic-only]                [22 25 21 2]
                          [:in-place :semantic-with-fallback]       [23 22 23 2]
                          [:appdb-h2 :appdb-mysql]                  [29 19 19 3]
                          [:appdb-h2 :appdb-postgres]               [28 19 20 3]
                          [:appdb-h2 :semantic-only]                [14 13 40 3]
                          [:appdb-h2 :semantic-with-fallback]       [14 10 44 2]
                          [:appdb-mysql :appdb-postgres]            [57 8 5 0]
                          [:appdb-mysql :semantic-only]             [16 9 41 4]
                          [:appdb-mysql :semantic-with-fallback]    [22 2 45 1]
                          [:appdb-postgres :semantic-only]          [18 8 41 3]
                          [:appdb-postgres :semantic-with-fallback] [26 0 44 0]
                          [:semantic-only :semantic-with-fallback]  [59 0 11 0]}}
             (compact same-query))))
    (testing "adapted queries and the original queries scored against the correct results"
      (is (= {:count        20
              :all-equal    2
              :mean-hits    {:in-place               69/20
                             :appdb-h2               59/20
                             :appdb-mysql            13/5
                             :appdb-postgres         13/5
                             :semantic-only          17/5
                             :semantic-with-fallback 71/20}
              :pairwise     {[:in-place :appdb-h2]                     [10 10 0 0]
                             [:in-place :appdb-mysql]                  [6 14 0 0]
                             [:in-place :appdb-postgres]               [6 14 0 0]
                             [:in-place :semantic-only]                [10 5 2 3]
                             [:in-place :semantic-with-fallback]       [12 3 3 2]
                             [:appdb-h2 :appdb-mysql]                  [8 8 4 0]
                             [:appdb-h2 :appdb-postgres]               [8 8 4 0]
                             [:appdb-h2 :semantic-only]                [7 3 8 2]
                             [:appdb-h2 :semantic-with-fallback]       [7 2 10 1]
                             [:appdb-mysql :appdb-postgres]            [20 0 0 0]
                             [:appdb-mysql :semantic-only]             [9 1 10 0]
                             [:appdb-mysql :semantic-with-fallback]    [7 1 12 0]
                             [:appdb-postgres :semantic-only]          [9 1 10 0]
                             [:appdb-postgres :semantic-with-fallback] [7 1 12 0]
                             [:semantic-only :semantic-with-fallback]  [17 0 3 0]}
              :scores       {:in-place               [877/1200 1 114397/138600 6]
                             :appdb-h2               [511/600 47/50 17147/19800 8]
                             :appdb-mysql            [59/60 1 99/100 19]
                             :appdb-postgres         [59/60 1 99/100 19]
                             :semantic-only          [457/600 99/100 114991/138600 9]
                             :semantic-with-fallback [859/1200 99/100 110767/138600 7]}
              :typed-scores {:in-place               [1403/2400 187/240 135731/225225 1]
                             :appdb-h2               [57/80 253/600 2071/4200 3]
                             :appdb-mysql            [923/1200 803/1200 67/100 7]
                             :appdb-postgres         [291/400 143/200 409/600 8]
                             :semantic-only          [863/1200 24/25 11909/15400 7]
                             :semantic-with-fallback [199/300 99/100 11799/15400 5]}}
             (compact translations))))))
