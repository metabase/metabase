(ns metabase.db.schema-migrations-test
  "Tests for the schema migrations defined in the Liquibase YAML files. The basic idea is:

  1. Create a temporary H2/Postgres/MySQL/MariaDB database
  2. Run all migrations up to a certain point
  3. Load some arbitrary data
  4. run migration(s) after that point (verify that they actually run)
  5. verify that data looks like what we'd expect after running migration(s)

  See `metabase.db.schema-migrations-test.impl` for the implementation of this functionality."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.db.schema-migrations-test.impl :as impl]
            [metabase.driver :as driver]
            [metabase.models :refer [Database Field Table]]
            [metabase.models.user :refer [User]]
            [metabase.test :as mt]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db])
  (:import java.sql.Connection
           java.util.UUID))

(deftest database-position-test
  (testing "Migration 165: add `database_position` to Field"
    (impl/test-migrations 165 [migrate!]
      ;; create a Database with a Table with 2 Fields
      (db/simple-insert! Database {:name "DB", :engine "h2", :created_at :%now, :updated_at :%now})
      (db/simple-insert! Table {:name "Table", :db_id 1, :created_at :%now, :updated_at :%now, :active true})
      (let [mock-field {:table_id 1, :created_at :%now, :updated_at :%now, :base_type "type/Text", :database_type "VARCHAR"}]
        (db/simple-insert! Field (assoc mock-field :name "Field 1"))
        (db/simple-insert! Field (assoc mock-field :name "Field 2")))
      (testing "sanity check: Fields should not have a `:database_position` column yet"
        (is (not (contains? (Field 1) :database_position))))
      ;; now run migration 165
      (migrate!)
      (testing "Fields should get `:database_position` equal to their IDs"
        (doseq [id [1 2]]
          (testing (format "Field %d" id)
            (is (= id
                   (db/select-one-field :database_position Field :id id)))))))))

(defn- create-raw-user!
  "create a user but skip pre and post insert steps"
  [email]
  (db/simple-insert! User
    :email        email
    :first_name   (tu/random-name)
    :last_name    (tu/random-name)
    :password     (str (UUID/randomUUID))
    :date_joined  :%now
    :is_active    true
    :is_superuser false))

(deftest email-lowercasing-test
  (testing "Migration 268-272: basic lowercasing `email` in `core_user`"
    (impl/test-migrations [268 272] [migrate!]
      (let [e1 "Foo@email.com"
            e2 "boo@email.com"]
        (doseq [e [e1 e2]]
          (create-raw-user! e))
        ;; Run migrations 268 - 272
        (migrate!)
        (doseq [e [e1 e2]]
          (is (= true
                 (db/exists? User :email (u/lower-case-en e1)))))))))

(deftest semantic-type-migration-tests
  (testing "updates each of the coercion types"
    (impl/test-migrations [283 296] [migrate!]
      ;; by name hoists results into a map by name so diffs are easier to read than sets.
      (let [by-name  #(into {} (map (juxt :name identity)) %)
            db-id    (db/simple-insert! Database {:name "DB", :engine "h2", :created_at :%now, :updated_at :%now})
            table-id (db/simple-insert! Table {:name "Table", :db_id db-id, :created_at :%now, :updated_at :%now, :active true})]
        ;; have to turn off field validation since the semantic types below are no longer valid but were up to 38
        (with-redefs [isa? (constantly true)]
          (db/insert-many! Field
            [{:base_type     :type/Text
              :semantic_type :type/Address
              :name          "address"
              :table_id      table-id
              :database_type "VARCHAR"}
             {:base_type     :type/Text
              :semantic_type :type/ISO8601DateTimeString
              :name          "iso-datetime"
              :table_id      table-id
              :database_type "VARCHAR"}
             {:base_type     :type/Text
              :semantic_type "timestamp_milliseconds"
              :name          "iso-datetime-v0.20"
              :table_id      table-id
              :database_type "VARCHAR"}
             {:base_type     :type/Text
              :semantic_type :type/ISO8601DateString
              :name          "iso-date"
              :table_id      table-id
              :database_type "VARCHAR"}
             {:base_type     :type/Text
              :semantic_type :type/ISO8601TimeString
              :name          "iso-time"
              :table_id      table-id
              :database_type "VARCHAR"}
             {:base_type     :type/Integer
              :semantic_type :type/UNIXTimestampSeconds
              :name          "unix-seconds"
              :table_id      table-id
              :database_type "INT"}
             {:base_type     :type/Integer
              :semantic_type :type/UNIXTimestampMilliseconds
              :name          "unix-millis"
              :table_id      table-id
              :database_type "INT"}
             {:base_type     :type/Integer
              :semantic_type :type/UNIXTimestampMicroseconds
              :name          "unix-micros"
              :table_id      table-id
              :database_type "INT"}]))
        (migrate!)
        (is (= (by-name
                [{:base_type         :type/Text
                  :effective_type    :type/Text
                  :coercion_strategy nil
                  :semantic_type     :type/Address
                  :name              "address"}
                 {:base_type         :type/Text
                  :effective_type    :type/DateTime
                  :coercion_strategy :Coercion/ISO8601->DateTime
                  :semantic_type     nil
                  :name              "iso-datetime"}
                 {:base_type         :type/Text
                  :effective_type    :type/Instant
                  :coercion_strategy :Coercion/UNIXMilliSeconds->DateTime
                  :semantic_type     nil
                  :name              "iso-datetime-v0.20"}
                 {:base_type         :type/Text
                  :effective_type    :type/Date
                  :coercion_strategy :Coercion/ISO8601->Date
                  :semantic_type     nil
                  :name              "iso-date"}
                 {:base_type         :type/Text
                  :effective_type    :type/Time
                  :coercion_strategy :Coercion/ISO8601->Time
                  :semantic_type     nil
                  :name              "iso-time"}
                 {:base_type         :type/Integer
                  :effective_type    :type/Instant
                  :coercion_strategy :Coercion/UNIXSeconds->DateTime
                  :semantic_type     nil
                  :name              "unix-seconds"}
                 {:base_type         :type/Integer
                  :effective_type    :type/Instant
                  :coercion_strategy :Coercion/UNIXMilliSeconds->DateTime
                  :semantic_type     nil
                  :name              "unix-millis"}
                 {:base_type         :type/Integer
                  :effective_type    :type/Instant
                  :coercion_strategy :Coercion/UNIXMicroSeconds->DateTime
                  :semantic_type     nil
                  :name              "unix-micros"}])
               (by-name
                (into #{}
                      (map #(select-keys % [:base_type :effective_type :coercion_strategy
                                            :semantic_type :name]))
                      (db/select Field :table_id table-id)))))))))

(defn app-db-column-types
  "Returns a map of all column names to their respective type names, for the given `table-name`, by using the JDBC
  .getMetaData method of the given `conn` (which is presumed to be an app DB connection)."
  [^Connection conn table-name]
  (with-open [rset (.getColumns (.getMetaData conn) nil nil table-name nil)]
    (into {} (take-while some?)
             (repeatedly
               (fn []
                 (when (.next rset)
                   [(.getString rset "COLUMN_NAME") (.getString rset "TYPE_NAME")]))))))

(deftest convert-text-to-longtext-migration-test
  (testing "all columns that were TEXT type in MySQL were changed to"
    (impl/test-migrations ["v42.00-004" "v42.00-063"] [migrate!]
      (migrate!) ; just run migrations immediately, then check the new types
      (let [all-text-cols [["activity" "details"]
                           ["collection" "description"]
                           ["collection" "name"]
                           ["computation_job" "context"]
                           ["computation_job_result" "payload"]
                           ["core_session" "anti_csrf_token"]
                           ["core_user" "login_attributes"]
                           ["group_table_access_policy" "attribute_remappings"]
                           ["login_history" "device_description"]
                           ["login_history" "ip_address"]
                           ["metabase_database" "caveats"]
                           ["metabase_database" "description"]
                           ["metabase_database" "details"]
                           ["metabase_database" "options"]
                           ["metabase_database" "points_of_interest"]
                           ["metabase_field" "caveats"]
                           ["metabase_field" "database_type"]
                           ["metabase_field" "description"]
                           ["metabase_field" "fingerprint"]
                           ["metabase_field" "has_field_values"]
                           ["metabase_field" "points_of_interest"]
                           ["metabase_field" "settings"]
                           ["metabase_fieldvalues" "human_readable_values"]
                           ["metabase_fieldvalues" "values"]
                           ["metabase_table" "caveats"]
                           ["metabase_table" "description"]
                           ["metabase_table" "points_of_interest"]
                           ["metric" "caveats"]
                           ["metric" "definition"]
                           ["metric" "description"]
                           ["metric" "how_is_this_calculated"]
                           ["metric" "points_of_interest"]
                           ["moderation_review" "text"]
                           ["native_query_snippet" "content"]
                           ["native_query_snippet" "description"]
                           ["pulse" "parameters"]
                           ["pulse_channel" "details"]
                           ["query" "query"]
                           ["query_execution" "error"]
                           ["report_card" "dataset_query"]
                           ["report_card" "description"]
                           ["report_card" "embedding_params"]
                           ["report_card" "result_metadata"]
                           ["report_card" "visualization_settings"]
                           ["report_dashboard" "caveats"]
                           ["report_dashboard" "description"]
                           ["report_dashboard" "embedding_params"]
                           ["report_dashboard" "parameters"]
                           ["report_dashboard" "points_of_interest"]
                           ["report_dashboardcard" "parameter_mappings"]
                           ["report_dashboardcard" "visualization_settings"]
                           ["revision" "message"]
                           ["revision" "object"]
                           ["segment" "caveats"]
                           ["segment" "definition"]
                           ["segment" "description"]
                           ["segment" "points_of_interest"]
                           ["setting" "value"]
                           ["task_history" "task_details"]
                           ["view_log" "metadata"]]]
        (with-open [conn (jdbc/get-connection (db/connection))]
          (doseq [[tbl-nm col-nms] (group-by first all-text-cols)]
            (let [^String exp-type (case driver/*driver*
                                     :mysql "longtext"
                                     :h2    "CLOB"
                                     "text")
                  name-fn          (case driver/*driver*
                                     :h2 str/upper-case
                                     identity)
                  tbl-cols         (app-db-column-types conn (name-fn tbl-nm))]
              (doseq [col-nm (map last col-nms)]
                (testing (format " %s in %s" exp-type driver/*driver*)
                  ;; just get the first/only scalar value from the results (which is a vec of maps)
                  (is (.equalsIgnoreCase exp-type (get tbl-cols (name-fn col-nm)))
                      (format "Using %s, type for %s.%s was supposed to be %s, but was %s"
                              driver/*driver*
                              tbl-nm
                              col-nm
                              exp-type
                              (get tbl-cols col-nm))))))))))))

(deftest convert-query-cache-result-to-blob-test
  (testing "the query_cache.results column was changed to"
    (mt/with-log-level :trace
      (impl/test-migrations ["v42.00-064"] [migrate!]
        (with-open [conn (jdbc/get-connection (db/connection))]
          (when (= :mysql driver/*driver*)
            ;; simulate the broken app DB state that existed prior to the fix from #16095
            (with-open [stmt (.prepareStatement conn "ALTER TABLE query_cache MODIFY results BLOB NULL;")]
              (.execute stmt)))
          (migrate!) ; run migrations, then check the new type
          (let [^String exp-type (case driver/*driver*
                                   :mysql    "longblob"
                                   :h2       "BLOB"
                                   :postgres "bytea")
                name-fn          (case driver/*driver*
                                   :h2 str/upper-case
                                   identity)
                tbl-nm           "query_cache"
                col-nm           "results"
                tbl-cols         (app-db-column-types conn (name-fn tbl-nm))]
              (testing (format " %s in %s" exp-type driver/*driver*)
                ;; just get the first/only scalar value from the results (which is a vec of maps)
                (is (.equalsIgnoreCase exp-type (get tbl-cols (name-fn col-nm)))
                  (format "Using %s, type for %s.%s was supposed to be %s, but was %s"
                          driver/*driver*
                          tbl-nm
                          col-nm
                          exp-type
                          (get tbl-cols col-nm))))))))))
