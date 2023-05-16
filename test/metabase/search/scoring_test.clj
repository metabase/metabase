(ns metabase.search.scoring-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase.search.config :as search-config]
   [metabase.search.scoring :as scoring]))

(defn- result-row
  ([name]
   (result-row name "card"))
  ([name model]
   {:model model
    :name name}))

(defn- scorer->score
  [scorer]
  (comp :score
        first
        (partial #'scoring/text-scores-with [{:weight 1 :scorer scorer}])))

(deftest ^:parallel consecutivity-scorer-test
  (let [score (scorer->score #'scoring/consecutivity-scorer)]
    (testing "partial matches"
      (is (= 1/3
             (score ["rasta" "el" "tucan"]
                    (result-row "Rasta the Toucan"))))
      (is (= 1/3
             (score ["rasta" "el" "tucan"]
                    (result-row "Here is Rasta the hero of many lands"))))
      (is (= 2/3
             (score ["Imposter" "the" "toucan"]
                    (result-row "Rasta the Toucan"))))
      (is (= 2/3 ;; substring matching; greedy choice does not work (i.e., don't match on Rasta)
             (score ["rasta" "the" "toucan"]
                    (result-row "Rasta may be my favorite of the toucans")))))
    (testing "exact matches"
      (is (= 1
             (score ["rasta" "the" "toucan"]
                    (result-row "Rasta the Toucan"))))
      (is (= 1
             (score ["rasta"]
                    (result-row "Rasta")))))
    (testing "misses"
      (is (zero?
           (score ["rasta"]
                  (result-row "just a straight-up imposter"))))
      (is (zero?
           (score ["rasta" "the" "toucan"]
                  (result-row "")))))))

(deftest ^:parallel total-occurrences-scorer-test
  (let [score (scorer->score #'scoring/total-occurrences-scorer)]
    (testing "partial matches"
      (is (= 1/3
             (score ["rasta" "el" "tucan"]
                    (result-row "Rasta the Toucan"))))
      (is (= 1/3
             (score ["rasta" "el" "tucan"]
                    (result-row "Here is Rasta the hero of many lands"))))
      (is (= 2/3
             (score ["Imposter" "the" "toucan"]
                    (result-row "Rasta the Toucan")))))
    (testing "full matches"
      (is (= 1
             (score ["rasta" "the" "toucan"]
                    (result-row "Rasta the Toucan"))))
      (is (= 1
             (score ["rasta"]
                    (result-row "Rasta"))))
      (is (= 1
             (score ["rasta" "the" "toucan"]
                    (result-row "Rasta may be my favorite of the toucans")))))
    (testing "misses"
      (is (zero?
           (score ["rasta"]
                  (result-row "just a straight-up imposter"))))
      (is (zero?
           (score ["rasta" "the" "toucan"]
                  (result-row "")))))))

(deftest ^:parallel fullness-scorer-test
  (let [score (scorer->score #'scoring/fullness-scorer)]
    (testing "partial matches"
      (is (= 1/8
             (score ["rasta" "el" "tucan"]
                    (result-row "Here is Rasta the hero of many lands")))))
    (testing "full matches"
      (is (= 1
             (score ["rasta" "the" "toucan"]
                    (result-row "Rasta the Toucan")))))
    (testing "misses"
      (is (zero?
           (score ["rasta"]
                  (result-row "just a straight-up imposter"))))
      (is (zero?
           (score ["rasta" "the" "toucan"]
                  (result-row "")))))))

(deftest ^:parallel exact-match-scorer-test
  (let [score (scorer->score #'scoring/exact-match-scorer)]
    (is (zero?
         (score ["rasta" "the" "toucan"]
                (result-row "Crowberto el tucan"))))
    (is (= 1/3
           (score ["rasta" "the" "toucan"]
                  (result-row "Rasta el tucan"))))
    (is (= 2/3
           (score ["rasta" "the" "toucan"]
                  (result-row "Crowberto the toucan"))))
    (is (= 1
           (score ["rasta" "the" "toucan"]
                  (result-row "Rasta the toucan"))))))

(deftest ^:parallel prefix-match-scorer-test
  (let [score (scorer->score #'scoring/prefix-scorer)]
    (is (= 5/9 (score ["Crowberto" "the" "toucan"]
                      (result-row "Crowberto el tucan"))))
    (is (= 3/7
           (score ["rasta" "the" "toucan"]
                  (result-row "Rasta el tucan"))))
    (is (= 0
           (score ["rasta" "the" "toucan"]
                  (result-row "Crowberto the toucan"))))))

(deftest ^:parallel top-results-test
  (let [xf (map identity)
        small 10
        medium 20
        large 200]
    (testing "a non-full queue behaves normally"
      (let [items (->> (range small)
                       reverse ;; descending order
                       (map (fn [i]
                              {:score  [2 2 i]
                               :result (str "item " i)})))]
        (is (= (map :result items)
               (scoring/top-results items large xf)))))
    (testing "a full queue only saves the top items"
      (let [sorted-items (->> (+ small search-config/max-filtered-results)
                              range
                              reverse ;; descending order
                              (map (fn [i]
                                     {:score  [1 2 3 i]
                                      :result (str "item " i)})))]
        (is (= (->> sorted-items
                    (take medium)
                    (map :result))
               (scoring/top-results (shuffle sorted-items) 20 xf)))))))

(deftest ^:parallel match-context-test
  (let [context  #'scoring/match-context
        tokens   (partial map str)
        match    (fn [text] {:text text :is_match true})
        no-match (fn [text] {:text text :is_match false})]
    (testing "it groups matches together"
      (is (=
           [(no-match "this is")
            (match "rasta toucan's")
            (no-match "collection of")
            (match "toucan")
            (no-match "things")]
           (context
            ["rasta" "toucan"]
            ["this" "is" "rasta" "toucan's" "collection" "of" "toucan" "things"]))))
    (testing "it handles no matches"
      (is (= [(no-match "aviary stats")]
             (context
              ["rasta" "toucan"]
              ["aviary" "stats"]))))
    (testing "it abbreviates when necessary"
      (is (= [(no-match "one two…eleven twelve")
              (match "rasta toucan")
              (no-match "alpha beta…the end")]
             (context
              (tokens '(rasta toucan))
              (tokens '(one
                        two
                        this should not be included
                        eleven twelve
                        rasta toucan
                        alpha beta
                        some other noise
                        the end))))))))

(deftest ^:parallel pinned-score-test
  (let [score #'scoring/pinned-score
        item (fn [collection-position] {:collection_position collection-position
                                        :model "card"})]
    (testing "it provides a sortable score, but doesn't favor magnitude"
      (let [result (->> [(item 0)
                         (item nil)
                         (item 3)
                         (item 1)
                         (item 2)]
                        shuffle
                        (sort-by score)
                        reverse
                        (map :collection_position))]
        (is (= #{1 2 3}
               (set (take 3 result))))
        (is (= #{nil 0}
               (set (take-last 2 result))))))))

(deftest ^:parallel recency-score-test
  (let [score    #'scoring/recency-score
        now      (t/offset-date-time)
        item     (fn [id updated-at] {:id id :updated_at updated-at})
        days-ago (fn [days] (t/minus now (t/days days)))]
    (testing "it provides a sortable score"
      (is (= [1 2 3 4]
             (->> [(item 1 (days-ago 0))
                   (item 2 (days-ago 1))
                   (item 3 (days-ago 50))
                   (item 4 nil)]
                  shuffle
                  (sort-by score)
                  reverse
                  (map :id)))))
    (testing "it treats stale items as being equally old"
      (let [stale search-config/stale-time-in-days]
        (is (= [1 2 3 4]
               (->> [(item 1 (days-ago (+ stale 1)))
                     (item 2 (days-ago (+ stale 50)))
                     (item 3 nil)
                     (item 4 (days-ago stale))]
                    (sort-by score)
                    (map :id))))))))

(deftest ^:parallel combined-test
  (let [search-string     "custom expression examples"
        labeled-results   {:a {:name "custom expression examples" :model "dashboard"}
                           :b {:name "examples of custom expressions" :model "dashboard"}
                           :c {:name "customer success stories"
                               :dashboardcard_count 50
                               :updated_at (t/offset-date-time)
                               :collection_position 1
                               :model "dashboard"}
                           :d {:name "customer examples of bad sorting" :model "dashboard"}}
        {:keys [a b c d]} labeled-results]
    (is (= (map :name [a                ; exact text match
                       b                ; good text match
                       c                ; weak text match, but awesome other stuff
                       d])              ; middling text match, no other signal
           (->> labeled-results
                vals
                (map (partial scoring/score-and-result search-string))
                (sort-by :score)
                reverse
                (map :result)
                (map :name))))))

(deftest ^:parallel bookmarked-test
  (let [search-string     "my card"
        labeled-results   {:a {:name "my card a" :model "dashboard"}
                           :b {:name "my card b" :model "dashboard" :bookmark true :collection_position 1}
                           :c {:name "my card c" :model "dashboard" :bookmark true}}
        {:keys [a b c]} labeled-results]
    (is (= (map :name [b c a])
           (->> labeled-results
                vals
                (map (partial scoring/score-and-result search-string))
                (sort-by :score)
                reverse
                (map :result)
                (map :name))))))

(deftest score-and-result-test
  (testing "If all scores are 0, does not divide by zero"
    (with-redefs [scoring/score-result
                  (fn [_]
                    [{:weight 100 :score 0 :name "Some score type"}
                     {:weight 100 :score 0 :name "Some other score type"}])]
      (is (= 0 (:score (scoring/score-and-result "" {:name "racing yo" :model "card"})))))))

(deftest force-weight-test
  (is (= [{:weight 10}]
         (scoring/force-weight [{:weight 1}] 10)))

  (is (= [{:weight 5} {:weight 5}]
         (scoring/force-weight [{:weight 1} {:weight 1}] 10)))

  (is (= [{:weight 0} {:weight 10}]
         (scoring/force-weight [{:weight 0} {:weight 1}] 10)))

  (is (= 10 (count (scoring/force-weight (repeat 10 {:weight 1}) 10))))
  (is (= #{[:weight 1]} (into #{} (first (scoring/force-weight (repeat 10 {:weight 1}) 10)))))

  (is (= 100 (count (scoring/force-weight (repeat 100 {:weight 10}) 10))))
  (is (= #{{:weight 1/10}} (into #{} (scoring/force-weight (repeat 100 {:weight 10}) 10)))))
