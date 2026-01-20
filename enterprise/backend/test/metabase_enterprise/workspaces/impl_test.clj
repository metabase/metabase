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
          (ws.impl/increment-graph-version! (:id ws))
          (ws.tu/analyze-workspace! (:id ws))
          (ws.impl/increment-graph-version! (:id ws))
          (ws.tu/analyze-workspace! (:id ws))
          (testing "still has exactly one of each after multiple syncs"
            (is (= 1 (t2/count :model/WorkspaceOutput :workspace_id (:id ws))))
            (is (= 1 (t2/count :model/WorkspaceInput :workspace_id (:id ws))))))))))

;;;; Two-flag staleness tests

(deftest staleness-recomputed-on-graph-read
  (testing "Graph staleness reflects current DB state with two flags"
    (let [t1-ref (str (random-uuid))]
      (mt/with-temp [:model/Workspace          {ws-id :id} {:name "Test WS"}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t1-ref
                                                            :name            "Transform 1"
                                                            :source          {:type "query" :query {}}
                                                            :target          {:database 1 :schema "public" :name "t1"}
                                                            :definition_changed true
                                                            :input_data_changed false}
                     :model/WorkspaceGraph     _           {:workspace_id ws-id
                                                            :graph        {:entities     [{:node-type :workspace-transform :id t1-ref}]
                                                                           :dependencies {}
                                                                           :inputs       []
                                                                           :outputs      []}}]
        (testing "initial read shows transform as definition_changed"
          (let [graph (ws.impl/get-or-calculate-graph! (t2/select-one :model/Workspace ws-id) :with-staleness? true)
                entity (first (:entities graph))]
            (is (true? (:definition_changed entity)))
            (is (false? (:input_data_changed entity)))))

        (t2/update! :model/WorkspaceTransform t1-ref {:definition_changed false :input_data_changed true})

        (testing "after updating flags in DB, graph read reflects the change"
          (let [graph (ws.impl/get-or-calculate-graph! (t2/select-one :model/Workspace ws-id) :with-staleness? true)
                entity (first (:entities graph))]
            (is (false? (:definition_changed entity)))
            (is (true? (:input_data_changed entity)))))))))

(deftest run-transform-with-stale-ancestor-sets-input-data-stale-test
  (testing "Running a transform with stale ancestor sets input_data_changed"
    ;; t1 queries from orders, outputs to t1 (definition_changed)
    ;; t2 queries from t1 (t1's output), outputs to t2 (fresh)
    ;; When t2 runs while t1 is still stale, t2 should have input_data_changed=true
    (let [t1-ref (str (random-uuid))
          t2-ref (str (random-uuid))
          mp     (mt/metadata-provider)
          query1 (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          query2 (mt/native-query {:query "SELECT * FROM public.t1"})]
      (mt/with-temp [:model/Workspace          {ws-id :id} {:name "Test WS"}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t1-ref
                                                            :name            "Transform 1"
                                                            :source          {:type "query" :query query1}
                                                            :target          {:database (mt/id) :schema "public" :name "t1"}
                                                            :definition_changed true
                                                            :input_data_changed false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t2-ref
                                                            :name            "Transform 2"
                                                            :source          {:type "query" :query query2}
                                                            :target          {:database (mt/id) :schema "public" :name "t2"}
                                                            :definition_changed false
                                                            :input_data_changed false}
                     ;; Graph showing t2 depends on t1
                     :model/WorkspaceGraph     _           {:workspace_id ws-id
                                                            :graph        {:entities     [{:node-type :workspace-transform :id t1-ref}
                                                                                          {:node-type :workspace-transform :id t2-ref}]
                                                                           :dependencies {{:node-type :workspace-transform :id t2-ref}
                                                                                          [{:node-type :workspace-transform :id t1-ref}]}
                                                                           :inputs       []
                                                                           :outputs      []}}]
        (testing "initial state: t1 is definition_changed, t2 is fresh"
          (is (true? (t2/select-one-fn :definition_changed :model/WorkspaceTransform :ref_id t1-ref)))
          (is (false? (t2/select-one-fn :definition_changed :model/WorkspaceTransform :ref_id t2-ref)))
          (is (false? (t2/select-one-fn :input_data_changed :model/WorkspaceTransform :ref_id t2-ref))))

        (mt/with-dynamic-fn-redefs [ws.execute/run-transform-with-remapping
                                    (fn [_transform _remapping]
                                      {:status :succeeded
                                       :end_time (java.time.Instant/now)
                                       :message "Mocked execution"})]
          (let [workspace    (t2/select-one :model/Workspace ws-id)
                ws-transform (t2/select-one :model/WorkspaceTransform :ref_id t2-ref)]
            (mt/with-current-user (mt/user->id :crowberto)
              (ws.impl/run-transform! workspace ws-transform))))

        (testing "after running t2: t2 has input_data_changed because t1 is still stale"
          (is (false? (t2/select-one-fn :definition_changed :model/WorkspaceTransform :ref_id t2-ref)))
          (is (true? (t2/select-one-fn :input_data_changed :model/WorkspaceTransform :ref_id t2-ref))))))))

(deftest run-transform-marks-downstream-stale-test
  (testing "Running a transform marks all transitive downstream as input_data_changed"
    (let [t1-ref (str (random-uuid))
          t2-ref (str (random-uuid))
          mp     (mt/metadata-provider)
          query1 (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          query2 (mt/native-query {:query "SELECT * FROM public.t1"})]
      (mt/with-temp [:model/Workspace          {ws-id :id} {:name "Test WS"}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t1-ref
                                                            :name            "Transform 1"
                                                            :source          {:type "query" :query query1}
                                                            :target          {:database (mt/id) :schema "public" :name "t1"}
                                                            :definition_changed true
                                                            :input_data_changed false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t2-ref
                                                            :name            "Transform 2"
                                                            :source          {:type "query" :query query2}
                                                            :target          {:database (mt/id) :schema "public" :name "t2"}
                                                            :definition_changed false
                                                            :input_data_changed false}
                     :model/WorkspaceGraph     _           {:workspace_id ws-id
                                                            :graph        {:entities     [{:node-type :workspace-transform :id t1-ref}
                                                                                          {:node-type :workspace-transform :id t2-ref}]
                                                                           :dependencies {{:node-type :workspace-transform :id t2-ref}
                                                                                          [{:node-type :workspace-transform :id t1-ref}]}
                                                                           :inputs       []
                                                                           :outputs      []}}]
        (testing "initial state: t1 is definition_changed, t2 is fresh"
          (is (true? (t2/select-one-fn :definition_changed :model/WorkspaceTransform :ref_id t1-ref)))
          (is (false? (t2/select-one-fn :input_data_changed :model/WorkspaceTransform :ref_id t1-ref)))
          (is (false? (t2/select-one-fn :definition_changed :model/WorkspaceTransform :ref_id t2-ref)))
          (is (false? (t2/select-one-fn :input_data_changed :model/WorkspaceTransform :ref_id t2-ref))))

        (mt/with-dynamic-fn-redefs [ws.execute/run-transform-with-remapping
                                    (fn [_transform _remapping]
                                      {:status :succeeded
                                       :end_time (java.time.Instant/now)
                                       :message "Mocked execution"})]
          (let [workspace    (t2/select-one :model/Workspace ws-id)
                ws-transform (t2/select-one :model/WorkspaceTransform :ref_id t1-ref)]
            (mt/with-current-user (mt/user->id :crowberto)
              (ws.impl/run-transform! workspace ws-transform))))

        (testing "after running t1: t1 is fresh, t2 is input_data_changed"
          (is (false? (t2/select-one-fn :definition_changed :model/WorkspaceTransform :ref_id t1-ref)))
          (is (false? (t2/select-one-fn :input_data_changed :model/WorkspaceTransform :ref_id t1-ref)))
          (is (false? (t2/select-one-fn :definition_changed :model/WorkspaceTransform :ref_id t2-ref)))
          (is (true? (t2/select-one-fn :input_data_changed :model/WorkspaceTransform :ref_id t2-ref))))))))

(deftest run-transform-marks-transitive-downstream-test
  (testing "Running a transform marks all transitive downstream, not just direct"
    (let [t1-ref (str (random-uuid))
          t2-ref (str (random-uuid))
          t3-ref (str (random-uuid))
          mp     (mt/metadata-provider)
          query1 (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (mt/with-temp [:model/Workspace          {ws-id :id} {:name "Test WS"}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t1-ref
                                                            :name            "Transform 1"
                                                            :source          {:type "query" :query query1}
                                                            :target          {:database (mt/id) :schema "public" :name "t1"}
                                                            :definition_changed true
                                                            :input_data_changed false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t2-ref
                                                            :name            "Transform 2"
                                                            :source          {:type "query" :query query1}
                                                            :target          {:database (mt/id) :schema "public" :name "t2"}
                                                            :definition_changed false
                                                            :input_data_changed false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t3-ref
                                                            :name            "Transform 3"
                                                            :source          {:type "query" :query query1}
                                                            :target          {:database (mt/id) :schema "public" :name "t3"}
                                                            :definition_changed false
                                                            :input_data_changed false}
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

        (testing "after running t1: both t2 and t3 are input_data_changed"
          (is (false? (t2/select-one-fn :definition_changed :model/WorkspaceTransform :ref_id t1-ref)))
          (is (true? (t2/select-one-fn :input_data_changed :model/WorkspaceTransform :ref_id t2-ref)))
          (is (true? (t2/select-one-fn :input_data_changed :model/WorkspaceTransform :ref_id t3-ref))))))))

(deftest run-transform-clears-both-flags-when-fresh-test
  (testing "Running a transform with fresh ancestor clears both flags"
    (let [t1-ref (str (random-uuid))
          t2-ref (str (random-uuid))
          mp     (mt/metadata-provider)
          query1 (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          query2 (mt/native-query {:query "SELECT * FROM public.t1"})]
      (mt/with-temp [:model/Workspace          {ws-id :id} {:name "Test WS"}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t1-ref
                                                            :name            "Transform 1"
                                                            :source          {:type "query" :query query1}
                                                            :target          {:database (mt/id) :schema "public" :name "t1"}
                                                            :definition_changed false
                                                            :input_data_changed false}
                     :model/WorkspaceTransform _           {:workspace_id    ws-id
                                                            :ref_id          t2-ref
                                                            :name            "Transform 2"
                                                            :source          {:type "query" :query query2}
                                                            :target          {:database (mt/id) :schema "public" :name "t2"}
                                                            :definition_changed true
                                                            :input_data_changed true}
                     :model/WorkspaceGraph     _           {:workspace_id ws-id
                                                            :graph        {:entities     [{:node-type :workspace-transform :id t1-ref}
                                                                                          {:node-type :workspace-transform :id t2-ref}]
                                                                           :dependencies {{:node-type :workspace-transform :id t2-ref}
                                                                                          [{:node-type :workspace-transform :id t1-ref}]}
                                                                           :inputs       []
                                                                           :outputs      []}}]
        (testing "initial state: t1 is fresh, t2 has both flags set"
          (is (false? (t2/select-one-fn :definition_changed :model/WorkspaceTransform :ref_id t1-ref)))
          (is (true? (t2/select-one-fn :definition_changed :model/WorkspaceTransform :ref_id t2-ref)))
          (is (true? (t2/select-one-fn :input_data_changed :model/WorkspaceTransform :ref_id t2-ref))))

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
          (is (false? (t2/select-one-fn :definition_changed :model/WorkspaceTransform :ref_id t2-ref)))
          (is (false? (t2/select-one-fn :input_data_changed :model/WorkspaceTransform :ref_id t2-ref))))))))

;;;; Static graph tests for with-staleness

(defn- workspace-transform
  "Create a workspace transform entity for testing."
  [id]
  {:node-type :workspace-transform :id id})

(defn- global-transform
  "Create a global/external transform entity for testing."
  [id]
  {:node-type :external-transform :id id})

(defn- stale->id
  "Group entity IDs by stale status: {true #{stale-ids} false #{non-stale-ids}}"
  [entities]
  (reduce (fn [acc {:keys [id stale]}]
            (update acc (boolean stale) (fnil conj #{}) id))
          {true #{} false #{}}
          entities))

(deftest with-staleness-linear-chain-test
  (testing "Linear chain: staleness propagates downstream"
    (let [t1 (workspace-transform "t1")
          t2 (workspace-transform "t2")
          t3 (workspace-transform "t3")
          ;; t1 -> t2 -> t3
          graph {:entities     [t1 t2 t3]
                 :dependencies {t2 [t1]
                                t3 [t2]}}]
      (testing "stale root propagates to all descendants"
        (let [staleness {"t1" {:definition_changed true :input_data_changed false}}
              result    (ws.impl/with-staleness graph staleness)]
          (is (= {true #{"t1" "t2" "t3"} false #{}}
                 (stale->id (:entities result))))))

      (testing "stale middle only propagates downstream"
        (let [staleness {"t2" {:definition_changed true :input_data_changed false}}
              result    (ws.impl/with-staleness graph staleness)]
          (is (= {true #{"t2" "t3"} false #{"t1"}}
                 (stale->id (:entities result))))))

      (testing "stale leaf doesn't propagate upstream"
        (let [staleness {"t3" {:definition_changed true :input_data_changed false}}
              result    (ws.impl/with-staleness graph staleness)]
          (is (= {true #{"t3"} false #{"t1" "t2"}}
                 (stale->id (:entities result)))))))))

(deftest with-staleness-diamond-graph-test
  (testing "Diamond graph: staleness propagates through all paths"
    (let [t1 (workspace-transform "t1")
          t2 (workspace-transform "t2")
          t3 (workspace-transform "t3")
          t4 (workspace-transform "t4")
          ;;    t1
          ;;   /  \
          ;; t2    t3
          ;;   \  /
          ;;    t4
          graph {:entities     [t1 t2 t3 t4]
                 :dependencies {t2 [t1]
                                t3 [t1]
                                t4 [t2 t3]}}]
      (testing "stale root propagates through all paths"
        (let [staleness {"t1" {:definition_changed true :input_data_changed false}}
              result    (ws.impl/with-staleness graph staleness)]
          (is (= {true #{"t1" "t2" "t3" "t4"} false #{}}
                 (stale->id (:entities result))))))

      (testing "stale on one branch only propagates through that path"
        (let [staleness {"t2" {:definition_changed true :input_data_changed false}}
              result    (ws.impl/with-staleness graph staleness)]
          (is (= {true #{"t2" "t4"} false #{"t1" "t3"}}
                 (stale->id (:entities result)))))))))

(deftest with-staleness-independent-subgraphs-test
  (testing "Independent subgraphs: staleness doesn't cross between them"
    (let [a1 (workspace-transform "a1")
          a2 (workspace-transform "a2")
          b1 (workspace-transform "b1")
          b2 (workspace-transform "b2")
          ;; Subgraph A: a1 -> a2
          ;; Subgraph B: b1 -> b2
          graph {:entities     [a1 a2 b1 b2]
                 :dependencies {a2 [a1]
                                b2 [b1]}}]
      (testing "staleness in subgraph A doesn't affect subgraph B"
        (let [staleness {"a1" {:definition_changed true :input_data_changed false}}
              result    (ws.impl/with-staleness graph staleness)]
          (is (= {true #{"a1" "a2"} false #{"b1" "b2"}}
                 (stale->id (:entities result)))))))))

(deftest with-staleness-wide-graph-test
  (testing "Wide graph: stale root propagates to all children"
    (let [t1 (workspace-transform "t1")
          t2 (workspace-transform "t2")
          t3 (workspace-transform "t3")
          t4 (workspace-transform "t4")
          t5 (workspace-transform "t5")
          ;;      t1
          ;;   / | | | \
          ;; t2 t3 t4 t5 ...
          graph {:entities     [t1 t2 t3 t4 t5]
                 :dependencies {t2 [t1]
                                t3 [t1]
                                t4 [t1]
                                t5 [t1]}}]
      (let [staleness {"t1" {:definition_changed true :input_data_changed false}}
            result    (ws.impl/with-staleness graph staleness)]
        (is (= {true #{"t1" "t2" "t3" "t4" "t5"} false #{}}
               (stale->id (:entities result))))))))

(deftest with-staleness-mixed-transforms-test
  (testing "Mixed transforms: staleness propagates through external transforms"
    (let [t1 (workspace-transform "t1")
          ext (global-transform 100)
          t2 (workspace-transform "t2")
          ;; t1 -> ext -> t2
          graph {:entities     [t1 ext t2]
                 :dependencies {ext [t1]
                                t2  [ext]}}]
      (testing "staleness propagates through external transform to downstream workspace transform"
        (let [staleness {"t1" {:definition_changed true :input_data_changed false}}
              result    (ws.impl/with-staleness graph staleness)]
          ;; ext is not a workspace-transform, so it's not in the staleness output
          ;; but t2 should be stale because t1 is stale
          (is (= {true #{"t1" "t2"} false #{}}
                 (stale->id (filter #(= :workspace-transform (:node-type %)) (:entities result))))))))))

(deftest with-staleness-empty-stale-set-test
  (testing "Empty stale set: nothing is marked stale"
    (let [t1 (workspace-transform "t1")
          t2 (workspace-transform "t2")
          graph {:entities     [t1 t2]
                 :dependencies {t2 [t1]}}
          staleness {}
          result    (ws.impl/with-staleness graph staleness)]
      (is (= {true #{} false #{"t1" "t2"}}
             (stale->id (:entities result)))))))

(deftest with-staleness-input-data-changed-test
  (testing "input_data_changed triggers staleness just like definition_changed"
    (let [t1 (workspace-transform "t1")
          t2 (workspace-transform "t2")
          graph {:entities     [t1 t2]
                 :dependencies {t2 [t1]}}
          staleness {"t1" {:definition_changed false :input_data_changed true}}
          result    (ws.impl/with-staleness graph staleness)]
      (is (= {true #{"t1" "t2"} false #{}}
             (stale->id (:entities result)))))))

(deftest with-staleness-preserves-other-fields-test
  (testing "compute-staleness preserves other entity fields"
    (let [t1 {:node-type :workspace-transform :id "t1" :extra-field "preserved"}
          graph {:entities     [t1]
                 :dependencies {}}
          staleness {"t1" {:definition_changed true :input_data_changed false}}
          result    (ws.impl/with-staleness graph staleness)
          entity    (first (:entities result))]
      (is (= "preserved" (:extra-field entity)))
      (is (true? (:stale entity)))
      (is (true? (:definition_changed entity)))
      (is (false? (:input_data_changed entity))))))

;;;; Static graph tests for marking functions (upstream-ancestors, downstream-descendants, any-ancestor-stale?)

(deftest upstream-ancestors-linear-chain-test
  (testing "Linear chain: computes all upstream ancestors"
    (let [t1 (workspace-transform "t1")
          t2 (workspace-transform "t2")
          t3 (workspace-transform "t3")
          ;; t1 -> t2 -> t3
          graph {:entities     [t1 t2 t3]
                 :dependencies {t2 [t1]
                                t3 [t2]}}]
      (testing "t3 has t1 and t2 as ancestors"
        (is (= #{"t1" "t2"}
               (ws.impl/upstream-ancestors graph "t3"))))
      (testing "t2 has only t1 as ancestor"
        (is (= #{"t1"}
               (ws.impl/upstream-ancestors graph "t2"))))
      (testing "t1 has no ancestors"
        (is (= #{}
               (ws.impl/upstream-ancestors graph "t1")))))))

(deftest upstream-ancestors-diamond-test
  (testing "Diamond graph: computes all paths"
    (let [t1 (workspace-transform "t1")
          t2 (workspace-transform "t2")
          t3 (workspace-transform "t3")
          t4 (workspace-transform "t4")
          ;;     t1
          ;;    /  \
          ;;   t2  t3
          ;;    \  /
          ;;     t4
          graph {:entities     [t1 t2 t3 t4]
                 :dependencies {t2 [t1]
                                t3 [t1]
                                t4 [t2 t3]}}]
      (testing "t4 has all transforms as ancestors"
        (is (= #{"t1" "t2" "t3"}
               (ws.impl/upstream-ancestors graph "t4"))))
      (testing "t2 has only t1 as ancestor"
        (is (= #{"t1"}
               (ws.impl/upstream-ancestors graph "t2")))))))

(deftest upstream-ancestors-with-external-transforms-test
  (testing "External transforms are traversed but not included"
    (let [t1 (workspace-transform "t1")
          ext (global-transform 100)
          t2 (workspace-transform "t2")
          ;; t1 -> ext -> t2
          graph {:entities     [t1 ext t2]
                 :dependencies {ext [t1]
                                t2  [ext]}}]
      (testing "t2 can reach through external transform to t1"
        (is (= #{"t1"}
               (ws.impl/upstream-ancestors graph "t2"))))
      (testing "ext cannot be returned as it's external"
        (is (not (contains? (ws.impl/upstream-ancestors graph "t2") 100)))))))

(deftest downstream-descendants-linear-chain-test
  (testing "Linear chain: computes all downstream descendants"
    (let [t1 (workspace-transform "t1")
          t2 (workspace-transform "t2")
          t3 (workspace-transform "t3")
          ;; t1 -> t2 -> t3
          graph {:entities     [t1 t2 t3]
                 :dependencies {t2 [t1]
                                t3 [t2]}}]
      (testing "t1 has t2 and t3 as descendants"
        (is (= #{"t2" "t3"}
               (ws.impl/downstream-descendants graph "t1"))))
      (testing "t2 has only t3 as descendant"
        (is (= #{"t3"}
               (ws.impl/downstream-descendants graph "t2"))))
      (testing "t3 has no descendants"
        (is (= #{}
               (ws.impl/downstream-descendants graph "t3")))))))

(deftest downstream-descendants-diamond-test
  (testing "Diamond graph: computes all downstream paths"
    (let [t1 (workspace-transform "t1")
          t2 (workspace-transform "t2")
          t3 (workspace-transform "t3")
          t4 (workspace-transform "t4")
          ;;     t1
          ;;    /  \
          ;;   t2  t3
          ;;    \  /
          ;;     t4
          graph {:entities     [t1 t2 t3 t4]
                 :dependencies {t2 [t1]
                                t3 [t1]
                                t4 [t2 t3]}}]
      (testing "t1 has all transforms as descendants"
        (is (= #{"t2" "t3" "t4"}
               (ws.impl/downstream-descendants graph "t1"))))
      (testing "t2 has only t4 as descendant"
        (is (= #{"t4"}
               (ws.impl/downstream-descendants graph "t2")))))))

(deftest downstream-descendants-with-external-transforms-test
  (testing "External transforms are traversed but not included"
    (let [t1 (workspace-transform "t1")
          ext (global-transform 100)
          t2 (workspace-transform "t2")
          ;; t1 -> ext -> t2
          graph {:entities     [t1 ext t2]
                 :dependencies {ext [t1]
                                t2  [ext]}}]
      (testing "t1 can reach through external transform to t2"
        (is (= #{"t2"}
               (ws.impl/downstream-descendants graph "t1"))))
      (testing "ext cannot be returned as it's external"
        (is (not (contains? (ws.impl/downstream-descendants graph "t1") 100)))))))

(deftest any-ancestor-stale?-test
  (testing "compute-any-ancestor-stale? checks staleness in staleness-map"
    (let [staleness-map {"t1" {:definition_changed true :input_data_changed false}
                         "t2" {:definition_changed false :input_data_changed false}
                         "t3" {:definition_changed false :input_data_changed true}}]
      (testing "returns true when any ancestor has definition_changed"
        (is (true? (ws.impl/any-ancestor-stale? #{"t1" "t2"} staleness-map))))
      (testing "returns true when any ancestor has input_data_changed"
        (is (true? (ws.impl/any-ancestor-stale? #{"t2" "t3"} staleness-map))))
      (testing "returns false when no ancestor is stale"
        (is (false? (ws.impl/any-ancestor-stale? #{"t2"} staleness-map))))
      (testing "returns false for empty ancestor set"
        (is (false? (ws.impl/any-ancestor-stale? #{} staleness-map))))
      (testing "returns false when ancestors not in staleness-map"
        (is (false? (ws.impl/any-ancestor-stale? #{"t99"} staleness-map)))))))

(deftest downstream-descendants-empty-graph-test
  (testing "Empty graph returns nil"
    (is (nil? (ws.impl/downstream-descendants {:entities [] :dependencies nil} "t1")))))

(deftest upstream-ancestors-empty-graph-test
  (testing "Empty graph returns nil"
    (is (nil? (ws.impl/upstream-ancestors {:entities [] :dependencies nil} "t1")))))
