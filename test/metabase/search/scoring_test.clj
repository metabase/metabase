(ns metabase.search.scoring-test
  (:require [clojure.test :refer :all]
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
  (comp :text-score
        (partial #'search/text-score-with [scorer])))

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
                 ["aviary" "stats"]))))))

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
        item (fn [collection-position] {:collection_position collection-position})]
    (testing "it provides a sortable score"
      (is (= [1 2 3 nil 0]
             (->> [(item 0)
                    ;; nil and 0 could theoretically be in either order, but it's a stable sort, so this is fine
                   (item nil)
                   (item 3)
                   (item 1)
                   (item 2)]
                  (sort-by score)
                  reverse
                  (map :collection_position)))))))
