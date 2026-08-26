(ns metabase.search.in-place.util-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.search.in-place.util :as search.util]))

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
                                            here is some more filler))))))
    (testing "empty inputs"
      (is (= 0 (subseq-length [] [])))
      (is (= 0 (subseq-length [] [1 2 3])))
      (is (= 0 (subseq-length [1 2 3] []))))
    (testing "custom equality predicate"
      (let [substring-match? (fn [needle haystack] (str/includes? haystack needle))]
        (is (= 2
               (search.util/largest-common-subseq-length substring-match?
                                                         ["gar" "pa"]
                                                         ["foo" "garden" "path"])))))))

(deftest ^:parallel largest-common-subseq-length-large-grid-test
  (testing "a 30x30 fully-matching grid computes promptly with the correct length"
    (is (= 30
           (search.util/largest-common-subseq-length = (repeat 30 :x) (repeat 30 :x))))))
