(ns metabase.search.scoring-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.search.config :as search-config]
            [metabase.search.scoring :as search]))

(defn- result-row
  ([name]
   (result-row name "card"))
  ([name model]
   {:model model
    :name name}))

(deftest tokenize-test
  (testing "basic tokenization"
    (is (= ["Rasta" "the" "Toucan's" "search"]
           (search/tokenize "Rasta the Toucan's search")))
    (is (= ["Rasta" "the" "Toucan"]
           (search/tokenize "                Rasta\tthe    \tToucan     ")))
    (is (= []
           (search/tokenize " \t\n\t ")))
    (is (= []
           (search/tokenize "")))
    (is (thrown-with-msg? Exception #"does not match schema"
                          (search/tokenize nil)))))

(defn scorer->score
  [scorer]
  (comp :score
        (partial #'search/text-score-with [{:weight 1 :scorer scorer}])))

(deftest consecutivity-scorer-test
  (let [score (scorer->score #'search/consecutivity-scorer)]
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
      (is (nil?
           (score ["rasta"]
                  (result-row "just a straight-up imposter")))
          (nil?
           (score ["rasta" "the" "toucan"]
                  (result-row "")))))))

(deftest total-occurrences-scorer-test
  (let [score (scorer->score #'search/total-occurrences-scorer)]
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
      (is (nil?
           (score ["rasta"]
                  (result-row "just a straight-up imposter"))))
      (is (nil?
           (score ["rasta" "the" "toucan"]
                  (result-row "")))))))

(deftest fullness-scorer-test
  (let [score (scorer->score #'search/fullness-scorer)]
    (testing "partial matches"
      (is (= 1/8
             (score ["rasta" "el" "tucan"]
                    (result-row "Here is Rasta the hero of many lands")))))
    (testing "full matches"
      (is (= 1
             (score ["rasta" "the" "toucan"]
                    (result-row "Rasta the Toucan")))))
    (testing "misses"
      (is (nil?
           (score ["rasta"]
                  (result-row "just a straight-up imposter"))))
      (is (nil?
           (score ["rasta" "the" "toucan"]
                  (result-row "")))))))

(deftest exact-match-scorer-test
  (let [score (scorer->score #'search/exact-match-scorer)]
    (is (nil?
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

(deftest top-results-test
  (let [xf (map identity)]
    (testing "a non-full queue behaves normally"
      (let [items (->> (range 10)
                       reverse ;; descending order
                       (map (fn [i]
                              {:score  [2 2 i]
                               :result (str "item " i)})))]
        (is (= (map :result items)
               (search/top-results items xf)))))
    (testing "a full queue only saves the top items"
      (let [sorted-items (->> (+ 10 search-config/max-filtered-results)
                              range
                              reverse ;; descending order
                              (map (fn [i]
                                     {:score  [1 2 3 i]
                                      :result (str "item " i)})))]
        (is (= (->> sorted-items
                    (take search-config/max-filtered-results)
                    (map :result))
               (search/top-results (shuffle sorted-items) xf)))))))

(deftest match-context-test
  (let [context  #'search/match-context
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
                 (tokens '(one two
                           this should not be included
                           eleven twelve
                           rasta toucan
                           alpha beta
                           some other noise
                           the end))))))))

(deftest test-largest-common-subseq-length
  (let [subseq-length (partial #'search/largest-common-subseq-length =)]
    (testing "greedy choice can't be taken"
      (is (= 3
             (subseq-length ["garden" "path" "this" "is" "not" "a" "garden" "path"]
                            ["a" "garden" "path"]))))
    (testing "no match"
      (is (= 0
             (subseq-length ["can" "not" "be" "found"]
                            ["The" "toucan" "is" "a" "South" "American" "bird"]))))
    (testing "long matches"
      (is (= 28
             (subseq-length (map str '(this social bird lives in small flocks in lowland rainforests in countries such as costa rica
                                       it flies short distances between trees toucans rest in holes in trees))
                            (map str '(here is some filler
                                       this social bird lives in small flocks in lowland rainforests in countries such as costa rica
                                       it flies short distances between trees toucans rest in holes in trees
                                       here is some more filler))))))))

(deftest pinned-score-test
  (let [score #'search/pinned-score
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

(deftest recency-score-test
  (let [score    #'search/recency-score
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

(deftest combined-test
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
                (map (partial search/score-and-result search-string))
                (sort-by :score)
                reverse
                (map :result)
                (map :name))))))

(deftest score-and-result-test
  (testing "If all scores are 0, does not divide by zero"
    (let [scorer (reify search/ResultScore
                   (score-result [_ search-result]
                     [{:weight 100 :score 0 :name "Some score type"}
                      {:weight 100 :score 0 :name "Some other score type"}]))]
      (is (= 0 (:score (search/score-and-result scorer "" {:name "racing yo" :model "card"})))))))
