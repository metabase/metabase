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
          wt-a        (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace
                                                   :transform nil
                                                   {:name   "Transform A"
                                                    :source {:type "query" :query query-a}
                                                    :target {:database (mt/id)
                                                             :schema   "analytics"
                                                             :name     "table_a"}})
          grant-calls (atom [])]
      (mt/with-dynamic-fn-redefs [ws.isolation/grant-read-access-to-tables!
                                  (fn [_database _workspace tables]
                                    (swap! grant-calls conj (set (map :name tables))))]
        (testing "Transform A depends on ORDERS"
          (let [result-a (ws.impl/sync-transform-dependencies! workspace wt-a)]
            (testing "returns external inputs"
              (is (= 1 (count result-a)))
              (is (some #(= (mt/format-name :orders) (:table %)) result-a)))
            (testing "creates output and input records"
              (is (= 1 (t2/count :model/WorkspaceOutput :workspace_id (:id workspace))))
              (is (= 1 (t2/count :model/WorkspaceInput :workspace_id (:id workspace)))))
            (testing "grants access to ORDERS"
              (is (= 1 (count @grant-calls)))
              (is (contains? (first @grant-calls) (mt/format-name :orders))))))

        (testing "Transform B depends on PRODUCTS, table_a is internal output"
          (let [wt-b     (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace
                                                      :transform nil
                                                      {:name   "Transform B"
                                                       :source {:type "query" :query query-b}
                                                       :target {:database (mt/id)
                                                                :schema   "analytics"
                                                                :name     "table_b"}})
                _        (reset! grant-calls [])
                result-b (ws.impl/sync-transform-dependencies! workspace wt-b)]
            (testing "returns all external inputs (outputs excluded)"
              (is (= 2 (count result-b)))
              (is (some #(= (mt/format-name :orders) (:table %)) result-b))
              (is (some #(= (mt/format-name :products) (:table %)) result-b))
              (is (not (some #(= "table_a" (:table %)) result-b))))
            (testing "creates records for both transforms"
              (is (= 2 (t2/count :model/WorkspaceOutput :workspace_id (:id workspace))))
              (is (= 2 (t2/count :model/WorkspaceInput :workspace_id (:id workspace)))))
            (testing "grants access to all external inputs, not internal outputs"
              (is (= 1 (count @grant-calls)))
              (is (contains? (first @grant-calls) (mt/format-name :orders)))
              (is (contains? (first @grant-calls) (mt/format-name :products)))
              (is (not (contains? (first @grant-calls) (mt/format-name :table_a)))))))))))

(deftest sync-transform-dependencies-idempotent-test
  (testing "sync-transform-dependencies! is idempotent"
    (let [mp        (mt/metadata-provider)
          query     (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          workspace (ws.tu/create-ready-ws! "Test Workspace")
          wt        (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace
                                                 :transform nil
                                                 {:name         "Transform"
                                                  :source       {:type "query" :query query}
                                                  :target       {:database (mt/id)
                                                                 :schema   "analytics"
                                                                 :name     "output_table"}})]
      (mt/with-dynamic-fn-redefs [ws.isolation/grant-read-access-to-tables! (constantly nil)]
        (ws.impl/sync-transform-dependencies! workspace wt)
        (ws.impl/sync-transform-dependencies! workspace wt)
        (ws.impl/sync-transform-dependencies! workspace wt)
        (testing "still has exactly one of each after multiple syncs"
          (is (= 1 (t2/count :model/WorkspaceOutput :workspace_id (:id workspace))))
          (is (= 1 (t2/count :model/WorkspaceInput :workspace_id (:id workspace))))
          (is (= 1 (t2/count :model/WorkspaceDependency :workspace_id (:id workspace)))))))))
