(ns metabase-enterprise.audit-app.analytics-dev-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.audit-app.analytics-dev :as analytics-dev]
   [metabase-enterprise.audit-app.audit :as ee-audit]
   [metabase.app-db.core :as mdb]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest postgres-only-requirement-test
  (testing "Analytics dev mode requires PostgreSQL"
    (when-not (= :postgres (mdb/db-type))
      (mt/with-temporary-setting-values [analytics-dev-mode true]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Analytics dev mode requires PostgreSQL AppDB"
             (#'analytics-dev/analytics-dev-mode-setup)))))))

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
          (is (= :postgres (:engine db)))
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
          (is (= ee-audit/default-db-name (:name found))))))

    (testing "find-analytics-dev-database does not find audit databases"
      (mt/with-temp [:model/Database _ {:name ee-audit/default-db-name
                                        :engine "postgres"
                                        :is_audit true}]
        (is (nil? (analytics-dev/find-analytics-dev-database)))))))

(def expected-view-schemas
  "Expected schema for each analytics usage view (v_* tables).
  This mapping serves as the source of truth for what fields should exist in each view.
  If a migration changes a view's schema, this map must be updated accordingly."
  {"v_alerts" #{"entity_id" "entity_qualified_id" "created_at" "updated_at"
                "creator_id" "card_id" "card_qualified_id" "alert_condition"
                "schedule_type" "schedule_day" "schedule_hour" "archived"
                "recipient_type" "recipients" "recipient_external"}

   "v_audit_log" #{"id" "topic" "timestamp" "end_timestamp" "user_id"
                   "entity_type" "entity_id" "entity_qualified_id" "details"}

   "v_content" #{"entity_id" "entity_qualified_id" "entity_type" "created_at"
                 "updated_at" "creator_id" "name" "description" "collection_id"
                 "made_public_by_user" "is_embedding_enabled" "is_verified"
                 "archived" "action_type" "action_model_id" "collection_is_official"
                 "collection_is_personal" "question_viz_type" "question_database_id"
                 "question_is_native" "event_timestamp"}

   "v_dashboardcard" #{"entity_id" "entity_qualified_id" "dashboard_qualified_id"
                       "dashboardtab_id" "card_qualified_id" "created_at" "updated_at"
                       "size_x" "size_y" "visualization_settings" "parameter_mappings"}

   "v_databases" #{"entity_id" "entity_qualified_id" "created_at" "updated_at"
                   "name" "description" "database_type" "metadata_sync_schedule"
                   "cache_field_values_schedule" "timezone" "is_on_demand"
                   "auto_run_queries" "cache_ttl" "creator_id" "db_version"}

   "v_fields" #{"entity_id" "entity_qualified_id" "created_at" "updated_at"
                "name" "display_name" "description" "base_type" "visibility_type"
                "fk_target_field_id" "has_field_values" "active" "table_id"}

   "v_group_members" #{"user_id" "group_id" "group_name"}

   "v_query_log" #{"entity_id" "started_at" "running_time_seconds" "result_rows"
                   "is_native" "query_source" "error" "user_id" "card_id"
                   "card_qualified_id" "dashboard_id" "dashboard_qualified_id"
                   "pulse_id" "database_id" "database_qualified_id" "cache_hit"
                   "action_id" "action_qualified_id" "query"}

   "v_subscriptions" #{"entity_id" "entity_qualified_id" "created_at" "updated_at"
                       "creator_id" "archived" "dashboard_qualified_id" "schedule_type"
                       "schedule_day" "schedule_hour" "recipient_type" "recipients"
                       "recipient_external" "parameters"}

   "v_tables" #{"entity_id" "entity_qualified_id" "created_at" "updated_at"
                "name" "display_name" "description" "active" "database_id"
                "schema" "is_upload" "entity_type" "visibility_type"
                "estimated_row_count" "view_count" "owner_email" "owner_user_id"}

   "v_tasks" #{"id" "task" "status" "database_qualified_id" "started_at"
               "ended_at" "duration_seconds" "details" "run_id"}

   "v_task_runs" #{"id" "run_type" "entity_type" "entity_id" "entity_qualified_id"
                   "started_at" "ended_at" "duration_seconds" "status"
                   "process_uuid" "updated_at"}

   "v_users" #{"user_id" "entity_qualified_id" "type" "email" "first_name"
               "last_name" "full_name" "date_joined" "last_login" "updated_at"
               "is_admin" "is_active" "sso_source" "locale"}

   "v_view_log" #{"id" "timestamp" "user_id" "entity_type" "entity_id"
                  "entity_qualified_id"}})

(defn- get-synced-field-names
  "Get the set of field names that Metabase has synced for a given table."
  [table-id]
  (into #{}
        (map :name)
        (t2/select :model/Field :table_id table-id :active true)))

(defn- get-actual-field-names
  "Get the set of field names that actually exist in the database for a given table."
  [database table]
  (let [table-metadata (driver/describe-table (driver/the-initialized-driver (:engine database))
                                              database
                                              table)]
    (into #{} (map :name) (:fields table-metadata))))

(deftest analytics-views-schema-test
  (testing "Analytics usage views (v_* tables) have expected schema"
    (mt/test-drivers #{:postgres :h2 :mysql}
      (let [analytics-db (t2/select-one :model/Database :is_audit true)]
        (when analytics-db
          (doseq [[view-name expected-fields] expected-view-schemas]
            (testing (str "View: " view-name)
              (let [table (t2/select-one :model/Table
                                         :db_id (:id analytics-db)
                                         :name view-name)
                    _ (is (some? table))

                    synced-fields (when table (get-synced-field-names (:id table)))
                    actual-fields (when table (get-actual-field-names analytics-db table))]

                (when table
                  (testing "Expected vs Actual"
                    (let [missing-from-actual (set/difference expected-fields actual-fields)
                          extra-in-actual (set/difference actual-fields expected-fields)]
                      (is (empty? missing-from-actual))
                      (is (empty? extra-in-actual))))

                  (testing "Synced vs Actual"
                    (let [missing-from-sync (set/difference actual-fields synced-fields)
                          extra-in-sync (set/difference synced-fields actual-fields)]
                      (is (empty? missing-from-sync))
                      (is (empty? extra-in-sync))))

                  (testing "Expected vs Synced"
                    (let [missing-from-sync (set/difference expected-fields synced-fields)
                          extra-in-sync (set/difference synced-fields expected-fields)]
                      (is (empty? missing-from-sync))
                      (is (empty? extra-in-sync)))))))))))))
