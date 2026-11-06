(ns metabase-enterprise.workspaces.no-remappings-test
  "On a database without table remappings the workspace hooks must cost no app-DB statements: they run on every
  query of every EE instance."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.query-processor.middleware :as ws.middleware]
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- call-count
  "The number of app-DB statements `thunk` makes."
  [thunk]
  (t2/with-call-count [n]
    (thunk)
    (n)))

(defn- with-no-remappings! [thunk]
  (ws.table-remapping/clear-mappings-for-db! (mt/id))
  ;; the first read of the cache after a write queries once; tests count the steady state
  (ws.remapping/enabled-for-db? (mt/id))
  (thunk))

(deftest qp-run-costs-no-remapping-statements-test
  (testing "a query makes the same app-DB statements as one with remapping suppressed"
    (with-no-remappings!
      (fn []
        (doseq [[kind query] {:mbql   (let [mp (mt/metadata-provider)]
                                        (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                            (lib/aggregate (lib/count))))
                              :native (mt/native-query {:query "SELECT 1"})}]
          (testing kind
            (qp/process-query query)
            (is (= (call-count #(binding [ws.remapping/*skip-remapping?* true]
                                  (qp/process-query query)))
                   (call-count #(qp/process-query query))))))))))

(deftest qp-hooks-cost-no-statements-test
  (with-no-remappings!
    (fn []
      (testing "Phase 1"
        (is (zero? (call-count #(ws.middleware/apply-workspace-remapping {:database (mt/id)})))))
      (testing "Phase 2"
        (is (zero? (call-count #((ws.middleware/apply-workspace-sql-remapping (fn [_query _rff] :ok))
                                 {:database (mt/id) :qp/compiled {:query "SELECT 1"}}
                                 identity))))))))

(deftest remap-added-after-first-query-takes-effect-test
  (testing "a remap added after a query has run applies to the next query"
    (with-no-remappings!
      (fn []
        (binding [driver/*driver* :h2]
          (let [rewritten (fn []
                            (let [seen (atom nil)]
                              ((ws.middleware/apply-workspace-sql-remapping (fn [query _rff] (reset! seen query)))
                               {:database (mt/id) :qp/compiled {:query "SELECT * FROM PUBLIC.VENUES"}}
                               identity)
                              (get-in @seen [:qp/compiled :query])))]
            (is (not (re-find #"(?i)ws_late" (rewritten))))
            (try
              (ws.table-remapping/add-mapping! (mt/id) {:schema "PUBLIC" :table "VENUES"} {:schema "ws_late" :table "VENUES"})
              (is (re-find #"(?i)ws_late" (rewritten)))
              (testing "and stops applying once removed"
                (ws.table-remapping/remove-mapping! (mt/id) {:schema "PUBLIC" :table "VENUES"})
                (is (not (re-find #"(?i)ws_late" (rewritten)))))
              (finally
                (ws.table-remapping/clear-mappings-for-db! (mt/id))))))))))

(deftest workspace-mode-sees-rows-written-elsewhere-test
  (testing "in workspace mode a row this process didn't write (another node's) takes effect on the next query"
    (with-no-remappings!
      (fn []
        (try
          (ws/set-instance-workspace! {:name      "test-ws"
                                       :databases {(mt/id) {:input_schemas ["PUBLIC"]
                                                            :output        {:schema "ws_other"}}}})
          (is (false? (ws.remapping/enabled-for-db? (mt/id))))
          ;; a plain HoneySQL insert skips the model hooks, so this process's cache isn't invalidated
          (t2/query-one {:insert-into :table_remapping
                         :values      [{:database_id     (mt/id)
                                        :from_db         ""
                                        :from_schema     "PUBLIC"
                                        :from_table_name "VENUES"
                                        :to_db           ""
                                        :to_schema       "ws_other"
                                        :to_table_name   "VENUES"
                                        :created_at      :%now}]})
          (is (true? (ws.remapping/enabled-for-db? (mt/id))))
          (finally
            (ws/clear-instance-workspace!)
            (ws.table-remapping/clear-mappings-for-db! (mt/id))))))))
