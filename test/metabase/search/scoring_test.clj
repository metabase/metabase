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
  (comp :score
        (partial #'search/score-with [scorer])))

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

(deftest accumulate-top-results-test
  (let [xf (map identity)]
    (testing "a non-full queue behaves normally"
      (let [items (map (fn [i] [[2 2 i] (str "item " i)]) (range 10))]
        (is (= items
               (transduce xf search/accumulate-top-results items)))))
    (testing "a full queue only saves the top items"
      (let [sorted-items (map (fn [i] [[1 2 3 i] (str "item " i)]) (range (+ 10 search-config/max-filtered-results)))]
        (is (= (drop 10 sorted-items)
               (transduce xf search/accumulate-top-results (shuffle sorted-items))))))))
