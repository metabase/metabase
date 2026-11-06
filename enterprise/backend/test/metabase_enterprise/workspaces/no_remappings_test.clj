(ns metabase-enterprise.workspaces.no-remappings-test
  "On a database without table remappings the workspace hooks must cost no app-DB statements: they run on every
  query, every synced table and every transform of every EE instance."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.models.table-remapping :as table-remapping]
   [metabase-enterprise.workspaces.query-processor.middleware :as ws.middleware]
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.test :as mt]
   [metabase.util.malli.fn :as mu.fn]
   [metabase.workspaces.table-remapping :as oss.table-remapping]
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

(deftest sync-hooks-cost-no-statements-test
  (with-no-remappings!
    (fn []
      (let [db-id (mt/id)
            spec  {:db nil :schema "PUBLIC" :name "VENUES"}]
        (is (zero? (call-count
                    #(do
                       (oss.table-remapping/table-remappings-exist? db-id)
                       (oss.table-remapping/workspace-remap-schema+name db-id spec)
                       (oss.table-remapping/canonical-schema+name db-id spec)
                       (oss.table-remapping/filter-workspace-side-tables #{spec} db-id)
                       (oss.table-remapping/inject-workspace-canonical-tuples #{spec} db-id)
                       (oss.table-remapping/expand-schema-names-with-workspace ["PUBLIC"] db-id)
                       (oss.table-remapping/rewrite-fk-result-canonical [] db-id)
                       (oss.table-remapping/call-with-fk-probe-iso-dbs db-id (constantly nil))))))))))

(deftest sync-costs-no-remapping-statements-test
  (testing "metadata sync makes the same app-DB statements as with the OSS fallbacks of the workspace hooks"
    (with-no-remappings!
      (fn []
        (let [sync! #(sync-metadata/sync-db-metadata! (mt/id))]
          (sync!)
          (is (= (call-count #(mt/with-dynamic-fn-redefs [oss.table-remapping/table-remappings-exist?             (constantly false)
                                                          oss.table-remapping/workspace-remap-schema+name        (constantly nil)
                                                          oss.table-remapping/filter-workspace-side-tables       (fn [tuples _] tuples)
                                                          oss.table-remapping/inject-workspace-canonical-tuples  (fn [tuples _] tuples)]
                                (sync!)))
                 (call-count sync!))))))))

(deftest fk-sync-streams-test
  (testing "without remappings, FK sync hands back the driver's reducible as is, unrealized"
    (with-no-remappings!
      (fn []
        (let [reducible (reify clojure.lang.IReduceInit
                          (reduce [_ _f init] init))]
          (with-redefs [driver/describe-fks      (constantly reducible)
                        mu.fn/instrument-ns?     (constantly false)]
            (is (identical? reducible (fetch-metadata/fk-metadata (driver.u/lib-database (mt/id)))))))))))

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

(deftest rolled-back-write-leaves-cache-correct-test
  (let [from {:schema "PUBLIC" :table "VENUES"}
        to   {:schema "ws_rollback" :table "VENUES"}
        rolled-back! (fn [thunk]
                       (try
                         (t2/with-transaction [_]
                           (thunk)
                           (throw (ex-info "roll back" {})))
                         (catch clojure.lang.ExceptionInfo _)))]
    (with-no-remappings!
      (fn []
        (try
          (testing "a delete read back in its own transaction and then rolled back leaves the remap in effect"
            (ws.table-remapping/add-mapping! (mt/id) from to)
            (is (true? (ws.remapping/enabled-for-db? (mt/id))))
            (rolled-back! #(do (ws.table-remapping/clear-mappings-for-db! (mt/id))
                               (is (false? (ws.remapping/enabled-for-db? (mt/id))) "the transaction sees its delete")))
            (is (t2/exists? :model/TableRemapping :database_id (mt/id)))
            (is (true? (ws.remapping/enabled-for-db? (mt/id)))))
          (testing "an insert read back in its own transaction and then rolled back leaves no remap"
            (ws.table-remapping/clear-mappings-for-db! (mt/id))
            (ws.remapping/enabled-for-db? (mt/id))
            (rolled-back! #(do (ws.table-remapping/add-mapping! (mt/id) from to)
                               (is (true? (ws.remapping/enabled-for-db? (mt/id))) "the transaction sees its insert")))
            (is (not (contains? (table-remapping/database-ids-with-remappings) (mt/id)))))
          (finally
            (ws.table-remapping/clear-mappings-for-db! (mt/id))))))))
