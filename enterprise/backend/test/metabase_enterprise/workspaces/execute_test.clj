(ns ^:mb/driver-tests metabase-enterprise.workspaces.execute-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
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
            graph        (ws.impl/get-or-calculate-graph! workspace)
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
                    (ws.impl/run-transform! workspace graph ws-transform))))
          (is (=? {:last_run_at some?}
                  (t2/select-one :model/WorkspaceTransform :workspace_id (:id workspace) :ref_id (:ref_id ws-transform))))

          (testing "The isolated_table_id gets populated"
            (ws.impl/get-or-calculate-graph! workspace)
            (is (=? [{:workspace_id      (:id workspace)
                      :global_table      output-table
                      :global_schema     nil
                      :global_table_id   nil
                      :isolated_schema   string?
                      :isolated_table    string?
                      :isolated_table_id number?}]
                    (t2/select :model/WorkspaceOutput :workspace_id (:id workspace) :ref_id (:ref_id ws-transform))))))

        (testing "app DB records are rolled back"
          (is (= before
                 {:xf    (t2/count :model/Transform)
                  :xfrun (t2/count :model/TransformRun)})))))))

(deftest dry-run-workspace-transform-test
  (testing "Dry-running a workspace transform returns rows without persisting"
    (let [workspace    (ws.tu/create-ready-ws! "Dry-Run Test Workspace")
          db-id        (:database_id workspace)
          body         {:name   "Dry-Run Transform"
                        :source {:type  "query"
                                 :query (mt/native-query {:query "SELECT 1 as id, 'hello' as name UNION ALL SELECT 2, 'world'"})}
                        :target {:type     "table"
                                 :database db-id
                                 :schema   nil
                                 :name     "ws_dryrun_test"}}
          ws-transform (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace :transform nil body)
          graph        (ws.impl/get-or-calculate-graph! workspace)
          before       {:xf    (t2/count :model/Transform)
                        :xfrun (t2/count :model/TransformRun)}]

      (testing "dry-run returns data nested under :data like /api/dataset"
        (is (=? {:status :succeeded
                 :data   {:rows [[1 "hello"] [2 "world"]]
                          :cols [{:name #"(ID)|(id)"} {:name #"(NAME)|(name)"}]}}
                (mt/with-current-user (mt/user->id :crowberto)
                  (ws.impl/dry-run-transform workspace graph ws-transform)))))

      (testing "last_run_at is NOT updated in dry-run mode"
        (is (nil? (:last_run_at (t2/select-one :model/WorkspaceTransform :workspace_id (:id workspace) :ref_id (:ref_id ws-transform))))))

      (testing "app DB records are NOT created in dry-run mode"
        (is (= before
               {:xf    (t2/count :model/Transform)
                :xfrun (t2/count :model/TransformRun)}))))))

(deftest ^:mb/transforms-python-test dry-run-python-workspace-transform-test
  (testing "Dry-running a Python workspace transform returns rows without persisting"
    (mt/test-drivers #{:mysql :postgres}
      (let [workspace    (ws.tu/create-ready-ws! "Python Dry-Run Test")
            db-id        (:database_id workspace)
            body         {:name   "Python Dry-Run Transform"
                          :source {:type          "python"
                                   :source-tables {}
                                   :body          (str "import pandas as pd\n"
                                                       "\n"
                                                       "def transform():\n"
                                                       "    return pd.DataFrame({'id': [1, 2], 'name': ['hello', 'world']})")}
                          :target {:type     "table"
                                   :database db-id
                                   :schema   nil
                                   :name     "ws_python_dryrun_test"}}
            ws-transform (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace :transform nil body)
            graph        (ws.impl/get-or-calculate-graph! workspace)
            before       {:xf    (t2/count :model/Transform)
                          :xfrun (t2/count :model/TransformRun)}]

        (testing "dry-run returns data with rows from Python output"
          (is (=? {:status :succeeded
                   :data   {:rows [[1 "hello"] [2 "world"]]
                            :cols [{:name "id"} {:name "name"}]}}
                  (mt/with-current-user (mt/user->id :crowberto)
                    (ws.impl/dry-run-transform workspace graph ws-transform)))))

        (testing "last_run_at is NOT updated in dry-run mode"
          (is (nil? (:last_run_at (t2/select-one :model/WorkspaceTransform :workspace_id (:id workspace) :ref_id (:ref_id ws-transform))))))

        (testing "app DB records are NOT created in dry-run mode"
          (is (= before
                 {:xf    (t2/count :model/Transform)
                  :xfrun (t2/count :model/TransformRun)})))))))

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


(deftest remap-sql-source-test
  (let [remap-sql-source #'ws.execute/remap-sql-source
        make-source      (fn [sql] {:type "query", :query {:database 1, :type :native, :stages [{:native sql}]}})]
    ;; Test cases as [label, table-mapping, input-sql, expected-sql]
    (doseq [[label table-mapping input-sql expected-sql]
            [["remaps qualified table reference to isolated table"
              {[1 "public" "orders"] {:db-id 1, :schema "ws_isolated_123", :table "public__orders", :id 456}}
              "SELECT * FROM public.orders"
              "SELECT * FROM ws_isolated_123.public__orders"]

             ["remaps unqualified table reference using nil-schema mapping"
              {[1 nil "orders"] {:db-id 1, :schema "ws_isolated_123", :table "public__orders", :id 456}}
              "SELECT * FROM orders"
              "SELECT * FROM ws_isolated_123.public__orders"]

             ;; This is what build-remapping creates for unqualified input tables
             ["qualifies unqualified input table reference (no isolation, just adds schema)"
              {[1 nil "orders"] {:db-id 1, :schema "public", :table "orders", :id 123}}
              "SELECT * FROM orders"
              "SELECT * FROM public.orders"]

             ["leaves unmapped tables unchanged"
              {[1 nil "other_table"] {:db-id 1, :schema "public", :table "other_table", :id 999}}
              "SELECT * FROM orders"
              "SELECT * FROM orders"]

             ["handles multiple tables in same query"
              {[1 nil "orders"]   {:db-id 1, :schema "public", :table "orders", :id 123}
               [1 nil "products"] {:db-id 1, :schema "public", :table "products", :id 456}}
              "SELECT * FROM orders JOIN products ON orders.product_id = products.id"
              "SELECT * FROM public.orders JOIN public.products ON public.orders.product_id = public.products.id"]]]
      (testing label
        (is (= (make-source expected-sql)
               (remap-sql-source table-mapping (make-source input-sql))))))))

(deftest run-transform-marks-not-stale-on-success
  (testing "Successful transform run marks definition_changed=false"
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map]}
                            {:workspace {:definitions {:x1 [:t0]}
                                         :properties  {:x1 {:definition_changed true :input_data_changed false}}}}]
      (let [t1-ref (workspace-map :x1)]
        (testing "initially stale"
          (is (= {t1-ref {:definition_changed true :input_data_changed false}}
                 (ws.tu/staleness-flags workspace-id))))

        (ws.tu/mock-run-transform! workspace-id t1-ref)

        (testing "after run: definition_changed cleared"
          (is (= {t1-ref {:definition_changed false :input_data_changed false}}
                 (ws.tu/staleness-flags workspace-id))))))))

(deftest transform-stale-lifecycle
  (testing "Transform stale lifecycle: create -> run (not stale) -> update (stale)"
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map]}
                            {:workspace {:definitions {:x1 [:t0]}
                                         :properties  {:x1 {:definition_changed true :input_data_changed false}}}}]
      (let [t1-ref (workspace-map :x1)]
        (testing "sanity check that it's stale to start with"
          (is (= {t1-ref {:definition_changed true :input_data_changed false}}
                 (ws.tu/staleness-flags workspace-id))))

        (testing "Run (mocked): should mark definition_changed as false"
          (ws.tu/mock-run-transform! workspace-id t1-ref)
          (is (= {t1-ref {:definition_changed false :input_data_changed false}}
                 (ws.tu/staleness-flags workspace-id))))

        (testing "Update source: should mark definition_changed as true"
          (t2/update! :model/WorkspaceTransform {:workspace_id workspace-id :ref_id t1-ref}
                      {:source {:type "query" :query (mt/native-query {:query "SELECT 2 as id, 'world' as name"})}})
          (is (= {t1-ref {:definition_changed true :input_data_changed false}}
                 (ws.tu/staleness-flags workspace-id))))))))
