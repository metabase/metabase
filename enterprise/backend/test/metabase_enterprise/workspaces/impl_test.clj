(ns metabase-enterprise.workspaces.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.common :as ws.common]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.driver.sql :as driver.sql]
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

;;;; build-remapping tests

(deftest build-remapping-creates-nil-schema-entries-for-default-schema-outputs-test
  (testing "build-remapping creates [db_id nil table] entries for outputs in the default schema"
    (ws.tu/with-resources! [{:keys [workspace-id]} {:workspace {:definitions {:x1 [:t0]}}}]
      (let [db              (t2/select-one [:model/Database :id :engine :details] (mt/id))
            default-schema  (or (driver.sql/default-schema (:engine db))
                                ((some-fn :dbname :db) (:details db)))
            ws-transform    (t2/select-one :model/WorkspaceTransform :workspace_id workspace-id)]
        ;; Update the transform's target schema to the default schema before analysis,
        ;; so analysis naturally produces an output in the default schema.
        (t2/update! :model/WorkspaceTransform
                    {:workspace_id workspace-id, :ref_id (:ref_id ws-transform)}
                    {:target (assoc (:target ws-transform) :schema default-schema)})
        (let [workspace    (t2/select-one :model/Workspace workspace-id)
              target-table (-> ws-transform :target :name)
              graph        (ws.impl/get-or-calculate-graph! workspace)
              result       (#'ws.impl/build-remapping workspace graph)
              ws-output    (t2/select-one :model/WorkspaceOutput
                                          :workspace_id workspace-id
                                          :global_table target-table)
              isolated     ((juxt :isolated_schema :isolated_table) ws-output)]
          (doseq [[desc lookup-key] [["qualified [db_id schema table]" [(mt/id) default-schema target-table]]
                                     ["unqualified [db_id nil table]"  [(mt/id) nil target-table]]]]
            (testing (str desc " maps to the isolated table")
              (is (= isolated ((juxt :schema :table) (get (:tables result) lookup-key)))))))))))

;;;; Two-flag staleness tests

(deftest staleness-recomputed-on-graph-read
  (testing "Graph staleness reflects current DB state with two flags"
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map]}
                            {:workspace {:definitions {:x1 [:t0]}
                                         :properties  {:x1 {:definition_changed true
                                                            :input_data_changed false}}}}]
      (let [t1-ref  (workspace-map :x1)
            find-t1 (fn [graph] (first (filter #(= t1-ref (:id %)) (:entities graph))))]
        (testing "initial read shows transform as definition_changed"
          (let [workspace (t2/select-one :model/Workspace workspace-id)
                graph     (ws.impl/with-staleness workspace (ws.impl/get-or-calculate-graph! workspace))
                entity    (find-t1 graph)]
            (is (= {:definition_changed true :input_data_changed false}
                   (select-keys entity [:definition_changed :input_data_changed])))))

        (t2/update! :model/WorkspaceTransform {:workspace_id workspace-id :ref_id t1-ref}
                    {:definition_changed false :input_data_changed true})

        (testing "after updating flags in DB, graph read reflects the change"
          (let [workspace (t2/select-one :model/Workspace workspace-id)
                graph     (ws.impl/with-staleness workspace (ws.impl/get-or-calculate-graph! workspace))
                entity    (find-t1 graph)]
            (is (= {:definition_changed false :input_data_changed true}
                   (select-keys entity [:definition_changed :input_data_changed])))))))))

(deftest run-transform-marks-downstream-stale-test
  (testing "Running a transform marks all transitive downstream as input_data_changed"
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map]}
                            {:workspace {:definitions {:x1 [:t0] :x2 [:x1]}
                                         :properties  {:x1 {:definition_changed true  :input_data_changed false}
                                                       :x2 {:definition_changed false :input_data_changed false}}}}]
      (let [t1-ref (workspace-map :x1)
            t2-ref (workspace-map :x2)]
        (ws.tu/mock-run-transform! workspace-id t1-ref)

        (testing "after running t1: t1 is fresh, t2 is input_data_changed"
          (is (= {t1-ref {:definition_changed false :input_data_changed false}
                  t2-ref {:definition_changed false :input_data_changed true}}
                 (ws.tu/staleness-flags workspace-id))))))))

(deftest run-transform-marks-transitive-downstream-test
  (testing "Running a transform marks all transitive downstream, not just direct"
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map]}
                            {:workspace {:definitions {:x1 [:t0] :x2 [:x1] :x3 [:x2]}
                                         :properties  {:x1 {:definition_changed true  :input_data_changed false}
                                                       :x2 {:definition_changed false :input_data_changed false}
                                                       :x3 {:definition_changed false :input_data_changed false}}}}]
      (let [t1-ref (workspace-map :x1)
            t2-ref (workspace-map :x2)
            t3-ref (workspace-map :x3)]
        (ws.tu/mock-run-transform! workspace-id t1-ref)

        (testing "after running t1: both t2 and t3 are input_data_changed"
          (is (= {t1-ref {:definition_changed false :input_data_changed false}
                  t2-ref {:definition_changed false :input_data_changed true}
                  t3-ref {:definition_changed false :input_data_changed true}}
                 (ws.tu/staleness-flags workspace-id))))))))

(deftest run-transform-clears-both-flags-when-fresh-test
  (testing "Running a transform with fresh ancestor clears both flags"
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map]}
                            {:workspace {:definitions {:x1 [:t0] :x2 [:x1]}
                                         :properties  {:x1 {:definition_changed false :input_data_changed false}
                                                       :x2 {:definition_changed true  :input_data_changed true}}}}]
      (let [t1-ref (workspace-map :x1)
            t2-ref (workspace-map :x2)]
        (testing "initial state: t1 is fresh, t2 has both flags set"
          (is (= {t1-ref {:definition_changed false :input_data_changed false}
                  t2-ref {:definition_changed true  :input_data_changed true}}
                 (ws.tu/staleness-flags workspace-id))))

        (ws.tu/mock-run-transform! workspace-id t2-ref)

        (testing "after running t2 with fresh ancestor: both flags are cleared"
          (is (= {t1-ref {:definition_changed false :input_data_changed false}
                  t2-ref {:definition_changed false :input_data_changed false}}
                 (ws.tu/staleness-flags workspace-id))))))))

;;;; Static graph tests for annotate-staleness

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

(deftest annotate-staleness-linear-chain-test
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
              result    (ws.impl/annotate-staleness graph staleness)]
          (is (= {true #{"t1" "t2" "t3"} false #{}}
                 (stale->id (:entities result))))))

      (testing "stale middle only propagates downstream"
        (let [staleness {"t2" {:definition_changed true :input_data_changed false}}
              result    (ws.impl/annotate-staleness graph staleness)]
          (is (= {true #{"t2" "t3"} false #{"t1"}}
                 (stale->id (:entities result))))))

      (testing "stale leaf doesn't propagate upstream"
        (let [staleness {"t3" {:definition_changed true :input_data_changed false}}
              result    (ws.impl/annotate-staleness graph staleness)]
          (is (= {true #{"t3"} false #{"t1" "t2"}}
                 (stale->id (:entities result)))))))))

(deftest annotate-staleness-diamond-graph-test
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
              result    (ws.impl/annotate-staleness graph staleness)]
          (is (= {true #{"t1" "t2" "t3" "t4"} false #{}}
                 (stale->id (:entities result))))))

      (testing "stale on one branch only propagates through that path"
        (let [staleness {"t2" {:definition_changed true :input_data_changed false}}
              result    (ws.impl/annotate-staleness graph staleness)]
          (is (= {true #{"t2" "t4"} false #{"t1" "t3"}}
                 (stale->id (:entities result)))))))))

(deftest annotate-staleness-independent-subgraphs-test
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
              result    (ws.impl/annotate-staleness graph staleness)]
          (is (= {true #{"a1" "a2"} false #{"b1" "b2"}}
                 (stale->id (:entities result)))))))))

(deftest annotate-staleness-wide-graph-test
  (testing "Wide graph: stale root propagates to all children"
    (let [t1 (workspace-transform "t1")
          t2 (workspace-transform "t2")
          t3 (workspace-transform "t3")
          t4 (workspace-transform "t4")
          t5 (workspace-transform "t5")
          ;;      t1
          ;;   / | | | \
          ;; t2 t3 t4 t5 ...
          graph     {:entities     [t1 t2 t3 t4 t5]
                     :dependencies {t2 [t1]
                                    t3 [t1]
                                    t4 [t1]
                                    t5 [t1]}}
          staleness {"t1" {:definition_changed true :input_data_changed false}}
          result    (ws.impl/annotate-staleness graph staleness)]
      (is (= {true #{"t1" "t2" "t3" "t4" "t5"} false #{}}
             (stale->id (:entities result)))))))

(deftest annotate-staleness-mixed-transforms-test
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
              result    (ws.impl/annotate-staleness graph staleness)]
          ;; All transforms (workspace and external) downstream of stale t1 should be marked stale
          (is (= {true #{"t1" 100 "t2"} false #{}}
                 (stale->id (filter #(#{:workspace-transform :external-transform} (:node-type %))
                                    (:entities result))))))))))

(deftest annotate-staleness-empty-stale-set-test
  (testing "Empty stale set: nothing is marked stale"
    (let [t1 (workspace-transform "t1")
          t2 (workspace-transform "t2")
          graph {:entities     [t1 t2]
                 :dependencies {t2 [t1]}}
          staleness {}
          result    (ws.impl/annotate-staleness graph staleness)]
      (is (= {true #{} false #{"t1" "t2"}}
             (stale->id (:entities result)))))))

(deftest annotate-staleness-input-data-changed-test
  (testing "input_data_changed triggers staleness just like definition_changed"
    (let [t1 (workspace-transform "t1")
          t2 (workspace-transform "t2")
          graph {:entities     [t1 t2]
                 :dependencies {t2 [t1]}}
          staleness {"t1" {:definition_changed false :input_data_changed true}}
          result    (ws.impl/annotate-staleness graph staleness)]
      (is (= {true #{"t1" "t2"} false #{}}
             (stale->id (:entities result)))))))

(deftest annotate-staleness-preserves-other-fields-test
  (testing "compute-staleness preserves other entity fields"
    (let [t1 {:node-type :workspace-transform :id "t1" :extra-field "preserved"}
          graph {:entities     [t1]
                 :dependencies {}}
          staleness {"t1" {:definition_changed true :input_data_changed false}}
          result    (ws.impl/annotate-staleness graph staleness)
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
               (set (ws.impl/upstream-ancestors graph "t3")))))
      (testing "t2 has only t1 as ancestor"
        (is (= #{"t1"}
               (set (ws.impl/upstream-ancestors graph "t2")))))
      (testing "t1 has no ancestors"
        (is (empty? (ws.impl/upstream-ancestors graph "t1")))))))

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
               (set (ws.impl/upstream-ancestors graph "t4")))))
      (testing "t2 has only t1 as ancestor"
        (is (= #{"t1"}
               (set (ws.impl/upstream-ancestors graph "t2"))))))))

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
               (set (ws.impl/upstream-ancestors graph "t2")))))
      (testing "ext cannot be returned as it's external"
        (is (not (contains? (set (ws.impl/upstream-ancestors graph "t2")) 100)))))))

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
               (set (ws.impl/downstream-descendants graph "t1")))))
      (testing "t2 has only t3 as descendant"
        (is (= #{"t3"}
               (set (ws.impl/downstream-descendants graph "t2")))))
      (testing "t3 has no descendants"
        (is (empty? (ws.impl/downstream-descendants graph "t3")))))))

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
               (set (ws.impl/downstream-descendants graph "t1")))))
      (testing "t2 has only t4 as descendant"
        (is (= #{"t4"}
               (set (ws.impl/downstream-descendants graph "t2"))))))))

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
               (set (ws.impl/downstream-descendants graph "t1")))))
      (testing "ext cannot be returned as it's external"
        (is (not (contains? (set (ws.impl/downstream-descendants graph "t1")) 100)))))))

(deftest downstream-descendants-empty-graph-test
  (testing "Empty graph returns nil"
    (is (nil? (ws.impl/downstream-descendants {:entities [] :dependencies nil} "t1")))))

(deftest upstream-ancestors-empty-graph-test
  (testing "Empty graph returns nil"
    (is (nil? (ws.impl/upstream-ancestors {:entities [] :dependencies nil} "t1")))))

;;;; run-stale-ancestors! tests

(deftest run-stale-ancestors-runs-only-stale-ancestors-test
  (testing "run-stale-ancestors! only runs ancestors that are stale (including transitively stale)"
    ;; Graph:
    ;;   x1 -> x2 \
    ;;   x3 -> x4 -> x7
    ;;   x5 -> x6 /
    ;; x1 and x4 are locally stale, x2 is transitively stale (depends on x1)
    ;; x3, x5, x6 are fresh and should NOT run
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map]}
                            {:workspace {:definitions {:x1 [:t0] :x2 [:x1]
                                                       :x3 [:t0] :x4 [:x3]
                                                       :x5 [:t0] :x6 [:x5]
                                                       :x7 [:x2 :x4 :x6]}
                                         :properties  {:x1 {:definition_changed true}
                                                       :x2 {:definition_changed false}
                                                       :x3 {:definition_changed false}
                                                       :x4 {:definition_changed true}
                                                       :x5 {:definition_changed false}
                                                       :x6 {:definition_changed false}
                                                       :x7 {:definition_changed false}}}}]
      (let [t1-ref (workspace-map :x1)
            t2-ref (workspace-map :x2)
            t4-ref (workspace-map :x4)
            t7-ref (workspace-map :x7)]
        (ws.tu/with-mocked-execution
          (let [workspace (t2/select-one :model/Workspace workspace-id)
                graph     (ws.impl/get-or-calculate-graph! workspace)
                result    (ws.impl/run-stale-ancestors! workspace graph t7-ref)
                succeeded (:succeeded result)]
            (testing "x1, x2 (transitively stale), and x4 run; x3, x5, x6 do not"
              (is (= (set [t1-ref t2-ref t4-ref]) (set succeeded)))
              (is (= [] (:failed result)))
              (is (= [] (:not_run result))))
            (testing "x1 runs before x2 (dependency order within branch)"
              (is (< (.indexOf succeeded t1-ref) (.indexOf succeeded t2-ref))))))))))

(deftest run-stale-ancestors-respects-dependency-order-test
  (testing "run-stale-ancestors! runs ancestors in dependency order"
    ;; Chain: t1 -> t2 -> t3, where t1 and t2 are stale
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map]}
                            {:workspace {:definitions {:x1 [:t0] :x2 [:x1] :x3 [:x2]}
                                         :properties  {:x1 {:definition_changed true}
                                                       :x2 {:definition_changed true}
                                                       :x3 {:definition_changed false}}}}]
      (let [t1-ref    (workspace-map :x1)
            t2-ref    (workspace-map :x2)
            t3-ref    (workspace-map :x3)
            run-order (atom [])]
        (mt/with-dynamic-fn-redefs [ws.impl/run-transform!
                                    (fn [_ws _graph transform & _]
                                      (swap! run-order conj (:ref_id transform))
                                      {:status :succeeded})]
          (let [workspace (t2/select-one :model/Workspace workspace-id)
                graph     (ws.impl/get-or-calculate-graph! workspace)
                result    (ws.impl/run-stale-ancestors! workspace graph t3-ref)]
            (testing "both stale ancestors are run in order (t1 before t2)"
              (is (= [t1-ref t2-ref] @run-order))
              (is (= [t1-ref t2-ref] (:succeeded result))))))))))

(deftest run-stale-ancestors-stops-on-failure-test
  (testing "run-stale-ancestors! stops on first failure and marks remaining as not_run"
    ;; Chain: t1 -> t2 -> t3, where t1 and t2 are stale, t1 fails
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map]}
                            {:workspace {:definitions {:x1 [:t0] :x2 [:x1] :x3 [:x2]}
                                         :properties  {:x1 {:definition_changed true}
                                                       :x2 {:definition_changed true}
                                                       :x3 {:definition_changed false}}}}]
      (let [t1-ref (workspace-map :x1)
            t2-ref (workspace-map :x2)
            t3-ref (workspace-map :x3)]
        (mt/with-dynamic-fn-redefs [ws.impl/run-transform!
                                    (fn [_ws _graph transform & _]
                                      (if (= (:ref_id transform) t1-ref)
                                        {:status :failed :message "Simulated failure"}
                                        {:status :succeeded}))]
          (let [workspace (t2/select-one :model/Workspace workspace-id)
                graph     (ws.impl/get-or-calculate-graph! workspace)
                result    (ws.impl/run-stale-ancestors! workspace graph t3-ref)]
            (testing "t1 fails, t2 is not_run"
              (is (= [] (:succeeded result)))
              (is (= [t1-ref] (:failed result)))
              (is (= [t2-ref] (:not_run result))))))))))

(deftest run-stale-ancestors-no-stale-ancestors-test
  (testing "run-stale-ancestors! returns empty results when no ancestors are stale"
    (ws.tu/with-resources! [{:keys [workspace-id workspace-map]}
                            {:workspace {:definitions {:x1 [:t0] :x2 [:x1]}
                                         :properties  {:x1 {:definition_changed false}
                                                       :x2 {:definition_changed false}}}}]
      (let [t2-ref (workspace-map :x2)]
        (ws.tu/with-mocked-execution
          (let [workspace (t2/select-one :model/Workspace workspace-id)
                graph     (ws.impl/get-or-calculate-graph! workspace)
                result    (ws.impl/run-stale-ancestors! workspace graph t2-ref)]
            (testing "no transforms are run"
              (is (= [] (:succeeded result)))
              (is (= [] (:failed result)))
              (is (= [] (:not_run result))))))))))
