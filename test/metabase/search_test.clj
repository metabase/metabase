(ns metabase.search-test
  (:require [clojure.test :refer :all]
            [metabase.search :as search]))

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
