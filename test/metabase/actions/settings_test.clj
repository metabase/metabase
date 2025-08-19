(ns metabase.actions.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(defn- extract-disabled-reasons
  "Extract disabled reasons from enabled-for-db? call. If no reasons, rethrow the exception."
  [enabled-for-db? db]
  (try
    (when-not (enabled-for-db? db)
      [:no-explicit-reason])
    (catch Exception e
      (or (some->> (:setting/disabled-reasons (ex-data e)) (map :key))
          (throw e)))))

(deftest database-enable-table-editing-enabled-for-db?-test
  (testing "enabled-for-db? returns appropriate disabled reasons"
    (let [enabled-for-db? (:enabled-for-db? (#'setting/resolve-setting :database-enable-table-editing))]

      (testing "returns database routing reason for destination databases"
        (let [db      {:id 1 :initial_sync_status "complete" :router_database_id 42}
              reasons (extract-disabled-reasons enabled-for-db? db)]
          (is (= [:setting/database-routing] reasons))))

      (testing "returns sync in progress reason when sync is incomplete"
        (let [db {:id 1 :initial_sync_status "incomplete"}
              reasons (extract-disabled-reasons enabled-for-db? db)]
          (is (= [:warning/database-sync-in-progress] reasons))))

      (testing "succeeds when database has writable tables"
        (mt/with-temp [:model/Database db {:initial_sync_status "complete"}
                       :model/Table    _table {:db_id (:id db) #_#_:is_writable true}]
          (is (= true (enabled-for-db? db)))))

      (testing "returns missing permissions reason when tables have unknown write-ability"
        (mt/with-temp [:model/Database db {:initial_sync_status "complete"}
                       :model/Table    _table {:db_id (:id db) #_#_:is_writable nil}]
          (let [reasons (extract-disabled-reasons enabled-for-db? db)]
            (is (= [:warning/database-metadata-missing] reasons)))))

      (testing "returns no writable tables reason when all tables are not writable"
        (mt/with-temp [:model/Database db {:initial_sync_status "complete"}
                       :model/Table    _table {:db_id (:id db) #_#_:is_writable false}]
          (let [reasons (extract-disabled-reasons enabled-for-db? db)]
            (is (= [:permissions/no-writable-table] reasons)))))

      (testing "returns no writable tables reason when database has no tables"
        (mt/with-temp [:model/Database db {:initial_sync_status "complete"}]
          (let [reasons (extract-disabled-reasons enabled-for-db? db)]
            (is (= [:permissions/no-writable-table] reasons))))))))
