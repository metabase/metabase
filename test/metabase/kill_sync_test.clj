(ns metabase.kill-sync-test
  "Tests for the global `disable-sync` kill-switch: all sync entry points refuse, manual-sync HTTP endpoints 503."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.sync.sync :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.warehouses.models.database :as database]
   [metabase.warehouses.settings :as warehouses.settings]))

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

(deftest flag-off-sync-still-works-test
  (testing "flag off: baseline that the gates don't break normal sync"
    (mt/with-temp [:model/Database db {:engine :h2 :details (:details (mt/db))}]
      (is (true? (database/should-sync? db)))
      (is (false? (sync-util/sync-disabled?)))
      (testing "POST /api/database/:id/sync_schema returns 200 when flag off"
        (mt/user-http-request :crowberto :post 200
                              (format "database/%d/sync_schema" (:id db)))))))
