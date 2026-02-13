(ns metabase-enterprise.workspaces.dependencies-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.dependencies :as ws.deps]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(ws.tu/ws-fixtures!)

;;; ---------------------------------------- analyze-entity tests ----------------------------------------

(deftest ^:parallel analyze-entity-query-transform-test
  (testing "analyze-entity extracts dependencies from a query transform"
    (let [mp        (mt/metadata-provider)
          query     (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          transform {:source {:type  "query"
                              :query query}
                     :target {:database (mt/id)
                              :schema   "public"
                              :name     "orders_with_products"}}
          result    (ws.deps/analyze-entity :transform transform)]
      (testing "output is extracted from target"
        (is (= {:db_id  (mt/id)
                :schema "public"
                :table  "orders_with_products"}
               (:output result))))
      (testing "inputs contain the source table with table_id (since table exists)"
        (let [inputs (:inputs result)
              table-names (set (map :table inputs))]
          (is (= 1 (count inputs)))
          (is (contains? table-names (mt/format-name :orders)))
          ;; MBQL queries have table_id since the tables must exist
          (is (every? #(and (:db_id %)
                            (:table %)
                            (:table_id %))
                      inputs)))))))

(deftest ^:parallel analyze-entity-native-query-existing-table-test
  (testing "analyze-entity extracts dependencies from native query referencing existing table"
    (let [mp        (mt/metadata-provider)
          query     (lib/native-query mp "SELECT * FROM ORDERS WHERE total > 100")
          transform {:source {:type  "query"
                              :query query}
                     :target {:database (mt/id)
                              :schema   "analytics"
                              :name     "high_value_orders"}}
          result    (ws.deps/analyze-entity :transform transform)]
      (testing "output is extracted from target"
        (is (= {:db_id  (mt/id)
                :schema "analytics"
                :table  "high_value_orders"}
               (:output result))))
      (testing "inputs include table_id since ORDERS table exists"
        (let [inputs (:inputs result)]
          ;; Native query parsing should detect ORDERS table reference and look up table_id
          (is (pos? (count inputs)))
          (is (every? #(and (:db_id %)
                            (:table %)
                            (:table_id %))
                      inputs)))))))

(deftest ^:parallel analyze-entity-native-query-nonexistent-table-test
  (testing "analyze-entity handles native query referencing non-existent table"
    (let [mp        (mt/metadata-provider)
          ;; Reference a table that doesn't exist in the database
          query     (lib/native-query mp "SELECT * FROM future_sales_data WHERE region = 'US'")
          transform {:source {:type  "query"
                              :query query}
                     :target {:database (mt/id)
                              :schema   "analytics"
                              :name     "regional_sales"}}
          result    (ws.deps/analyze-entity :transform transform)]
      (testing "output is extracted from target"
        (is (= {:db_id  (mt/id)
                :schema "analytics"
                :table  "regional_sales"}
               (:output result))))
      (testing "inputs have logical reference but no table_id (table doesn't exist)"
        (let [inputs (:inputs result)]
          ;; Should still parse the table reference even though table doesn't exist
          (is (pos? (count inputs)))
          ;; Has db_id and table name but NOT table_id
          (is (every? #(and (:db_id %)
                            (:table %))
                      inputs))
          ;; Verify table_id is nil or missing for non-existent tables
          (is (every? #(nil? (:table_id %)) inputs)))))))

(deftest ^:parallel analyze-entity-python-transform-test
  (testing "analyze-entity extracts dependencies from a python transform"
    (let [transform {:source {:type          "python"
                              :source-tables {"orders"   (mt/id :orders)
                                              "products" (mt/id :products)}
                              :body          "def transform(orders, products): return orders"}
                     :target {:database (mt/id)
                              :schema   "public"
                              :name     "python_result"}}
          result    (ws.deps/analyze-entity :transform transform)]
      (testing "output is extracted from target"
        (is (= {:db_id  (mt/id)
                :schema "public"
                :table  "python_result"}
               (:output result))))
      (testing "inputs contain the source tables with table_ids"
        (let [inputs (:inputs result)
              table-names (set (map :table inputs))]
          (is (= 2 (count inputs)))
          (is (contains? table-names (mt/format-name :orders)))
          (is (contains? table-names (mt/format-name :products)))
          ;; Python transforms have table_ids since source-tables maps to existing table IDs
          (is (every? :table_id inputs)))))))

(deftest analyze-entity-asserts-transform-type-test
  (testing "analyze-entity asserts entity-type is :transform"
    (is (thrown-with-msg? Exception #"Only transform entity type is supported"
                          (ws.deps/analyze-entity :card {})))))

;;; ---------------------------------------- write-analysis! tests ----------------------------------------

(defn- write-analysis! [workspace-id isolated-schema entity-type ref-id analysis]
  ;; Always do new analysis
  (t2/query {:update :workspace_transform
             :set    {:analysis_version [:+ :analysis_version 1]}
             :where  [:and [:= :workspace_id workspace-id] [:= :ref_id ref-id]]})
  (ws.deps/write-entity-analysis! workspace-id isolated-schema entity-type ref-id analysis
                                  (case entity-type
                                    :transform (t2/select-one-fn :analysis_version
                                                                 [:model/WorkspaceTransform :analysis_version]
                                                                 :workspace_id workspace-id
                                                                 :ref_id ref-id))))

(deftest write-dependencies-creates-output-test
  (testing "write-dependencies! creates workspace_output record"
    (mt/with-temp [:model/Workspace workspace {:name        (ws.tu/unique-name)
                                               :database_id (mt/id)
                                               :schema      "test_isolated_schema"}
                   :model/WorkspaceTransform wt {:workspace_id (:id workspace)
                                                 :name         "Test Transform"
                                                 :source       {:type "query" :query {}}
                                                 :target       {:database (mt/id)
                                                                :schema   "public"
                                                                :name     "test_output"}}]
      (let [analysis {:output {:db_id  (mt/id)
                               :schema "public"
                               :table  "test_output"}
                      :inputs []}]
        (write-analysis! (:id workspace) "test_isolated_schema" :transform (:ref_id wt) analysis)
        (let [output (t2/select-one :model/WorkspaceOutput
                                    :workspace_id (:id workspace)
                                    :ref_id (:ref_id wt))]
          (is (some? output))
          (is (= (mt/id) (:db_id output)))
          (is (= "public" (:global_schema output)))
          (is (= "test_output" (:global_table output)))
          (is (= "test_isolated_schema" (:isolated_schema output)))
          (is (= "public__test_output" (:isolated_table output))))))))

(deftest write-dependencies-creates-inputs-test
  (testing "write-dependencies! creates workspace_input records for external dependencies"
    (let [iso-schema "test_isolated_schema"]
      (mt/with-temp [:model/Workspace workspace {:name        (ws.tu/unique-name)
                                                 :database_id (mt/id)
                                                 :schema      iso-schema}
                     :model/WorkspaceTransform wt {:workspace_id (:id workspace)
                                                   :name         "Test Transform"
                                                   :source       {:type "query" :query {}}
                                                   :target       {:database (mt/id)
                                                                  :schema   "public"
                                                                  :name     "test_output"}}]
        (let [orders-table (t2/select-one [:model/Table :db_id :schema :name] :id (mt/id :orders))
              analysis     {:output {:db_id  (mt/id)
                                     :schema "public"
                                     :table  "test_output"}
                            :inputs [{:db_id  (:db_id orders-table)
                                      :schema (:schema orders-table)
                                      :table  (:name orders-table)}]}]
          (write-analysis! (:id workspace) iso-schema :transform (:ref_id wt) analysis)
          (let [input (t2/select-one :model/WorkspaceInput
                                     :workspace_id (:id workspace)
                                     :table (:name orders-table))]
            (is (some? input))
            (is (= (:db_id orders-table) (:db_id input)))
            (is (= (:name orders-table) (:table input)))
            (testing "input is linked to transform via workspace_input_transform"
              (is (t2/exists? :model/WorkspaceInputTransform
                              :workspace_input_id (:id input)
                              :workspace_id (:id workspace)
                              :ref_id (:ref_id wt))))))))))

(deftest write-dependencies-updates-on-change-test
  (testing "write-dependencies! replaces inputs when dependencies change"
    (mt/with-temp [:model/Workspace workspace {:name        (ws.tu/unique-name)
                                               :database_id (mt/id)
                                               :schema      "test_isolated_schema"}
                   :model/WorkspaceTransform wt {:workspace_id (:id workspace)
                                                 :name         "Test Transform"
                                                 :source       {:type "query" :query {}}
                                                 :target       {:database (mt/id)
                                                                :schema   "public"
                                                                :name     "test_output"}}]
      (let [orders-table   (t2/select-one [:model/Table :db_id :schema :name] :id (mt/id :orders))
            products-table (t2/select-one [:model/Table :db_id :schema :name] :id (mt/id :products))]
        ;; First write with orders dependency
        (write-analysis! (:id workspace) "test_isolated_schema" :transform (:ref_id wt)
                         {:output {:db_id  (mt/id)
                                   :schema "public"
                                   :table  "test_output"}
                          :inputs [{:db_id  (:db_id orders-table)
                                    :schema (:schema orders-table)
                                    :table  (:name orders-table)}]})
        (is (= 1 (t2/count :model/WorkspaceInput :workspace_id (:id workspace))))
        (is (= 1 (t2/count :model/WorkspaceInputTransform :workspace_id (:id workspace) :ref_id (:ref_id wt))))

        ;; Update to depend on products instead
        (write-analysis! (:id workspace) "test_isolated_schema" :transform (:ref_id wt)
                         {:output {:db_id  (mt/id)
                                   :schema "public"
                                   :table  "test_output"}
                          :inputs [{:db_id  (:db_id products-table)
                                    :schema (:schema products-table)
                                    :table  (:name products-table)}]})

        ;; Trigger clean-up
        (#'ws.impl/cleanup-old-transform-versions! (:id workspace) (:ref_id wt))

        (testing "old input link is removed, new input exists"
          ;; After cleanup, old WorkspaceInputTransform rows are removed.
          ;; The WorkspaceInput for orders may still exist (orphaned) but the join row is gone.
          (is (= 1 (t2/count :model/WorkspaceInputTransform :workspace_id (:id workspace) :ref_id (:ref_id wt))))
          (let [wit (t2/select-one :model/WorkspaceInputTransform :workspace_id (:id workspace) :ref_id (:ref_id wt))
                input (t2/select-one :model/WorkspaceInput :id (:workspace_input_id wit))]
            (is (= (:name products-table) (:table input)))))))))

;;; ---------------------------------------- Integration test ----------------------------------------

(deftest analyze-and-write-integration-test
  (testing "Full flow: analyze a real transform and write its dependencies"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (mt/with-temp [:model/Workspace workspace {:name        "Integration Test Workspace"
                                                 :database_id (mt/id)
                                                 :schema      "test_isolated_schema"}
                     :model/WorkspaceTransform wt {:workspace_id (:id workspace)
                                                   :name         "Orders Analysis"
                                                   :source       {:type "query" :query {}}
                                                   :target       {:database (mt/id)
                                                                  :schema   "analytics"
                                                                  :name     "orders_analysis"}}]
        ;; Create the transform entity with the proper query (not from DB)
        (let [transform-entity {:source {:type  "query"
                                         :query query}
                                :target {:database (mt/id)
                                         :schema   "analytics"
                                         :name     "orders_analysis"}}
              analysis         (ws.deps/analyze-entity :transform transform-entity)]
          (write-analysis! (:id workspace) "test_isolated_schema" :transform (:ref_id wt) analysis)

          (testing "output record created"
            (is (= 1 (t2/count :model/WorkspaceOutput :workspace_id (:id workspace)))))
          (testing "input record created for ORDERS table, linked via workspace_input_transform"
            (is (= 1 (t2/count :model/WorkspaceInput :workspace_id (:id workspace))))
            (let [input (t2/select-one :model/WorkspaceInput :workspace_id (:id workspace))]
              (is (t2/exists? :model/WorkspaceInputTransform
                              :workspace_input_id (:id input)
                              :workspace_id (:id workspace)
                              :ref_id (:ref_id wt))))))))))
