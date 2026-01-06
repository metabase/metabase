(ns metabase-enterprise.workspaces.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(ws.tu/ws-fixtures!)

(deftest sync-transform-dependencies-test
  (testing "sync-transform-dependencies! writes dependencies and grants access to external inputs"
    (let [mp          (mt/metadata-provider)
          query-a     (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          query-b     (lib/query mp (lib.metadata/table mp (mt/id :products)))
          workspace   (ws.tu/create-ready-ws! "Test Workspace")
          grant-calls (atom [])]
      ;; Set up mock BEFORE calling add-to-changeset! since it calls sync-transform-dependencies! internally
      (mt/with-dynamic-fn-redefs [ws.isolation/grant-read-access-to-tables!
                                  (fn [_database _workspace tables]
                                    (swap! grant-calls conj (set (map :name tables))))]
        (testing "Transform A depends on ORDERS"
          (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace
                                       :transform nil
                                       {:name   "Transform A"
                                        :source {:type "query" :query query-a}
                                        :target {:database (mt/id)
                                                 :schema   "analytics"
                                                 :name     "table_a"}})
          (testing "creates output and input records"
            (is (= 1 (t2/count :model/WorkspaceOutput :workspace_id (:id workspace))))
            (is (= 1 (t2/count :model/WorkspaceInput :workspace_id (:id workspace)))))
          (testing "input record has correct table name"
            (is (= (mt/format-name :orders)
                   (t2/select-one-fn :table :model/WorkspaceInput :workspace_id (:id workspace)))))
          (testing "grants access to ORDERS"
            (is (= 1 (count @grant-calls)))
            (is (contains? (first @grant-calls) (mt/format-name :orders)))))

        (testing "Transform B depends on PRODUCTS, table_a is internal output"
          (reset! grant-calls [])
          (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace
                                       :transform nil
                                       {:name   "Transform B"
                                        :source {:type "query" :query query-b}
                                        :target {:database (mt/id)
                                                 :schema   "analytics"
                                                 :name     "table_b"}})
          (testing "creates records for both transforms"
            (is (= 2 (t2/count :model/WorkspaceOutput :workspace_id (:id workspace))))
            (is (= 2 (t2/count :model/WorkspaceInput :workspace_id (:id workspace)))))
          (testing "only grants access to newly discovered inputs (PRODUCTS), not already-granted ones"
            (is (= 1 (count @grant-calls)))
            ;; ORDERS was already granted in Transform A, so only PRODUCTS is in this grant call
            (is (not (contains? (first @grant-calls) (mt/format-name :orders))))
            (is (contains? (first @grant-calls) (mt/format-name :products)))
            (is (not (contains? (first @grant-calls) "table_a")))))))))

(deftest sync-transform-dependencies-idempotent-test
  (testing "sync-transform-dependencies! is idempotent"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          ws    (ws.tu/create-ready-ws! "Test Workspace")]
      (mt/with-dynamic-fn-redefs [ws.isolation/grant-read-access-to-tables! (constantly nil)]
        (let [wt (ws.common/add-to-changeset! (mt/user->id :crowberto) ws
                                              :transform nil
                                              {:name         "Transform"
                                               :source       {:type "query" :query query}
                                               :target       {:database (mt/id)
                                                              :schema   "analytics"
                                                              :name     "output_table"}})
              ws (t2/select-one :model/Workspace (:id ws))]
          ;; Call sync again to test idempotency
          (ws.impl/sync-transform-dependencies! ws wt)
          (ws.impl/sync-transform-dependencies! ws wt)
          (testing "still has exactly one of each after multiple syncs"
            (is (= 1 (t2/count :model/WorkspaceOutput :workspace_id (:id ws))))
            (is (= 1 (t2/count :model/WorkspaceInput :workspace_id (:id ws))))
            (is (= 1 (t2/count :model/WorkspaceDependency :workspace_id (:id ws))))))))))
