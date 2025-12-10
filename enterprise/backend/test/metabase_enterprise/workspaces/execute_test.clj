(ns ^:mb/driver-tests metabase-enterprise.workspaces.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.test-util :as transforms.tu]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.execute :as ws.execute]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fn [tests]
                      (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
                        (mt/with-premium-features [:workspaces :dependencies :transforms]
                          (search.tu/with-index-disabled
                            (tests))))))

(use-fixtures :each (fn [tests]
                      (mt/with-model-cleanup [:model/Collection
                                              :model/Transform
                                              :model/TransformRun
                                              :model/Workspace
                                              :model/WorkspaceTransform]
                        (tests))))

(defn- ws-ready
  "Poll until workspace status becomes :ready or timeout"
  [ws-or-id]
  (let [ws-id (cond-> ws-or-id
                (map? ws-or-id) :id)]
    (u/poll {:thunk      #(t2/select-one :model/Workspace :id ws-id)
             :done?      #(= :ready (:status %))
             :timeout-ms 5000})))

(defn- create-ready-ws!
  "Create a workspace and wait for it to be ready."
  [name]
  (ws-ready (mt/with-current-user (mt/user->id :crowberto)
              (ws.common/create-workspace! (mt/user->id :crowberto)
                                           {:name        name
                                            :database_id (mt/id)}))))

(deftest run-workspace-transform-basic-test
  (testing "Executing a workspace transform returns results and rolls back app DB records"
    (transforms.tu/with-transform-cleanup! [output-table "ws_execute_test"]
      (let [workspace    (create-ready-ws! "Execute Test Workspace")
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
                   :table      {:name   output-table
                                :schema (:schema workspace)}}
                  (mt/with-current-user (mt/user->id :crowberto)
                    (ws.execute/run-workspace-transform! workspace ws-transform)))))

        (testing "app DB records are rolled back"
          (is (= before
                 {:xf    (t2/count :model/Transform)
                  :xfrun (t2/count :model/TransformRun)})))))))
