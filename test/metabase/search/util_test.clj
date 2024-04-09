(ns metabase.search.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.util :as search.util]))

(deftest ^:parallel tokenize-test
  (testing "basic tokenization"
    (is (= ["Rasta" "the" "Toucan's" "search"]
           (search.util/tokenize "Rasta the Toucan's search")))
    (is (= ["Rasta" "the" "Toucan"]
           (search.util/tokenize "                Rasta\tthe    \tToucan     ")))
    (is (= []
           (search.util/tokenize " \t\n\t ")))
    (is (= []
           (search.util/tokenize "")))
    (is (thrown-with-msg? Exception #"should be a string"
                          (search.util/tokenize nil)))))

(deftest ^:parallel test-largest-common-subseq-length
  (let [subseq-length (partial search.util/largest-common-subseq-length =)]
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
