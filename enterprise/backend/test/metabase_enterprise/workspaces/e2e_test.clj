(ns ^:mb/driver-tests metabase-enterprise.workspaces.e2e-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.transforms.test-util :as transforms.tu]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(ws.tu/ws-fixtures!)

(deftest isolation-e2e-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (transforms.tu/with-transform-cleanup! [output-table-name (str "test_table_1_" (mt/random-name))]
      (mt/with-model-cleanup [:model/Transform :model/Workspace]
        (mt/with-temp [:model/Transform {transform-id :id} {:name   "Transform 1"
                                                            :source {:type  "query"
                                                                     :query (mt/native-query (ws.tu/mbql->native (mt/mbql-query orders {:limit 3})))}
                                                            :target {:type     "table"
                                                                     :name     output-table-name
                                                                     :database (mt/id)
                                                                     :schema   (t2/select-one-fn :schema :model/Table (mt/id :orders))}}]
          (ws.tu/with-workspaces! [workspace {:name        (mt/random-name)
                                              :database_id (mt/id)}]
            (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace
                                         :transform transform-id
                                         (t2/select-one :model/Transform transform-id))
            (u/poll {:thunk      #(t2/select-one :model/Workspace (:id workspace))
                     :done?      #(= :ready (:db_status %))
                     :timeout-ms 5000})
            (let [workspace           (t2/select-one :model/Workspace (:id workspace))
                  graph               (ws.impl/get-or-calculate-graph! workspace)
                  isolated-transform (t2/select-one :model/WorkspaceTransform :workspace_id (:id workspace))
                  executed-transform (mt/with-current-user (mt/user->id :crowberto)
                                      ;; trigger analysis, so we get the RO grants
                                       (ws.impl/analyze-transform-if-stale! workspace isolated-transform)
                                       (ws.impl/run-transform! workspace graph isolated-transform))
                  output-table       (-> executed-transform :table)
                  schema              (:schema output-table)
                  table-name          (:name output-table)]
              (testing "execute the transform with the original query is fine and the output is in an isolated schema"
                (when (u/poll {:thunk      #(t2/select-one :model/Table :name table-name :schema schema)
                               :done?      some?
                               :timeout-ms 1000})
                   ;; TODO (Ngoc 2026-01-21) -- the table is synced but there are no fields even though the table and fields exist in the db
                   ;;       ... even force sync-ing it again doesn't seem to help ;_;
                  (sync/sync-table! (t2/select-one :model/Table :name table-name :schema schema))
                  #_(transforms.tu/wait-for-table (:name output-table) 1000))
                (is (str/starts-with? (:schema output-table) "mb__isolation"))
                #_(is (= 1 (count (transforms.tu/table-rows table-name)))))

              (testing "changing the query without granting access will fail"
                (t2/update! :model/WorkspaceTransform
                            {:workspace_id (:id workspace) :ref_id (:ref_id isolated-transform)}
                            {:source {:type  "query"
                                      :query (mt/native-query (ws.tu/mbql->native (mt/mbql-query venues {:limit 1})))}})
                (let [ref-id    (:ref_id isolated-transform)
                      transform (t2/select-one :model/WorkspaceTransform :workspace_id (:id workspace) :ref_id ref-id)]
                  (is (=? {:status :failed}
                          (mt/with-current-user (mt/user->id :crowberto)
                            (ws.impl/run-transform! workspace graph transform)))))))))))))
