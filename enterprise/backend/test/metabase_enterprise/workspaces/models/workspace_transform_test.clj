(ns metabase-enterprise.workspaces.models.workspace-transform-test
  "Tests for WorkspaceTransform model behavior."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(ws.tu/ws-fixtures!)

(deftest workspace-transform-definition-stale-marking
  (testing "WorkspaceTransform definition_changed is marked based on source/target changes"
    (ws.tu/with-resources! [{ws-id :workspace-id, :keys [workspace-map]}
                            {:workspace {:definitions {:x1 [:t0]}}}]
      (let [t1-ref (workspace-map :x1)
            ws+ref {:workspace_id ws-id, :ref_id t1-ref}
            tx-url (ws.tu/ws-url ws-id "/transform/" t1-ref)
            change!   (fn [updates]
                        (t2/update! :model/WorkspaceTransform ws+ref {:definition_changed false})
                        (mt/user-http-request :crowberto :put 200 tx-url updates))]
        (testing "initially definition is stale - as we've never been run"
          (is (= {t1-ref {:definition_changed true, :input_data_changed false}} (ws.tu/staleness-flags ws-id))))
        (testing "marks as stale when source changes"
          (change! {:source {:type "query" :query (mt/native-query {:query "SELECT 2 as id"})}})
          (is (= {t1-ref {:definition_changed true, :input_data_changed false}} (ws.tu/staleness-flags ws-id))))
        (testing "marks as stale when target changes"
          (change! {:target {:type "table", :database (mt/id), :schema nil, :name "new_table"}})
          (is (= {t1-ref {:definition_changed true, :input_data_changed false}} (ws.tu/staleness-flags ws-id))))
        (testing "preserves definition_changed when other fields change"
          (change! {:name "New Name"})
          (is (= {t1-ref {:definition_changed false :input_data_changed false}} (ws.tu/staleness-flags ws-id))))))))
