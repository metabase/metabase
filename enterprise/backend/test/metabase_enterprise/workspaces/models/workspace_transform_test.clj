(ns metabase-enterprise.workspaces.models.workspace-transform-test
  "Tests for WorkspaceTransform model behavior."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.query-test-util :as query-util]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(ws.tu/ws-fixtures!)

(deftest workspace-transform-execution-stale-marking
  (testing "WorkspaceTransform execution_stale is marked based on source/target changes"
    (let [query1 (query-util/make-query :source-table "ORDERS")
          query2 (query-util/make-query :source-table "PRODUCTS")]
      (mt/with-temp [:model/Workspace          {workspace-id :id} {:name "Test Workspace"}
                     :model/WorkspaceTransform {ref-id :ref_id}   {:workspace_id workspace-id
                                                                   :ref_id (str (random-uuid))
                                                                   :name "Test Transform"
                                                                   :source {:type "query" :query query1}
                                                                   :target {:database (mt/id) :schema "public" :name "test_table"}
                                                                   :execution_stale false}]
        (testing "marks as stale when source changes"
          (t2/update! :model/WorkspaceTransform ref-id {:source {:type "query" :query query2}})
          (let [updated (t2/select-one :model/WorkspaceTransform :ref_id ref-id)]
            (is (true? (:execution_stale updated)))))

        (testing "marks as stale when target changes"
          (t2/update! :model/WorkspaceTransform ref-id {:target {:database (mt/id) :schema "public" :name "new_table"}})
          (let [updated (t2/select-one :model/WorkspaceTransform :ref_id ref-id)]
            (is (true? (:execution_stale updated)))))

        (testing "preserves execution_stale when other fields change"
          (t2/update! :model/WorkspaceTransform ref-id {:execution_stale false})
          (t2/update! :model/WorkspaceTransform ref-id {:name "New Name"})
          (let [updated (t2/select-one :model/WorkspaceTransform :ref_id ref-id)]
            (is (false? (:execution_stale updated)))))))))
