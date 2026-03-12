(ns ^:mb/driver-tests metabase.query-processor.null-array-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]))

(deftest ^:parallel null-array-test
  (testing "a null array should be handled gracefully and return nil"
    (mt/test-drivers (mt/normal-drivers-with-feature :test/null-arrays)
      (is (= [[nil]]
             (-> (mt/native-query {:query (tx/native-null-array-query driver/*driver*)})
                 mt/process-query
                 mt/rows))))))
