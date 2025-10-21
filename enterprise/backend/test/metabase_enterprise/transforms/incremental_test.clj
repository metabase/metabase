(ns ^:mb/driver-tests metabase-enterprise.transforms.incremental-test
  "Tests for incremental transforms functionality."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest create-incremental-transform-test
  (testing "Creating an incremental transform with keyset strategy"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [target-table "incremental_test"]
            (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))
                  source-query {:database (mt/id)
                                :type "native"
                                :native {:query "SELECT * FROM transforms_products WHERE id > {{watermark}}"
                                         :template-tags {"watermark" {:id "watermark"
                                                                      :name "watermark"
                                                                      :display-name "Watermark"
                                                                      :type :number
                                                                      :default 0
                                                                      :required false}}}}
                  transform-payload {:name "Test Incremental Transform"
                                     :source {:type "query"
                                              :query source-query
                                              :source-incremental-strategy {:type "keyset"
                                                                            :keyset-column "id"}}
                                     :target {:type "table-incremental"
                                              :schema schema
                                              :name target-table
                                              :target-incremental-strategy {:type "append"}}}]
              (testing "Transform is created successfully"
                (mt/with-temp [:model/Transform transform transform-payload]
                  (is (some? (:id transform)))
                  (is (= "Test Incremental Transform" (:name transform)))
                  (is (= "table-incremental" (-> transform :target :type)))
                  (is (= "keyset" (-> transform :source :source-incremental-strategy :type)))
                  (is (= "id" (-> transform :source :source-incremental-strategy :keyset-column)))

                  (testing "No watermark exists initially"
                    (is (nil? (t2/select-one :model/TransformWatermark :transform_id (:id transform)))))

                  (testing "Can retrieve transform via API"
                    (let [retrieved (mt/user-http-request :crowberto :get 200 (format "ee/transform/%d" (:id transform)))]
                      (is (= (:id transform) (:id retrieved)))
                      (is (= "Test Incremental Transform" (:name retrieved)))))

                  (testing "Transform appears in list endpoint"
                    (let [transforms (mt/user-http-request :crowberto :get 200 "ee/transform")
                          our-transform (first (filter #(= (:id transform) (:id %)) transforms))]
                      (is (some? our-transform))
                      (is (= "Test Incremental Transform" (:name our-transform))))))))))))))

(deftest run-incremental-transform-twice-test
  (testing "Running an incremental transform twice processes only new data on second run"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [target-table "incremental_twice"]
            (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))
                  source-table-name (t2/select-one-fn :name :model/Table (mt/id :transforms_products))
                  source-query {:database (mt/id)
                                :type "native"
                                :native {:query "SELECT * FROM transforms_products WHERE id > {{watermark}}"
                                         :template-tags {"watermark" {:id "watermark"
                                                                      :name "watermark"
                                                                      :display-name "Watermark"
                                                                      :type :number
                                                                      :default 0
                                                                      :required false}}}}
                  transform-payload {:name "Incremental Transform"
                                     :source {:type "query"
                                              :query source-query
                                              :source-incremental-strategy {:type "keyset"
                                                                            :keyset-column "id"}}
                                     :target {:type "table-incremental"
                                              :schema schema
                                              :name target-table
                                              :target-incremental-strategy {:type "append"}}}]
              (mt/with-temp [:model/Transform transform transform-payload]
                (testing "First run processes all data"
                  (transforms.i/execute! transform {:run-method :manual})
                  (let [table (transforms.tu/wait-for-table target-table 10000)
                        mp (mt/metadata-provider)
                        table-metadata (lib.metadata/table mp (:id table))
                        count-query (lib/aggregate (lib/query mp table-metadata) (lib/count))
                        result (qp/process-query count-query)
                        row-count (-> result :data :rows first first)]
                    (is (= 16 row-count) "First run should process all 16 products")

                    (testing "Watermark is created after first run"
                      (let [watermark (t2/select-one :model/TransformWatermark :transform_id (:id transform))]
                        (is (some? watermark))
                        (is (= 16 (:watermark_value watermark)) "Watermark should be MAX(id) = 16")))))

                (testing "Second run with no new data processes nothing"
                  (transforms.i/execute! transform {:run-method :manual})
                  (let [table (t2/select-one :model/Table :name target-table)
                        mp (mt/metadata-provider)
                        table-metadata (lib.metadata/table mp (:id table))
                        count-query (lib/aggregate (lib/query mp table-metadata) (lib/count))
                        result (qp/process-query count-query)
                        row-count (-> result :data :rows first first)]
                    (is (= 16 row-count) "Second run should not add any rows")

                    (testing "Watermark remains unchanged"
                      (let [watermark (t2/select-one :model/TransformWatermark :transform_id (:id transform))]
                        (is (= 16 (:watermark_value watermark)) "Watermark should still be 16")))))

                (testing "Third run after adding new data processes only new rows"
                  (let [spec (sql-jdbc.conn/db->pooled-connection-spec (mt/id))
                        schema-prefix (if schema (str schema ".") "")
                        insert-sql (format "INSERT INTO %s%s (name, category, price, created_at) VALUES ('New Product 1', 'Widget', 99.99, '2024-01-17T10:00:00'), ('New Product 2', 'Gadget', 199.99, '2024-01-18T10:00:00')"
                                           schema-prefix
                                           source-table-name)]
                    (driver/execute-raw-queries! driver/*driver* spec [[insert-sql]])
                    (sync/sync-database! (mt/db) {:scan :schema})

                    (transforms.i/execute! transform {:run-method :manual})
                    (let [table (t2/select-one :model/Table :name target-table)
                          mp (mt/metadata-provider)
                          table-metadata (lib.metadata/table mp (:id table))
                          count-query (lib/aggregate (lib/query mp table-metadata) (lib/count))
                          result (qp/process-query count-query)
                          row-count (-> result :data :rows first first)]
                      (is (= 18 row-count) "Third run should add 2 new rows (16 + 2 = 18)")

                      (testing "Watermark is updated to new MAX(id)"
                        (let [watermark (t2/select-one :model/TransformWatermark :transform_id (:id transform))]
                          (is (= 18 (:watermark_value watermark)) "Watermark should be updated to 18"))))))))))))))


