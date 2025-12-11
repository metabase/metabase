(ns ^:mb/driver-tests metabase-enterprise.workspaces.execute-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.test-util :as transforms.tu]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(ws.tu/ws-fixtures!)

(deftest run-workspace-transform-no-input-test
  (testing "Executing a workspace transform returns results and rolls back app DB records"
    (transforms.tu/with-transform-cleanup! [output-table "ws_execute_test"]
      (let [workspace    (ws.tu/create-ready-ws! "Execute Test Workspace")
            ws-transform (t2/insert-returning-instance!
                          :model/WorkspaceTransform
                          {:workspace_id (:id workspace)
                           :name         "Test Transform"
                           :source       {:type  "query"
                                          :query (mt/native-query {:query "SELECT 1 as id, 'hello' as name"})}
                           :target       {:type     "table"
                                          :database (:database_id workspace)
                                          :schema   (:schema workspace)
                                          :name     output-table}})
            before       {:xf    (t2/count :model/Transform)
                          :xfrun (t2/count :model/TransformRun)}]

        (testing "execution returns expected result structure"
          (is (=? {:status     :succeeded
                   :start_time some?
                   :end_time   some?
                   :table      {:name   #(str/includes? % output-table)
                                :schema (:schema workspace)}}
                  (mt/with-current-user (mt/user->id :crowberto)
                    (ws.execute/run-workspace-transform! workspace ws-transform
                                                         (partial ws.common/mock-mapping workspace))))))

        (testing "app DB records are rolled back"
          (is (= before
                 {:xf    (t2/count :model/Transform)
                  :xfrun (t2/count :model/TransformRun)})))))))
