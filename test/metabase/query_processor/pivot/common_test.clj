(ns metabase.query-processor.pivot.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.pivot.common :as pivot.common]))

(deftest ^:parallel group-bitmask-test
  (doseq [[indices expected] {[0]     6
                              [0 1]   4
                              [0 1 2] 0
                              []      7}]
    (is (= expected
           (pivot.common/group-bitmask 3 indices)))))

(deftest ^:parallel group-bitmask-test-2
  (testing "Should work for more than 31 breakouts"
    (is (= 4294967295 (pivot.common/group-bitmask 32 [])))))
