(ns metabase.db.schema-migrations-test
  "Tests for the schema migrations defined in the Liquibase YAML files. The basic idea is:

  1. Create a temporary H2/Postgres/MySQL/MariaDB database
  2. Run all migrations up to a certain point
  3. Load some arbitrary data
  4. run migration(s) after that point (verify that they actually run)
  5. verify that data looks like what we'd expect after running migration(s)

  See `metabase.db.schema-migrations-test.impl` for the implementation of this functionality."
  (:require
   [cheshire.core :as json]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.query :as mdb.query]
   [metabase.db.schema-migrations-test.impl :as impl]
   [metabase.db.setup :as db.setup]
   [metabase.driver :as driver]
   [metabase.models
    :refer [Action
            Card
            Collection
            Dashboard
            Database
            Dimension
            Field
            Permissions
            PermissionsGroup
            Pulse
            Setting
            Table
            User]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.random :as tu.random]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.execute :as t2.execute])
  (:import
   (java.sql Connection)
   (java.util UUID)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest rollback-test
  (testing "Migrating to latest version, rolling back to v44, and then migrating up again"
    ;; using test-migrations to excercise all drivers
    (impl/test-migrations [1] [_]
      (let [{:keys [db-type ^javax.sql.DataSource data-source]} mdb.connection/*application-db*
            migrate!    (partial db.setup/migrate! db-type data-source)
            get-last-id (fn []
                          (-> {:connection (.getConnection data-source)}
                              (jdbc/query ["SELECT id FROM DATABASECHANGELOG ORDER BY ORDEREXECUTED DESC LIMIT 1"])
                              first
                              :id))]
        (migrate! :up)
        (let [latest-id (get-last-id)]
          ;; This is an unusual usage of db.setup/migrate! with an explicit version, which is not currently
          ;; available via the CLI, but is used here to rollback to the lowest version we support.
          (migrate! :down 44)
            ;; will always be the last v44 migration
          (is (= "v44.00-044" (get-last-id)))
          (migrate! :up)
          (is (= latest-id (get-last-id))))))))

(deftest database-position-test
  (testing "Migration 165: add `database_position` to Field"
    (impl/test-migrations 165 [migrate!]
      ;; create a Database with a Table with 2 Fields
      (t2/insert! (t2/table-name Database) {:name "DB", :engine "h2", :created_at :%now, :updated_at :%now})
      (t2/insert! (t2/table-name Table) {:name "Table", :db_id 1, :created_at :%now, :updated_at :%now, :active true})
      (let [mock-field {:table_id 1, :created_at :%now, :updated_at :%now, :base_type "type/Text", :database_type "VARCHAR"}]
        (t2/insert! (t2/table-name Field) (assoc mock-field :name "Field 1"))
        (t2/insert! (t2/table-name Field) (assoc mock-field :name "Field 2")))
      (testing "sanity check: Fields should not have a `:database_position` column yet"
        (is (not (contains? (t2/select-one Field :id 1) :database_position))))
      ;; now run migration 165
      (migrate!)
      (testing "Fields should get `:database_position` equal to their IDs"
        (doseq [id [1 2]]
          (testing (format "Field %d" id)
            (is (= id
                   (t2/select-one-fn :database_position Field :id id)))))))))

(defn- create-raw-user!
  "create a user but skip pre and post insert steps"
  [email]
  (first (t2/insert-returning-instances! (t2/table-name User)
                                         :email        email
                                         :first_name   (tu.random/random-name)
                                         :last_name    (tu.random/random-name)
                                         :password     (str (UUID/randomUUID))
                                         :date_joined  :%now
                                         :is_active    true
                                         :is_superuser false)))

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
                 (t2/exists? User :email (u/lower-case-en e)))))))))

(deftest semantic-type-migration-tests
  (testing "updates each of the coercion types"
    (impl/test-migrations [283 296] [migrate!]
      ;; by name hoists results into a map by name so diffs are easier to read than sets.
      (let [by-name  #(into {} (map (juxt :name identity)) %)
            db-id    (first (t2/insert-returning-pks! (t2/table-name Database) {:name "DB", :engine "h2", :created_at :%now, :updated_at :%now}))
            table-id (first (t2/insert-returning-pks! (t2/table-name Table) {:name "Table", :db_id db-id, :created_at :%now, :updated_at :%now, :active true}))]
        ;; Using insert with table-name, so we don't run into the field type validation
        ;; added in 38
        (t2/insert! (t2/table-name Field)
          (for [field [{:base_type     :type/Text
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
                        :database_type "INT"}]]
            (-> field
                (update :base_type u/qualified-name)
                (update :semantic_type u/qualified-name)
                (assoc :created_at (mi/now), :updated_at (mi/now)))))
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
                      (t2/select Field :table_id table-id)))))))))

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
        (t2/with-connection [conn]
          (doseq [[tbl-nm col-nms] (group-by first all-text-cols)]
            (let [^String exp-type (case driver/*driver*
                                     :mysql "longtext"
                                     :h2    "CHARACTER LARGE OBJECT"
                                     "text")
                  name-fn          (case driver/*driver*
                                     :h2 u/upper-case-en
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
    (impl/test-migrations ["v42.00-064"] [migrate!]
      (t2/with-connection [^java.sql.Connection conn]
        (when (= :mysql driver/*driver*)
          ;; simulate the broken app DB state that existed prior to the fix from #16095
          (with-open [stmt (.prepareStatement conn "ALTER TABLE query_cache MODIFY results BLOB NULL;")]
            (.execute stmt)))
        (migrate!)                      ; run migrations, then check the new type
        (let [^String exp-type (case driver/*driver*
                                 :mysql    "longblob"
                                 :h2       "BINARY LARGE OBJECT"
                                 :postgres "bytea")
              name-fn          (case driver/*driver*
                                 :h2 u/upper-case-en
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
                        (get tbl-cols col-nm)))))))))

(deftest remove-bigquery-driver-test
  (testing "Migrate legacy BigQuery driver to new (:bigquery-cloud-sdk) driver (#20141)"
    (impl/test-migrations ["v43.00-001"] [migrate!]
      (try
        ;; we're using `simple-insert!` here instead of `with-temp` because Toucan `post-insert` for the DB will
        ;; normally try to add it to the magic Permissions Groups which don't exist yet. They're added in later
        ;; migrations
        (let [db-id (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "Legacy BigQuery driver DB"
                                                                               :engine     "bigquery"
                                                                               :details    (json/generate-string {:service-account-json "{\"fake_key\": 14}"})
                                                                               :created_at :%now
                                                                               :updated_at :%now}))]
          (migrate!)
          (is (= [{:engine "bigquery-cloud-sdk"}]
                 (mdb.query/query {:select [:engine], :from [:metabase_database], :where [:= :id db-id]}))))
        (finally
          (t2/delete! (t2/table-name Database) :name "Legacy BigQuery driver DB"))))))

(deftest create-root-permissions-entry-for-admin-test
  (testing "Migration v0.43.00-006: Add root permissions entry for 'Administrators' magic group"
    (doseq [existing-entry? [true false]]
      (testing (format "Existing root entry? %s" (pr-str existing-entry?))
        (impl/test-migrations "v43.00-006" [migrate!]
          (let [[{admin-group-id :id}] (mdb.query/query {:select [:id]
                                                         :from   [:permissions_group]
                                                         :where  [:= :name perms-group/admin-group-name]})]
            (is (integer? admin-group-id))
            (when existing-entry?
              (t2/query-one {:insert-into :permissions
                             :values      [{:object   "/"
                                            :group_id admin-group-id}]}))
            (migrate!)
            (is (= [{:object "/"}]
                   (mdb.query/query {:select [:object]
                                     :from   [:permissions]
                                     :where  [:= :group_id admin-group-id]})))))))))

(deftest create-database-entries-for-all-users-group-test
  (testing "Migration v43.00-007: create DB entries for the 'All Users' permissions group"
    (doseq [with-existing-data-migration? [true false]]
      (testing (format "With existing data migration? %s" (pr-str with-existing-data-migration?))
        (impl/test-migrations "v43.00-007" [migrate!]
          (t2/query-one {:insert-into :metabase_database
                         :values      [{:name       "My DB"
                                        :engine     "h2"
                                        :created_at :%now
                                        :updated_at :%now
                                        :details    "{}"}]})
          (when with-existing-data-migration?
            (t2/query-one {:insert-into :data_migrations
                           :values      [{:id        "add-databases-to-magic-permissions-groups"
                                          :timestamp :%now}]}))
          (migrate!)
          (is (= (if with-existing-data-migration?
                   []
                   [{:object "/db/1/"}])
                 (mdb.query/query {:select    [:p.object]
                                   :from      [[:permissions :p]]
                                   :left-join [[:permissions_group :pg] [:= :p.group_id :pg.id]]
                                   :where     [:= :pg.name perms-group/all-users-group-name]}))))))))

(deftest migrate-legacy-site-url-setting-test
  (testing "Migration v43.00-008: migrate legacy `-site-url` Setting to `site-url`; remove trailing slashes (#4123, #4188, #20402)"
    (impl/test-migrations ["v43.00-008"] [migrate!]
      (t2/query-one {:insert-into :setting
                     :values      [{:key   "-site-url"
                                    :value "http://localhost:3000/"}]})
      (migrate!)
      (is (= [{:key "site-url", :value "http://localhost:3000"}]
             (mdb.query/query {:select [:*], :from [:setting], :where [:= :key "site-url"]}))))))

(deftest site-url-ensure-protocol-test
  (testing "Migration v43.00-009: ensure `site-url` Setting starts with a protocol (#20403)"
    (impl/test-migrations ["v43.00-009"] [migrate!]
      (t2/query-one {:insert-into :setting
                     :values      [{:key   "site-url"
                                    :value "localhost:3000"}]})
      (migrate!)
      (is (= [{:key "site-url", :value "http://localhost:3000"}]
             (mdb.query/query {:select [:*], :from [:setting], :where [:= :key "site-url"]}))))))

(defn- add-legacy-data-migration-entry! [migration-name]
  (t2/query-one {:insert-into :data_migrations
                 :values      [{:id        migration-name
                                :timestamp :%now}]}))

(defn- add-migrated-collections-data-migration-entry! []
  (add-legacy-data-migration-entry! "add-migrated-collections"))

(deftest add-migrated-collections-test
  (testing "Migrations v43.00-014 - v43.00-019"
    (letfn [(create-user! []
              (t2/query-one {:insert-into :core_user
                             :values      [{:first_name  "Cam"
                                            :last_name   "Era"
                                            :email       "cam@era.com"
                                            :password    "abc123"
                                            :date_joined :%now}]}))]
      (doseq [{:keys [model collection-name create-instance!]}
              [{:model            Dashboard
                :collection-name  "Migrated Dashboards"
                :create-instance! (fn []
                                    (create-user!)
                                    (t2/query-one {:insert-into :report_dashboard
                                                   :values      [{:name          "My Dashboard"
                                                                  :created_at    :%now
                                                                  :updated_at    :%now
                                                                  :creator_id    1
                                                                  :parameters    "[]"
                                                                  :collection_id nil}]}))}
               {:model            Pulse
                :collection-name  "Migrated Pulses"
                :create-instance! (fn []
                                    (create-user!)
                                    (t2/query-one {:insert-into :pulse
                                                   :values      [{:name          "My Pulse"
                                                                  :created_at    :%now
                                                                  :updated_at    :%now
                                                                  :creator_id    1
                                                                  :parameters    "[]"
                                                                  :collection_id nil}]}))}
               {:model            Card
                :collection-name  "Migrated Questions"
                :create-instance! (fn []
                                    (create-user!)
                                    (t2/query-one {:insert-into :metabase_database
                                                   :values      [{:name       "My DB"
                                                                  :engine     "h2"
                                                                  :details    "{}"
                                                                  :created_at :%now
                                                                  :updated_at :%now}]})
                                    (t2/query-one {:insert-into :report_card
                                                   :values      [{:name                   "My Saved Question"
                                                                  :created_at             :%now
                                                                  :updated_at             :%now
                                                                  :creator_id             1
                                                                  :display                "table"
                                                                  :dataset_query          "{}"
                                                                  :visualization_settings "{}"
                                                                  :database_id            1
                                                                  :collection_id          nil}]}))}]

              :let [table-name-keyword (t2/table-name model)]]
        (testing (format "create %s Collection for %s in the Root Collection"
                         (pr-str collection-name)
                         (name model))
          (letfn [(collections []
                    (mdb.query/query {:select [:name :slug], :from [:collection]}))
                  (collection-slug []
                    (-> collection-name
                        u/lower-case-en
                        (str/replace #"\s+" "_")))]
            (impl/test-migrations ["v43.00-014" "v43.00-019"] [migrate!]
              (create-instance!)
              (migrate!)
              (is (= [{:name collection-name, :slug (collection-slug)}]
                     (collections)))
              (testing "Instance should be moved new Collection"
                (is (= [{:collection_id 1}]
                       (mdb.query/query {:select [:collection_id], :from [table-name-keyword]})))))
            (testing "\nSkip if\n"
              (testing "There are no instances not in a Collection\n"
                (impl/test-migrations ["v43.00-014" "v43.00-019"] [migrate!]
                  (migrate!)
                  (is (= []
                         (collections)))))
              (testing "add-migrated-collections already ran\n"
                (impl/test-migrations ["v43.00-014" "v43.00-019"] [migrate!]
                  (create-instance!)
                  (add-migrated-collections-data-migration-entry!)
                  (migrate!)
                  (is (= []
                         (collections)))
                  (testing "Instance should NOT be moved"
                    (is (= [{:collection_id nil}]
                           (mdb.query/query {:select [:collection_id], :from [table-name-keyword]}))))))
              (testing "Migrated Collection already exists\n"
                (impl/test-migrations ["v43.00-014" "v43.00-019"] [migrate!]
                  (create-instance!)
                  (t2/query-one {:insert-into :collection
                                 :values      [{:name collection-name, :slug "existing_collection", :color "#abc123"}]})
                  (migrate!)
                  (is (= [{:name collection-name, :slug "existing_collection"}]
                         (collections)))
                  (testing "Collection should not have been created but instance should still be moved"
                    (is (= [{:collection_id 1}]
                           (mdb.query/query {:select [:collection_id], :from [table-name-keyword]})))))))))))))

(deftest grant-all-users-root-collection-readwrite-perms-test
  (testing "Migration v43.00-020: create a Root Collection entry for All Users"
    (letfn [(all-users-group-id []
              (let [[{id :id}] (mdb.query/query {:select [:id]
                                                 :from   [:permissions_group]
                                                 :where  [:= :name perms-group/all-users-group-name]})]
                (is (integer? id))
                id))
            (all-user-perms []
              (mdb.query/query {:select [:object]
                                :from   [:permissions]
                                :where  [:= :group_id (all-users-group-id)]}))]
      (impl/test-migrations ["v43.00-020" "v43.00-021"] [migrate!]
        (is (= []
               (all-user-perms)))
        (migrate!)
        (is (= [{:object "/collection/root/"}]
               (all-user-perms))))

      (testing "add-migrated-collections data migration was ran previously: don't create an entry"
        (impl/test-migrations ["v43.00-020" "v43.00-021"] [migrate!]
          (add-migrated-collections-data-migration-entry!)
          (migrate!)
          (is (= []
                 (all-user-perms)))))

      (testing "entry already exists: don't create an entry"
        (impl/test-migrations ["v43.00-020" "v43.00-021"] [migrate!]
          (t2/query-one {:insert-into :permissions
                         :values      [{:object   "/collection/root/"
                                        :group_id (all-users-group-id)}]})
          (migrate!)
          (is (= [{:object "/collection/root/"}]
                 (all-user-perms))))))))

(deftest clear-ldap-user-passwords-test
  (testing "Migration v43.00-029: clear password and password_salt for LDAP users"
    (impl/test-migrations ["v43.00-029"] [migrate!]
      (t2/query-one {:insert-into :core_user
                     :values      [{:first_name    "Cam"
                                    :last_name     "Era"
                                    :email         "cam@era.com"
                                    :date_joined   :%now
                                    :password      "password"
                                    :password_salt "and pepper"
                                    :ldap_auth     false}
                                   {:first_name    "LDAP Cam"
                                    :last_name     "Era"
                                    :email         "ldap_cam@era.com"
                                    :date_joined   :%now
                                    :password      "password"
                                    :password_salt "and pepper"
                                    :ldap_auth     true}]})
      (migrate!)
      (is (= [{:first_name "Cam", :password "password", :password_salt "and pepper", :sso_source nil}
              {:first_name "LDAP Cam", :password nil, :password_salt nil, :sso_source "ldap"}]
             (mdb.query/query {:select   [:first_name :password :password_salt :sso_source]
                               :from     [:core_user]
                               :order-by [[:id :asc]]}))))))

(deftest grant-download-perms-test
  (testing "Migration v43.00-042: grant download permissions to All Users permissions group"
    (impl/test-migrations ["v43.00-042" "v43.00-043"] [migrate!]
      (t2/query-one {:insert-into :metabase_database
                     :values      [{:name       "My DB"
                                    :engine     "h2"
                                    :created_at :%now
                                    :updated_at :%now
                                    :details    "{}"}]})
      (migrate!)
      (is (= [{:object "/collection/root/"} {:object "/download/db/1/"}]
             (mdb.query/query {:select    [:p.object]
                               :from      [[:permissions :p]]
                               :left-join [[:permissions_group :pg] [:= :p.group_id :pg.id]]
                               :where     [:= :pg.name perms-group/all-users-group-name]}))))))

(deftest grant-subscription-permission-test
  (testing "Migration v43.00-047: Grant the 'All Users' Group permissions to create/edit subscriptions and alerts"
    (impl/test-migrations ["v43.00-047" "v43.00-048"] [migrate!]
      (migrate!)
      (is (= #{"All Users"}
             (set (map :name (mdb.query/query {:select    [:pg.name]
                                               :from      [[:permissions :p]]
                                               :left-join [[:permissions_group :pg] [:= :p.group_id :pg.id]]
                                               :where     [:= :p.object "/general/subscription/"]}))))))))

(deftest rename-general-permissions-to-application-test
  (testing "Migration v43.00-057: Rename general permissions to application permissions"
    (impl/test-migrations ["v43.00-057" "v43.00-058"] [migrate!]
      (letfn [(get-perms [object] (set (map :name (mdb.query/query {:select    [:pg.name]
                                                                    :from      [[:permissions :p]]
                                                                    :left-join [[:permissions_group :pg] [:= :p.group_id :pg.id]]
                                                                    :where     [:= :p.object object]}))))]
        (is (= #{"All Users"} (get-perms "/general/subscription/")))
        (migrate!)
        (is (= #{"All Users"} (get-perms "/application/subscription/")))))))

(deftest add-parameter-to-cards-test
  (testing "Migration v44.00-022: Add parameters to report_card"
    (impl/test-migrations ["v44.00-022" "v44.00-024"] [migrate!]
      (let [user-id
            (first (t2/insert-returning-pks! (t2/table-name User) {:first_name  "Howard"
                                                                   :last_name   "Hughes"
                                                                   :email       "howard@aircraft.com"
                                                                   :password    "superstrong"
                                                                   :date_joined :%now}))
            database-id (first (t2/insert-returning-pks! (t2/table-name Database) {:name "DB", :engine "h2", :created_at :%now, :updated_at :%now}))
            card-id (first (t2/insert-returning-pks! (t2/table-name Card) {:name                   "My Saved Question"
                                                                           :created_at             :%now
                                                                           :updated_at             :%now
                                                                           :creator_id             user-id
                                                                           :display                "table"
                                                                           :dataset_query          "{}"
                                                                           :visualization_settings "{}"
                                                                           :database_id            database-id
                                                                           :collection_id          nil}))]
       (migrate!)
       (is (= nil
              (:parameters (first (t2/select (t2/table-name Card) {:where [:= :id card-id]})))))))))

(deftest add-parameter-mappings-to-cards-test
  (testing "Migration v44.00-024: Add parameter_mappings to cards"
    (impl/test-migrations ["v44.00-024" "v44.00-026"] [migrate!]
      (let [user-id
            (first (t2/insert-returning-pks! (t2/table-name User) {:first_name  "Howard"
                                                                   :last_name   "Hughes"
                                                                   :email       "howard@aircraft.com"
                                                                   :password    "superstrong"
                                                                   :date_joined :%now}))
            database-id
            (first (t2/insert-returning-pks! (t2/table-name Database) {:name "DB", :engine "h2", :created_at :%now, :updated_at :%now}))
            card-id
            (first (t2/insert-returning-pks! (t2/table-name Card) {:name                   "My Saved Question"
                                                                   :created_at             :%now
                                                                   :updated_at             :%now
                                                                   :creator_id             user-id
                                                                   :display                "table"
                                                                   :dataset_query          "{}"
                                                                   :visualization_settings "{}"
                                                                   :database_id            database-id
                                                                   :collection_id          nil}))]
        (migrate!)
        (is (= nil
               (:parameter_mappings (first (t2/select (t2/table-name Card) {:where [:= :id card-id]})))))))))

(deftest grant-all-users-root-snippets-collection-readwrite-perms-test
  (letfn [(perms-path [] "/collection/namespace/snippets/root/")
          (all-users-group-id []
            (-> (mdb.query/query {:select [:id]
                                  :from   [:permissions_group],
                                  :where  [:= :name perms-group/all-users-group-name]})
                first
                :id))
          (get-perms [] (map :name (mdb.query/query {:select    [:pg.name]
                                                     :from      [[:permissions :p]]
                                                     :left-join [[:permissions_group :pg] [:= :p.group_id :pg.id]]
                                                     :where     [:= :p.object (perms-path)]})))]
    (testing "Migration v44.00-033: create a Root Snippets Collection entry for All Users\n"
      (testing "Should run for new OSS instances"
        (impl/test-migrations ["v44.00-033" "v44.00-034"] [migrate!]
          (migrate!)
          (is (= ["All Users"] (get-perms)))))

      (testing "Should run for new EE instances"
        (impl/test-migrations ["v44.00-033" "v44.00-034"] [migrate!]
          (t2/insert! (t2/table-name Setting) {:key   "premium-embedding-token"
                                               :value "fake-key"})
          (migrate!)
          (is (= ["All Users"] (get-perms)))))

      (testing "Should not run for existing OSS instances"
        (impl/test-migrations ["v44.00-033" "v44.00-034"] [migrate!]
          (create-raw-user! "ngoc@metabase.com")
          (migrate!)
          (is (= [] (get-perms)))))

      (testing "Should not run for existing EE instances"
        (impl/test-migrations ["v44.00-033" "v44.00-034"] [migrate!]
          (create-raw-user! "ngoc@metabase.com")
          (t2/insert! (t2/table-name Setting) {:key   "premium-embedding-token"
                                               :value "fake-key"})
          (migrate!)
          (is (= [] (get-perms)))))

      (testing "Should not fail if permissions already exist"
        (impl/test-migrations ["v44.00-033" "v44.00-034"] [migrate!]
          (t2/query-one {:insert-into :permissions
                         :values      [{:object   (perms-path)
                                        :group_id (all-users-group-id)}]})
          (migrate!)
          (is (= ["All Users"] (get-perms))))))))

(deftest make-database-details-not-null-test
  (testing "Migrations v45.00-042 and v45.00-043: set default value of '{}' for Database rows with NULL details"
    (impl/test-migrations ["v45.00-042" "v45.00-043"] [migrate!]
      (let [database-id (first (t2/insert-returning-pks! (t2/table-name Database) (-> (dissoc (mt/with-temp-defaults Database) :details)
                                                                                      (assoc :engine "h2"))))]
        (is (partial= {:details nil}
                      (t2/select-one Database :id database-id)))
        (migrate!)
        (is (partial= {:details {}}
                      (t2/select-one Database :id database-id)))))))

(deftest populate-collection-created-at-test
  (testing "Migrations v45.00-048 thru v45.00-050: add Collection.created_at and populate it"
    (impl/test-migrations ["v45.00-048" "v45.00-050"] [migrate!]
      (let [database-id              (first (t2/insert-returning-pks! (t2/table-name Database) {:details   "{}"
                                                                                                :engine    "h2"
                                                                                                :is_sample false
                                                                                                :name      "populate-collection-created-at-test-db"}))
            user-id                  (first (t2/insert-returning-pks! (t2/table-name User) {:first_name  "Cam"
                                                                                            :last_name   "Era"
                                                                                            :email       "cam@example.com"
                                                                                            :password    "123456"
                                                                                            :date_joined #t "2022-10-20T02:09Z"}))
            personal-collection-id   (first (t2/insert-returning-pks! (t2/table-name Collection) {:name              "Cam Era's Collection"
                                                                                                  :personal_owner_id user-id
                                                                                                  :color             "#ff0000"
                                                                                                  :slug              "personal_collection"}))
            impersonal-collection-id (first (t2/insert-returning-pks! (t2/table-name Collection) {:name  "Regular Collection"
                                                                                                  :color "#ff0000"
                                                                                                  :slug  "regular_collection"}))
            empty-collection-id      (first (t2/insert-returning-pks! (t2/table-name Collection) {:name  "Empty Collection"
                                                                                                  :color "#ff0000"
                                                                                                  :slug  "empty_collection"}))
            _                        (t2/insert! (t2/table-name Card) {:collection_id          impersonal-collection-id
                                                                       :name                   "Card 1"
                                                                       :display                "table"
                                                                       :dataset_query          "{}"
                                                                       :visualization_settings "{}"
                                                                       :creator_id             user-id
                                                                       :database_id            database-id
                                                                       :created_at             #t "2022-10-20T02:09Z"
                                                                       :updated_at             #t "2022-10-20T02:09Z"})
            _                        (t2/insert! (t2/table-name Card) {:collection_id          impersonal-collection-id
                                                                       :name                   "Card 2"
                                                                       :display                "table"
                                                                       :dataset_query          "{}"
                                                                       :visualization_settings "{}"
                                                                       :creator_id             user-id
                                                                       :database_id            database-id
                                                                       :created_at             #t "2021-10-20T02:09Z"
                                                                       :updated_at             #t "2022-10-20T02:09Z"})]
        (migrate!)
        (testing "A personal Collection should get created_at set by to the date_joined from its owner"
          (is (= (t/offset-date-time #t "2022-10-20T02:09Z")
                 (t/offset-date-time (t2/select-one-fn :created_at Collection :id personal-collection-id)))))
        (testing "A non-personal Collection should get created_at set to its oldest object"
          (is (= (t/offset-date-time #t "2021-10-20T02:09Z")
                 (t/offset-date-time (t2/select-one-fn :created_at Collection :id impersonal-collection-id)))))
        (testing "Empty Collection should not have been updated"
          (let [empty-collection-created-at (t/offset-date-time (t2/select-one-fn :created_at Collection :id empty-collection-id))]
            (is (not= (t/offset-date-time #t "2021-10-20T02:09Z")
                      empty-collection-created-at))
            (is (not= (t/offset-date-time #t "2022-10-20T02:09Z")
                      empty-collection-created-at))))))))

(deftest deduplicate-dimensions-test
  (testing "Migrations v46.00-029 thru v46.00-031: make Dimension field_id unique instead of field_id + name"
    (impl/test-migrations ["v46.00-029" "v46.00-031"] [migrate!]
      (let [database-id (first (t2/insert-returning-pks! (t2/table-name Database) {:details   "{}"
                                                                                    :engine    "h2"
                                                                                    :is_sample false
                                                                                    :name      "populate-collection-created-at-test-db"}))
            table-id    (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      database-id
                                                                                 :name       "Table"
                                                                                 :created_at :%now
                                                                                 :updated_at :%now
                                                                                 :active     true}))
            field-1-id  (first (t2/insert-returning-pks! (t2/table-name Field) {:name          "F1"
                                                                                 :table_id      table-id
                                                                                 :base_type     "type/Text"
                                                                                 :database_type "TEXT"
                                                                                 :created_at    :%now
                                                                                 :updated_at    :%now}))
            field-2-id  (first (t2/insert-returning-pks! (t2/table-name Field) {:name          "F2"
                                                                                 :table_id      table-id
                                                                                 :base_type     "type/Text"
                                                                                 :database_type "TEXT"
                                                                                 :created_at    :%now
                                                                                 :updated_at    :%now}))
            _           (t2/insert! (t2/table-name Dimension) {:field_id   field-1-id
                                                               :name       "F1 D1"
                                                               :type       "internal"
                                                               :created_at #t "2022-12-07T18:30:30.000-08:00"
                                                               :updated_at #t "2022-12-07T18:30:30.000-08:00"})
            _           (t2/insert! (t2/table-name Dimension) {:field_id   field-1-id
                                                               :name       "F1 D2"
                                                               :type       "internal"
                                                               :created_at #t "2022-12-07T18:45:30.000-08:00"
                                                               :updated_at #t "2022-12-07T18:45:30.000-08:00"})
            _           (t2/insert! (t2/table-name Dimension) {:field_id   field-2-id
                                                               :name       "F2 D1"
                                                               :type       "internal"
                                                               :created_at #t "2022-12-07T18:45:30.000-08:00"
                                                               :updated_at #t "2022-12-07T18:45:30.000-08:00"})]
        (is (= #{"F1 D1"
                 "F1 D2"
                 "F2 D1"}
               (t2/select-fn-set :name Dimension {:order-by [[:id :asc]]})))
        (migrate!)
        (testing "Keep the newest Dimensions"
          (is (= #{"F1 D2"
                   "F2 D1"}
                 (t2/select-fn-set :name Dimension {:order-by [[:id :asc]]}))))))))

(deftest clean-up-gtap-table-test
  (testing "Migrations v46.00-064 to v46.00-067: rename `group_table_access_policy` table, add `permission_id` FK,
           and clean up orphaned rows"
    (impl/test-migrations ["v46.00-064" "v46.00-067"] [migrate!]
      (let [db-id    (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "DB"
                                                                                :engine     "h2"
                                                                                :created_at :%now
                                                                                :updated_at :%now
                                                                                :details    "{}"}))
            table-id (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                             :name       "Table"
                                                                             :created_at :%now
                                                                             :updated_at :%now
                                                                             :active     true}))
            _        (t2/query-one {:insert-into :group_table_access_policy
                                    :values      [{:group_id             1
                                                   :table_id             table-id
                                                   :attribute_remappings "{\"foo\", 1}"}
                                                  {:group_id             2
                                                   :table_id             table-id
                                                   :attribute_remappings "{\"foo\", 1}"}]})
            perm-id  (first (t2/insert-returning-pks! (t2/table-name Permissions) {:group_id 1
                                                                                   :object   "/db/1/schema/PUBLIC/table/1/query/segmented/"}))]
        ;; Two rows are present in `group_table_access_policy`
        (is (= [{:id 1, :group_id 1, :table_id table-id, :card_id nil, :attribute_remappings "{\"foo\", 1}"}
                {:id 2, :group_id 2, :table_id table-id, :card_id nil, :attribute_remappings "{\"foo\", 1}"}]
               (mdb.query/query {:select [:*] :from [:group_table_access_policy]})))
        (migrate!)
        ;; Only the sandbox with a corresponding `Permissions` row is present, and the table is renamed to `sandboxes`
        (is (= [{:id 1, :group_id 1, :table_id table-id, :card_id nil, :attribute_remappings "{\"foo\", 1}", :permission_id perm-id}]
               (mdb.query/query {:select [:*] :from [:sandboxes]})))))))

(deftest able-to-delete-db-with-actions-test
  (testing "Migrations v46.00-084 and v46.00-085 set delete CASCADE for action.model_id to
           fix the bug of unable to delete database with actions"
    (impl/test-migrations ["v46.00-084" "v46.00-085"] [migrate!]
      (let [user-id  (first (t2/insert-returning-pks! (t2/table-name User) {:first_name  "Howard"
                                                                            :last_name   "Hughes"
                                                                            :email       "howard@aircraft.com"
                                                                            :password    "superstrong"
                                                                            :date_joined :%now}))
            db-id    (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "db"
                                                                                 :engine     "postgres"
                                                                                 :created_at :%now
                                                                                 :updated_at :%now
                                                                                 :settings    "{\"database-enable-actions\":true}"
                                                                                 :details    "{}"}))
            table-id (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                              :name       "Table"
                                                                              :created_at :%now
                                                                              :updated_at :%now
                                                                              :active     true}))
            model-id (first (t2/insert-returning-pks! (t2/table-name Card) {:name                   "My Saved Question"
                                                                             :created_at             :%now
                                                                             :updated_at             :%now
                                                                             :creator_id             user-id
                                                                             :table_id               table-id
                                                                             :display                "table"
                                                                             :dataset_query          "{}"
                                                                             :visualization_settings "{}"
                                                                             :database_id            db-id
                                                                             :collection_id          nil}))
            _        (t2/insert! (t2/table-name Action) {:name       "Update user name"
                                                         :type       "implicit"
                                                         :model_id   model-id
                                                         :archived   false
                                                         :created_at :%now
                                                         :updated_at :%now})]
       (is (thrown? clojure.lang.ExceptionInfo
                    (t2/delete! Database :id db-id)))
       (migrate!)
       (is (t2/delete! Database :id db-id))))))

(deftest split-data-permission-test
  (testing "Migration v46.00-080: split existing v1 data permission paths into v2 data and query permission paths"
    (impl/test-migrations ["v46.00-080"] [migrate!]
      (let [[group-1-id]        (t2/insert-returning-pks! PermissionsGroup {:name "Test Group 1"})
            [group-2-id]        (t2/insert-returning-pks! PermissionsGroup {:name "Test Group 2"})
            v1-paths-and-groups [["/db/1/"                                       group-1-id]
                                 ["/db/2/schema/"                                group-1-id]
                                 ["/db/3/native/"                                group-1-id]
                                 ["/db/4/schema/PUBLIC/"                         group-1-id]
                                 ["/db/5/schema/my\\\\schema/"                   group-1-id]
                                 ["/db/6/schema/PUBLIC/table/1/"                 group-1-id]
                                 ["/db/7/schema/PUBLIC/table/1/query/segmented/" group-1-id]
                                 ["/db/8/schema/PUBLIC/table/1/query/segmented/" group-1-id]
                                 ["/db/1/"                                       group-2-id]
                                 ["invalid-path"                                 group-2-id]]
            _                   (t2.execute/query-one {:insert-into :permissions
                                                       :columns     [:object :group_id]
                                                       :values      v1-paths-and-groups})
            _                   (migrate!)
            new-paths-set       (t2/select-fn-set (juxt :object :group_id)
                                                  :models/permissions
                                                  {:where [:in :group_id [group-1-id group-2-id]]})]
        ;; Check that the full permission set for group-1 and group-2 is what we expect post-migration.
        ;; Each v1-path from above is listed here, immediately followed by the two resulting v2 paths.
        (is (= #{["/db/1/"                                       group-1-id]
                 ["/data/db/1/"                                  group-1-id]
                 ["/query/db/1/"                                 group-1-id]
                 ["/db/2/schema/"                                group-1-id]
                 ["/data/db/2/"                                  group-1-id]
                 ["/query/db/2/schema/"                          group-1-id]
                 ["/db/3/native/"                                group-1-id]
                 ["/data/db/3/"                                  group-1-id]
                 ["/query/db/3/"                                 group-1-id]
                 ["/db/4/schema/PUBLIC/"                         group-1-id]
                 ["/data/db/4/schema/PUBLIC/"                    group-1-id]
                 ["/query/db/4/schema/PUBLIC/"                   group-1-id]
                 ["/db/5/schema/my\\\\schema/"                   group-1-id]
                 ["/data/db/5/schema/my\\\\schema/"              group-1-id]
                 ["/query/db/5/schema/my\\\\schema/"             group-1-id]
                 ["/db/6/schema/PUBLIC/table/1/"                 group-1-id]
                 ["/data/db/6/schema/PUBLIC/table/1/"            group-1-id]
                 ["/query/db/6/schema/PUBLIC/table/1/"           group-1-id]
                 ["/db/7/schema/PUBLIC/table/1/query/segmented/" group-1-id]
                 ["/data/db/7/schema/PUBLIC/table/1/"            group-1-id]
                 ["/query/db/7/schema/PUBLIC/table/1/"           group-1-id]
                 ["/db/8/schema/PUBLIC/table/1/query/segmented/" group-1-id]
                 ["/data/db/8/schema/PUBLIC/table/1/"            group-1-id]
                 ["/query/db/8/schema/PUBLIC/table/1/"           group-1-id]
                 ["/db/1/"                                       group-2-id]
                 ["/data/db/1/"                                  group-2-id]
                 ["/query/db/1/"                                 group-2-id]
                 ;; Invalid path is not touched but also doesn't fail the migration
                 ["invalid-path"                                 group-2-id]}
               new-paths-set))))))

(deftest migrate-field-database-type-test
  (testing "Migration v47.00-001: set base-type to type/JSON for JSON database-types for postgres and mysql"
    (impl/test-migrations ["v47.00-001"] [_]
      (let [{:keys [db-type ^javax.sql.DataSource
                    data-source]} mdb.connection/*application-db*
            ;; Use db.setup/migrate! instead of the impl/test-migrations migrate! binding, otherwise the rollback
            ;; will sometimes fail to work in CI (metabase#29515)
            migrate! (partial db.setup/migrate! db-type data-source)
            [pg-db-id
             mysql-db-id] (t2/insert-returning-pks! Database [{:name "PG Database"    :engine "postgres"}
                                                              {:name "MySQL Database" :engine "mysql"}])
            [pg-table-id
             mysql-table-id] (t2/insert-returning-pks! Table [{:db_id pg-db-id    :name "PG Table"    :active true}
                                                              {:db_id mysql-db-id :name "MySQL Table" :active true}])
            [pg-field-1-id
             pg-field-2-id
             pg-field-3-id
             mysql-field-1-id
             mysql-field-2-id] (t2/insert-returning-pks! Field [{:name "PG Field 1"    :table_id pg-table-id    :database_type "json"    :base_type :type/Structured}
                                                                {:name "PG Field 2"    :table_id pg-table-id    :database_type "JSONB"   :base_type :type/Structured}
                                                                {:name "PG Field 3"    :table_id pg-table-id    :database_type "varchar" :base_type :type/Text}
                                                                {:name "MySQL Field 1" :table_id mysql-table-id :database_type "json"    :base_type :type/SerializedJSON}
                                                                {:name "MySQL Field 2" :table_id mysql-table-id :database_type "varchar" :base_type :type/Text}])
            _ (migrate! :up)
            new-base-types (t2/select-pk->fn :base_type Field)]
        (are [field-id expected] (= expected (get new-base-types field-id))
          pg-field-1-id :type/JSON
          pg-field-2-id :type/JSON
          pg-field-3-id :type/Text
          mysql-field-1-id :type/JSON
          mysql-field-2-id :type/Text)
        ;; TODO: this is commented out temporarily because it flakes for MySQL
        #_(testing "Rollback restores the original state"
           (migrate! :down 46)
           (let [new-base-types (t2/select-pk->fn :base_type Field)]
             (are [field-id expected] (= expected (get new-base-types field-id))
               pg-field-1-id :type/Structured
               pg-field-2-id :type/Structured
               pg-field-3-id :type/Text
               mysql-field-1-id :type/SerializedJSON
               mysql-field-2-id :type/Text)))))))

(deftest migrate-google-auth-test
  (testing "Migrations v47.00-009 and v47.00-012: migrate google_auth into sso_source"
    (impl/test-migrations ["v47.00-009" "v47.00-012"] [migrate!]
                          (t2/query-one {:insert-into :core_user
                                         :values      [{:first_name    "Cam"
                                                        :last_name     "Era"
                                                        :email         "cam@era.com"
                                                        :date_joined   :%now
                                                        :password      "password"
                                                        :password_salt "and pepper"
                                                        :google_auth   false}
                                                       {:first_name    "Google Cam"
                                                        :last_name     "Era"
                                                        :email         "ldap_cam@era.com"
                                                        :date_joined   :%now
                                                        :password      "password"
                                                        :password_salt "and pepper"
                                                        :google_auth   true}]})
                          (migrate!)
                          (is (= [{:first_name "Cam", :sso_source nil}
                                  {:first_name "Google Cam", :sso_source "google"}]
                                 (mdb.query/query {:select   [:first_name :sso_source]
                                                   :from     [:core_user]
                                                   :order-by [[:id :asc]]}))))))

(deftest migrate-ldap-auth-test
  (testing "Migration v47.00-013 and v47.00-014: migrate ldap_auth into sso_source"
    (impl/test-migrations ["v47.00-013" "v47.00-014"] [migrate!]
      (t2/query-one {:insert-into :core_user
                     :values      [{:first_name    "Cam"
                                    :last_name     "Era"
                                    :email         "cam@era.com"
                                    :date_joined   :%now
                                    :password      "password"
                                    :password_salt "and pepper"
                                    :ldap_auth     false}
                                   {:first_name    "LDAP Cam"
                                    :last_name     "Era"
                                    :email         "ldap_cam@era.com"
                                    :date_joined   :%now
                                    :password      "password"
                                    :password_salt "and pepper"
                                    :ldap_auth     true}]})
      (migrate!)
      (is (= [{:first_name "Cam", :sso_source nil}
              {:first_name "LDAP Cam", :sso_source "ldap"}]
             (mdb.query/query {:select   [:first_name :sso_source]
                               :from     [:core_user]
                               :order-by [[:id :asc]]}))))))

(defn- migrate18-to-24
  [{:keys [row col size_x size_y]}]
  {:row    (+ row (quot row 3))
   :col    (+ col (quot (+ col 1) 3))
   :size_x (- (+ size_x
                 (quot (+ col size_x 1) 3))
              (quot (+ col 1) 3))
   :size_y (+ size_y
              (-
                (quot (+ size_y row) 3)
                (quot row 3)))})

(defn- migrate24-to-18
  [{:keys [row col size_x size_y]}]
  {:row    (- row (quot row 4))
   :col    (- col (quot col 4))
   :size_x (- size_x
              (-
                (quot (+ size_x col) 4)
                (quot col 4)))
   :size_y (- size_y
              (-
                (quot (+ size_y row) 4)
                (quot row 4)))})

(deftest migrate-grid-from-18-to-24-test
  (impl/test-migrations ["v47.00-030" "v47.00-031"] [_migrate!]
    (let [{:keys [db-type ^javax.sql.DataSource data-source]} mdb.connection/*application-db*
          migrate!     (partial db.setup/migrate! db-type data-source)
          user         (create-raw-user! (tu.random/random-email))
          dashboard-id (first (t2/insert-returning-pks! :model/Dashboard {:name       "A dashboard"
                                                                          :creator_id (:id user)}))
          cases        (for [[col, row, size_x, size_y] [[0, 15, 12, 8],
                                                         [12, 7, 6, 8],
                                                         [5, 2, 5, 3],
                                                         [0, 25, 7, 10,],
                                                         [0, 2, 5, 3],
                                                         [6, 7, 6, 8,],
                                                         [7, 25 ,11 ,10],
                                                         [0, 7, 6, 4,],
                                                         [0, 23, 18, 2],
                                                         [0, 5, 18, 2],
                                                         [0, 0, 18 ,2],]]
                         {:row    row
                          :col    col
                          :size_x size_x
                          :size_y size_y})
          dashcard-ids (t2/insert-returning-pks! :model/DashboardCard
                                                 (map #(merge % {:dashboard_id dashboard-id
                                                                 :visualization_settings {}
                                                                 :parameter_mappings     {}}) cases))]
      (migrate! :up)
      (is (= (map migrate18-to-24 cases)
             (t2/select-fn-vec #(select-keys % [:row :col :size_x :size_y]) :model/DashboardCard :id [:in dashcard-ids])))

      (migrate! :down 46)
      (is (= (->> cases (map migrate18-to-24) (map migrate24-to-18))
             (t2/select-fn-vec #(select-keys % [:row :col :size_x :size_y]) :model/DashboardCard :id [:in dashcard-ids]))))))
