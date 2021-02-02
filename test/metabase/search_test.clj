(ns metabase.search-test
  (:require [clojure.test :refer :all]
            [metabase.search :as search]))

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

(deftest consecutivity-score-test
  (let [score #'search/consecutivity-score]
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
      (is (= 0
             (score ["rasta"]
                    (result-row "just a straight-up imposter")))
          (= 0
             (score ["rasta" "the" "toucan"]
                    (result-row "")))))))
