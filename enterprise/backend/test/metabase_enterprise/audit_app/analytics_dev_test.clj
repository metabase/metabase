(ns metabase-enterprise.audit-app.analytics-dev-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.audit-app.analytics-dev :as analytics-dev]
   [metabase-enterprise.audit-app.audit :as ee-audit]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]))

(deftest postgres-only-requirement-test
  (testing "Analytics dev mode requires PostgreSQL"
    (when-not (= :postgres (mdb/db-type))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Analytics dev mode requires PostgreSQL application database"
           (#'analytics-dev/analytics-dev-mode-setup nil))))))

(deftest yaml->dev-test
  (testing "yaml->dev replaces canonical creator with user email"
    (let [yaml-data {:creator_id "internal@metabase.com"
                     :name "Test Card"
                     :nested {:creator_id "internal@metabase.com"}}
          user-email "user@example.com"
          result (#'analytics-dev/yaml->dev yaml-data user-email)]
      (is (= "user@example.com" (:creator_id result)))
      (is (= "user@example.com" (get-in result [:nested :creator_id]))))))

(deftest yaml->canonical-test
  (testing "yaml->canonical replaces user email with canonical creator"
    (let [yaml-data {:creator_id "user@example.com"
                     :name "Test Card"
                     :metabase_version "v0.50.0"
                     :is_writable true
                     :nested {:creator_id "user@example.com"}}
          user-email "user@example.com"
          result (#'analytics-dev/yaml->canonical "test.yaml" yaml-data user-email)]
      (is (= "internal@metabase.com" (:creator_id result)))
      (is (= "internal@metabase.com" (get-in result [:nested :creator_id])))
      (is (nil? (:metabase_version result)) "metabase_version should be removed")
      (is (nil? (:is_writable result)) "is_writable should be removed")))

  (testing "yaml->canonical for database YAML sets is_audit true and strips fields"
    (let [yaml-data {:name "Internal Metabase Database"
                     :creator_id "user@example.com"
                     :engine "postgres"
                     :metabase_version "v0.50.0"
                     :is_writable true
                     :extra_field "should be removed"
                     :is_sample false
                     :is_on_demand false
                     :serdes/meta {}
                     :initial_sync_status "complete"
                     :entity_id "abc123"}
          user-email "user@example.com"
          result (#'analytics-dev/yaml->canonical "Internal Metabase Database.yaml" yaml-data user-email)]
      (is (true? (:is_audit result)) "is_audit should be set to true")
      (is (= "internal@metabase.com" (:creator_id result)))
      (is (= "Internal Metabase Database" (:name result)))
      (is (nil? (:engine result)) "engine should be stripped")
      (is (nil? (:extra_field result)) "extra fields should be removed")
      (is (contains? result :is_sample))
      (is (contains? result :is_on_demand))
      (is (contains? result :serdes/meta))
      (is (contains? result :initial_sync_status))
      (is (contains? result :entity_id)))))

(deftest create-analytics-dev-database-test
  (mt/test-drivers #{:postgres}
    (mt/with-model-cleanup [:model/Database]
      (testing "create-analytics-dev-database! creates a non-audit database"
        (let [user-id (mt/user->id :crowberto)
              db (analytics-dev/create-analytics-dev-database! user-id)]
          (is (some? db))
          (is (false? (:is_audit db)) "Database should NOT be marked as audit")
          (is (= ee-audit/default-db-name (:name db)))
          (is (= "postgres" (:engine db)))
          (is (= user-id (:creator_id db)))))

      (testing "create-analytics-dev-database! returns existing database if already created"
        (let [user-id (mt/user->id :crowberto)
              db1 (analytics-dev/create-analytics-dev-database! user-id)
              db2 (analytics-dev/create-analytics-dev-database! user-id)]
          (is (= (:id db1) (:id db2))))))))

(deftest find-analytics-dev-database-test
  (mt/test-drivers #{:postgres}
    (mt/with-model-cleanup [:model/Database]
      (testing "find-analytics-dev-database finds the dev database"
        (let [user-id (mt/user->id :crowberto)
              _ (analytics-dev/create-analytics-dev-database! user-id)
              found (analytics-dev/find-analytics-dev-database)]
          (is (some? found))
          (is (false? (:is_audit found)))
          (is (= ee-audit/default-db-name (:name found)))))

      (testing "find-analytics-dev-database does not find audit databases"
        (mt/with-temp [:model/Database _ {:name ee-audit/default-db-name
                                          :engine "postgres"
                                          :is_audit true}]
          (is (nil? (analytics-dev/find-analytics-dev-database))))))))
