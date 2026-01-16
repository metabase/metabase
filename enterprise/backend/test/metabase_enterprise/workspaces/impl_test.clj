(ns metabase-enterprise.workspaces.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.execute :as ws.execute]
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
          workspace   (ws.tu/create-empty-ws! "Test Workspace")
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
          (ws.tu/analyze-workspace! (:id workspace))
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
          (ws.tu/analyze-workspace! (:id workspace))
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
          ws    (ws.tu/create-empty-ws! "Test Workspace")]
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

;;;; Two-flag staleness tests

(deftest staleness-recomputed-on-graph-read
  (testing "Graph staleness reflects current DB state with two flags"
    (let [t1-ref (str (random-uuid))]
      (mt/with-temp [:model/Workspace          {ws-id :id} {:name "Test WS" :analysis_stale false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t1-ref
                                                            :name            "Transform 1"
                                                            :source          {:type "query" :query {}}
                                                            :target          {:database 1 :schema "public" :name "t1"}
                                                            :definition_stale true
                                                            :input_data_stale false}
                     :model/WorkspaceGraph     _           {:workspace_id ws-id
                                                            :graph        {:entities     [{:node-type :workspace-transform :id t1-ref}]
                                                                           :dependencies {}
                                                                           :inputs       []
                                                                           :outputs      []}}]
        (testing "initial read shows transform as definition_stale"
          (let [graph (ws.impl/get-or-calculate-graph (t2/select-one :model/Workspace ws-id))
                entity (first (:entities graph))]
            (is (true? (:definition_stale entity)))
            (is (false? (:input_data_stale entity)))))

        (t2/update! :model/WorkspaceTransform t1-ref {:definition_stale false :input_data_stale true})

        (testing "after updating flags in DB, graph read reflects the change"
          (let [graph (ws.impl/get-or-calculate-graph (t2/select-one :model/Workspace ws-id))
                entity (first (:entities graph))]
            (is (false? (:definition_stale entity)))
            (is (true? (:input_data_stale entity)))))))))

(deftest run-transform-with-stale-ancestor-sets-input-data-stale-test
  (testing "Running a transform with stale ancestor sets input_data_stale"
    ;; t1 queries from orders, outputs to t1 (definition_stale)
    ;; t2 queries from t1 (t1's output), outputs to t2 (fresh)
    ;; When t2 runs while t1 is still stale, t2 should have input_data_stale=true
    (let [t1-ref (str (random-uuid))
          t2-ref (str (random-uuid))
          mp     (mt/metadata-provider)
          query1 (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          query2 (mt/native-query {:query "SELECT * FROM public.t1"})]
      (mt/with-temp [:model/Workspace          {ws-id :id} {:name "Test WS" :analysis_stale false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t1-ref
                                                            :name            "Transform 1"
                                                            :source          {:type "query" :query query1}
                                                            :target          {:database (mt/id) :schema "public" :name "t1"}
                                                            :definition_stale true
                                                            :input_data_stale false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t2-ref
                                                            :name            "Transform 2"
                                                            :source          {:type "query" :query query2}
                                                            :target          {:database (mt/id) :schema "public" :name "t2"}
                                                            :definition_stale false
                                                            :input_data_stale false}
                     ;; Graph showing t2 depends on t1
                     :model/WorkspaceGraph     _           {:workspace_id ws-id
                                                            :graph        {:entities     [{:node-type :workspace-transform :id t1-ref}
                                                                                          {:node-type :workspace-transform :id t2-ref}]
                                                                           :dependencies {{:node-type :workspace-transform :id t2-ref}
                                                                                          [{:node-type :workspace-transform :id t1-ref}]}
                                                                           :inputs       []
                                                                           :outputs      []}}]
        (testing "initial state: t1 is definition_stale, t2 is fresh"
          (is (true? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id t1-ref)))
          (is (false? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id t2-ref)))
          (is (false? (t2/select-one-fn :input_data_stale :model/WorkspaceTransform :ref_id t2-ref))))

        (mt/with-dynamic-fn-redefs [ws.execute/run-transform-with-remapping
                                    (fn [_transform _remapping]
                                      {:status :succeeded
                                       :end_time (java.time.Instant/now)
                                       :message "Mocked execution"})]
          (let [workspace    (t2/select-one :model/Workspace ws-id)
                ws-transform (t2/select-one :model/WorkspaceTransform :ref_id t2-ref)]
            (mt/with-current-user (mt/user->id :crowberto)
              (ws.impl/run-transform! workspace ws-transform))))

        (testing "after running t2: t2 has input_data_stale because t1 is still stale"
          (is (false? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id t2-ref)))
          (is (true? (t2/select-one-fn :input_data_stale :model/WorkspaceTransform :ref_id t2-ref))))))))

(deftest run-transform-marks-downstream-stale-test
  (testing "Running a transform marks all transitive downstream as input_data_stale"
    (let [t1-ref (str (random-uuid))
          t2-ref (str (random-uuid))
          mp     (mt/metadata-provider)
          query1 (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          query2 (mt/native-query {:query "SELECT * FROM public.t1"})]
      (mt/with-temp [:model/Workspace          {ws-id :id} {:name "Test WS" :analysis_stale false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t1-ref
                                                            :name            "Transform 1"
                                                            :source          {:type "query" :query query1}
                                                            :target          {:database (mt/id) :schema "public" :name "t1"}
                                                            :definition_stale true
                                                            :input_data_stale false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t2-ref
                                                            :name            "Transform 2"
                                                            :source          {:type "query" :query query2}
                                                            :target          {:database (mt/id) :schema "public" :name "t2"}
                                                            :definition_stale false
                                                            :input_data_stale false}
                     :model/WorkspaceGraph     _           {:workspace_id ws-id
                                                            :graph        {:entities     [{:node-type :workspace-transform :id t1-ref}
                                                                                          {:node-type :workspace-transform :id t2-ref}]
                                                                           :dependencies {{:node-type :workspace-transform :id t2-ref}
                                                                                          [{:node-type :workspace-transform :id t1-ref}]}
                                                                           :inputs       []
                                                                           :outputs      []}}]
        (testing "initial state: t1 is definition_stale, t2 is fresh"
          (is (true? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id t1-ref)))
          (is (false? (t2/select-one-fn :input_data_stale :model/WorkspaceTransform :ref_id t1-ref)))
          (is (false? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id t2-ref)))
          (is (false? (t2/select-one-fn :input_data_stale :model/WorkspaceTransform :ref_id t2-ref))))

        (mt/with-dynamic-fn-redefs [ws.execute/run-transform-with-remapping
                                    (fn [_transform _remapping]
                                      {:status :succeeded
                                       :end_time (java.time.Instant/now)
                                       :message "Mocked execution"})]
          (let [workspace    (t2/select-one :model/Workspace ws-id)
                ws-transform (t2/select-one :model/WorkspaceTransform :ref_id t1-ref)]
            (mt/with-current-user (mt/user->id :crowberto)
              (ws.impl/run-transform! workspace ws-transform))))

        (testing "after running t1: t1 is fresh, t2 is input_data_stale"
          (is (false? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id t1-ref)))
          (is (false? (t2/select-one-fn :input_data_stale :model/WorkspaceTransform :ref_id t1-ref)))
          (is (false? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id t2-ref)))
          (is (true? (t2/select-one-fn :input_data_stale :model/WorkspaceTransform :ref_id t2-ref))))))))

(deftest run-transform-marks-transitive-downstream-test
  (testing "Running a transform marks all transitive downstream, not just direct"
    (let [t1-ref (str (random-uuid))
          t2-ref (str (random-uuid))
          t3-ref (str (random-uuid))
          mp     (mt/metadata-provider)
          query1 (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (mt/with-temp [:model/Workspace          {ws-id :id} {:name "Test WS" :analysis_stale false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t1-ref
                                                            :name            "Transform 1"
                                                            :source          {:type "query" :query query1}
                                                            :target          {:database (mt/id) :schema "public" :name "t1"}
                                                            :definition_stale true
                                                            :input_data_stale false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t2-ref
                                                            :name            "Transform 2"
                                                            :source          {:type "query" :query query1}
                                                            :target          {:database (mt/id) :schema "public" :name "t2"}
                                                            :definition_stale false
                                                            :input_data_stale false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t3-ref
                                                            :name            "Transform 3"
                                                            :source          {:type "query" :query query1}
                                                            :target          {:database (mt/id) :schema "public" :name "t3"}
                                                            :definition_stale false
                                                            :input_data_stale false}
                     ;; t1 -> t2 -> t3
                     :model/WorkspaceGraph     _           {:workspace_id ws-id
                                                            :graph        {:entities     [{:node-type :workspace-transform :id t1-ref}
                                                                                          {:node-type :workspace-transform :id t2-ref}
                                                                                          {:node-type :workspace-transform :id t3-ref}]
                                                                           :dependencies {{:node-type :workspace-transform :id t2-ref}
                                                                                          [{:node-type :workspace-transform :id t1-ref}]
                                                                                          {:node-type :workspace-transform :id t3-ref}
                                                                                          [{:node-type :workspace-transform :id t2-ref}]}
                                                                           :inputs       []
                                                                           :outputs      []}}]
        (mt/with-dynamic-fn-redefs [ws.execute/run-transform-with-remapping
                                    (fn [_transform _remapping]
                                      {:status :succeeded
                                       :end_time (java.time.Instant/now)
                                       :message "Mocked execution"})]
          (let [workspace    (t2/select-one :model/Workspace ws-id)
                ws-transform (t2/select-one :model/WorkspaceTransform :ref_id t1-ref)]
            (mt/with-current-user (mt/user->id :crowberto)
              (ws.impl/run-transform! workspace ws-transform))))

        (testing "after running t1: both t2 and t3 are input_data_stale"
          (is (false? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id t1-ref)))
          (is (true? (t2/select-one-fn :input_data_stale :model/WorkspaceTransform :ref_id t2-ref)))
          (is (true? (t2/select-one-fn :input_data_stale :model/WorkspaceTransform :ref_id t3-ref))))))))

(deftest run-transform-clears-both-flags-when-fresh-test
  (testing "Running a transform with fresh ancestor clears both flags"
    (let [t1-ref (str (random-uuid))
          t2-ref (str (random-uuid))
          mp     (mt/metadata-provider)
          query1 (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          query2 (mt/native-query {:query "SELECT * FROM public.t1"})]
      (mt/with-temp [:model/Workspace          {ws-id :id} {:name "Test WS" :analysis_stale false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t1-ref
                                                            :name            "Transform 1"
                                                            :source          {:type "query" :query query1}
                                                            :target          {:database (mt/id) :schema "public" :name "t1"}
                                                            :definition_stale false
                                                            :input_data_stale false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t2-ref
                                                            :name            "Transform 2"
                                                            :source          {:type "query" :query query2}
                                                            :target          {:database (mt/id) :schema "public" :name "t2"}
                                                            :definition_stale true
                                                            :input_data_stale true}
                     :model/WorkspaceGraph     _           {:workspace_id ws-id
                                                            :graph        {:entities     [{:node-type :workspace-transform :id t1-ref}
                                                                                          {:node-type :workspace-transform :id t2-ref}]
                                                                           :dependencies {{:node-type :workspace-transform :id t2-ref}
                                                                                          [{:node-type :workspace-transform :id t1-ref}]}
                                                                           :inputs       []
                                                                           :outputs      []}}]
        (testing "initial state: t1 is fresh, t2 has both flags set"
          (is (false? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id t1-ref)))
          (is (true? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id t2-ref)))
          (is (true? (t2/select-one-fn :input_data_stale :model/WorkspaceTransform :ref_id t2-ref))))

        (mt/with-dynamic-fn-redefs [ws.execute/run-transform-with-remapping
                                    (fn [_transform _remapping]
                                      {:status :succeeded
                                       :end_time (java.time.Instant/now)
                                       :message "Mocked execution"})]
          (let [workspace    (t2/select-one :model/Workspace ws-id)
                ws-transform (t2/select-one :model/WorkspaceTransform :ref_id t2-ref)]
            (mt/with-current-user (mt/user->id :crowberto)
              (ws.impl/run-transform! workspace ws-transform))))

        (testing "after running t2 with fresh ancestor: both flags are cleared"
          (is (false? (t2/select-one-fn :definition_stale :model/WorkspaceTransform :ref_id t2-ref)))
          (is (false? (t2/select-one-fn :input_data_stale :model/WorkspaceTransform :ref_id t2-ref))))))))
