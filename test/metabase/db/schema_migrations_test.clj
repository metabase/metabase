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
   [metabase.db.schema-migrations-test.impl :as impl]
   [metabase.driver :as driver]
   [metabase.models :refer [Card Collection Dashboard Database Field Permissions PermissionsGroup Pulse Setting Table]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.user :refer [User]]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan.db :as db])
  (:import java.sql.Connection
           java.util.UUID))

(use-fixtures :once (fixtures/initialize :db))

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
        ;; Using [[db/simple-insert-many!]] instead of [[db/insert-many!]] so we don't run into the field type validation
        ;; added in 38
        (db/simple-insert-many! Field
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
    (impl/test-migrations ["v42.00-064"] [migrate!]
      (with-open [conn (jdbc/get-connection (db/connection))]
        (when (= :mysql driver/*driver*)
          ;; simulate the broken app DB state that existed prior to the fix from #16095
          (with-open [stmt (.prepareStatement conn "ALTER TABLE query_cache MODIFY results BLOB NULL;")]
            (.execute stmt)))
        (migrate!)                      ; run migrations, then check the new type
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
                        (get tbl-cols col-nm)))))))))

(deftest remove-bigquery-driver-test
  (testing "Migrate legacy BigQuery driver to new (:bigquery-cloud-sdk) driver (#20141)"
    (impl/test-migrations ["v43.00-001"] [migrate!]
      (try
        ;; we're using `simple-insert!` here instead of `with-temp` because Toucan `post-insert` for the DB will
        ;; normally try to add it to the magic Permissions Groups which don't exist yet. They're added in later
        ;; migrations
        (let [db (db/simple-insert! Database {:name       "Legacy BigQuery driver DB"
                                              :engine     "bigquery"
                                              :details    (json/generate-string {:service-account-json "{\"fake_key\": 14}"})
                                              :created_at :%now
                                              :updated_at :%now})]
          (migrate!)
          (is (= [{:engine "bigquery-cloud-sdk"}]
                 (db/query {:select [:engine], :from [Database], :where [:= :id (u/the-id db)]}))))
        (finally
          (db/simple-delete! Database :name "Legacy BigQuery driver DB"))))))

(deftest create-root-permissions-entry-for-admin-test
  (testing "Migration v0.43.00-006: Add root permissions entry for 'Administrators' magic group"
    (doseq [existing-entry? [true false]]
      (testing (format "Existing root entry? %s" (pr-str existing-entry?))
        (impl/test-migrations "v43.00-006" [migrate!]
          (let [[{admin-group-id :id}] (db/query {:select [:id], :from [PermissionsGroup],
                                                  :where [:= :name perms-group/admin-group-name]})]
            (is (integer? admin-group-id))
            (when existing-entry?
              (db/execute! {:insert-into Permissions
                            :values      [{:object   "/"
                                           :group_id admin-group-id}]}))
            (migrate!)
            (is (= [{:object "/"}]
                   (db/query {:select    [:object]
                              :from      [Permissions]
                              :where     [:= :group_id admin-group-id]})))))))))

(deftest create-database-entries-for-all-users-group-test
  (testing "Migration v43.00-007: create DB entries for the 'All Users' permissions group"
    (doseq [with-existing-data-migration? [true false]]
      (testing (format "With existing data migration? %s" (pr-str with-existing-data-migration?))
        (impl/test-migrations "v43.00-007" [migrate!]
          (db/execute! {:insert-into Database
                        :values      [{:name       "My DB"
                                       :engine     "h2"
                                       :created_at :%now
                                       :updated_at :%now
                                       :details    "{}"}]})
          (when with-existing-data-migration?
            (db/execute! {:insert-into :data_migrations
                          :values      [{:id        "add-databases-to-magic-permissions-groups"
                                         :timestamp :%now}]}))
          (migrate!)
          (is (= (if with-existing-data-migration?
                   []
                   [{:object "/db/1/"}])
                 (db/query {:select    [:p.object]
                            :from      [[Permissions :p]]
                            :left-join [[PermissionsGroup :pg] [:= :p.group_id :pg.id]]
                            :where     [:= :pg.name perms-group/all-users-group-name]}))))))))

(deftest migrate-legacy-site-url-setting-test
  (testing "Migration v43.00-008: migrate legacy `-site-url` Setting to `site-url`; remove trailing slashes (#4123, #4188, #20402)"
    (impl/test-migrations ["v43.00-008"] [migrate!]
      (db/execute! {:insert-into Setting
                    :values      [{:key   "-site-url"
                                   :value "http://localhost:3000/"}]})
      (migrate!)
      (is (= [{:key "site-url", :value "http://localhost:3000"}]
             (db/query {:select [:*], :from [Setting], :where [:= :key "site-url"]}))))))

(deftest site-url-ensure-protocol-test
  (testing "Migration v43.00-009: ensure `site-url` Setting starts with a protocol (#20403)"
    (impl/test-migrations ["v43.00-009"] [migrate!]
      (db/execute! {:insert-into Setting
                    :values      [{:key   "site-url"
                                   :value "localhost:3000"}]})
      (migrate!)
      (is (= [{:key "site-url", :value "http://localhost:3000"}]
             (db/query {:select [:*], :from [Setting], :where [:= :key "site-url"]}))))))

(defn- add-legacy-data-migration-entry! [migration-name]
  (db/execute! {:insert-into :data_migrations
                :values      [{:id        migration-name
                               :timestamp :%now}]}))

(defn- add-migrated-collections-data-migration-entry! []
  (add-legacy-data-migration-entry! "add-migrated-collections"))

(deftest add-migrated-collections-test
  (testing "Migrations v43.00-014 - v43.00-019"
    (letfn [(create-user! []
              (db/execute! {:insert-into User
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
                                    (db/execute! {:insert-into Dashboard
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
                                    (db/execute! {:insert-into Pulse
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
                                    (db/execute! {:insert-into Database
                                                  :values      [{:name       "My DB"
                                                                 :engine     "h2"
                                                                 :details    "{}"
                                                                 :created_at :%now
                                                                 :updated_at :%now}]})
                                    (db/execute! {:insert-into Card
                                                  :values      [{:name                   "My Saved Question"
                                                                 :created_at             :%now
                                                                 :updated_at             :%now
                                                                 :creator_id             1
                                                                 :display                "table"
                                                                 :dataset_query          "{}"
                                                                 :visualization_settings "{}"
                                                                 :database_id            1
                                                                 :collection_id          nil}]}))}]]
        (testing (format "create %s Collection for %s in the Root Collection"
                         (pr-str collection-name)
                         (name model))
          (letfn [(collections []
                    (db/query {:select [:name :slug], :from [Collection]}))
                  (collection-slug []
                    (-> collection-name
                        str/lower-case
                        (str/replace #"\s+" "_")))]
            (impl/test-migrations ["v43.00-014" "v43.00-019"] [migrate!]
              (create-instance!)
              (migrate!)
              (is (= [{:name collection-name, :slug (collection-slug)}]
                     (collections)))
              (testing "Instance should be moved new Collection"
                (is (= [{:collection_id 1}]
                       (db/query {:select [:collection_id], :from [model]})))))
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
                           (db/query {:select [:collection_id], :from [model]}))))))
              (testing "Migrated Collection already exists\n"
                (impl/test-migrations ["v43.00-014" "v43.00-019"] [migrate!]
                  (create-instance!)
                  (db/execute! {:insert-into Collection
                                :values      [{:name collection-name, :slug "existing_collection", :color "#abc123"}]})
                  (migrate!)
                  (is (= [{:name collection-name, :slug "existing_collection"}]
                         (collections)))
                  (testing "Collection should not have been created but instance should still be moved"
                    (is (= [{:collection_id 1}]
                           (db/query {:select [:collection_id], :from [model]})))))))))))))

(deftest grant-all-users-root-collection-readwrite-perms-test
  (testing "Migration v43.00-020: create a Root Collection entry for All Users"
    (letfn [(all-users-group-id []
              (let [[{id :id}] (db/query {:select [:id], :from [PermissionsGroup],
                                          :where [:= :name perms-group/all-users-group-name]})]
                (is (integer? id))
                id))
            (all-user-perms []
              (db/query {:select [:object], :from [Permissions], :where [:= :group_id (all-users-group-id)]}))]
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
          (db/execute! {:insert-into Permissions
                        :values      [{:object   "/collection/root/"
                                       :group_id (all-users-group-id)}]})
          (migrate!)
          (is (= [{:object "/collection/root/"}]
                 (all-user-perms))))))))

(deftest clear-ldap-user-passwords-test
  (testing "Migration v43.00-029: clear password and password_salt for LDAP users"
    (impl/test-migrations ["v43.00-029"] [migrate!]
      (db/execute! {:insert-into User
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
      (is (= [{:first_name "Cam", :password "password", :password_salt "and pepper", :ldap_auth false}
              {:first_name "LDAP Cam", :password nil, :password_salt nil, :ldap_auth true}]
             (db/query {:select [:first_name :password :password_salt :ldap_auth], :from [User], :order-by [[:id :asc]]}))))))

(deftest grant-download-perms-test
  (testing "Migration v43.00-042: grant download permissions to All Users permissions group"
    (impl/test-migrations ["v43.00-042" "v43.00-043"] [migrate!]
      (db/execute! {:insert-into Database
                    :values      [{:name       "My DB"
                                   :engine     "h2"
                                   :created_at :%now
                                   :updated_at :%now
                                   :details    "{}"}]})
      (migrate!)
      (is (= [{:object "/collection/root/"} {:object "/download/db/1/"}]
             (db/query {:select    [:p.object]
                        :from      [[Permissions :p]]
                        :left-join [[PermissionsGroup :pg] [:= :p.group_id :pg.id]]
                        :where     [:= :pg.name perms-group/all-users-group-name]}))))))

(deftest grant-subscription-permission-tests
  (testing "Migration v43.00-047: Grant the 'All Users' Group permissions to create/edit subscriptions and alerts"
    (impl/test-migrations ["v43.00-047" "v43.00-048"] [migrate!]
        (migrate!)
        (is (= #{"All Users"}
               (set (map :name (db/query {:select    [:pg.name]
                                          :from      [[Permissions :p]]
                                          :left-join [[PermissionsGroup :pg] [:= :p.group_id :pg.id]]
                                          :where     [:= :p.object "/general/subscription/"]}))))))))

(deftest grant-subscription-permission-tests
  (testing "Migration v43.00-057: Rename general permissios to application permissions"
    (impl/test-migrations ["v43.00-057" "v43.00-058"] [migrate!]
      (letfn [(get-perms [object] (set (map :name (db/query {:select    [:pg.name]
                                                             :from      [[Permissions :p]]
                                                             :left-join [[PermissionsGroup :pg] [:= :p.group_id :pg.id]]
                                                             :where     [:= :p.object object]}))))]
        (is (= #{"All Users"} (get-perms "/general/subscription/")))
        (migrate!)
        (is (= #{"All Users"} (get-perms "/application/subscription/")))))))
