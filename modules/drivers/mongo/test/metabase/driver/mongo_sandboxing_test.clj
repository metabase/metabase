(ns ^:mb/driver-tests metabase.driver.mongo-sandboxing-test
  "End-to-end sandboxing tests for the Mongo driver, focused on scenarios that involve nested object fields."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.driver.mongo-test :as mongo-test]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(deftest sandbox-preserves-nested-object-columns-test
  (testing "MBQL sandbox on a Mongo table with nested object fields does not drop the nested columns (#75305)"
    (mt/test-driver :mongo
      (mt/dataset mongo-test/nested-bindata-coll
        (met/with-gtaps! {:gtaps      {:nested-bindata {:remappings {:user-int ["variable" [:field (mt/id :nested-bindata :int) nil]]}}}
                          :attributes {"user-int" 1}}
          (let [mp        (mt/metadata-provider)
                query     (lib/query mp (lib.metadata/table mp (mt/id :nested-bindata)))
                result    (mt/user-http-request :rasta :post 202 "dataset" query)
                col-names (->> result :data :cols (map :name) set)]
            (is (=? {:status "completed" :row_count 1} result))
            (testing "nested-field columns are present in the sandboxed result"
              (is (contains? col-names "nested_mixed_uuid.nested_data"))
              (is (contains? col-names "nested_mixed_not_uuid.nested_data_2")))))))))
