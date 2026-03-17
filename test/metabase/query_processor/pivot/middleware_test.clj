(ns metabase.query-processor.pivot.middleware-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.pivot.middleware :as qp.pivot.middleware]))

(deftest ^:parallel splice-in-remap-test
  (let [splice #'qp.pivot.middleware/splice-in-remap]
    (is (= []
           (splice [] {1 0, 4 3})))
    (is (= [0 1]
           (splice [0] {1 0, 4 3})))
    (is (= [2]
           (splice [1] {1 0, 4 3})))
    (is (= [0 1 2]
           (splice [0 1] {1 0, 4 3})))
    (is (= [0 1 3 4]
           (splice [0 2] {1 0, 4 3})))
    (testing "chained remapping"
      (is (= [1 2 3 5]
             (splice [1 2] {1 2, 2 5})))
      (is (= [1 2 3 4 5]
             (splice [1 2 3] {1 2, 2 5})))
      (is (= [1 2 3 5 6]
             (splice [1 2 4] {1 2, 2 5})))
      (is (= [1 2 3 5 7]
             (splice [1 2 5] {1 2, 2 5})))
      (is (= [1 2 3 5 8]
             (splice [1 2 6] {1 2, 2 5})))
      (is (= [1 2 3 5 8]
             (splice [1 2 6] {1 2, 2 5, 3 2}))))))
