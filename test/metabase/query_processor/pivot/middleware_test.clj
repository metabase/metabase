(ns metabase.query-processor.pivot.middleware-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.pivot.middleware :as qp.pivot.middleware]))

(deftest ^:parallel full-breakout-combination-test
  (letfn [(combo [breakout-combination remaps]
            (#'qp.pivot.middleware/full-breakout-combination
             {:qp.pivot/remapped-breakout-combination breakout-combination
              :qp.pivot/remapped-indexes              remaps}))]
    (is (= []
           (combo [] {1 0, 4 3})))
    (is (= [0 1]
           (combo [0] {1 0, 4 3})))
    (is (= [2]
           (combo [1] {1 0, 4 3})))
    (is (= [0 1 2]
           (combo [0 1] {1 0, 4 3})))
    (is (= [0 1 3 4]
           (combo [0 2] {1 0, 4 3})))
    (testing "chained remapping"
      (is (= [1 2 3 5]
             (combo [1 2] {1 2, 2 5})))
      (is (= [1 2 3 4 5]
             (combo [1 2 3] {1 2, 2 5})))
      (is (= [1 2 3 5 6]
             (combo [1 2 4] {1 2, 2 5})))
      (is (= [1 2 3 5 7]
             (combo [1 2 5] {1 2, 2 5})))
      (is (= [1 2 3 5 8]
             (combo [1 2 6] {1 2, 2 5})))
      (is (= [1 2 3 5 8]
             (combo [1 2 6] {1 2, 2 5, 3 2}))))))
