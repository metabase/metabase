(ns metabase.kill-sync-test
  "Tests for the global `disable-sync` kill-switch: all sync entry points refuse, manual-sync HTTP endpoints 503."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.util]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.sync.sync :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.task.sync-databases :as task.sync-databases]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouses.models.database :as database]
   [metabase.warehouses.settings :as warehouses.settings]
   [toucan2.core :as t2]))

(deftest disable-sync-setting-defaults-off-test
  (is (false? (warehouses.settings/disable-sync)))
  (is (false? (sync-util/sync-disabled?))))

(deftest disable-sync-setting-flips-test
  (mt/with-temporary-setting-values [disable-sync true]
    (is (true? (warehouses.settings/disable-sync)))
    (is (true? (sync-util/sync-disabled?)))))

(deftest should-sync?-respects-disable-sync-test
  (mt/with-temp [:model/Database normal-db {:engine :h2}
                 :model/Database dest-db   {:engine :h2 :router_database_id (:id normal-db)}]
    (testing "flag off: normal DB syncs, destination DB doesn't"
      (is (true?  (database/should-sync? normal-db)))
      (is (false? (database/should-sync? dest-db))))
    (mt/with-temporary-setting-values [disable-sync true]
      (testing "flag on: neither syncs"
        (is (false? (database/should-sync? normal-db)))
        (is (false? (database/should-sync? dest-db)))))))

(deftest disable-sync-blocks-db-phase-functions-test
  (testing "DB-level sync entry points return nil and never reach the driver when flag is on"
    (mt/with-temp [:model/Database db {:engine :h2}]
      (mt/with-temporary-setting-values [disable-sync true]
        (let [driver-calls (atom 0)]
          (with-redefs [driver/describe-database (fn [& _] (swap! driver-calls inc) {:tables #{}})
                        driver/describe-fields   (fn [& _] (swap! driver-calls inc) [])
                        driver/describe-table    (fn [& _] (swap! driver-calls inc) {:fields #{}})]
            (is (nil? (sync/sync-database! db))                     "sync-database! refuses")
            (is (nil? (sync-metadata/sync-db-metadata! db))         "sync-db-metadata! refuses")
            (is (nil? (analyze/analyze-db! db))                     "analyze-db! refuses")
            (is (nil? (analyze/refingerprint-db! db))               "refingerprint-db! refuses")
            (is (nil? (sync.field-values/update-field-values! db))  "update-field-values! refuses")
            (is (zero? @driver-calls)                               "no driver methods invoked")))))))

(deftest disable-sync-blocks-table-phase-functions-test
  (testing "Table-level sync entry points refuse and never reach the driver when flag is on"
    (mt/with-temp [:model/Database db    {:engine :h2}
                   :model/Table    table {:db_id (:id db) :name "t"}]
      (mt/with-temporary-setting-values [disable-sync true]
        (let [driver-calls (atom 0)]
          (with-redefs [driver/describe-fields (fn [& _] (swap! driver-calls inc) [])
                        driver/describe-table  (fn [& _] (swap! driver-calls inc) {:fields #{}})]
            (testing "sync-table! returns the table (doto-threaded caller contract)"
              (is (= table (sync/sync-table! table))))
            (testing "sync-table-metadata! returns nil"
              (is (nil? (sync-metadata/sync-table-metadata! table))))
            (testing "analyze-table! returns nil"
              (is (nil? (analyze/analyze-table! table))))
            (testing "update-field-values-for-table! returns zero-stats map"
              (is (= {:errors 0, :created 0, :updated 0, :deleted 0}
                     (sync.field-values/update-field-values-for-table! table))))
            (is (zero? @driver-calls) "no driver methods invoked")))))))

(deftest sync-schema-endpoint-503-test
  (testing "POST /api/database/:id/sync_schema returns 503 when disable-sync is on"
    (mt/with-temp [:model/Database db {:engine :h2}]
      (mt/with-temporary-setting-values [disable-sync true]
        (let [response (mt/user-http-request :crowberto :post 503
                                             (format "database/%d/sync_schema" (:id db)))]
          (is (= "sync-disabled" (get response :error-code))))))))

(deftest rescan-values-endpoint-503-test
  (testing "POST /api/database/:id/rescan_values returns 503 when disable-sync is on"
    (mt/with-temp [:model/Database db {:engine :h2}]
      (mt/with-temporary-setting-values [disable-sync true]
        (let [response (mt/user-http-request :crowberto :post 503
                                             (format "database/%d/rescan_values" (:id db)))]
          (is (= "sync-disabled" (get response :error-code))))))))

(deftest disable-sync-blocks-quartz-sync-and-analyze-test
  (testing "sync-and-analyze-database*! refuses at the job entry point when disable-sync is on (defense in depth)"
    (mt/with-temp [:model/Database db {:engine :h2}]
      (mt/with-temporary-setting-values [disable-sync true]
        (let [reached-sync? (atom false)]
          ;; Stub driver.u/can-connect-with-details? so the guard under test is the only thing
          ;; between the entry point and the sync/analyze fns — otherwise a failing connect here
          ;; would short-circuit and the assertion would pass vacuously.
          (with-redefs [metabase.driver.util/can-connect-with-details? (fn [& _] true)
                        sync-metadata/sync-db-metadata!                (fn [& _] (reset! reached-sync? true) nil)
                        analyze/analyze-db!                            (fn [& _] (reset! reached-sync? true) nil)]
            (#'task.sync-databases/sync-and-analyze-database*! (:id db))
            (is (false? @reached-sync?)
                "guard missing: sync-and-analyze-database*! reached sync/analyze despite disable-sync")))))))

(deftest disable-sync-blocks-quartz-update-field-values-test
  (testing "update-field-values! refuses at the job entry point when disable-sync is on (defense in depth)"
    (mt/with-temp [:model/Database db {:engine :h2}]
      (mt/with-temporary-setting-values [disable-sync true]
        (let [reached-fv? (atom false)
              db-id       (:id db)]
          (with-redefs-fn {#'task.sync-databases/job-context->database-id (fn [_] db-id)
                           #'sync.field-values/update-field-values!       (fn [& _] (reset! reached-fv? true) nil)}
            (fn []
              (#'task.sync-databases/update-field-values! ::fake-job-context)))
          (is (false? @reached-fv?)
              "guard missing: update-field-values! reached sync.field-values despite disable-sync"))))))

(deftest disable-sync-blocks-jit-field-values-cache-miss-test
  (testing (str "get-or-create-full-field-values! is the JIT path behind GET /api/field/:id/values. "
                "On a cache miss, it must NOT issue a warehouse query when disable-sync is on — operators "
                "rely on the kill-switch's docstring promise that field-value sync is suppressed regardless "
                "of how it was triggered.")
    (mt/dataset test-data
      (let [field-id (mt/id :categories :name)]
        (t2/delete! :model/FieldValues :field_id field-id :type :full)
        (mt/with-temporary-setting-values [disable-sync true]
          (with-redefs [field-values/distinct-values
                        (fn [& _] (throw (ex-info "distinct-values must not run under disable-sync" {})))]
            (let [result (field-values/get-or-create-full-field-values!
                          (t2/select-one :model/Field :id field-id))]
              (is (nil? result)
                  "with no cached FieldValues and kill-switch on, returns nil (downstream emits empty values)")
              (is (zero? (t2/count :model/FieldValues :field_id field-id :type :full))
                  "no FieldValues row was created — confirms create-or-update path was skipped"))))))))

(deftest disable-sync-serves-stale-field-values-test
  (testing (str "When the cache row exists but is stale (inactive?), disable-sync must serve the stale row "
                "rather than re-fetching from the warehouse — degraded but consistent with the kill-switch contract.")
    (mt/dataset test-data
      (let [field-id (mt/id :categories :name)]
        (t2/delete! :model/FieldValues :field_id field-id :type :full)
        ;; Seed a stale FieldValues row by writing one then aging its last_used_at past the inactive cutoff.
        (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id field-id))
        (t2/update! :model/FieldValues
                    {:field_id field-id :type :full}
                    {:last_used_at (java.time.OffsetDateTime/of 2001 1 1 0 0 0 0 java.time.ZoneOffset/UTC)})
        (let [stale (t2/select-one :model/FieldValues :field_id field-id :type :full)]
          (mt/with-temporary-setting-values [disable-sync true]
            (with-redefs [field-values/distinct-values
                          (fn [& _] (throw (ex-info "distinct-values must not run under disable-sync" {})))]
              (let [result (field-values/get-or-create-full-field-values!
                            (t2/select-one :model/Field :id field-id))]
                (is (some? result)
                    "stale row is returned, not nil")
                (is (= (:id stale) (:id result))
                    "the same FieldValues row id comes back")))))))))

(deftest flag-off-sync-still-works-test
  (testing "flag off: baseline that the gates don't break normal sync"
    (mt/with-temp [:model/Database db {:engine :h2 :details (:details (mt/db))}]
      (is (true? (database/should-sync? db)))
      (is (false? (sync-util/sync-disabled?)))
      (testing "POST /api/database/:id/sync_schema returns 200 when flag off"
        (mt/user-http-request :crowberto :post 200
                              (format "database/%d/sync_schema" (:id db)))))))
