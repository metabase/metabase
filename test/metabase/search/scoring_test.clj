(ns metabase.search.scoring-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.api.search :as api.search]
   [metabase.search.config :as search.config]
   [metabase.search.filter-test :as search.filter-test]
   [metabase.search.scoring :as scoring]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
        (partial #'scoring/text-scores-with nil [{:weight 1 :scorer scorer}])))

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
      (let [sorted-items (->> (+ small search.config/max-filtered-results)
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
      (let [stale search.config/stale-time-in-days]
        (is (= [1 2 3 4]
               (->> [(item 1 (days-ago (+ stale 1)))
                     (item 2 (days-ago (+ stale 50)))
                     (item 3 nil)
                     (item 4 (days-ago stale))]
                    (sort-by score)
                    (map :id))))))))

(defn search-results
  "Returns search results as they are returned from the search query before scoring"
  [search-ctx]
  (mt/with-current-user (mt/user->id :crowberto)
    (let [search-ctx (merge search.filter-test/default-search-ctx search-ctx)]
      (t2/query (#'api.search/full-search-query search-ctx)))))

(deftest search-native-query-scoring-test
  (testing "Exclude native query matches in search scoring when the search should exclude native queries"
    (mt/dataset test-data
      (mt/with-temp [;; card-1 has a match in the native query, card-2 does not
                     :model/Card card-1 {:name "matching", :dataset_query (mt/native-query {:query "also matching"})}
                     :model/Card card-2 {:name "matching", :dataset_query (mt/native-query {:query "doesn't"})}]
        (let [search-string       "matching"
              search-native-query false
              results             (search-results {:search-string search-string}) ; note :search-native-query is not enabled
              score               (fn [model id]
                                    (let [result (first (filter #(= [(:model %) (:id %)] [model id]) results))]
                                      (float (:score (scoring/score-and-result result {:search-string       search-string
                                                                                       :search-native-query search-native-query})))))
              [score-1 score-2]   (map #(score "card" %) [(:id card-1) (:id card-2)])]
          (is (= score-1 score-2)))))))

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
                (map #(scoring/score-and-result % {:search-string search-string :search-native-query nil}))
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
                (map #(scoring/score-and-result % {:search-string search-string :search-native-query nil}))
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
      (is (= 0 (:score (scoring/score-and-result {:name "racing yo" :model "card"}
                                                 {:search-string "" :search-native-query nil})))))))

(deftest ^:parallel serialize-test
  (testing "It normalizes dataset queries from strings"
    (let [query  {:type     :query
                  :query    {:source-query {:source-table 1}}
                  :database 1}
          result {:name          "card"
                  :model         "card"
                  :dataset_query (json/generate-string query)
                  :all-scores {}
                  :relevant-scores {}}]
      (is (= query (-> result scoring/serialize :dataset_query)))))
  (testing "Doesn't error on other models without a query"
    (is (nil? (-> {:name "dash" :model "dashboard" :all-scores {} :relevant-scores {}}
                  (#'scoring/serialize)
                  :dataset_query)))))

(deftest ^:parallel force-weight-test
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
