(ns ^:mb/driver-tests metabase-enterprise.workspaces.execute-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.query-test-util :as query-util]
   [metabase-enterprise.transforms.test-util :as transforms.tu]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(ws.tu/ws-fixtures!)

(deftest run-workspace-transform-no-input-test
  (testing "Executing a workspace transform returns results and rolls back app DB records"
    (transforms.tu/with-transform-cleanup! [output-table "ws_execute_test"]
      (let [workspace    (ws.tu/create-ready-ws! "Execute Test Workspace")
            db-id        (:database_id workspace)
            body         {:name   "Test Transform"
                          :source {:type  "query"
                                   :query (mt/native-query {:query "SELECT 1 as id, 'hello' as name"})}
                          :target {:type     "table"
                                   :database db-id
                                   :schema   nil
                                   :name     output-table}}
            ws-transform (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace :transform nil body)
            ;; get initialized fields
            workspace    (t2/select-one :model/Workspace (:id workspace))
            ws-schema    (t2/select-one-fn :schema :model/Workspace (:id workspace))
            before       {:xf    (t2/count :model/Transform)
                          :xfrun (t2/count :model/TransformRun)}]

        (testing "execution returns expected result structure"
          (is (=? {:status     :succeeded
                   :start_time some?
                   :end_time   some?
                   :table      {:name   #(str/includes? % output-table)
                                :schema ws-schema}}
                  (mt/with-current-user (mt/user->id :crowberto)
                    (ws.impl/run-transform! workspace ws-transform))))
          (is (=? {:last_run_at some?}
                  (t2/select-one :model/WorkspaceTransform :ref_id (:ref_id ws-transform))))

          ;; Not sure why this is here, but we're testing the analysis metadata, which is lazy
          (ws.impl/get-or-calculate-graph workspace)
          (is (=? [{:workspace_id      (:id workspace)
                    :global_table      output-table
                    :global_schema     nil
                    :global_table_id   nil
                    :isolated_schema   string?
                    :isolated_table    string?
                    ;; TODO I think this is broken because of normalization breaking case equality
                    #_#_:isolated_table_id number?}]
                  (t2/select :model/WorkspaceOutput :workspace_id (:id workspace)))))

        (testing "app DB records are rolled back"
          (is (= before
                 {:xf    (t2/count :model/Transform)
                  :xfrun (t2/count :model/TransformRun)})))))))

(deftest dry-run-workspace-transform-test
  (testing "Dry-running a workspace transform returns rows without persisting"
    (let [workspace    (ws.tu/create-ready-ws! "DryRun Test Workspace")
          db-id        (:database_id workspace)
          body         {:name   "DryRun Transform"
                        :source {:type  "query"
                                 :query (mt/native-query {:query "SELECT 1 as id, 'hello' as name UNION ALL SELECT 2, 'world'"})}
                        :target {:type     "table"
                                 :database db-id
                                 :schema   nil
                                 :name     "ws_dryrun_test"}}
          ws-transform (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace :transform nil body)
          before       {:xf    (t2/count :model/Transform)
                        :xfrun (t2/count :model/TransformRun)}]

      (testing "dry-run returns data nested under :data like /api/dataset"
        (is (=? {:status :succeeded
                 :data   {:rows [[1 "hello"] [2 "world"]]
                          :cols [{:name "ID"} {:name "NAME"}]}
                 :table  {:name "ws_dryrun_test"}}
                (mt/with-current-user (mt/user->id :crowberto)
                  (ws.impl/dry-run-transform workspace ws-transform)))))

      (testing "last_run_at is NOT updated in dry-run mode"
        (is (nil? (:last_run_at (t2/select-one :model/WorkspaceTransform :ref_id (:ref_id ws-transform))))))

      (testing "app DB records are NOT created in dry-run mode"
        (is (= before
               {:xf    (t2/count :model/Transform)
                :xfrun (t2/count :model/TransformRun)}))))))

(deftest remap-python-source-test
  (let [remap-python-source #'ws.execute/remap-python-source]
    (testing "remaps to table ID when mapping has :id"
      (let [table-mapping {[1 "public" "orders"] {:db-id  1
                                                  :schema "ws_isolated_123"
                                                  :table  "orders_isolated"
                                                  :id     456}}
            source        {:type          "python"
                           :body          "import pandas as pd"
                           :source-tables {"orders" {:database_id 1
                                                     :schema      "public"
                                                     :table       "orders"
                                                     :table_id    123}}}]
        (is (= {:type          "python"
                :body          "import pandas as pd"
                :source-tables {"orders" 456}}
               (remap-python-source table-mapping source)))))

    (testing "remaps to map format when mapping has nil :id"
      (let [table-mapping {[1 "public" "orders"] {:db-id  1
                                                  :schema "ws_isolated_123"
                                                  :table  "orders_isolated"
                                                  :id     nil}}
            source        {:type          "python"
                           :body          "import pandas as pd"
                           :source-tables {"orders" {:database_id 1
                                                     :schema      "public"
                                                     :table       "orders"
                                                     :table_id    123}}}]
        (is (= {:type          "python"
                :body          "import pandas as pd"
                :source-tables {"orders" {:database_id 1
                                          :schema      "ws_isolated_123"
                                          :table       "orders_isolated"}}}
               (remap-python-source table-mapping source)))))

    (testing "leaves source-tables unchanged when no mapping exists"
      (let [table-mapping {}
            source        {:type          "python"
                           :body          "import pandas as pd"
                           :source-tables {"orders" {:database_id 1
                                                     :schema      "public"
                                                     :table       "orders"
                                                     :table_id    123}}}]
        (is (= source (remap-python-source table-mapping source)))))

    (testing "remaps legacy integer to table ID when mapping has :id"
      (let [table-mapping {123 {:db-id  1
                                :schema "ws_isolated_123"
                                :table  "orders_isolated"
                                :id     456}}
            source        {:type          "python"
                           :body          "import pandas as pd"
                           :source-tables {"orders" 123}}]
        (is (= {:type          "python"
                :body          "import pandas as pd"
                :source-tables {"orders" 456}}
               (remap-python-source table-mapping source)))))

    (testing "remaps legacy integer to map format when mapping has nil :id"
      (let [table-mapping {123 {:db-id  1
                                :schema "ws_isolated_123"
                                :table  "orders_isolated"
                                :id     nil}}
            source        {:type          "python"
                           :body          "import pandas as pd"
                           :source-tables {"orders" 123}}]
        (is (= {:type          "python"
                :body          "import pandas as pd"
                :source-tables {"orders" {:database_id 1
                                          :schema      "ws_isolated_123"
                                          :table       "orders_isolated"}}}
               (remap-python-source table-mapping source)))))

    (testing "leaves legacy integer table-id unchanged when no mapping exists"
      (let [table-mapping {}
            source        {:type          "python"
                           :body          "import pandas as pd"
                           :source-tables {"orders" 123}}]
        (is (= source (remap-python-source table-mapping source)))))

    (testing "handles mixed formats with mappings for both"
      (let [table-mapping {[1 "public" "orders"] {:db-id  1
                                                  :schema "ws_isolated_123"
                                                  :table  "orders_isolated"
                                                  :id     456}
                           789                    {:db-id  1
                                                   :schema "ws_isolated_123"
                                                   :table  "customers_isolated"
                                                   :id     999}}
            source        {:type          "python"
                           :body          "import pandas as pd"
                           :source-tables {"orders"    {:database_id 1
                                                        :schema      "public"
                                                        :table       "orders"
                                                        :table_id    123}
                                           "customers" 789}}]
        (is (= {:type          "python"
                :body          "import pandas as pd"
                :source-tables {"orders"    456
                                "customers" 999}}
               (remap-python-source table-mapping source)))))

    (testing "prefers table_id lookup over triple lookup for map format"
      (let [table-mapping {123                    {:db-id  1
                                                   :schema "ws_isolated_123"
                                                   :table  "orders_by_id"
                                                   :id     456}
                           [1 "public" "orders"] {:db-id  1
                                                  :schema "ws_isolated_123"
                                                  :table  "orders_by_triple"
                                                  :id     789}}
            source        {:type          "python"
                           :body          "import pandas as pd"
                           :source-tables {"orders" {:database_id 1
                                                     :schema      "public"
                                                     :table       "orders"
                                                     :table_id    123}}}]
        (is (= {:type          "python"
                :body          "import pandas as pd"
                :source-tables {"orders" 456}}
               (remap-python-source table-mapping source)))))

    (testing "falls back to triple lookup when table_id not in mapping"
      (let [table-mapping {[1 "public" "orders"] {:db-id  1
                                                  :schema "ws_isolated_123"
                                                  :table  "orders_isolated"
                                                  :id     456}}
            source        {:type          "python"
                           :body          "import pandas as pd"
                           :source-tables {"orders" {:database_id 1
                                                     :schema      "public"
                                                     :table       "orders"
                                                     :table_id    999}}}]
        (is (= {:type          "python"
                :body          "import pandas as pd"
                :source-tables {"orders" 456}}
               (remap-python-source table-mapping source)))))))

(deftest run-transform-marks-not-stale-on-success
  (testing "Successful transform run marks definition_stale=false"
    (let [query1 (mt/native-query {:query "SELECT 1 as id, 'hello' as name"})]
      (mt/with-temp [:model/Workspace {workspace-id :id}     {:name "Stale Test Workspace"}
                     :model/WorkspaceTransform {ref-id :ref_id} {:workspace_id workspace-id
                                                                 :ref_id (str (random-uuid))
                                                                 :name "Test Transform"
                                                                 :source {:type "query" :query query1}
                                                                 :target {:type     "table"
                                                                          :database (mt/id)
                                                                          :schema   nil
                                                                          :name     "ws_stale_test"}
                                                                 :definition_stale true}]
        (let [workspace (t2/select-one :model/Workspace :id workspace-id)]
          ;; Verify it starts as stale
          (is (true? (:definition_stale (t2/select-one :model/WorkspaceTransform :ref_id ref-id))))

          ;; Run the transform (mocked)
          (mt/with-dynamic-fn-redefs [ws.execute/run-transform-with-remapping
                                      (fn [_transform _remapping]
                                        {:status :succeeded
                                         :end_time (java.time.Instant/now)
                                         :message "Mocked execution"})]
            (let [ws-transform (t2/select-one :model/WorkspaceTransform :ref_id ref-id)]
              (mt/with-current-user (mt/user->id :crowberto)
                (ws.impl/run-transform! workspace ws-transform))))

          ;; Check that it's marked as not stale
          (is (false? (:definition_stale (t2/select-one :model/WorkspaceTransform :ref_id ref-id)))))))))

(deftest transform-stale-lifecycle
  (testing "Transform stale lifecycle: create -> run (not stale) -> update (stale)"
    (let [query1 (mt/native-query {:query "SELECT 1 as id, 'hello' as name"})
          query2 (mt/native-query {:query "SELECT 2 as id, 'world' as name"})]
      (mt/with-temp [:model/Workspace {workspace-id :id}     {:name "Lifecycle Test Workspace"}
                     :model/WorkspaceTransform {ref-id :ref_id} {:workspace_id workspace-id
                                                                 :ref_id (str (random-uuid))
                                                                 :name "Test Transform"
                                                                 :source {:type "query" :query query1}
                                                                 :target {:type     "table"
                                                                          :database (mt/id)
                                                                          :schema   nil
                                                                          :name     "test_table"}
                                                                 :definition_stale true}]
        (let [workspace (t2/select-one :model/Workspace :id workspace-id)]
          (testing "sanity check that it's staled to start with"
            (is (true? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id ref-id))))

          (testing "Run (mocked): should mark definition_stale as false"
            (mt/with-dynamic-fn-redefs [ws.execute/run-transform-with-remapping
                                        (fn [_transform _remapping]
                                          {:status :succeeded
                                           :end_time (java.time.Instant/now)
                                           :message "Mocked execution"})]
              (let [ws-transform (t2/select-one :model/WorkspaceTransform :ref_id ref-id)]
                (mt/with-current-user (mt/user->id :crowberto)
                  (ws.impl/run-transform! workspace ws-transform))))
            (is (false? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id ref-id))))

          (testing "Update source: should mark definition_stale as true"
            (t2/update! :model/WorkspaceTransform ref-id {:source {:type "query" :query query2}})
            (is (true? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id ref-id)))))))))
