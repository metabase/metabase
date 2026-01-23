(ns ^:mb/driver-tests metabase-enterprise.transforms-base.core-test
  "Tests for base transform execution without transform_run tracking.

   These tests verify the core contract of transforms-base.core/execute!:
   - Returns result in memory (not writing transform_run)
   - Respects cancelled? callback
   - Returns error info on failure"
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-base.core :as transforms-base]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :refer [with-transform-cleanup!]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest execute-returns-result-map-test
  (testing "Base execute! returns result map and does NOT create transform_run"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
            (with-transform-cleanup! [target-table {:type   :table
                                                    :schema schema
                                                    :name   "base_exec_test"}]
              (let [mp (mt/metadata-provider)
                    transforms-products (lib.metadata/table mp (mt/id :transforms_products))
                    products-category (lib.metadata/field mp (mt/id :transforms_products :category))
                    query (-> (lib/query mp transforms-products)
                              (lib/filter (lib/= products-category "Widget"))
                              (lib/limit 5))]
                (mt/with-temp [:model/Transform transform {:name   "base-test-transform"
                                                           :source {:type  :query
                                                                    :query query}
                                                           :target target-table}]
                  (let [transform-run-count-before (t2/count :model/TransformRun :transform_id (:id transform))
                        result (transforms-base/execute! transform)
                        transform-run-count-after (t2/count :model/TransformRun :transform_id (:id transform))]

                    (testing "Returns result map with :status"
                      (is (map? result))
                      (is (= :succeeded (:status result))))

                    (testing "Result contains :result key"
                      (is (contains? result :result)))

                    (testing "Does NOT create transform_run row"
                      (is (= transform-run-count-before transform-run-count-after)
                          "Base execute! should not write to transform_run table"))))))))))))

(deftest execute-respects-cancelled-callback-test
  (testing "Base execute! respects cancelled? callback"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
            (with-transform-cleanup! [target-table {:type   :table
                                                    :schema schema
                                                    :name   "cancel_test"}]
              (let [mp (mt/metadata-provider)
                    transforms-products (lib.metadata/table mp (mt/id :transforms_products))
                    query (lib/query mp transforms-products)]
                (mt/with-temp [:model/Transform transform {:name   "cancel-test-transform"
                                                           :source {:type  :query
                                                                    :query query}
                                                           :target target-table}]

                  (testing "When cancelled? returns true before execution, returns :cancelled"
                    (let [result (transforms-base/execute! transform {:cancelled? (constantly true)})]
                      (is (= :cancelled (:status result)))
                      (is (some? (:error result))))))))))))))

(deftest execute-returns-error-on-failure-test
  (testing "Base execute! returns error info on failure"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
            (with-transform-cleanup! [target-table {:type   :table
                                                    :schema schema
                                                    :name   "error_test"}]
              ;; Create a transform with invalid query (nonexistent table)
              (mt/with-temp [:model/Transform transform {:name   "error-test-transform"
                                                         :source {:type  :query
                                                                  :query {:database (mt/id)
                                                                          :type     :native
                                                                          :native   {:query "SELECT * FROM nonexistent_table_xyz"}}}
                                                         :target target-table}]
                (let [result (transforms-base/execute! transform)]

                  (testing "Returns :failed status"
                    (is (= :failed (:status result))))

                  (testing "Contains :error with exception"
                    (is (some? (:error result)))
                    (is (instance? Exception (:error result)))))))))))))
