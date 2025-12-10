(ns metabase-enterprise.workspaces.dependencies-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.dependencies :as ws.deps]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fn [tests]
                      (mt/with-premium-features [:workspaces :dependencies :transforms]
                        (tests))))

(use-fixtures :each (fn [tests]
                      (mt/with-model-cleanup [:model/Workspace
                                              :model/WorkspaceTransform
                                              :model/WorkspaceInput
                                              :model/WorkspaceOutput
                                              :model/WorkspaceDependency]
                        (tests))))

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
        (is (= {:database_id (mt/id)
                :schema      "public"
                :table       "orders_with_products"}
               (:output result))))
      (testing "inputs contain the source table with metadata"
        (let [inputs (:inputs result)
              table-names (set (map :table inputs))]
          (is (= 1 (count inputs)))
          (is (contains? table-names "ORDERS"))
          (is (every? #(and (:database_id %)
                            (:table %)
                            (:table_id %))
                      inputs)))))))

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
        (is (= {:database_id (mt/id)
                :schema      "public"
                :table       "python_result"}
               (:output result))))
      (testing "inputs contain the source tables"
        (let [inputs (:inputs result)
              table-names (set (map :table inputs))]
          (is (= 2 (count inputs)))
          (is (contains? table-names "ORDERS"))
          (is (contains? table-names "PRODUCTS")))))))

(deftest analyze-entity-asserts-transform-type-test
  (testing "analyze-entity asserts entity-type is :transform"
    (is (thrown-with-msg? Exception #"transform"
                          (ws.deps/analyze-entity :card {})))))

;;; ---------------------------------------- write-dependencies! tests ----------------------------------------

(deftest write-dependencies-creates-output-test
  (testing "write-dependencies! creates workspace_output record"
    (mt/with-temp [:model/Workspace workspace {:name        "Test Workspace"
                                               :database_id (mt/id)}
                   :model/WorkspaceTransform wt {:workspace_id (:id workspace)
                                                 :name         "Test Transform"
                                                 :source       {:type "query" :query {}}
                                                 :target       {:database (mt/id)
                                                                :schema   "public"
                                                                :name     "test_output"}}]
      (let [analysis {:output {:database_id (mt/id)
                               :schema      "public"
                               :table       "test_output"}
                      :inputs []}]
        (ws.deps/write-dependencies! (:id workspace) :transform (:ref_id wt) analysis)
        (let [output (t2/select-one :model/WorkspaceOutput
                                    :workspace_id (:id workspace)
                                    :ref_id (:ref_id wt))]
          (is (some? output))
          (is (= (mt/id) (:database_id output)))
          (is (= "public" (:schema output)))
          (is (= "test_output" (:table output))))))))

(deftest write-dependencies-creates-inputs-test
  (testing "write-dependencies! creates workspace_input records for external dependencies"
    (mt/with-temp [:model/Workspace workspace {:name        "Test Workspace"
                                               :database_id (mt/id)}
                   :model/WorkspaceTransform wt {:workspace_id (:id workspace)
                                                 :name         "Test Transform"
                                                 :source       {:type "query" :query {}}
                                                 :target       {:database (mt/id)
                                                                :schema   "public"
                                                                :name     "test_output"}}]
      (let [orders-table (t2/select-one [:model/Table :db_id :schema :name] :id (mt/id :orders))
            analysis     {:output {:database_id (mt/id)
                                   :schema      "public"
                                   :table       "test_output"}
                          :inputs [{:database_id (:db_id orders-table)
                                    :schema      (:schema orders-table)
                                    :table       (:name orders-table)
                                    :table_id    (mt/id :orders)}]}]
        (ws.deps/write-dependencies! (:id workspace) :transform (:ref_id wt) analysis)
        (let [input (t2/select-one :model/WorkspaceInput
                                   :workspace_id (:id workspace)
                                   :table_id (mt/id :orders))]
          (is (some? input))
          (is (= (:db_id orders-table) (:database_id input)))
          (is (= (:name orders-table) (:table input))))))))

(deftest write-dependencies-creates-edges-test
  (testing "write-dependencies! creates workspace_dependency edges"
    (mt/with-temp [:model/Workspace workspace {:name        "Test Workspace"
                                               :database_id (mt/id)}
                   :model/WorkspaceTransform wt {:workspace_id (:id workspace)
                                                 :name         "Test Transform"
                                                 :source       {:type "query" :query {}}
                                                 :target       {:database (mt/id)
                                                                :schema   "public"
                                                                :name     "test_output"}}]
      (let [orders-table (t2/select-one [:model/Table :db_id :schema :name] :id (mt/id :orders))
            analysis     {:output {:database_id (mt/id)
                                   :schema      "public"
                                   :table       "test_output"}
                          :inputs [{:database_id (:db_id orders-table)
                                    :schema      (:schema orders-table)
                                    :table       (:name orders-table)
                                    :table_id    (mt/id :orders)}]}]
        (ws.deps/write-dependencies! (:id workspace) :transform (:ref_id wt) analysis)
        (let [edges (t2/select :model/WorkspaceDependency
                               :workspace_id (:id workspace)
                               :from_entity_type :transform
                               :from_entity_id (:ref_id wt))]
          (is (= 1 (count edges)))
          (is (= :input (:to_entity_type (first edges)))))))))

(deftest write-dependencies-internal-dependency-test
  (testing "write-dependencies! links to workspace_output for internal dependencies"
    (mt/with-temp [:model/Workspace workspace {:name        "Test Workspace"
                                               :database_id (mt/id)}
                   :model/WorkspaceTransform wt1 {:workspace_id (:id workspace)
                                                  :name         "Upstream Transform"
                                                  :source       {:type "query" :query {}}
                                                  :target       {:database (mt/id)
                                                                 :schema   "public"
                                                                 :name     "upstream_output"}}
                   :model/WorkspaceTransform wt2 {:workspace_id (:id workspace)
                                                  :name         "Downstream Transform"
                                                  :source       {:type "query" :query {}}
                                                  :target       {:database (mt/id)
                                                                 :schema   "public"
                                                                 :name     "downstream_output"}}]
      ;; First, write dependencies for the upstream transform (creates the output)
      (ws.deps/write-dependencies! (:id workspace) :transform (:ref_id wt1)
                                   {:output {:database_id (mt/id)
                                             :schema      "public"
                                             :table       "upstream_output"}
                                    :inputs []})

      ;; Now write dependencies for downstream that depends on upstream's output
      (ws.deps/write-dependencies! (:id workspace) :transform (:ref_id wt2)
                                   {:output {:database_id (mt/id)
                                             :schema      "public"
                                             :table       "downstream_output"}
                                    :inputs [{:database_id (mt/id)
                                              :schema      "public"
                                              :table       "upstream_output"
                                              :table_id    nil}]})

      (let [edges (t2/select :model/WorkspaceDependency
                             :workspace_id (:id workspace)
                             :from_entity_type :transform
                             :from_entity_id (:ref_id wt2))]
        (testing "creates edge to output (internal dependency)"
          (is (= 1 (count edges)))
          (is (= :output (:to_entity_type (first edges)))))
        (testing "no workspace_input created for internal dependency"
          (is (nil? (t2/select-one :model/WorkspaceInput
                                   :workspace_id (:id workspace)
                                   :table "upstream_output"))))))))

(deftest write-dependencies-updates-on-change-test
  (testing "write-dependencies! updates records and removes stale edges"
    (mt/with-temp [:model/Workspace workspace {:name        "Test Workspace"
                                               :database_id (mt/id)}
                   :model/WorkspaceTransform wt {:workspace_id (:id workspace)
                                                 :name         "Test Transform"
                                                 :source       {:type "query" :query {}}
                                                 :target       {:database (mt/id)
                                                                :schema   "public"
                                                                :name     "test_output"}}]
      (let [orders-table   (t2/select-one [:model/Table :db_id :schema :name] :id (mt/id :orders))
            products-table (t2/select-one [:model/Table :db_id :schema :name] :id (mt/id :products))]
        ;; First write with orders dependency
        (ws.deps/write-dependencies! (:id workspace) :transform (:ref_id wt)
                                     {:output {:database_id (mt/id)
                                               :schema      "public"
                                               :table       "test_output"}
                                      :inputs [{:database_id (:db_id orders-table)
                                                :schema      (:schema orders-table)
                                                :table       (:name orders-table)
                                                :table_id    (mt/id :orders)}]})
        (is (= 1 (t2/count :model/WorkspaceDependency :workspace_id (:id workspace))))

        ;; Update to depend on products instead
        (ws.deps/write-dependencies! (:id workspace) :transform (:ref_id wt)
                                     {:output {:database_id (mt/id)
                                               :schema      "public"
                                               :table       "test_output"}
                                      :inputs [{:database_id (:db_id products-table)
                                                :schema      (:schema products-table)
                                                :table       (:name products-table)
                                                :table_id    (mt/id :products)}]})

        (testing "old edge is removed"
          (is (= 1 (t2/count :model/WorkspaceDependency :workspace_id (:id workspace)))))
        (testing "new input is created"
          (is (some? (t2/select-one :model/WorkspaceInput
                                    :workspace_id (:id workspace)
                                    :table_id (mt/id :products)))))))))

;;; ---------------------------------------- Integration test ----------------------------------------

(deftest analyze-and-write-integration-test
  (testing "Full flow: analyze a real transform and write its dependencies"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (mt/with-temp [:model/Workspace workspace {:name        "Integration Test Workspace"
                                                 :database_id (mt/id)}
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
          (ws.deps/write-dependencies! (:id workspace) :transform (:ref_id wt) analysis)

          (testing "output record created"
            (is (= 1 (t2/count :model/WorkspaceOutput :workspace_id (:id workspace)))))
          (testing "input record created for ORDERS table"
            (is (= 1 (t2/count :model/WorkspaceInput :workspace_id (:id workspace)))))
          (testing "dependency edge created"
            (is (= 1 (t2/count :model/WorkspaceDependency :workspace_id (:id workspace))))))))))
