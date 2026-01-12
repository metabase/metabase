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
                                  (fn [_driver _database _workspace tables]
                                    (swap! grant-calls conj (set (map :name tables))))]
        (testing "Transform A depends on ORDERS"
          (ws.common/add-to-changeset! (mt/user->id :crowberto) workspace
                                       :transform nil
                                       {:name   "Transform A"
                                        :source {:type "query" :query query-a}
                                        :target {:database (mt/id)
                                                 :schema   "analytics"
                                                 :name     "table_a"}})
          ;; Trigger analysis
          (ws.impl/get-or-calculate-graph (t2/select-one :model/Workspace (:id workspace)))
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
        (let [_  (ws.common/add-to-changeset! (mt/user->id :crowberto) ws
                                              :transform nil
                                              {:name         "Transform"
                                               :source       {:type "query" :query query}
                                               :target       {:database (mt/id)
                                                              :schema   "analytics"
                                                              :name     "output_table"}})
              ws (t2/select-one :model/Workspace (:id ws))]
          ;; Trigger analysis again to test idempotency
          (t2/update! :model/Workspace (:id ws) {:analysis_stale true})
          (ws.tu/analyze-workspace! (:id ws))
          (t2/update! :model/Workspace (:id ws) {:analysis_stale true})
          (ws.tu/analyze-workspace! (:id ws))
          (testing "still has exactly one of each after multiple syncs"
            (is (= 1 (t2/count :model/WorkspaceOutput :workspace_id (:id ws))))
            (is (= 1 (t2/count :model/WorkspaceInput :workspace_id (:id ws))))
            (is (= 1 (t2/count :model/WorkspaceDependency :workspace_id (:id ws))))))))))

;;;; Helpers for mark-execution-stale tests

(defn- workspace-transform
  ([] (workspace-transform (str (random-uuid))))
  ([id] {:node-type :workspace-transform :id id}))

(defn- global-transform
  ([] (global-transform (rand-int 10000)))
  ([id] {:node-type :external-transform :id id}))

(defn- stale->id
  "Group entity IDs by stale status: {true #{stale-ids} false #{non-stale-ids}}"
  [entities]
  (reduce (fn [m e]
            (let [stale? (boolean (:execution_stale e))]
              (update m stale? (fnil conj #{}) (select-keys e [:node-type :id]))))
          {}
          entities))

(deftest mark-execution-stale-single-workspace-chain
  (testing "marks all workspace-transform descendants when root transform is stale"
    (let [t1 (workspace-transform)
          t2 (workspace-transform)
          t3 (workspace-transform)
          graph {:entities [t1 t2 t3]
                 :dependencies {t2 [t1] t3 [t2]}}
          stale-entities #{t1}
          result (#'ws.impl/mark-execution-stale graph stale-entities)]
      (is (= {true #{t1 t2 t3}} (stale->id (:entities result)))))))

(deftest mark-execution-stale-multiple-stale-roots
  (testing "marks descendants of each independent stale root separately"
    (let [r1 (workspace-transform)
          c1 (workspace-transform)
          r2 (workspace-transform)
          c2 (workspace-transform)
          graph {:entities [r1 c1 r2 c2]
                 :dependencies {c1 [r1] c2 [r2]}}
          stale-entities #{r1 r2}
          result (#'ws.impl/mark-execution-stale graph stale-entities)]
      (is (= {true #{r1 c1 r2 c2}} (stale->id (:entities result)))))))

(deftest mark-execution-stale-diamond-dependency
  (testing "marks descendants reachable through multiple paths from stale root"
    (let [r (workspace-transform)
          l (workspace-transform)
          rg (workspace-transform)
          m (workspace-transform)
          graph {:entities [r l rg m]
                 :dependencies {l [r] rg [r] m [l rg]}}
          stale-entities #{r}
          result (#'ws.impl/mark-execution-stale graph stale-entities)]
      (is (= {true #{r l rg m}} (stale->id (:entities result)))))))

(deftest mark-execution-stale-no-stale-transforms
  (testing "marks no entities when stale sets are empty"
    (let [t1 (workspace-transform)
          t2 (workspace-transform)
          graph {:entities [t1 t2]
                 :dependencies {t2 [t1]}}
          stale-entities #{}
          result (#'ws.impl/mark-execution-stale graph stale-entities)]
      (is (= {false #{t1 t2}} (stale->id (:entities result)))))))

(deftest mark-execution-stale-leaf-node
  (testing "marks stale node even when it's a leaf (has no children)"
    (let [t1 (workspace-transform)
          t2 (workspace-transform)
          graph {:entities [t1 t2]
                 :dependencies {t2 [t1]}}
          stale-entities #{t2}
          result (#'ws.impl/mark-execution-stale graph stale-entities)]
      (is (= {true  #{t2}
              false #{t1}} (stale->id (:entities result)))))))

(deftest mark-execution-stale-preserves-other-fields
  (testing "Marked entities retain their original fields"
    (let [t1 (workspace-transform)
          t2 (workspace-transform)
          t1-with-name (assoc t1 :name "Transform 1")
          t2-with-name (assoc t2 :name "Transform 2")
          graph {:entities [t1-with-name t2-with-name]
                 :dependencies {t2-with-name [t1-with-name]}}
          stale-entities #{t1}
          result (#'ws.impl/mark-execution-stale graph stale-entities)
          entity-map (reduce (fn [m e] (assoc m (select-keys e [:node-type :id]) e)) {} (:entities result))]
      (let [t1-result (entity-map t1)
            t2-result (entity-map t2)]
        (is (= :workspace-transform (:node-type t2-result)))
        (is (= (:id t2) (:id t2-result)))
        (is (= "Transform 2" (:name t2-result)))
        (is (= {true #{t1 t2}} (stale->id (:entities result))))))))

(deftest mark-execution-stale-depends-on-stale-global
  (testing "workspace-transforms are marked stale if they depend on stale global-transforms"
    (let [g (global-transform)
          ws1 (workspace-transform)
          ws2 (workspace-transform)
          graph {:entities [g ws1 ws2]
                 :dependencies {ws1 [g] ws2 [ws1]}}
          stale-entities #{g}
          result (#'ws.impl/mark-execution-stale graph stale-entities)]
      (is (= {true #{ws1 ws2} false #{g}} (stale->id (:entities result)))))))

(deftest mark-execution-stale-mixed-workspace-and-global-parents
  (testing "workspace-transform with both workspace and global parents marks if either parent is stale"
    (let [g1 (global-transform)
          g2 (global-transform)
          ws (workspace-transform)
          graph {:entities [g1 g2 ws]
                 :dependencies {ws [g1 g2]}}
          stale-entities #{g1}
          result (#'ws.impl/mark-execution-stale graph stale-entities)]
      (is (= {true #{ws} false #{g1 g2}} (stale->id (:entities result)))))))

(deftest mark-execution-stale-deep-chain
  (testing "marks all descendants in a deep chain (5 levels)"
    (let [t1 (workspace-transform)
          t2 (workspace-transform)
          t3 (workspace-transform)
          t4 (workspace-transform)
          t5 (workspace-transform)
          graph {:entities [t1 t2 t3 t4 t5]
                 :dependencies {t2 [t1] t3 [t2] t4 [t3] t5 [t4]}}
          stale-entities #{t1}
          result (#'ws.impl/mark-execution-stale graph stale-entities)]
      (is (= {true #{t1 t2 t3 t4 t5}} (stale->id (:entities result)))))))

(deftest mark-execution-stale-complex-convergence
  (testing "marks all descendants in complex convergence pattern with multiple paths"
    (let [r1 (workspace-transform)
          r2 (workspace-transform)
          a (workspace-transform)
          b (workspace-transform)
          c (workspace-transform)
          d (workspace-transform)
          m (workspace-transform)
          graph {:entities [r1 r2 a b c d m]
                 :dependencies {a [r1] b [r2] c [r1] d [r2] m [a b c d]}}
          stale-entities #{r1 r2}
          result (#'ws.impl/mark-execution-stale graph stale-entities)]
      (is (= {true #{r1 r2 a b c d m}} (stale->id (:entities result)))))))

(deftest mark-execution-stale-only-global-transforms
  (testing "graph with only global (external) transforms marks none as stale"
    (let [g1 (global-transform)
          g2 (global-transform)
          g3 (global-transform)
          graph {:entities [g1 g2 g3]
                 :dependencies {g2 [g1] g3 [g2]}}
          stale-entities #{g1}
          result (#'ws.impl/mark-execution-stale graph stale-entities)]
      (is (= {false #{g1 g2 g3}} (stale->id (:entities result)))))))

(deftest mark-execution-stale-stale-entity-as-non-root
  (testing "stale entities that are descendants (not roots) still mark their descendants"
    (let [t1 (workspace-transform)
          t2 (workspace-transform)
          t3 (workspace-transform)
          t4 (workspace-transform)
          graph {:entities [t1 t2 t3 t4]
                 :dependencies {t2 [t1] t3 [t2] t4 [t3]}}
          ;; Mark t2 as stale (not the root), should mark t3 and t4
          stale-entities #{t2}
          result (#'ws.impl/mark-execution-stale graph stale-entities)]
      (is (= {true #{t2 t3 t4} false #{t1}} (stale->id (:entities result)))))))

(deftest staleness-recomputed-on-graph-read
  (testing "Graph staleness reflects current DB state, not cached state"
    (let [t1-ref (str (random-uuid))]
      (mt/with-temp [:model/Workspace          {ws-id :id} {:name "Test WS" :analysis_stale false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t1-ref
                                                            :name            "Transform 1"
                                                            :source          {:type "query" :query {}}
                                                            :target          {:database 1 :schema "public" :name "t1"}
                                                            :execution_stale true}
                     :model/WorkspaceGraph     _           {:workspace_id ws-id
                                                            :graph        {:entities     [{:node-type :workspace-transform :id t1-ref}]
                                                                           :dependencies {}
                                                                           :inputs       []
                                                                           :outputs      []}}]
        (testing "initial read shows transform as stale"
          (let [graph (ws.impl/get-or-calculate-graph (t2/select-one :model/Workspace ws-id))]
            (is (true? (:execution_stale (first (:entities graph)))))))

        (t2/update! :model/WorkspaceTransform t1-ref {:execution_stale false})

        (testing "after marking not stale in DB, graph read reflects the change"
          (let [graph (ws.impl/get-or-calculate-graph (t2/select-one :model/Workspace ws-id))]
            (is (nil? (:execution_stale (first (:entities graph)))))))))))
