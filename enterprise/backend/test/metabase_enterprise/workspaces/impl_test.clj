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

(deftest workspace-transform-mark-stale-on-source-change
  (testing "Changing source marks workspace transform as stale"
    (let [workspace (ws.tu/create-ready-ws! "Test Workspace")
          transform (t2/insert! :model/WorkspaceTransform
                                {:workspace_id (:id workspace)
                                 :ref_id (str (random-uuid))
                                 :name "test-transform"
                                 :source {:type :native :query "SELECT 1"}
                                 :target {:database (mt/id) :schema "public" :name "test_table"}
                                 :execution_stale false})
          _updated (t2/update! :model/WorkspaceTransform (:ref_id transform)
                               {:source {:type :native :query "SELECT 2"}})]
      (let [result (t2/select-one :model/WorkspaceTransform :ref_id (:ref_id transform))]
        (is (true? (:stale result)))))))

(deftest workspace-transform-mark-stale-on-target-change
  (testing "Changing target marks workspace transform as stale"
    (let [workspace (ws.tu/create-ready-ws! "Test Workspace")
          transform (t2/insert! :model/WorkspaceTransform
                                {:workspace_id (:id workspace)
                                 :ref_id (str (random-uuid))
                                 :name "test-transform"
                                 :source {:type :native :query "SELECT 1"}
                                 :target {:database (mt/id) :schema "public" :name "old_table"}
                                 :execution_stale false})
          _updated (t2/update! :model/WorkspaceTransform (:ref_id transform)
                               {:target {:database (mt/id) :schema "public" :name "new_table"}})]
      (let [result (t2/select-one :model/WorkspaceTransform :ref_id (:ref_id transform))]
        (is (true? (:stale result)))))))

(deftest workspace-transform-preserves-stale-if-non-definition-change
  (testing "Updating name doesn't change stale status"
    (let [workspace (ws.tu/create-ready-ws! "Test Workspace")
          transform (t2/insert! :model/WorkspaceTransform
                                {:workspace_id (:id workspace)
                                 :ref_id (str (random-uuid))
                                 :name "old-name"
                                 :source {:type :native :query "SELECT 1"}
                                 :target {:database (mt/id) :schema "public" :name "test_table"}
                                 :execution_stale false})
          _updated (t2/update! :model/WorkspaceTransform (:ref_id transform)
                               {:name "new-name"})]
      (let [result (t2/select-one :model/WorkspaceTransform :ref_id (:ref_id transform))]
        (is (false? (:stale result)))))))

(deftest graph-marks-descendants-as-execution-stale
  (testing "Descendants of stale transforms are marked as execution_stale"
    (let [;; Create a chain: transform-1 -> transform-2 -> transform-3
          t1-ref (str (random-uuid))
          t2-ref (str (random-uuid))
          t3-ref (str (random-uuid))
          ;; Simulate graph with parent-child relationships
          graph {:entities [{:node-type :workspace-transform :id t1-ref :parents []}
                            {:node-type :workspace-transform :id t2-ref :parents [t1-ref]}
                            {:node-type :workspace-transform :id t3-ref :parents [t2-ref]}]}
          stale-ids {:workspace #{t1-ref} :global #{}}
          result (#'ws.impl/mark-execution-stale graph stale-ids)]
      ;; Check that t2 and t3 are marked as execution_stale
      (let [entities (:entities result)
            t1-entity (first (filter #(= t1-ref (:id %)) entities))
            t2-entity (first (filter #(= t2-ref (:id %)) entities))
            t3-entity (first (filter #(= t3-ref (:id %)) entities))]
        (is (false? (:execution_stale t1-entity)) "t1 should not be marked (it's directly stale)")
        (is (true? (:execution_stale t2-entity)) "t2 should have stale ancestors")
        (is (true? (:execution_stale t3-entity)) "t3 should have stale ancestors")))))

(deftest transforms-to-execute-filters-by-staleness
  (testing "stale-only=true filters to only stale transforms"
    (let [t1-ref (str (random-uuid))
          t2-ref (str (random-uuid))
          ;; Mock the graph to include execution_stale info
          mock-graph {:entities [{:node-type :workspace-transform :id t1-ref :execution_stale true :parents []}
                                 {:node-type :workspace-transform :id t2-ref :execution_stale false :parents []}]}]
      (mt/with-dynamic-fn-redefs [ws.impl/get-or-calculate-graph (constantly mock-graph)]
        ;; When stale-only is true, should filter to only stale entities
        (let [result (#'ws.impl/transforms-to-execute {:id (mt/id) :analysis_stale false} :stale-only? true)]
          ;; Result should only include t1-ref (the stale one)
          (is (= 1 (count result))))))))

(deftest transforms-to-execute-includes-execution-stale
  (testing "stale-only=true includes execution_stale transforms"
    (let [t1-ref (str (random-uuid))
          t2-ref (str (random-uuid))
          ;; Mock the graph with execution_stale set
          mock-graph {:entities [{:node-type :workspace-transform :id t1-ref :execution_stale false :parents []}
                                 {:node-type :workspace-transform :id t2-ref :execution_stale true :parents [t1-ref]}]}]
      (mt/with-dynamic-fn-redefs [ws.impl/get-or-calculate-graph (constantly mock-graph)]
        ;; When stale-only is true, should include both stale and execution_stale
        (let [result (#'ws.impl/transforms-to-execute {:id (mt/id) :analysis_stale false} :stale-only? true)]
          ;; Result should include both transforms
          (is (= 2 (count result))))))))

;;;; Helpers for mark-execution-stale tests

(defn- workspace-transform
  ([] (workspace-transform (str (random-uuid))))
  ([id] {:node-type :workspace-transform :id id}))

(defn- global-transform
  ([] (global-transform (rand-int 10000)))
  ([id] {:node-type :external-transform :id id}))

(defn- entities-by-key
  "Create a lookup map from entity identity to entity."
  [entities]
  (reduce (fn [m e] (assoc m (select-keys e [:node-type :id]) e)) {} entities))

(deftest mark-execution-stale-single-workspace-chain
  (testing "marks all workspace-transform descendants when root transform is stale"
    (let [t1 (workspace-transform)
          t2 (workspace-transform)
          t3 (workspace-transform)
          graph {:entities [t1 t2 t3]
                 :dependencies {t2 [t1] t3 [t2]}}
          stale-entities #{t1}
          result (#'ws.impl/mark-execution-stale graph stale-entities)
          entities (:entities result)]
      (is (true? (:execution_stale (first entities))) "t1 (stale root) should be marked")
      (is (true? (:execution_stale (second entities))) "t2 (child of stale) should be marked")
      (is (true? (:execution_stale (nth entities 2))) "t3 (grandchild of stale) should be marked"))))

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
      (let [entity-map (entities-by-key (:entities result))]
        (is (true? (:execution_stale (entity-map r1))) "r1 should be marked (stale root)")
        (is (true? (:execution_stale (entity-map r2))) "r2 should be marked (stale root)")
        (is (true? (:execution_stale (entity-map c1))) "c1 should be marked (child of r1)")
        (is (true? (:execution_stale (entity-map c2))) "c2 should be marked (child of r2)")))))

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
      (let [entity-map (entities-by-key (:entities result))]
        (is (true? (:execution_stale (entity-map r))) "r should be marked (stale root)")
        (is (true? (:execution_stale (entity-map l))) "l should be marked (child of r)")
        (is (true? (:execution_stale (entity-map rg))) "rg should be marked (child of r)")
        (is (true? (:execution_stale (entity-map m))) "m should be marked (child of l and rg)")))))

(deftest mark-execution-stale-no-stale-transforms
  (testing "marks no entities when stale sets are empty"
    (let [t1 (workspace-transform)
          t2 (workspace-transform)
          graph {:entities [t1 t2]
                 :dependencies {t2 [t1]}}
          stale-entities #{}
          result (#'ws.impl/mark-execution-stale graph stale-entities)
          entities (:entities result)]
      (is (nil? (:execution_stale (nth entities 0))) "t1 should not be marked")
      (is (nil? (:execution_stale (nth entities 1))) "t2 should not be marked"))))

(deftest mark-execution-stale-leaf-node
  (testing "marks stale node even when it's a leaf (has no children)"
    (let [t1 (workspace-transform)
          t2 (workspace-transform)
          graph {:entities [t1 t2]
                 :dependencies {t2 [t1]}}
          stale-entities #{t2}  ;; t2 is a leaf (no children)
          result (#'ws.impl/mark-execution-stale graph stale-entities)
          entities (:entities result)]
      (is (nil? (:execution_stale (nth entities 0))) "t1 should not be marked")
      (is (true? (:execution_stale (nth entities 1))) "t2 should be marked (it's a stale root, even though it's a leaf)"))))

(deftest mark-execution-stale-preserves-other-fields
  (testing "Marked entities retain their original fields"
    (let [t1 (workspace-transform)
          t2 (workspace-transform)
          t1-with-name (assoc t1 :name "Transform 1")
          t2-with-name (assoc t2 :name "Transform 2")
          graph {:entities [t1-with-name t2-with-name]
                 :dependencies {t2-with-name [t1-with-name]}}
          stale-entities #{t1}
          result (#'ws.impl/mark-execution-stale graph stale-entities)]
      (let [entity-map (entities-by-key (:entities result))
            t1-result (entity-map t1)
            t2-result (entity-map t2)]
        (is (= :workspace-transform (:node-type t2-result)) "t2 node-type preserved")
        (is (= (:id t2) (:id t2-result)) "t2 id preserved")
        (is (= "Transform 2" (:name t2-result)) "t2 name preserved")
        (is (true? (:execution_stale t1-result)) "t1 (stale root) marked")
        (is (true? (:execution_stale t2-result)) "t2 (child) marked")))))

(deftest mark-execution-stale-depends-on-stale-global
  (testing "workspace-transforms are marked stale if they depend on stale global-transforms"
    (let [g (global-transform)
          ws1 (workspace-transform)
          ws2 (workspace-transform)
          graph {:entities [g ws1 ws2]
                 :dependencies {ws1 [g] ws2 [ws1]}}
          stale-entities #{g}
          result (#'ws.impl/mark-execution-stale graph stale-entities)
          entity-map (entities-by-key (:entities result))]
      (is (nil? (:execution_stale (entity-map g))) "g (external-transform) should not be marked")
      (is (true? (:execution_stale (entity-map ws1))) "ws1 should be marked (depends on stale g)")
      (is (true? (:execution_stale (entity-map ws2))) "ws2 should be marked (depends on stale ws1)"))))

(deftest mark-execution-stale-mixed-workspace-and-global-parents
  (testing "workspace-transform with both workspace and global parents marks if either parent is stale"
    (let [g1 (global-transform)
          g2 (global-transform)
          ws (workspace-transform)
          graph {:entities [g1 g2 ws]
                 :dependencies {ws [g1 g2]}}
          stale-entities #{g1}
          result (#'ws.impl/mark-execution-stale graph stale-entities)
          entity-map (entities-by-key (:entities result))]
      (is (nil? (:execution_stale (entity-map g1))) "g1 should not be marked")
      (is (nil? (:execution_stale (entity-map g2))) "g2 should not be marked")
      (is (true? (:execution_stale (entity-map ws))) "ws should be marked (depends on stale g1)"))))

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
          result (#'ws.impl/mark-execution-stale graph stale-entities)
          entity-map (entities-by-key (:entities result))]
      (is (true? (:execution_stale (entity-map t1))) "t1 (stale root) should be marked")
      (is (true? (:execution_stale (entity-map t2))) "t2 should be marked")
      (is (true? (:execution_stale (entity-map t3))) "t3 should be marked")
      (is (true? (:execution_stale (entity-map t4))) "t4 should be marked")
      (is (true? (:execution_stale (entity-map t5))) "t5 (5 levels deep) should be marked"))))

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
          result (#'ws.impl/mark-execution-stale graph stale-entities)
          entity-map (entities-by-key (:entities result))]
      (is (true? (:execution_stale (entity-map r1))) "r1 (stale root) should be marked")
      (is (true? (:execution_stale (entity-map r2))) "r2 (stale root) should be marked")
      (is (true? (:execution_stale (entity-map a))) "a (depends on r1) should be marked")
      (is (true? (:execution_stale (entity-map b))) "b (depends on r2) should be marked")
      (is (true? (:execution_stale (entity-map c))) "c (depends on r1) should be marked")
      (is (true? (:execution_stale (entity-map d))) "d (depends on r2) should be marked")
      (is (true? (:execution_stale (entity-map m))) "m (depends on all stale ancestors) should be marked"))))
