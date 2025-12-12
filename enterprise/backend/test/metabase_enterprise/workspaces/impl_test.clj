(ns metabase-enterprise.workspaces.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest sync-transform-dependencies-test
  (testing "sync-transform-dependencies! writes dependencies and grants access to external inputs"
    (let [mp      (mt/metadata-provider)
          query-a (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          query-b (lib/query mp (lib.metadata/table mp (mt/id :products)))]
      (mt/with-temp [:model/Workspace workspace {:name        "Test Workspace"
                                                 :database_id (mt/id)}
                     :model/WorkspaceTransform wt-a {:workspace_id (:id workspace)
                                                     :name         "Transform A"
                                                     :source       {:type "query" :query {}}
                                                     :target       {:database (mt/id)
                                                                    :schema   "analytics"
                                                                    :name     "table_a"}}
                     :model/WorkspaceTransform wt-b {:workspace_id (:id workspace)
                                                     :name         "Transform B"
                                                     :source       {:type "query" :query {}}
                                                     :target       {:database (mt/id)
                                                                    :schema   "analytics"
                                                                    :name     "table_b"}}]
        (let [transform-a (assoc wt-a :source {:type "query" :query query-a})
              transform-b (assoc wt-b :source {:type "query" :query query-b})
              grant-calls (atom [])]
          (mt/with-dynamic-fn-redefs [ws.isolation/grant-read-access-to-tables!
                                      (fn [_database _workspace tables]
                                        (swap! grant-calls conj (set (map :name tables))))]
            (testing "Transform A depends on ORDERS"
              (let [result-a (ws.impl/sync-transform-dependencies! workspace transform-a)]
                (testing "returns external inputs"
                  (is (= 1 (count result-a)))
                  (is (some #(= "ORDERS" (:table %)) result-a)))
                (testing "creates output and input records"
                  (is (= 1 (t2/count :model/WorkspaceOutput :workspace_id (:id workspace))))
                  (is (= 1 (t2/count :model/WorkspaceInput :workspace_id (:id workspace)))))
                (testing "grants access to ORDERS"
                  (is (= 1 (count @grant-calls)))
                  (is (contains? (first @grant-calls) "ORDERS")))))

            (testing "Transform B depends on PRODUCTS, table_a is internal output"
              (let [result-b (ws.impl/sync-transform-dependencies! workspace transform-b)]
                (testing "returns all external inputs (outputs excluded)"
                  (is (= 2 (count result-b)))
                  (is (some #(= "ORDERS" (:table %)) result-b))
                  (is (some #(= "PRODUCTS" (:table %)) result-b))
                  (is (not (some #(= "table_a" (:table %)) result-b))))
                (testing "creates records for both transforms"
                  (is (= 2 (t2/count :model/WorkspaceOutput :workspace_id (:id workspace))))
                  (is (= 2 (t2/count :model/WorkspaceInput :workspace_id (:id workspace)))))
                (testing "grants access to all external inputs, not internal outputs"
                  (is (= 2 (count @grant-calls)))
                  (is (contains? (second @grant-calls) "ORDERS"))
                  (is (contains? (second @grant-calls) "PRODUCTS"))
                  (is (not (contains? (second @grant-calls) "table_a"))))))))))))

(deftest sync-transform-dependencies-idempotent-test
  (testing "sync-transform-dependencies! is idempotent"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (mt/with-temp [:model/Workspace workspace {:name        "Test Workspace"
                                                 :database_id (mt/id)}
                     :model/WorkspaceTransform wt {:workspace_id (:id workspace)
                                                   :name         "Transform"
                                                   :source       {:type "query" :query {}}
                                                   :target       {:database (mt/id)
                                                                  :schema   "analytics"
                                                                  :name     "output_table"}}]
        (let [transform (assoc wt :source {:type "query" :query query})]
          (mt/with-dynamic-fn-redefs [ws.isolation/grant-read-access-to-tables! (constantly nil)]
            (ws.impl/sync-transform-dependencies! workspace transform)
            (ws.impl/sync-transform-dependencies! workspace transform)
            (ws.impl/sync-transform-dependencies! workspace transform)
            (testing "still has exactly one of each after multiple syncs"
              (is (= 1 (t2/count :model/WorkspaceOutput :workspace_id (:id workspace))))
              (is (= 1 (t2/count :model/WorkspaceInput :workspace_id (:id workspace))))
              (is (= 1 (t2/count :model/WorkspaceDependency :workspace_id (:id workspace)))))))))))
