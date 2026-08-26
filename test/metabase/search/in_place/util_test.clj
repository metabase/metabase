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
  (let [subseq-length (partial search.util/largest-common-subseq-length =)]
    (testing "a 30x30 fully-matching grid computes promptly with the correct length"
      (is (= 30 (subseq-length (repeat 30 :x) (repeat 30 :x)))))
    (testing "no matches at all (every cell is a dead end)"
      (is (= 0 (subseq-length (range 200) (range 200 400)))))
    (testing "alternating tokens: many short runs that never chain"
      (is (= 1 (subseq-length (take 200 (cycle [:a :b])) (repeat 200 :a)))))
    (testing "a single mismatch in the middle halves the run"
      (is (= 100 (subseq-length (repeat 201 :x) (concat (repeat 100 :x) [:y] (repeat 100 :x))))))
    (testing "asymmetric inputs"
      (is (= 1 (subseq-length [:x] (repeat 5000 :x))))
      (is (= 1 (subseq-length (repeat 5000 :x) [:x]))))
    (testing "well above the 30-token cap the scorer applies"
      (is (= 500 (subseq-length (range 500) (range 500)))))))

(deftest ^:parallel largest-common-subseq-length-eq-call-count-test
  (testing "eq is invoked exactly once per cell of the n*m grid, regardless of match density"
    (doseq [[xs ys] [[(range 40) (range 25)]
                     [(repeat 40 :x) (repeat 25 :x)]
                     [(range 40) (range 100 125)]]]
      (let [calls (atom 0)
            eq    (fn [a b] (swap! calls inc) (= a b))]
        (search.util/largest-common-subseq-length eq xs ys)
        (is (= (* 40 25) @calls))))))
