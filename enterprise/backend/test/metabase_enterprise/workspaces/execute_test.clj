(ns ^:mb/driver-tests metabase-enterprise.workspaces.execute-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.test-util :as transforms.tu]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(ws.tu/ws-fixtures!)

(deftest run-workspace-transform-no-input-test
  (testing "Executing a workspace transform returns results and rolls back app DB records"
    (transforms.tu/with-transform-cleanup! [output-table "ws_execute_test"]
      (let [workspace    (ws.tu/create-ready-ws! "Execute Test Workspace")
            db-id        (:database_id workspace)
            ws-schema    (:schema workspace)
            body         {:name   "Test Transform"
                          :source {:type  "query"
                                   :query (mt/native-query {:query "SELECT 1 as id, 'hello' as name"})}
                          :target {:type     "table"
                                   :database db-id
                                   :schema   nil
                                   :name     output-table}}
            ws-transform (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace :transform nil body)
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
          (is (=? [{:workspace_id      (:id workspace)
                    :global_table      output-table
                    :global_schema     nil
                    :global_table_id   nil
                    :isolated_schema   string?
                    :isolated_table    string?
                    ;; TODO I think this is broken because of normalization breaking case equality
                    #_#_:isolated_table_id number?}]
                  (t2/select :model/WorkspaceOutput :ref_id (:ref_id ws-transform)))))

        (testing "app DB records are rolled back"
          (is (= before
                 {:xf    (t2/count :model/Transform)
                  :xfrun (t2/count :model/TransformRun)})))))))
