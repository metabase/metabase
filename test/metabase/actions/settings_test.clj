(ns metabase.actions.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.util :as driver.u]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(defn- extract-disabled-reasons*
  "Extract disabled reasons from enabled-for-db? call. If no reasons, rethrow the exception."
  [enabled-for-db? db]
  (try
    (when-not (enabled-for-db? db)
      [:no-explicit-reason])
    (catch Exception e
      (or (some->> (:setting/disabled-reasons (ex-data e)) (map :key))
          (throw e)))))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defn- can-configure-data-editing-for-db? [db]
  (try
    (let [driver-support? (fn [db feature] (driver.u/supports? (driver.u/database->driver db) feature db))]
      (setting/validate-settable-for-db! :database-enable-table-editing db driver-support?))
    true
    (catch Exception _
      false)))

(deftest database-enable-table-editing-enabled-for-db?-test
  (testing "enabled-for-db? returns appropriate disabled reasons"
    (mt/with-premium-features #{:table-data-editing}
      (let [enabled-for-db?  (:enabled-for-db? (#'setting/resolve-setting :database-enable-table-editing))
            disabled-reasons (partial extract-disabled-reasons* enabled-for-db?)]

        (testing "returns database routing reason for destination databases"
          (mt/with-temp [:model/Database router-db {:initial_sync_status "complete"}
                         :model/Database target-db {:initial_sync_status "complete", :router_database_id (:id router-db)}
                         :model/Table    _         {:db_id (:id router-db) :is_writable true}
                         :model/Table    _         {:db_id (:id target-db) :is_writable true}]
            (is (= [:setting/database-routing]
                   (disabled-reasons router-db)))
            (is (= [:setting/database-routing]
                   (disabled-reasons target-db)))
            (is (false? (can-configure-data-editing-for-db? router-db)))
            (is (false? (can-configure-data-editing-for-db? target-db)))))

        (testing "returns sync in progress reason when sync is incomplete"
          (mt/with-temp [:model/Database db {:initial_sync_status "incomplete"}]
            (is (= [:database-metadata/sync-in-progress] (disabled-reasons db)))
            (is (can-configure-data-editing-for-db? db))))

        (testing "succeeds when database has writable tables"
          (mt/with-temp [:model/Database db {:initial_sync_status "complete"}
                         :model/Table _table {:db_id (:id db) :is_writable true}]
            (is (= nil (disabled-reasons db)))
            (is (can-configure-data-editing-for-db? db))))

        (testing "returns missing permissions reason when tables have unknown write-ability"
          (mt/with-temp [:model/Database db {:initial_sync_status "complete"}
                         :model/Table _table {:db_id (:id db) :is_writable nil}]
            (is (= [:database-metadata/not-populated] (disabled-reasons db)))
            (is (can-configure-data-editing-for-db? db))))

        (testing "returns no writable tables reason when all tables are not writable"
          (mt/with-temp [:model/Database db {:initial_sync_status "complete"}
                         :model/Table _table {:db_id (:id db) :is_writable false}]
            (is (= [:permissions/no-writable-table] (disabled-reasons db)))
            (is (false? (can-configure-data-editing-for-db? db)))))

        (testing "returns no writable tables reason when database has no tables"
          (mt/with-temp [:model/Database db {:initial_sync_status "complete"}]
            (is (= [:permissions/no-writable-table] (disabled-reasons db)))
            (is (false? (can-configure-data-editing-for-db? db)))))))))
