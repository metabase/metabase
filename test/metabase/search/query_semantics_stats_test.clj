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

(deftest matching-pair-count-test
  ;; Every grouping five engines can form, from all agreeing to all differing
  (are [expected hits] (= expected (stats/matching-pair-count (zipmap stats/engines hits)))
    10 [#{} #{}   #{}   #{}   #{}]
    6  [#{} #{}   #{}   #{}   #{:A}]
    4  [#{} #{}   #{}   #{:A} #{:A}]
    3  [#{} #{}   #{}   #{:A} #{:B}]
    2  [#{} #{}   #{:A} #{:A} #{:B}]
    1  [#{} #{}   #{:A} #{:B} #{:C}]
    0  [#{} #{:A} #{:B} #{:C} #{:D}]))

(deftest conforming-engines-test
  (are [expected hits] (= expected (stats/conforming-engines #{:A} (zipmap stats/engines hits)))
    stats/engines              [#{:A} #{:A} #{:A}    #{:A} #{:A}]
    [:appdb-h2 :semantic-only] [#{}   #{:A} #{:A :B} #{:A} #{:A :B}]
    []                         [#{}   #{:B} #{:A :B} #{}   #{:B}]))

(deftest correct-score-test
  (are [expected correct hits] (= expected (stats/score correct hits))
    {:precision 1,   :recall 1,   :f1 1}   #{}      #{}
    {:precision 0,   :recall 0,   :f1 0}   #{:A}    #{}
    {:precision 0,   :recall 0,   :f1 0}   #{}      #{:A}
    {:precision 1,   :recall 1/2, :f1 2/3} #{:A :B} #{:A}
    {:precision 1/2, :recall 1,   :f1 2/3} #{:A}    #{:A :B}
    {:precision 0,   :recall 0,   :f1 0}   #{:A}    #{:B}))

(deftest semantic-with-fallback-test
  (are [expected semantic postgres] (= expected (fixtures/expected-hits {:expect {:semantic       semantic
                                                                                  :appdb-postgres postgres}}
                                                                        :semantic-with-fallback))
    ;; Both arms, topped up with app-db's hits
    #{:A :B :C} {:keyword [:A], :vector [:B]} [:C]
    #{:B :C}    {:vector [:B]}                [:C]
    ;; Semantic search does not fall back when its own arms found nothing
    #{}         {:keyword [], :vector []}     [:C]))

(deftest translation-row-scores-test
  (let [scenario {:id          "case"
                  :query       "typed"
                  :expect      {:in-place       [:A :B]
                                :appdb-h2       [:A]
                                :appdb-postgres []
                                :semantic       {:vector [:B]}}
                  :comparisons [{:focus        "goal"
                                 :kind         :or
                                 :correct      [:A]
                                 :alternatives {:in-place {:query "adapted", :hits [:A]}}}]}]
    (is (=? [{:scores {:in-place               {:typed {:f1 2/3}, :best {:f1 1}}
                       :appdb-h2               {:typed {:f1 1},   :best {:f1 1}}
                       :appdb-postgres         {:typed {:f1 0},   :best {:f1 0}}
                       :semantic-only          {:typed {:f1 0},   :best {:f1 0}}
                       :semantic-with-fallback {:typed {:f1 0},   :best {:f1 0}}}}]
            (stats/translation-rows [scenario])))))

(deftest translated-comparisons-change-a-query-test
  (doseq [{:keys [scenario-id focus specs]} (stats/translation-rows fixtures/cases)]
    (is (< 1 (count (set (map (comp :query specs) stats/engines))))
        (str scenario-id " / " focus " does not adapt any query"))))

(deftest comparisons-have-a-goal-kind-test
  (doseq [{:keys [id comparisons]} fixtures/cases
          {:keys [focus kind]}     comparisons]
    (is (some #{kind} stats/goal-kinds)
        (str id " / " focus " has no known goal kind"))))

(deftest comparison-ids-are-unique-test
  ;; Report links name a comparison by its id.
  (let [ids (for [{:keys [comparisons]} fixtures/cases, {:keys [id]} comparisons] id)]
    (is (= (count ids) (count (set (filter string? ids)))))))

(deftest alternatives-score-no-worse-test
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

(deftest corpus-statistics-test
  ;; Pairwise counts are [equal left-superset left-subset incomparable], relative to the first engine.
  ;; Scores are [precision recall f1 exact].
  (let [{:keys [same-query translations]} (stats/summary fixtures/cases)]
    (testing "same query"
      (is (= {:count     43
              :all-equal 6
              :mean-hits {:in-place               121/43
                          :appdb-h2               62/43
                          :appdb-postgres         67/43
                          :semantic-only          103/43
                          :semantic-with-fallback 113/43}
              :pairwise  {[:in-place :appdb-h2]                     [21 22 0  0]
                          [:in-place :appdb-postgres]               [7  29 4  3]
                          [:in-place :semantic-only]                [13 20 9  1]
                          [:in-place :semantic-with-fallback]       [13 19 9  2]
                          [:appdb-h2 :appdb-postgres]               [14 13 13 3]
                          [:appdb-h2 :semantic-only]                [9  10 22 2]
                          [:appdb-h2 :semantic-with-fallback]       [8  9  24 2]
                          [:appdb-postgres :semantic-only]          [15 5  23 0]
                          [:appdb-postgres :semantic-with-fallback] [20 0  23 0]
                          [:semantic-only :semantic-with-fallback]  [38 0  5  0]}}
             (compact same-query))))
    (testing "translated queries, scored against each comparison's correct result set"
      (is (= {:count        13
              :all-equal    1
              :mean-hits    {:in-place               50/13
                             :appdb-h2               42/13
                             :appdb-postgres         38/13
                             :semantic-only          4
                             :semantic-with-fallback 53/13}
              :pairwise     {[:in-place :appdb-h2]                     [5  8 0 0]
                             [:in-place :appdb-postgres]               [4  9 0 0]
                             [:in-place :semantic-only]                [7  2 2 2]
                             [:in-place :semantic-with-fallback]       [8  1 2 2]
                             [:appdb-h2 :appdb-postgres]               [6  4 3 0]
                             [:appdb-h2 :semantic-only]                [6  0 6 1]
                             [:appdb-h2 :semantic-with-fallback]       [5  0 7 1]
                             [:appdb-postgres :semantic-only]          [4  1 8 0]
                             [:appdb-postgres :semantic-with-fallback] [3  1 9 0]
                             [:semantic-only :semantic-with-fallback]  [12 0 1 0]}
              :scores       {:in-place               [171/260 1       1101/1430   3]
                             :appdb-h2               [157/195 123/130 14999/18018 5]
                             :appdb-postgres         [181/195 1       433/455     11]
                             :semantic-only          [127/195 64/65   9601/12870  3]
                             :semantic-with-fallback [239/390 64/65   9271/12870  2]}
              :typed-scores {:in-place               [863/1560 23/26   372611/585585 1]
                             :appdb-h2               [10/13    361/780 746/1365      3]
                             :appdb-postgres         [211/260  59/65   161/195       7]
                             :semantic-only          [127/195  61/65   3017/4290     3]
                             :semantic-with-fallback [233/390  64/65   3061/4290     2]}}
             (compact translations))))))
