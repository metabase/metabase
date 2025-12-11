(ns ^:mb/driver-tests metabase-enterprise.workspaces.execute-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.test-util :as transforms.tu]
   [metabase-enterprise.workspaces.execute :as ws.execute]
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
            ws-transform (t2/insert-returning-instance!
                          :model/WorkspaceTransform
                          {:workspace_id (:id workspace)
                           :name         "Test Transform"
                           :source       {:type  "query"
                                          :query (mt/native-query {:query "SELECT 1 as id, 'hello' as name"})}
                           :target       {:type     "table"
                                          :database db-id
                                          :schema   nil
                                          :name     output-table}})
            before       {:xf    (t2/count :model/Transform)
                          :xfrun (t2/count :model/TransformRun)}
            table-map    {[db-id nil output-table] {:db-id  db-id
                                                    :schema ws-schema
                                                    :table  (ws.u/isolated-table-name nil output-table)
                                                    :id     ::todo}}
            field-map    nil]

        (testing "execution returns expected result structure"
          (is (=? {:status     :succeeded
                   :start_time some?
                   :end_time   some?
                   :table      {:name   #(str/includes? % output-table)
                                :schema ws-schema}}
                  (mt/with-current-user (mt/user->id :crowberto)
                    (ws.execute/run-transform-with-remapping ws-transform table-map field-map)))))

        (testing "app DB records are rolled back"
          (is (= before
                 {:xf    (t2/count :model/Transform)
                  :xfrun (t2/count :model/TransformRun)})))))))
