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
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.cmd.dump-to-h2 :as dump-to-h2]
   [metabase.cmd.load-from-h2 :as load-from-h2]
   [metabase.cmd.load-from-h2-test :as load-from-h2-test]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.custom-migrations-test :as custom-migrations-test]
   [metabase.db.liquibase :as liquibase]
   [metabase.db.query :as mdb.query]
   [metabase.db.schema-migrations-test.impl :as impl]
   [metabase.driver :as driver]
   [metabase.models
    :refer [Action
            Card
            Collection
            Database
            Dimension
            Field
            Permissions
            PermissionsGroup
            Table
            User]]
   [metabase.test :as mt]
   [metabase.test.data.env :as tx.env]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest rollback-test
  (testing "Migrating to latest version, rolling back to v44, and then migrating up again"
    ;; using test-migrations to excercise all drivers
    (impl/test-migrations ["v46.00-001" "v46.00-002"] [migrate!]
      (let [get-last-id (fn []
                          (-> {:datasource (mdb/app-db)}
                              (jdbc/query ["SELECT id FROM DATABASECHANGELOG ORDER BY ORDEREXECUTED DESC LIMIT 1"])
                              first
                              :id))]
        (migrate!)
        (let [latest-id (get-last-id)]
          (migrate! :down 45)
          ;; will always be the last v44 migration
          (is (= "v45.00-057" (get-last-id)))
          (migrate!)
          (is (= latest-id (get-last-id))))))))

(defn- create-raw-user!
  "create a user but skip pre and post insert steps"
  [email]
  (first (t2/insert-returning-instances! (t2/table-name User)
                                         :email        email
                                         :first_name   (mt/random-name)
                                         :last_name    (mt/random-name)
                                         :password     (str (random-uuid))
                                         :date_joined  :%now
                                         :is_active    true
                                         :is_superuser false)))


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

(deftest migrate-field-database-type-test
  (testing "Migration v47.00-001: set base-type to type/JSON for JSON database-types for postgres and mysql"
    (impl/test-migrations ["v47.00-001"] [migrate!]
      (let [[pg-db-id
             mysql-db-id] (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                    [{:name "PG Database"
                                                      :engine "postgres"
                                                      :created_at :%now
                                                      :updated_at :%now
                                                      :details "{}"}
                                                     {:name "MySQL Database"
                                                      :engine "mysql"
                                                      :created_at :%now
                                                      :updated_at :%now
                                                      :details "{}"}])
            [pg-table-id
             mysql-table-id] (t2/insert-returning-pks! (t2/table-name :model/Table)
                                                       [{:db_id pg-db-id
                                                         :name "PG Table"
                                                         :created_at :%now
                                                         :updated_at :%now
                                                         :active true}
                                                        {:db_id mysql-db-id
                                                         :name "MySQL Table"
                                                         :created_at :%now
                                                         :updated_at :%now
                                                         :active true}])
            [pg-field-1-id
             pg-field-2-id
             pg-field-3-id
             mysql-field-1-id
             mysql-field-2-id] (t2/insert-returning-pks! Field [{:name "PG Field 1"    :table_id pg-table-id    :database_type "json"    :base_type :type/Structured}
                                                                {:name "PG Field 2"    :table_id pg-table-id    :database_type "JSONB"   :base_type :type/Structured}
                                                                {:name "PG Field 3"    :table_id pg-table-id    :database_type "varchar" :base_type :type/Text}
                                                                {:name "MySQL Field 1" :table_id mysql-table-id :database_type "json"    :base_type :type/SerializedJSON}
                                                                {:name "MySQL Field 2" :table_id mysql-table-id :database_type "varchar" :base_type :type/Text}])
            _ (migrate!)
            new-base-types (t2/select-pk->fn :base_type Field)]
        (are [field-id expected] (= expected (get new-base-types field-id))
          pg-field-1-id :type/JSON
          pg-field-2-id :type/JSON
          pg-field-3-id :type/Text
          mysql-field-1-id :type/JSON
          mysql-field-2-id :type/Text)
        ;; TODO: this is commented out temporarily because it flakes for MySQL (metabase#37884)
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

(deftest migrate-grid-from-18-to-24-test
  (impl/test-migrations ["v47.00-031" "v47.00-032"] [migrate!]
    (let [user         (create-raw-user! (mt/random-email))
          dashboard-id (first (t2/insert-returning-pks! :model/Dashboard {:name       "A dashboard"
                                                                          :creator_id (:id user)}))
          ;; this layout is from magic dashboard for order table
          cases        [{:row 15 :col 0  :size_x 12 :size_y 8}
                        {:row 7  :col 12 :size_x 6  :size_y 8}
                        {:row 2  :col 5  :size_x 5  :size_y 3}
                        {:row 25 :col 0  :size_x 7  :size_y 10}
                        {:row 2  :col 0  :size_x 5  :size_y 3}
                        {:row 7  :col 6  :size_x 6  :size_y 8}
                        {:row 25 :col 7  :size_x 11 :size_y 10}
                        {:row 7  :col 0  :size_x 6  :size_y 4}
                        {:row 23 :col 0  :size_x 18 :size_y 2}
                        {:row 5  :col 0  :size_x 18 :size_y 2}
                        {:row 0  :col 0  :size_x 18 :size_y 2}
                        ;; these 2 last cases is a specical case where the last card has (width, height) = (1, 1)
                        ;; it's to test an edge case to make sure downgrade from 24 -> 18 does not remove these cards
                        {:row 36 :col 0  :size_x 17 :size_y 1}
                        {:row 36 :col 17 :size_x 1  :size_y 1}]
          dashcard-ids (t2/insert-returning-pks! :model/DashboardCard
                                                 (map #(merge % {:dashboard_id dashboard-id
                                                                 :visualization_settings {}
                                                                 :parameter_mappings     {}}) cases))]
      (testing "forward migration migrate correctly"
        (migrate!)
        (let [migrated-to-24 (t2/select-fn-vec #(select-keys % [:row :col :size_x :size_y])
                                               :model/DashboardCard :id [:in dashcard-ids]
                                               {:order-by [[:id :asc]]})]
          (is (= [{:row 15 :col 0  :size_x 16 :size_y 8}
                  {:row 7  :col 16 :size_x 8  :size_y 8}
                  {:row 2  :col 7  :size_x 6  :size_y 3}
                  {:row 25 :col 0  :size_x 9  :size_y 10}
                  {:row 2  :col 0  :size_x 7  :size_y 3}
                  {:row 7  :col 8  :size_x 8  :size_y 8}
                  {:row 25 :col 9  :size_x 15 :size_y 10}
                  {:row 7  :col 0  :size_x 8  :size_y 4}
                  {:row 23 :col 0  :size_x 24 :size_y 2}
                  {:row 5  :col 0  :size_x 24 :size_y 2}
                  {:row 0  :col 0  :size_x 24 :size_y 2}
                  {:row 36 :col 0  :size_x 23 :size_y 1}
                  {:row 36 :col 23 :size_x 1  :size_y 1}]
                 migrated-to-24))
          (is (true? (custom-migrations-test/no-cards-are-overlap? migrated-to-24)))
          (is (true? (custom-migrations-test/no-cards-are-out-of-grid-and-has-size-0? migrated-to-24 24)))))

      ;; TODO: this is commented out temporarily because it flakes for MySQL (metabase#37884)
      #_(testing "downgrade works correctly"
         (migrate! :down 46)
         (let [rollbacked-to-18 (t2/select-fn-vec #(select-keys % [:row :col :size_x :size_y])
                                                  :model/DashboardCard :id [:in dashcard-ids]
                                                  {:order-by [[:id :asc]]})]
           (is (= cases rollbacked-to-18))
           (is (true? (custom-migrations-test/no-cards-are-overlap? rollbacked-to-18)))
           (is (true? (custom-migrations-test/no-cards-are-out-of-grid-and-has-size-0? rollbacked-to-18 18))))))))

(deftest backfill-permission-id-test
  (testing "Migrations v46.00-088-v46.00-90: backfill `permission_id` FK on sandbox table"
    (impl/test-migrations ["v46.00-088" "v46.00-090"] [migrate!]
      (let [db-id    (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "DB"
                                                                                :engine     "h2"
                                                                                :created_at :%now
                                                                                :updated_at :%now
                                                                                :details    "{}"}))
            table-id (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                             :schema     "SchemaName"
                                                                             :name       "Table"
                                                                             :created_at :%now
                                                                             :updated_at :%now
                                                                             :active     true}))
            _        (t2/query-one {:insert-into :sandboxes
                                    :values      [{:group_id             1
                                                   :table_id             table-id
                                                   :attribute_remappings "{\"foo\", 1}"}
                                                  {:group_id             2
                                                   :table_id             table-id
                                                   :attribute_remappings "{\"foo\", 1}"}]})
            perm-id  (first (t2/insert-returning-pks! (t2/table-name Permissions)
                                                      [{:group_id 1
                                                        :object   "/db/1/schema/SchemaName/table/1/query/segmented/"}
                                                       {:group_id 1
                                                        :object   "/db/1/schema//table/1/query/segmented/"}]))]
        ;; Two rows are present in `sandboxes`
        (is (= [{:id 1, :group_id 1, :table_id table-id, :card_id nil, :attribute_remappings "{\"foo\", 1}" :permission_id nil}
                {:id 2, :group_id 2, :table_id table-id, :card_id nil, :attribute_remappings "{\"foo\", 1}" :permission_id nil}]
               (mdb.query/query {:select [:*] :from [:sandboxes]})))
        (migrate!)
        ;; Only the sandbox with a corresponding `Permissions` row is present
        (is (= [{:id 1, :group_id 1, :table_id table-id, :card_id nil, :attribute_remappings "{\"foo\", 1}", :permission_id perm-id}]
               (mdb.query/query {:select [:*] :from [:sandboxes]})))))))

(deftest add-revision-most-recent-test
  (testing "Migrations v48.00-008-v48.00-009: add `revision.most_recent`"
    (impl/test-migrations ["v48.00-007"] [migrate!]
      (let [user-id         (:id (create-raw-user! (mt/random-email)))
            old             (t/minus (t/local-date-time) (t/hours 1))
            rev-dash-1-old  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                     {:model       "dashboard"
                                                      :model_id    1
                                                      :user_id     user-id
                                                      :object      "{}"
                                                      :is_creation true
                                                      :timestamp   old})
            rev-dash-1-new  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                     {:model       "dashboard"
                                                      :model_id    1
                                                      :user_id     user-id
                                                      :object      "{}"
                                                      :timestamp   :%now})
            rev-dash-2-old  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                     {:model       "dashboard"
                                                      :model_id    2
                                                      :user_id     user-id
                                                      :object      "{}"
                                                      :is_creation true
                                                      :timestamp   old})
            rev-dash-2-new  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                     {:model       "dashboard"
                                                      :model_id    2
                                                      :user_id     user-id
                                                      :object      "{}"
                                                      :timestamp   :%now})
            rev-card-1-old  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                     {:model       "card"
                                                      :model_id    1
                                                      :user_id     user-id
                                                      :object      "{}"
                                                      :is_creation true
                                                      :timestamp   old})
            rev-card-1-new  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                     {:model       "card"
                                                      :model_id    1
                                                      :user_id     user-id
                                                      :object      "{}"
                                                      :timestamp   :%now})]
        (migrate!)
        (is (= #{false} (t2/select-fn-set :most_recent (t2/table-name :model/Revision)
                                          :id [:in [rev-dash-1-old rev-dash-2-old rev-card-1-old]])))
        (is (= #{true} (t2/select-fn-set :most_recent (t2/table-name :model/Revision)
                                         :id [:in [rev-dash-1-new rev-dash-2-new rev-card-1-new]])))))))
(deftest fks-are-indexed-test
  (mt/test-driver :postgres
    (testing "FKs are not created automatically in Postgres, check that migrations add necessary indexes"
     (is (= [{:table_name  "field_usage"
              :column_name "query_execution_id"}]
            (t2/query
              "SELECT
                   conrelid::regclass::text AS table_name,
                   a.attname AS column_name
               FROM
                   pg_constraint AS c
                   JOIN pg_attribute AS a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
               WHERE
                   c.contype = 'f'
                   AND NOT EXISTS (
                       SELECT 1
                       FROM pg_index AS i
                       WHERE i.indrelid = c.conrelid
                         AND a.attnum = ANY(i.indkey)
                   )
               ORDER BY
                   table_name,
                   column_name;"))))))

(deftest remove-collection-color-test
  (testing "Migration v48.00-019"
    (impl/test-migrations ["v48.00-019"] [migrate!]
      (with-redefs [config/load-sample-content? (constantly false)]
        (let [collection-id (first (t2/insert-returning-pks! (t2/table-name Collection) {:name "Amazing collection"
                                                                                         :slug "amazing_collection"
                                                                                         :color "#509EE3"}))]
        (testing "Collection should exist and have the color set by the user prior to migration"
          (is (= "#509EE3" (:color (t2/select-one :model/Collection :id collection-id)))))

        (migrate!)
        (testing "should drop the existing color column"
          (is (not (contains? (t2/select-one :model/Collection :id collection-id) :color)))))))))

(deftest audit-v2-views-test
  (testing "Migrations v48.00-029 - end"
    ;; Use an open-ended migration range so that we can detect if any migrations added after these views broke the view
    ;; queries
    (impl/test-migrations ["v48.00-029"] [migrate!]
      (let [new-view-names ["v_audit_log"
                            "v_content"
                            "v_dashboardcard"
                            "v_group_members"
                            "v_subscriptions"
                            "v_alerts"
                            "v_users"
                            "v_databases"
                            "v_fields"
                            "v_query_log"
                            "v_tables"
                            "v_view_log"]]
        (migrate!)
        (doseq [view-name new-view-names]
          (testing (str "View " view-name " should be created")
            ;; Just assert that something was returned by the query and no exception was thrown
            (is (partial= [] (t2/query (str "SELECT 1 FROM " view-name))))))
        #_#_ ;; TODO: this is commented out temporarily because it flakes for MySQL (metabase#37884)
        (migrate! :down 47)
        (testing "Views should be removed when downgrading"
          (doseq [view-name new-view-names]
            (is (thrown?
                 clojure.lang.ExceptionInfo
                 (t2/query (str "SELECT 1 FROM " view-name))))))))))

(deftest activity-data-migration-test
  (testing "Migration v48.00-049"
    (mt/test-drivers [:postgres :mysql]
     (impl/test-migrations "v48.00-049" [migrate!]
       (create-raw-user! (mt/random-email))
       ;; Use raw :activity keyword as table name since the model has since been removed
       (let [_activity-1 (t2/insert-returning-pks! :activity
                                                   {:topic       "card-create"
                                                    :user_id     1
                                                    :timestamp   :%now
                                                    :model       "Card"
                                                    :model_id    2
                                                    :database_id 1
                                                    :table_id    6
                                                    :details     "{\"arbitrary_key\": \"arbitrary_value\"}"})]
         (testing "activity rows are copied into audit_log"
           (is (= 0 (t2/count :model/AuditLog)))
           (is (= 1 (t2/count :activity)))
           (migrate!)
           (is (= 1 (t2/count :model/AuditLog)))
           (is (= 1 (t2/count :activity))))

         (testing "`database_id` and `table_id` are merged into `details`"
           (is (partial=
                {:id 1
                 :topic :card-create
                 :end_timestamp nil
                 :user_id 1
                 :model "Card"
                 :model_id 2
                 :details {:database_id 1
                           :table_id 6}}
                (t2/select-one :model/AuditLog)))))))

    (mt/test-drivers [:h2]
     (impl/test-migrations "v48.00-049" [migrate!]
       (create-raw-user! (mt/random-email))
       (let [_activity-1 (t2/insert-returning-pks! "activity"
                                                   {:topic       "card-create"
                                                    :user_id     1
                                                    :timestamp   :%now
                                                    :model       "Card"
                                                    :model_id    2
                                                    :database_id 1
                                                    :table_id    6
                                                    :details     "{\"arbitrary_key\": \"arbitrary_value\"}"})]
         (testing "activity rows are copied into audit_log"
           (is (= 0 (t2/count :model/AuditLog)))
           (is (= 1 (t2/count :activity)))
           (migrate!)
           (is (= 1 (t2/count :model/AuditLog)))
           (is (= 1 (t2/count :activity))))

         (testing "`database_id` and `table_id` are inserted into `details`, but not merged with the previous value
                   (H2 limitation)"
           (is (partial=
                {:id 1
                 :topic :card-create
                 :end_timestamp nil
                 :user_id 1
                 :model "Card"
                 :model_id 2
                 :details {:database_id 1
                           :table_id 6}}
                (t2/select-one :model/AuditLog)))))))))

(deftest inactive-fields-fk-migration-test
  (testing "Migration v48.00-051"
    (impl/test-migrations ["v48.00-051"] [migrate!]
      (let [database-id (first (t2/insert-returning-pks! (t2/table-name Database) {:details   "{}"
                                                                                   :engine    "h2"
                                                                                   :is_sample false
                                                                                   :name      "populate-collection-created-at-test-db"}))
            table-1-id  (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      database-id
                                                                                :name       "Table 1"
                                                                                :created_at :%now
                                                                                :updated_at :%now
                                                                                :active     true}))
            table-2-id  (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      database-id
                                                                                :name       "Table 2"
                                                                                :created_at :%now
                                                                                :updated_at :%now
                                                                                :active     true}))
            field-1-id  (first (t2/insert-returning-pks! (t2/table-name Field) {:name          "F1"
                                                                                :table_id      table-1-id
                                                                                :base_type     "type/Text"
                                                                                :database_type "TEXT"
                                                                                :created_at    :%now
                                                                                :updated_at    :%now
                                                                                :active        false}))
            field-2-id  (first (t2/insert-returning-pks! (t2/table-name Field) {:name               "F2"
                                                                                :table_id           table-2-id
                                                                                :base_type          "type/Text"
                                                                                :database_type      "TEXT"
                                                                                :created_at         :%now
                                                                                :updated_at         :%now
                                                                                :active             true
                                                                                :fk_target_field_id field-1-id
                                                                                :semantic_type      "type/FK"}))]
        (migrate!)
        (is (=? {:fk_target_field_id nil
                 :semantic_type      nil}
                (t2/select-one (t2/table-name :model/Field) :id field-2-id)))))))

(deftest audit-v2-downgrade-test
  (testing "Migration v48.00-050, and v48.00-54"
    (impl/test-migrations "v48.00-054" [migrate!]
      (let [_db-audit-id (first (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                          {:name       "Audit DB"
                                                           :is_audit   true
                                                           :details    "{}"
                                                           :engine     "postgres"}))
            _db-normal-id (first (t2/insert-returning-pks! (t2/table-name :model/Database)
                                                           {:name       "Normal DB"
                                                            :is_audit   false
                                                            :details    "{}"
                                                            :engine     "postgres"}))
            _coll-analytics-id (first (t2/insert-returning-pks! (t2/table-name :model/Collection)
                                                                {:name       "Metabase Analytics"
                                                                 :type       "instance_analytics"
                                                                 :slug       "metabase_analytics"}))
            _coll-normal-id (first (t2/insert-returning-pks! (t2/table-name :model/Collection)
                                                             {:name       "Normal Collection"
                                                              :type       nil
                                                              :slug       "normal_collection"}))
            _internal-user-id (first (t2/insert-returning-pks! (t2/table-name :model/User)
                                                               {:id 13371338
                                                                :first_name "Metabase Internal User"
                                                                :email "internal@metabase.com"
                                                                :password (str (random-uuid))
                                                                :date_joined :%now}))
            original-db-names (t2/select-fn-set :name :metabase_database)
            original-collections (t2/select-fn-set :name :collection)
            check-before (fn []
                           (is (partial= original-db-names
                                         (t2/select-fn-set :name :metabase_database)))
                           (is (partial= original-collections
                                         (t2/select-fn-set :name :collection)))
                           (is (= 1 (t2/count :core_user :id 13371338))))]

        (check-before) ;; Verify that data is inserted correctly
        (migrate!) ;; no-op forward migration
        (check-before) ;; Verify that forward migration did not change data

        (migrate! :down 47)

        ;; Verify that rollback deleted the correct rows
        (is (= 1 (t2/count :metabase_database)))
        (is (= 1 (t2/count :collection)))
        (is (= 0 (t2/count :metabase_database :is_audit true)))
        (is (= 0 (t2/count :collection :type "instance_analytics")))
        (is (= 0 (t2/count :core_user :id 13371338)))))))

(deftest remove-legacy-pulse-tests
  (testing "v49.00-000"
    (impl/test-migrations "v49.00-000" [migrate!]
      (let [user-id (:id (create-raw-user! (mt/random-email)))
            alert-id (first (t2/insert-returning-pks! :pulse {:name            "An Alert"
                                                              :creator_id      user-id
                                                              :dashboard_id    nil
                                                              :collection_id   nil
                                                              :alert_condition "rows"
                                                              :parameters      "[]"
                                                              :created_at      :%now
                                                              :updated_at      :%now}))
            dashboard-id (first (t2/insert-returning-pks! :report_dashboard {:name       "A dashboard"
                                                                             :creator_id user-id
                                                                             :parameters "[]"
                                                                             :created_at :%now
                                                                             :updated_at :%now}))
            dash-subscription-id (first (t2/insert-returning-pks! :pulse {:name            "A dashboard subscription"
                                                                          :creator_id      user-id
                                                                          :dashboard_id    dashboard-id
                                                                          :collection_id   nil
                                                                          :alert_condition "rows"
                                                                          :parameters      "[]"
                                                                          :created_at      :%now
                                                                          :updated_at      :%now}))
            legacy-pulse-id (first (t2/insert-returning-pks! :pulse {:name            "A legacy pulse"
                                                                     :creator_id      user-id
                                                                     :collection_id   nil
                                                                     :alert_condition nil
                                                                     :parameters      "[]"
                                                                     :created_at      :%now
                                                                     :updated_at      :%now}))]
        (migrate!)
        (is (t2/exists? :pulse :id dash-subscription-id))
        (is (t2/exists? :pulse :id alert-id))
        (is (not (t2/exists? :pulse :id legacy-pulse-id)))))))

(deftest no-tiny-int-columns
  (mt/test-driver :mysql
    (testing "All boolean columns in mysql, mariadb should be bit(1)"
      (is (= [{:table_name "DATABASECHANGELOGLOCK" :column_name "LOCKED"}] ;; outlier because this is liquibase's table
             (t2/query
              (format "SELECT table_name, column_name FROM information_schema.columns WHERE data_type LIKE 'tinyint%%' AND table_schema = '%s';"
                      (with-open [conn (-> (mdb/app-db) .getConnection)]
                        (.getCatalog conn)))))))))

(deftest index-database-changelog-test
  (testing "we should have an unique constraint on databasechangelog.(id,author,filename)"
    (impl/test-migrations "v49.00-000" [migrate!]
      (migrate!)
      (is (pos?
             (:count
              (t2/query-one
               (case (mdb/db-type)
                 :postgres "SELECT COUNT(*) as count FROM pg_indexes WHERE
                           tablename = 'databasechangelog' AND indexname = 'idx_databasechangelog_id_author_filename';"
                 :mysql    "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_NAME = 'DATABASECHANGELOG' AND INDEX_NAME = 'idx_databasechangelog_id_author_filename';"
                 ;; h2 has a strange way of naming constraint
                 :h2       "SELECT COUNT(*) as count FROM information_schema.indexes
                           WHERE TABLE_NAME = 'DATABASECHANGELOG' AND INDEX_NAME = 'IDX_DATABASECHANGELOG_ID_AUTHOR_FILENAME_INDEX_1';"))))))))

(deftest enable-public-sharing-default-test
  (testing "enable-public-sharing is not set for new instances"
    (impl/test-migrations "v49.2024-02-09T13:55:26" [migrate!]
      (migrate!)
      (is (nil?
           (t2/select-one-fn :value (t2/table-name :model/Setting) :key "enable-public-sharing")))))

  (testing "enable-public-sharing defaults to false for already-initalized instances"
    (impl/test-migrations "v49.2024-02-09T13:55:26" [migrate!]
      (create-raw-user! (mt/random-email))
      (migrate!)
      (is (= "false"
             (t2/select-one-fn :value (t2/table-name :model/Setting) :key "enable-public-sharing")))))

  (testing "enable-public-sharing remains true if already set"
    (impl/test-migrations "v49.2024-02-09T13:55:26" [migrate!]
      (create-raw-user! (mt/random-email))
      (t2/insert! (t2/table-name :model/Setting) :key "enable-public-sharing" :value "true")
      (migrate!)
      (is (= "true"
             (t2/select-one-fn :value (t2/table-name :model/Setting) :key "enable-public-sharing"))))))

(deftest fix-multiple-revistion-most-recent-test
  (testing "Migrations v49.2024-05-07T10:00:00: Set revision.most_recent = true ensures that there is only one most recent revision per model_id"
    (mt/test-driver :mysql
      (impl/test-migrations "v49.2024-05-07T10:00:00" [migrate!]
        (let [user-id         (:id (create-raw-user! (mt/random-email)))
              old             (t/minus (t/local-date-time) (t/hours 1))
              now             (t/local-date-time)
              rev-dash-1-old  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                       {:model       "dashboard"
                                                        :model_id    1
                                                        :user_id     user-id
                                                        :object      "{}"
                                                        :is_creation true
                                                        :most_recent false
                                                        :timestamp   old})
              rev-dash-1-new  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                       {:model       "dashboard"
                                                        :model_id    1
                                                        :user_id     user-id
                                                        :object      "{}"
                                                        :most_recent true
                                                        :timestamp   now})
              rev-dash-2-old  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                       {:model       "dashboard"
                                                        :model_id    2
                                                        :user_id     user-id
                                                        :object      "{}"
                                                        :is_creation true
                                                        :most_recent true
                                                        :timestamp   old})
              rev-dash-2-new  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                       {:model       "dashboard"
                                                        :model_id    2
                                                        :user_id     user-id
                                                        :object      "{}"
                                                        :most_recent true
                                                        :timestamp   now})
              rev-card-1-old  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                       {:model       "card"
                                                        :model_id    1
                                                        :user_id     user-id
                                                        :object      "{}"
                                                        :is_creation true
                                                        :most_recent false
                                                        :timestamp   now})
              rev-card-1-new  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                       {:model       "card"
                                                        :model_id    1
                                                        :user_id     user-id
                                                        :object      "{}"
                                                        :most_recent true
                                                        :timestamp   now})
              rev-card-2-old  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                       {:model       "card"
                                                        :model_id    2
                                                        :user_id     user-id
                                                        :object      "{}"
                                                        :is_creation true
                                                        :most_recent true
                                                        :timestamp   now})
              rev-card-2-new  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                       {:model       "card"
                                                        :model_id    2
                                                        :user_id     user-id
                                                        :object      "{}"
                                                        ;; both this and the previous one has most recent = true with the same timestamp,
                                                        ;; the one that has higher id will be updated
                                                        :most_recent true
                                                        :timestamp   now})
              ;; test case where there is only one migration per item
              rev-card-3-new  (t2/insert-returning-pk! (t2/table-name :model/Revision)
                                                       {:model       "card"
                                                        :model_id    3
                                                        :user_id     user-id
                                                        :object      "{}"
                                                        :most_recent true
                                                        :timestamp   now})]
         (migrate!)
         (is (= {false #{rev-dash-1-old rev-dash-2-old rev-card-1-old rev-card-2-old}
                 true  #{rev-dash-1-new rev-dash-2-new rev-card-1-new rev-card-2-new rev-card-3-new}}
                (update-vals (group-by :most_recent (t2/select (t2/table-name :model/Revision))) #(set (map :id %))))))))))

(defn- clear-permissions!
  []
  (t2/delete! (t2/table-name :model/Permissions) {:where [:not= :object "/"]})
  (t2/delete! (t2/table-name :model/DataPermissions))
  (t2/delete! :connection_impersonations)
  (t2/delete! :sandboxes))

(deftest data-access-permissions-schema-migration-basic-test
  (testing "Data access permissions are correctly migrated from `permissions` to `data_permissions`"
    (impl/test-migrations "v50.2024-01-10T03:27:30" [migrate!]
      (let [group-id   (first (t2/insert-returning-pks! (t2/table-name PermissionsGroup) {:name "Test Group"}))
            db-id      (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "db"
                                                                                  :engine     "postgres"
                                                                                  :created_at :%now
                                                                                  :updated_at :%now
                                                                                  :details    "{}"}))
            table-id-1 (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                               :name       "Table 1"
                                                                               :created_at :%now
                                                                               :updated_at :%now
                                                                               :schema     "PUBLIC"
                                                                               :active     true}))
            table-id-2 (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                               :name       "Table 2"
                                                                               :created_at :%now
                                                                               :updated_at :%now
                                                                               :schema     "PUBLIC/with\\slash"
                                                                               :active     true}))]
        (testing "Unrestricted data access for a DB"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/db/%d/" db-id)})
          (migrate!)
          (is (= "unrestricted" (t2/select-one-fn :perm_value
                                                  (t2/table-name :model/DataPermissions)
                                                  :db_id db-id :table_id nil :group_id group-id)))
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/data-access"))))

        (testing "Unrestricted not-native data access for a DB"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/db/%d/schema/" db-id)})
          (migrate!)
          (is (= "unrestricted" (t2/select-one-fn :perm_value
                                                  (t2/table-name :model/DataPermissions)
                                                  :db_id db-id :table_id nil :group_id group-id :perm_type "perms/data-access")))
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/data-access"))))

        (testing "Unrestricted data access for a schema"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/db/%d/schema/PUBLIC/" db-id)})
          (migrate!)
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id nil :group_id group-id :perm_type "perms/data-access")))
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/data-access"))))

        (testing "Unrestricted data access for a table"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/db/%d/schema/PUBLIC/table/%d/" db-id table-id-1)})
          (migrate!)
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id nil :group_id group-id :perm_type "perms/data-access")))
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/data-access"))))

        (testing "Query access to a table"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/db/%d/schema/PUBLIC/table/%d/query/" db-id table-id-1)})
          (migrate!)
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id nil :group_id group-id :perm_type "perms/data-access")))
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/data-access"))))

        (testing "Segmented query access to a table - maps to unrestricted data access; sandboxing is determined by the
                                     `sandboxes` table"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/db/%d/schema/PUBLIC/table/%d/query/segmented/" db-id table-id-1)})
          (migrate!)
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id nil :group_id group-id :perm_type "perms/data-access")))
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/data-access"))))

        (testing "No self service database access"
          (clear-permissions!)
          (migrate!)
          (is (= "no-self-service"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id :perm_type "perms/data-access")))
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/data-access"))))

        (testing "Granular table permissions"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/db/%d/schema/PUBLIC\\/with\\\\slash/table/%d/" db-id table-id-2)})
          (migrate!)
          (is (nil?
               (t2/select-one-fn :perm_value
                                 (t2/table-name :model/DataPermissions)
                                 :db_id db-id :table_id nil :group_id group-id :perm_type "perms/data-access")))
          (is (= "no-self-service"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/data-access")))
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-2 :group_id group-id :perm_type "perms/data-access"))))

        (testing "Block permissions for a database"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/block/db/%d/" db-id)})
          (migrate!)
          (is (= "block" (t2/select-one-fn :perm_value
                                           (t2/table-name :model/DataPermissions)
                                           :db_id db-id :table_id nil :group_id group-id :perm_type "perms/data-access")))
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/data-access"))))))))

(deftest native-query-editing-permissions-schema-migration-test
  (testing "Native query editing permissions are correctly migrated from `permissions` to `data_permissions`"
    (impl/test-migrations "v50.2024-01-10T03:27:31" [migrate!]
      (let [group-id (first (t2/insert-returning-pks! (t2/table-name PermissionsGroup) {:name "Test Group"}))
            db-id    (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "db"
                                                                                :engine     "postgres"
                                                                                :created_at :%now
                                                                                :updated_at :%now
                                                                                :details    "{}"}))]
        (testing "Native query editing allowed"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/db/%d/" db-id)})
          (migrate!)
          (is (= "yes" (t2/select-one-fn :perm_value
                                         (t2/table-name :model/DataPermissions)
                                         :db_id db-id :table_id nil :group_id group-id :perm_type "perms/native-query-editing"))))

        (testing "Native query editing explicitly allowed"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/db/%d/native/" db-id)})
          (migrate!)
          (is (= "yes" (t2/select-one-fn :perm_value
                                         (t2/table-name :model/DataPermissions)
                                         :db_id db-id :table_id nil :group_id group-id :perm_type "perms/native-query-editing"))))

        (testing "Native query editing not allowed"
          (clear-permissions!)
          (migrate!)
          (is (= "no" (t2/select-one-fn :perm_value
                                        (t2/table-name :model/DataPermissions)
                                        :db_id db-id :table_id nil :group_id group-id :perm_type "perms/native-query-editing"))))))))

(deftest download-results-permissions-schema-migration-test
  (testing "Download results permissions are correctly migrated from `permissions` to `data_permissions`"
    (impl/test-migrations "v50.2024-01-10T03:27:32" [migrate!]
      (let [group-id   (first (t2/insert-returning-pks! (t2/table-name PermissionsGroup) {:name "Test Group"}))
            db-id      (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "db"
                                                                                  :engine     "postgres"
                                                                                  :created_at :%now
                                                                                  :updated_at :%now
                                                                                  :details    "{}"}))
            table-id-1 (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                               :name       "Table 1"
                                                                               :created_at :%now
                                                                               :updated_at :%now
                                                                               :schema     "PUBLIC"
                                                                               :active     true}))
            table-id-2 (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                               :name       "Table 2"
                                                                               :created_at :%now
                                                                               :updated_at :%now
                                                                               :schema     "PUBLIC"
                                                                               :active     true}))
            table-id-3 (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                               :name       "Table 3"
                                                                               :created_at :%now
                                                                               :updated_at :%now
                                                                               :schema     "PUBLIC"
                                                                               :active     true}))]
        (testing "One-million-rows download access for a DB"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/download/db/%d/" db-id)})
          (migrate!)
          (is (= "one-million-rows" (t2/select-one-fn :perm_value
                                                      (t2/table-name :model/DataPermissions)
                                                      :db_id db-id :table_id nil :group_id group-id :perm_type "perms/download-results")))
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/download-results")))

          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/download/db/%d/schema/" db-id)})
          (migrate!)
          (is (= "one-million-rows" (t2/select-one-fn :perm_value
                                                      (t2/table-name :model/DataPermissions)
                                                      :db_id db-id :table_id nil :group_id group-id :perm_type "perms/download-results")))
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/download-results"))))

        (testing "Ten-thousand-rows download access for a DB"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/download/limited/db/%d/" db-id)})
          (migrate!)
          (is (= "ten-thousand-rows" (t2/select-one-fn :perm_value
                                                       (t2/table-name :model/DataPermissions)
                                                       :db_id db-id :table_id nil :group_id group-id :perm_type "perms/download-results")))
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/download-results")))

          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/download/limited/db/%d/schema/" db-id)})
          (migrate!)
          (is (= "ten-thousand-rows" (t2/select-one-fn :perm_value
                                                       (t2/table-name :model/DataPermissions)
                                                       :db_id db-id :table_id nil :group_id group-id :perm_type "perms/download-results")))
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/download-results"))))

        (testing "No download access for a DB"
          (clear-permissions!)
          (migrate!)
          (is (= "no" (t2/select-one-fn :perm_value
                                        (t2/table-name :model/DataPermissions)
                                        :db_id db-id :table_id nil :group_id group-id :perm_type "perms/download-results")))
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/download-results"))))


        (testing "One-million-rows download access for a table"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/download/db/%d/schema/PUBLIC/table/%d/" db-id table-id-1)})
          (migrate!)
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id nil :group_id group-id :perm_type "perms/download-results")))
          (is (= "one-million-rows"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/download-results"))))

        (testing "One-million-rows download access for a table"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/download/db/%d/schema/PUBLIC/table/%d/" db-id table-id-1)})
          (migrate!)
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id nil :group_id group-id :perm_type "perms/download-results")))
          (is (= "one-million-rows"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/download-results"))))

        (testing "Ten-thousand-rows download access for a table"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/download/limited/db/%d/schema/PUBLIC/table/%d/" db-id table-id-1)})
          (migrate!)
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id nil :group_id group-id :perm_type "perms/download-results")))
          (is (= "ten-thousand-rows"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/download-results"))))

        (testing "Granular table permissions"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) [{:group_id group-id
                                                    :object   (format "/download/db/%d/schema/PUBLIC/table/%d/" db-id table-id-1)}
                                                   {:group_id group-id
                                                    :object   (format "/download/limited/db/%d/schema/PUBLIC/table/%d/" db-id table-id-2)}])
          (migrate!)
          (is (nil?
               (t2/select-one-fn :perm_value
                                 (t2/table-name :model/DataPermissions)
                                 :db_id db-id :table_id nil :group_id group-id)))
          (is (= "one-million-rows"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id)))
          (is (= "ten-thousand-rows"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-2 :group_id group-id)))
          (is (= "no"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-3 :group_id group-id))))))))


(deftest manage-table-metadata-permissions-schema-migration-test
  (testing "Manage table metadata permissions are correctly migrated from `permissions` to `data_permissions`"
    (impl/test-migrations "v50.2024-01-10T03:27:33" [migrate!]
      (let [group-id   (first (t2/insert-returning-pks! (t2/table-name PermissionsGroup) {:name "Test Group"}))
            db-id      (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "db"
                                                                                  :engine     "postgres"
                                                                                  :created_at :%now
                                                                                  :updated_at :%now
                                                                                  :details    "{}"}))
            table-id   (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                               :name       "Table 1"
                                                                               :created_at :%now
                                                                               :updated_at :%now
                                                                               :schema     "PUBLIC"
                                                                               :active     true}))]
        (testing "Manage table metadata access for a DB"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/data-model/db/%d/" db-id)})
          (migrate!)
          (is (= "yes" (t2/select-one-fn :perm_value
                                         (t2/table-name :model/DataPermissions)
                                         :db_id db-id :table_id nil :group_id group-id :perm_type "perms/manage-table-metadata")))
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id :group_id group-id :perm_type "perms/manage-table-metadata"))))

        (testing "No manage table metadata access for a DB"
          (clear-permissions!)
          (migrate!)
          (is (= "no" (t2/select-one-fn :perm_value
                                        (t2/table-name :model/DataPermissions)
                                        :db_id db-id :table_id nil :group_id group-id :perm_type "perms/manage-table-metadata")))
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id :group_id group-id :perm_type "perms/manage-table-metadata"))))

        (testing "Manage table metadata access for a schema"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/data-model/db/%d/schema/PUBLIC/" db-id)})
          (migrate!)
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id nil :group_id group-id :perm_type "perms/manage-table-metadata")))
          (is (= "yes"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id :group_id group-id :perm_type "perms/manage-table-metadata"))))

        (testing "Manage table metadata access for a table"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/data-model/db/%d/schema/PUBLIC/table/%d/" db-id table-id)})
          (migrate!)
          (is (nil? (t2/select-one-fn :perm_value
                                      (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id nil :group_id group-id :perm_type "perms/manage-table-metadata")))
          (is (= "yes"
                 (t2/select-one-fn :perm_value
                                   (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id :group_id group-id :perm_type "perms/manage-table-metadata"))))))))

(deftest manage-database-permissions-schema-migration-test
  (testing "Manage database permissions are correctly migrated from `permissions` to `data_permissions`"
    (impl/test-migrations "v50.2024-01-10T03:27:34" [migrate!]
      (let [group-id   (first (t2/insert-returning-pks! (t2/table-name PermissionsGroup) {:name "Test Group"}))
            db-id      (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "db"
                                                                                  :engine     "postgres"
                                                                                  :created_at :%now
                                                                                  :updated_at :%now
                                                                                  :details    "{}"}))]
        (testing "Manage database permission"
          (clear-permissions!)
          (t2/insert! (t2/table-name Permissions) {:group_id group-id
                                                   :object   (format "/details/db/%d/" db-id)})
          (migrate!)
          (is (= "yes" (t2/select-one-fn :perm_value
                                         (t2/table-name :model/DataPermissions)
                                         :db_id db-id :group_id group-id :perm_type "perms/manage-database"))))

        (testing "No manage database permission"
          (clear-permissions!)
          (migrate!)
          (is (= "no" (t2/select-one-fn :perm_value
                                        (t2/table-name :model/DataPermissions)
                                        :db_id db-id :group_id group-id :perm_type "perms/manage-database"))))))))

(deftest create-internal-user-test
  (testing "The internal user is created if it doesn't already exist"
    (impl/test-migrations "v50.2024-03-28T16:30:35" [migrate!]
      (let [get-users #(t2/query "SELECT * FROM core_user")]
        (is (= [] (get-users)))
        (migrate!)
        (is (=? [{:id               config/internal-mb-user-id
                  :first_name       "Metabase"
                  :last_name        "Internal"
                  :email            "internal@metabase.com"
                  :password         some?
                  :password_salt    some?
                  :is_active        false
                  :is_superuser     false
                  :login_attributes nil
                  :sso_source       nil
                  :type             "internal"
                  :date_joined      some?}]
                (get-users))))))
  (testing "The internal user isn't created again if it already exists"
    (impl/test-migrations "v50.2024-03-28T16:30:35" [migrate!]
      (t2/insert-returning-pks!
       :core_user
       ;; Copied from the old `metabase-enterprise.internal-user` namespace
       {:id               config/internal-mb-user-id
        :first_name       "Metabase"
        :last_name        "Internal"
        :email            "internal@metabase.com"
        :password         (str (random-uuid))
        :password_salt    (str (random-uuid))
        :is_active        false
        :is_superuser     false
        :login_attributes nil
        :sso_source       nil
        :type             "internal"
        :date_joined      :%now})
      (let [get-users    #(t2/query "SELECT * FROM core_user")
            users-before (get-users)]
        (migrate!)
        (is (= users-before (get-users)))))))

(deftest data-permissions-migration-rollback-test
  (testing "Data permissions are correctly rolled back from `data_permissions` to `permissions`"
    (impl/test-migrations ["v50.2024-01-04T13:52:51" "v50.2024-02-19T21:32:04"] [migrate!]
      (let [migrate-up!  (fn []
                           (migrate!)
                           (clear-permissions!))
            group-id     (first (t2/insert-returning-pks! (t2/table-name PermissionsGroup) {:name "Test Group"}))
            db-id        (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "db"
                                                                                    :engine     "postgres"
                                                                                    :created_at :%now
                                                                                    :updated_at :%now
                                                                                    :details    "{}"}))
            table-id     (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                                 :name       "Table 1"
                                                                                 :created_at :%now
                                                                                 :updated_at :%now
                                                                                 :active     true}))
            table-id-2   (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                                 :name       "Table 2"
                                                                                 :created_at :%now
                                                                                 :updated_at :%now
                                                                                 :active     true}))
            insert-perm! (fn [perm-type perm-value & [table-id schema]]
                           (t2/insert! (t2/table-name :model/DataPermissions)
                                       :db_id db-id
                                       :group_id group-id
                                       :table_id table-id
                                       :schema_name schema
                                       :perm_type perm-type
                                       :perm_value perm-value))]
        (migrate-up!)
        (insert-perm! "perms/data-access" "unrestricted")
        (migrate! :down 49)
        (is (= [(format "/db/%d/schema/" db-id)]
               (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/data-access" "block")
        (migrate! :down 49)
        (is (= [(format "/block/db/%d/" db-id)]
               (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/data-access" "no-self-service")
        (migrate! :down 49)
        (is (nil? (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/data-access" "unrestricted" table-id "PUBLIC")
        (migrate! :down 49)
        (is (= [(format "/db/%d/schema/PUBLIC/table/%d/" db-id table-id)]
               (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/data-access" "unrestricted" table-id "schema/with\\slashes")
        (migrate! :down 49)
        (is (= [(format "/db/%d/schema/schema\\/with\\\\slashes/table/%d/" db-id table-id)]
               (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/data-access" "no-self-service" table-id "PUBLIC")
        (migrate! :down 49)
        (is (nil? (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/native-query-editing" "yes")
        (migrate! :down 49)
        (is (= [(format "/db/%d/native/" db-id)]
               (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/native-query-editing" "no")
        (migrate! :down 49)
        (is (nil? (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/download-results" "one-million-rows")
        (migrate! :down 49)
        (is (= [(format "/download/db/%d/" db-id)]
               (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/download-results" "ten-thousand-rows")
        (migrate! :down 49)
        (is (= [(format "/download/limited/db/%d/" db-id)]
               (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/download-results" "no")
        (migrate! :down 49)
        (is (nil? (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/download-results" "one-million-rows" table-id "PUBLIC")
        (insert-perm! "perms/download-results" "no" table-id-2 "PUBLIC")
        (migrate! :down 49)
        (is (= #{(format "/download/db/%d/schema/PUBLIC/table/%d/" db-id table-id)}
               (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/download-results" "ten-thousand-rows" table-id "PUBLIC")
        (insert-perm! "perms/download-results" "no" table-id-2 "PUBLIC")
        (migrate! :down 49)
        (is (= #{(format "/download/limited/db/%d/schema/PUBLIC/table/%d/" db-id table-id)}
               (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        ;; Granular download perms also get limited native download perms if all tables have at least "ten-thousand-rows"
        (migrate-up!)
        (insert-perm! "perms/download-results" "one-million-rows" table-id "PUBLIC")
        (insert-perm! "perms/download-results" "ten-thousand-rows" table-id-2 "PUBLIC")
        (migrate! :down 49)
        (is (= #{(format "/download/db/%d/schema/PUBLIC/table/%d/" db-id table-id)
                 (format "/download/limited/db/%d/schema/PUBLIC/table/%d/" db-id table-id-2)
                 (format "/download/limited/db/%d/native/" db-id)}
               (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/download-results" "no" table-id "PUBLIC")
        (insert-perm! "perms/download-results" "no" table-id-2 "PUBLIC")
        (migrate! :down 49)
        (is (nil? (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/download-results" "one-million-rows" table-id "schema/with\\slashes")
        (insert-perm! "perms/download-results" "no" table-id-2 "PUBLIC")
        (migrate! :down 49)
        (is (= #{(format "/download/db/%d/schema/schema\\/with\\\\slashes/table/%d/" db-id table-id)}
               (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/manage-table-metadata" "yes")
        (migrate! :down 49)
        (is (= [(format "/data-model/db/%d/" db-id)]
               (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/manage-table-metadata" "no")
        (migrate! :down 49)
        (is (nil? (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/manage-table-metadata" "yes" table-id "PUBLIC")
        (migrate! :down 49)
        (is (= [(format "/data-model/db/%d/schema/PUBLIC/table/%d/" db-id table-id)]
               (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/manage-table-metadata" "yes" table-id "schema/with\\slashes")
        (migrate! :down 49)
        (is (= [(format "/data-model/db/%d/schema/schema\\/with\\\\slashes/table/%d/" db-id table-id)]
               (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/manage-table-metadata" "no" table-id "PUBLIC")
        (migrate! :down 49)
        (is (nil? (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/manage-database" "yes")
        (migrate! :down 49)
        (is (= [(format "/details/db/%d/" db-id)]
               (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/manage-database" "no")
        (migrate! :down 49)
        (is (nil? (t2/select-fn-vec :object (t2/table-name :model/Permissions) :group_id group-id)))))))

(deftest cache-config-migration-test
  (testing "Caching config is correctly copied over"
    (impl/test-migrations ["v50.2024-06-12T12:33:07"] [migrate!]
      ;; this peculiar setup is to reproduce #44012, `enable-query-caching` should be unencrypted for the condition
      ;; to hit it
      (t2/insert! :setting [{:key "enable-query-caching", :value (encryption/maybe-encrypt "true")}])
      (encryption-test/with-secret-key "whateverwhatever"
        (t2/insert! :setting [{:key "query-caching-ttl-ratio", :value (encryption/maybe-encrypt "100.4")}
                              {:key "query-caching-min-ttl", :value (encryption/maybe-encrypt "123.4")}]))

      (let [user (create-raw-user! (mt/random-email))
            db   (t2/insert-returning-pk! :metabase_database (-> (mt/with-temp-defaults Database)
                                                                 (update :details json/generate-string)
                                                                 (update :engine str)
                                                                 (assoc :cache_ttl 10)))
            dash (t2/insert-returning-pk! (t2/table-name :model/Dashboard)
                                          {:name       "A dashboard"
                                           :creator_id (:id user)
                                           :created_at :%now
                                           :updated_at :%now
                                           :cache_ttl  20
                                           :parameters ""})
            card (t2/insert-returning-pk! (t2/table-name Card)
                                          {:name                   "Card"
                                           :display                "table"
                                           :dataset_query          "{}"
                                           :visualization_settings "{}"
                                           :cache_ttl              30
                                           :creator_id             (:id user)
                                           :database_id            db
                                           :created_at             :%now
                                           :updated_at             :%now})]

        (encryption-test/with-secret-key "whateverwhatever"
          (migrate! :up))

        (is (=? [{:model    "root"
                  :model_id 0
                  :strategy "ttl"
                  :config   {:multiplier      101
                             :min_duration_ms 124}}
                 {:model    "database"
                  :model_id db
                  :strategy "duration"
                  :config   {:duration 10 :unit "hours"}}
                 {:model    "dashboard"
                  :model_id dash
                  :strategy "duration"
                  :config   {:duration 20 :unit "hours"}}
                 {:model    "question"
                  :model_id card
                  :strategy "duration"
                  :config   {:duration 30 :unit "hours"}}]
                (->> (t2/select :cache_config)
                     (mapv #(update % :config json/decode true))))))))
  (testing "And not copied if caching is disabled"
    (impl/test-migrations ["v50.2024-04-12T12:33:07"] [migrate!]
      (t2/insert! :setting [{:key "enable-query-caching", :value (encryption/maybe-encrypt "false")}
                            {:key "query-caching-ttl-ratio", :value (encryption/maybe-encrypt "100")}
                            {:key "query-caching-min-ttl", :value (encryption/maybe-encrypt "123")}])

      ;; this one to have custom configuration to check they are not copied over
      (t2/insert-returning-pk! :metabase_database (-> (mt/with-temp-defaults Database)
                                                      (update :details json/generate-string)
                                                      (update :engine str)
                                                      (assoc :cache_ttl 10)))
      (migrate!)
      (is (= []
             (t2/select :cache_config))))))

(deftest cache-config-mysql-update-test
  (when (= (mdb/db-type) :mysql)
    (testing "Root cache config for mysql is updated with correct values"
      (encryption-test/with-secret-key "whateverwhatever"
        (impl/test-migrations ["v50.2024-06-12T12:33:07"] [migrate!]
          (t2/insert! :setting [{:key "enable-query-caching", :value (encryption/maybe-encrypt "true")}
                                {:key "query-caching-ttl-ratio", :value (encryption/maybe-encrypt "100.4")}
                                {:key "query-caching-min-ttl", :value (encryption/maybe-encrypt "123.4")}])

          ;; the idea here is that `v50.2024-04-12T12:33:09` during execution with partially encrypted data (see
          ;; `cache-config-migration-test`) instead of throwing an error just silently put zeros in config. If config
          ;; contains zeros, we assume human did not touch it yet and update with existing (decrypted thanks to
          ;; `v50.2024-06-12T12:33:07`) settings
          (t2/insert! :cache_config {:model    "root"
                                     :model_id 0
                                     :strategy "ttl"
                                     :config   (json/encode {:multiplier      0
                                                             :min_duration_ms 0})})
          (migrate!)

          (is (=? {:model    "root"
                   :model_id 0
                   :strategy "ttl"
                   :config {:multiplier      101
                            :min_duration_ms 124}}
                  (-> (t2/select-one :cache_config)
                      (update :config json/decode true)))))))))

(deftest cache-config-old-id-cleanup
  (testing "Cache config migration old id is removed from databasechangelog"
    (impl/test-migrations ["v50.2024-06-28T12:35:50"] [migrate!]
      (let [clog       (with-open [conn (.getConnection (mdb/data-source))]
                         (keyword (liquibase/changelog-table-name conn)))
            last-order (:orderexecuted (t2/select-one clog {:order-by [[:orderexecuted :desc]]}))]
        (t2/insert! clog [{:id            "v50.2024-04-12T12:33:09"
                           :author        "piranha"
                           :filename      "001_update_migrations.yaml"
                           :dateexecuted  :%now
                           :orderexecuted (inc last-order)
                           :exectype      "EXECUTED"}])

        (is (=? {:id            "v50.2024-04-12T12:33:09"
                 :orderexecuted pos?}
                (t2/select-one clog :id "v50.2024-04-12T12:33:09")))

        (migrate!)
        (is (nil? (t2/select-one clog :id "v50.2024-04-12T12:33:09")))))))

(deftest split-data-permissions-migration-test
  (testing "View Data and Create Query permissions are created correctly based on existing data permissions"
    (impl/test-migrations ["v50.2024-02-26T22:15:54" "v50.2024-02-26T22:15:55"] [migrate!]
      (let [group-id   (first (t2/insert-returning-pks! (t2/table-name PermissionsGroup) {:name "Test Group"}))
            db-id      (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "db"
                                                                                  :engine     "postgres"
                                                                                  :created_at :%now
                                                                                  :updated_at :%now
                                                                                  :details    "{}"}))
            table-id-1 (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                               :name       "Table 1"
                                                                               :created_at :%now
                                                                               :updated_at :%now
                                                                               :schema     "PUBLIC"
                                                                               :active     true}))
            table-id-2 (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                               :name       "Table 2"
                                                                               :created_at :%now
                                                                               :updated_at :%now
                                                                               :schema     "PUBLIC"
                                                                               :active     true}))]
        (testing "Unrestricted data access + native query editing"
          (clear-permissions!)
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id
                                                              :perm_type "perms/data-access"
                                                              :perm_value "unrestricted"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id
                                                              :perm_type "perms/native-query-editing"
                                                              :perm_value "yes"})
          (migrate!)
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id :perm_type "perms/view-data")))
          (is (= "query-builder-and-native"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id :perm_type "perms/create-queries"))))

        (testing "Unrestricted data access + no native query editing"
          (clear-permissions!)
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id
                                                              :perm_type "perms/data-access"
                                                              :perm_value "unrestricted"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id
                                                              :perm_type "perms/native-query-editing"
                                                              :perm_value "no"})
          (migrate!)
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id :perm_type "perms/view-data")))
          (is (= "query-builder"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id :perm_type "perms/create-queries"))))

        (testing "No self-service data access + no native query editing"
          (clear-permissions!)
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id
                                                              :perm_type "perms/data-access"
                                                              :perm_value "no-self-service"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id
                                                              :perm_type "perms/native-query-editing"
                                                              :perm_value "no"})
          (migrate!)
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id :perm_type "perms/view-data")))
          (is (= "no"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id :perm_type "perms/create-queries"))))

        (testing "Blocked data access + no native query editing"
          (clear-permissions!)
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id
                                                              :perm_type "perms/data-access"
                                                              :perm_value "block"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id
                                                              :perm_type "perms/native-query-editing"
                                                              :perm_value "no"})
          (migrate!)
          (is (= "blocked"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id :perm_type "perms/view-data")))
          (is (= "no"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id :perm_type "perms/create-queries"))))


        (testing "Granular (table-level) data access"
          (clear-permissions!)
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :table_id table-id-1
                                                              :schema_name "PUBLIC"
                                                              :group_id group-id
                                                              :perm_type "perms/data-access"
                                                              :perm_value "unrestricted"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :table_id table-id-2
                                                              :schema_name "PUBLIC"
                                                              :group_id group-id
                                                              :perm_type "perms/data-access"
                                                              :perm_value "no-self-service"})
          (migrate!)
          ;; Granular data-access permissions always map to DB-level unrestricted view-data permissions
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id :perm_type "perms/view-data")))
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id :perm_type "perms/view-data")))
          (is (= "query-builder"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id :perm_type "perms/create-queries")))
          (is (= "no"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-2 :group_id group-id :perm_type "perms/create-queries"))))))))

(deftest split-data-permissions-legacy-no-self-service-migration-test
  (testing "view-data is set to `legacy-no-self-service` for groups that meet specific conditions"
    (impl/test-migrations ["v50.2024-02-26T22:15:54" "v50.2024-02-26T22:15:55"] [migrate!]
      (let [user-id    (:id (create-raw-user! (mt/random-email)))
            group-id-1 (first (t2/insert-returning-pks! (t2/table-name PermissionsGroup) {:name "Test Group 1"}))
            group-id-2 (first (t2/insert-returning-pks! (t2/table-name PermissionsGroup) {:name "Test Group 2"}))
            _pgm       (t2/insert-returning-pks! (t2/table-name :model/PermissionsGroupMembership)
                                                 {:user_id user-id :group_id group-id-1 :is_group_manager false})
            _pgm       (t2/insert-returning-pks! (t2/table-name :model/PermissionsGroupMembership)
                                                 {:user_id user-id :group_id group-id-2 :is_group_manager false})
            db-id      (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "db"
                                                                                  :engine     "postgres"
                                                                                  :created_at :%now
                                                                                  :updated_at :%now
                                                                                  :details    "{}"}))
            table-id-1 (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                               :name       "Table 1"
                                                                               :created_at :%now
                                                                               :updated_at :%now
                                                                               :schema     "PUBLIC"
                                                                               :active     true}))
            table-id-2 (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                               :name       "Table 2"
                                                                               :created_at :%now
                                                                               :updated_at :%now
                                                                               :schema     "PUBLIC"
                                                                               :active     true}))]
        (testing "No self-service in group 1 and unrestricted in group 2 (normal case)"
          (clear-permissions!)
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id-1
                                                              :perm_type "perms/data-access"
                                                              :perm_value "no-self-service"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id-2
                                                              :perm_type "perms/data-access"
                                                              :perm_value "unrestricted"})
          (migrate!)
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id-1 :perm_type "perms/view-data")))
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id-2 :perm_type "perms/view-data"))))

        (testing "No self-service in group 1 and block in group 2"
          (clear-permissions!)
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id-1
                                                              :perm_type "perms/data-access"
                                                              :perm_value "no-self-service"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id-2
                                                              :perm_type "perms/data-access"
                                                              :perm_value "block"})
          (migrate!)
          (is (= "legacy-no-self-service"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id-1 :perm_type "perms/view-data")))
          (is (= "blocked"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id-2 :perm_type "perms/view-data"))))

        (testing "Granular perms in group 1 and block in group 2"
          (clear-permissions!)
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :table_id table-id-1
                                                              :group_id group-id-1
                                                              :perm_type "perms/data-access"
                                                              :perm_value "no-self-service"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :table_id table-id-2
                                                              :group_id group-id-1
                                                              :perm_type "perms/data-access"
                                                              :perm_value "unrestricted"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id-2
                                                              :perm_type "perms/data-access"
                                                              :perm_value "block"})
          (migrate!)
          (is (= "legacy-no-self-service"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id-1 :perm_type "perms/view-data")))
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-2 :group_id group-id-1 :perm_type "perms/view-data")))
          (is (= "blocked"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id-2 :perm_type "perms/view-data"))))

        (testing "No self-service in group 1 and impersonation in group 2"
          (clear-permissions!)
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id-1
                                                              :perm_type "perms/data-access"
                                                              :perm_value "no-self-service"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id-2
                                                              :perm_type "perms/data-access"
                                                              :perm_value "unrestricted"})
          (t2/insert-returning-pks! :connection_impersonations {:group_id group-id-2 :db_id db-id :attribute "foo"})
          (migrate!)
          (is (= "legacy-no-self-service"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id-1 :perm_type "perms/view-data")))
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id-2 :perm_type "perms/view-data"))))

        (testing "Granular perms in group 1 and impersonation in group 2"
          (clear-permissions!)
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :table_id table-id-1
                                                              :group_id group-id-1
                                                              :perm_type "perms/data-access"
                                                              :perm_value "no-self-service"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :table_id table-id-2
                                                              :group_id group-id-1
                                                              :perm_type "perms/data-access"
                                                              :perm_value "unrestricted"})
          (t2/insert-returning-pks! :connection_impersonations {:group_id group-id-2 :db_id db-id :attribute "foo"})
          (migrate!)
          (is (= "legacy-no-self-service"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id-1 :perm_type "perms/view-data")))
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-2 :group_id group-id-1 :perm_type "perms/view-data"))))

        (testing "No self-service in group 1 and sandbox in group 2"
          (clear-permissions!)
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id-1
                                                              :perm_type "perms/data-access"
                                                              :perm_value "no-self-service"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :group_id group-id-2
                                                              :perm_type "perms/data-access"
                                                              :perm_value "unrestricted"})
          (t2/insert-returning-pks! :sandboxes {:group_id group-id-2 :table_id table-id-1})
          (migrate!)
          (is (= "legacy-no-self-service"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id-1 :perm_type "perms/view-data")))
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id-2 :perm_type "perms/view-data"))))

        (testing "Granular perms in group 1 and sandbox in group 2"
          (clear-permissions!)
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :table_id table-id-1
                                                              :group_id group-id-1
                                                              :perm_type "perms/data-access"
                                                              :perm_value "no-self-service"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :table_id table-id-2
                                                              :group_id group-id-1
                                                              :perm_type "perms/data-access"
                                                              :perm_value "unrestricted"})
          (t2/insert-returning-pks! :sandboxes {:group_id group-id-2 :table_id table-id-1})
          (migrate!)
          (is (= "legacy-no-self-service"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-1 :group_id group-id-1 :perm_type "perms/view-data")))
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id table-id-2 :group_id group-id-1 :perm_type "perms/view-data")))

          (clear-permissions!)

          ;; If the sandbox is for a different table, the group should not get the legacy-no-self-service permission
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :table_id table-id-1
                                                              :group_id group-id-1
                                                              :perm_type "perms/data-access"
                                                              :perm_value "no-self-service"})
          (t2/insert! (t2/table-name :model/DataPermissions) {:db_id db-id
                                                              :table_id table-id-2
                                                              :group_id group-id-1
                                                              :perm_type "perms/data-access"
                                                              :perm_value "unrestricted"})
          (t2/insert-returning-pks! :sandboxes {:group_id group-id-2 :table_id table-id-2})
          (migrate!)
          (is (= "unrestricted"
                 (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                   :db_id db-id :table_id nil :group_id group-id-1 :perm_type "perms/view-data")))
          (is (nil? (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id-1 :group_id group-id-1 :perm_type "perms/view-data")))
          (is (nil? (t2/select-one-fn :perm_value (t2/table-name :model/DataPermissions)
                                      :db_id db-id :table_id table-id-2 :group_id group-id-1 :perm_type "perms/view-data"))))))))

(deftest split-data-permissions-migration-rollback-test
  (impl/test-migrations ["v50.2024-01-04T13:52:51" "v50.2024-02-26T22:15:55"] [migrate!]
    (let [migrate-up!  (fn []
                         (migrate!)
                         (clear-permissions!))
          group-id     (first (t2/insert-returning-pks! (t2/table-name PermissionsGroup) {:name "Test Group"}))
          db-id        (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "db"
                                                                                  :engine     "postgres"
                                                                                  :created_at :%now
                                                                                  :updated_at :%now
                                                                                  :details    "{}"}))
          table-id     (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                               :name       "Table 1"
                                                                               :schema     "PUBLIC"
                                                                               :created_at :%now
                                                                               :updated_at :%now
                                                                               :active     true}))
          insert-perm! (fn [perm-type perm-value & [table-id]]
                         (t2/insert! (t2/table-name :model/DataPermissions)
                                     :db_id db-id
                                     :group_id group-id
                                     :table_id table-id
                                     :schema_name "PUBLIC"
                                     :perm_type perm-type
                                     :perm_value perm-value))]
      (testing "DB-level data access"
        (migrate-up!)
        (insert-perm! "perms/view-data" "unrestricted")
        (insert-perm! "perms/create-queries" "query-builder-and-native")
        (migrate! :down 49)
        (is (= #{(format "/db/%d/schema/" db-id)
                 (format "/db/%d/native/" db-id)}
               (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/view-data" "unrestricted")
        (insert-perm! "perms/create-queries" "query-builder")
        (migrate! :down 49)
        (is (= #{(format "/db/%d/schema/" db-id)}
               (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/view-data" "unrestricted")
        (insert-perm! "perms/create-queries" "no")
        (migrate! :down 49)
        (is (nil? (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/view-data" "legacy-no-self-service")
        (insert-perm! "perms/create-queries" "no")
        (migrate! :down 49)
        (is (nil? (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/view-data" "blocked")
        (insert-perm! "perms/create-queries" "no")
        (migrate! :down 49)
        (is (= #{(format "/block/db/%d/" db-id)}
               (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id))))

      (testing "Table-level access"
        (migrate-up!)
        (insert-perm! "perms/view-data" "unrestricted")
        (insert-perm! "perms/create-queries" "query-builder" table-id)
        (migrate! :down 49)
        (is (= #{(format "/db/%d/schema/PUBLIC/table/%d/" db-id table-id)}
               (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (insert-perm! "perms/view-data" "unrestricted")
        (insert-perm! "perms/create-queries" "no" table-id)
        (migrate! :down 49)
        (is (nil? (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (t2/insert-returning-pks! :sandboxes {:group_id group-id :table_id table-id})
        (insert-perm! "perms/view-data" "unrestricted")
        (insert-perm! "perms/create-queries" "no" table-id)
        (migrate! :down 49)
        (is (= #{(format "/block/db/%d/" db-id)}
               (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id))))

      (testing "Impersonated data access"
        (migrate-up!)
        (t2/insert-returning-pks! :connection_impersonations {:group_id group-id :db_id db-id :attribute "foo"})
        (insert-perm! "perms/view-data" "unrestricted")
        (insert-perm! "perms/create-queries" "query-builder-and-native")
        (migrate! :down 49)
        (is (= #{(format "/db/%d/schema/" db-id)
                 (format "/db/%d/native/" db-id)}
               (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (t2/insert-returning-pks! :connection_impersonations {:group_id group-id :db_id db-id :attribute "foo"})
        (insert-perm! "perms/view-data" "unrestricted")
        (insert-perm! "perms/create-queries" "query-builder")
        (migrate! :down 49)
        (is (= #{(format "/db/%d/schema/" db-id)}
               (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))

        (migrate-up!)
        (t2/insert-returning-pks! :connection_impersonations {:group_id group-id :db_id db-id :attribute "foo"})
        (insert-perm! "perms/view-data" "unrestricted")
        (insert-perm! "perms/create-queries" "no")
        (migrate! :down 49)
        (is (= #{(format "/block/db/%d/" db-id)}
               (t2/select-fn-set :object (t2/table-name :model/Permissions) :group_id group-id)))))))

(deftest sandboxing-rollback-test
  ;; Rollback tests flake on MySQL, so only run on Postgres/H2
  (mt/test-drivers [:postgres :h2]
    (testing "Can we rollback to 49 when sandboxing is configured"
      (impl/test-migrations ["v50.2024-01-10T03:27:29" "v50.2024-06-20T13:21:30"] [migrate!]
        (let [db-id         (first (t2/insert-returning-pks! (t2/table-name Database) {:name       "DB"
                                                                                       :engine     "h2"
                                                                                       :created_at :%now
                                                                                       :updated_at :%now
                                                                                       :details    "{}"}))
              table-id      (first (t2/insert-returning-pks! (t2/table-name Table) {:db_id      db-id
                                                                                    :schema     "SchemaName"
                                                                                    :name       "Table"
                                                                                    :created_at :%now
                                                                                    :updated_at :%now
                                                                                    :active     true}))
              permission-id (t2/insert-returning-pk! (t2/table-name :model/Permissions) {:object "/db/fake-permission/"
                                                                                         :group_id 1})
              _             (t2/query-one {:insert-into :sandboxes
                                           :values      [{:group_id             1
                                                          :table_id             table-id
                                                          :attribute_remappings "{\"foo\", 1}"
                                                          :permission_id        permission-id}]})
              expected        {:group_id             1
                               :table_id             table-id
                               :attribute_remappings "{\"foo\", 1}"}]
          (migrate!)
          (is (=? expected (t2/select-one :sandboxes :table_id table-id)))
          (migrate! :down 49)
          (is (=? expected (t2/select-one :sandboxes :table_id table-id))))))))

(deftest view-count-test
  (testing "report_card.view_count and report_dashboard.view_count should be populated"
    (impl/test-migrations ["v50.2024-04-25T16:29:31" "v50.2024-04-25T16:29:36"] [migrate!]
      (let [user-id 13371338 ; use internal user to avoid creating a real user
            db-id   (t2/insert-returning-pk! :metabase_database {:name       "db"
                                                                 :engine     "postgres"
                                                                 :created_at :%now
                                                                 :updated_at :%now
                                                                 :details    "{}"})
            table-id (t2/insert-returning-pk! :metabase_table {:active     true
                                                               :db_id      db-id
                                                               :name       "a table"
                                                               :created_at :%now
                                                               :updated_at :%now})
            dash-id (t2/insert-returning-pk! :report_dashboard {:name       "A dashboard"
                                                                :creator_id user-id
                                                                :parameters "[]"
                                                                :created_at :%now
                                                                :updated_at :%now})
            card-id (t2/insert-returning-pk! :report_card {:creator_id             user-id
                                                           :database_id            db-id
                                                           :dataset_query          "{}"
                                                           :visualization_settings "{}"
                                                           :display                "table"
                                                           :name                   "a card"
                                                           :created_at             :%now
                                                           :updated_at             :%now})
            _ (t2/insert-returning-pk! :view_log {:user_id   user-id
                                                  :model     "table"
                                                  :model_id  table-id
                                                  :timestamp :%now})
            _ (t2/insert-returning-pk! :view_log {:user_id   user-id
                                                  :model     "card"
                                                  :model_id  card-id
                                                  :timestamp :%now})
            _ (dotimes [_ 2]
                (t2/insert-returning-pk! :view_log {:user_id   user-id
                                                    :model     "dashboard"
                                                    :model_id  dash-id
                                                    :timestamp :%now}))]
        (migrate!)
        (is (= 1 (t2/select-one-fn :view_count :metabase_table table-id)))
        (is (= 1 (t2/select-one-fn :view_count :report_card card-id)))
        (is (= 2 (t2/select-one-fn :view_count :report_dashboard dash-id)))))))

(deftest populate-is-defective-duplicate-test
  (testing "Migration v49.2024-06-27T00:00:02 populates is_defective_duplicate correctly"
    (mt/test-drivers #{:postgres :h2 :mysql}
      (impl/test-migrations ["v49.2024-06-27T00:00:00" "v49.2024-06-27T00:00:08"] [migrate!]
        (when (= driver/*driver* :postgres)
          ;; This is to test what happens when Postgres is rolled back to 48 from 49, and
          ;; then rolled back to 49 again. The rollback to 48 will cause the
          ;; idx_uniq_field_table_id_parent_id_name_2col index to be dropped
          (t2/query "DROP INDEX IF EXISTS idx_uniq_field_table_id_parent_id_name_2col;"))
        (let [db-id (t2/insert-returning-pk! :metabase_database
                                             {:details    "{}"
                                              :created_at :%now
                                              :updated_at :%now
                                              :engine     "h2"
                                              :is_sample  false
                                              :name       "populate-is-defective-duplicate-test-db"})
              table! (fn []
                       (t2/insert-returning-instance! :metabase_table
                                                      {:db_id      db-id
                                                       :name       (mt/random-name)
                                                       :created_at :%now
                                                       :updated_at :%now
                                                       :active     true}))
              field! (fn [table values]
                       (t2/insert-returning-instance! :metabase_field
                                                      (merge {:table_id      (:id table)
                                                              :parent_id     nil
                                                              :base_type     "type/Text"
                                                              :database_type "TEXT"
                                                              :created_at    :%now
                                                              :updated_at    :%now}
                                                             values)))
              earlier #t "2023-01-01T00:00:00"
              later   #t "2024-01-01T00:00:00"
              ; 1.
              table-1 (table!)
              cases-1 {; field                                                                                 ; is_defective_duplicate
                       (field! table-1 {:name "F1", :active true,  :nfc_path "NOT NULL", :created_at later})   false
                       (field! table-1 {:name "F1", :active false, :nfc_path nil,        :created_at earlier}) true}
              ; 2.
              table-2 (table!)
              cases-2 {(field! table-2 {:name "F2", :active true,  :nfc_path nil,        :created_at later})   false
                       (field! table-2 {:name "F2", :active true,  :nfc_path "NOT NULL", :created_at earlier}) true}
              ; 3.
              table-3 (table!)
              cases-3 {(field! table-3 {:name "F3", :active true,  :nfc_path nil,        :created_at earlier}) false
                       (field! table-3 {:name "F3", :active true,  :nfc_path nil,        :created_at later})   true}
              ; 4.
              table-4 (table!)
              cases-4 {(field! table-4 {:name "F4", :active true,  :nfc_path nil,        :created_at earlier}) false
                       (field! table-4 {:name "F4", :active false, :nfc_path nil,        :created_at later})   true
                       (field! table-4 {:name "F4", :active false, :nfc_path "NOT NULL", :created_at earlier}) true
                       (field! table-4 {:name "F4", :active false, :nfc_path "NOT NULL", :created_at later})   true}
              ; 5.
              table-5 (table!)
              field-no-parent-1   (field! table-5 {:name "F5", :active true,  :parent_id nil})
              field-no-parent-2   (field! table-5 {:name "F5", :active false, :parent_id nil})
              field-with-parent-1 (field! table-5 {:name "F5", :active true,  :parent_id (:id field-no-parent-1)})
              field-with-parent-2 (field! table-5 {:name "F5", :active true,  :parent_id (:id field-no-parent-2)})
              cases-5 {field-no-parent-1 false
                       field-no-parent-2 true
                       field-with-parent-1 false
                       field-with-parent-2 false}
              assert-defective-cases (fn [field->defective?]
                                       (doseq [[field-before defective?] field->defective?]
                                         (let [field-after (t2/select-one :metabase_field :id (:id field-before))]
                                           (is (= defective? (:is_defective_duplicate field-after))))))]
          (migrate!)
          (testing "1. Active is 1st preference"
            (assert-defective-cases cases-1))
          (testing "2. NULL nfc_path is 2nd preference"
            (assert-defective-cases cases-2))
          (testing "3. Earlier created_at is 3rd preference"
            (assert-defective-cases cases-3))
          (testing "4. More than two fields can be defective"
            (assert-defective-cases cases-4))
          (testing "5. Fields with different parent_id's are not defective duplicates"
            (assert-defective-cases cases-5))
          (when (not= driver/*driver* :mysql) ; skipping MySQL because of rollback flakes (metabase#37434)
            (testing "Migrate down succeeds"
              (migrate! :down 48))))))))

(deftest is-defective-duplicate-constraint-test
  (testing "Migrations for H2 and MySQL to prevent duplicate fields"
    (impl/test-migrations ["v49.2024-06-27T00:00:00" "v49.2024-06-27T00:00:08"] [migrate!]
      (let [db-id (t2/insert-returning-pk! :metabase_database
                                           {:details    "{}"
                                            :created_at :%now
                                            :updated_at :%now
                                            :engine     "h2"
                                            :is_sample  false
                                            :name       "populate-is-defective-duplicate-test-db"})
            table (t2/insert-returning-instance! :metabase_table
                                                 {:db_id      db-id
                                                  :name       (mt/random-name)
                                                  :created_at :%now
                                                  :updated_at :%now
                                                  :active     true})
            field! (fn [values]
                     (t2/insert-returning-instance! :metabase_field
                                                    (merge {:table_id      (:id table)
                                                            :parent_id     nil
                                                            :base_type     "type/Text"
                                                            :database_type "TEXT"
                                                            :created_at    :%now
                                                            :updated_at    :%now}
                                                           values)))
            field-no-parent-1     (field! {:name "F1", :active true, :parent_id nil})
            field-no-parent-2     (field! {:name "F2", :active true, :parent_id nil})
            defective+field-thunk [; A field is defective if they have non-unique (table, name) but parent_id is NULL
                                   [true  #(field! {:name "F1", :active true, :parent_id nil, :nfc_path "NOT NULL"})]
                                   ; A field is not defective if they have non-unique (table, name) but different parent_id
                                   [false #(field! {:name "F1", :active true, :parent_id (:id field-no-parent-1)})]
                                   [false #(field! {:name "F1", :active true, :parent_id (:id field-no-parent-2)})]]
            fields-to-clean-up    (atom [])
            clean-up-fields!      (fn []
                                    (t2/delete! :metabase_field :id [:in (map :id @fields-to-clean-up)])
                                    (reset! fields-to-clean-up []))]
        (if (= driver/*driver* :postgres)
          (testing "Before the migrations, Postgres does not allow fields to have the same table, name, but different parent_id"
            (doseq [[defective? field-thunk] defective+field-thunk]
              (if defective?
                (is (thrown? Exception (field-thunk)))
                (let [field (field-thunk)]
                  (is (some? field))
                  (swap! fields-to-clean-up conj field)))))
          (testing "Before the migrations, all fields are allowed"
            (doseq [[_ field-thunk] defective+field-thunk]
              (let [field (field-thunk)]
                (is (some? field))
                (swap! fields-to-clean-up conj field)))))
        (migrate!)
        (clean-up-fields!)
        (testing "After the migrations, only allow fields that have the same table, name, but different parent_id"
          (doseq [[defective? field-thunk] defective+field-thunk]
            (if defective?
              (is (thrown? Exception (field-thunk)))
              (let [field (field-thunk)]
                (is (some? field))
                (swap! fields-to-clean-up conj field)))))
        (when (not= driver/*driver* :mysql) ; skipping MySQL because of rollback flakes (metabase#37434)
          (testing "Migrate down succeeds"
            (migrate! :down 48))
          (clean-up-fields!)
          (testing "After rolling back the migrations, all fields are allowed"
            ;; Postgres' unique index is removed on rollback, so we can add defective fields
            ;; This is needed to allow load-from-h2 to Postgres and then downgrading to work
            (testing "After migrating down, all fields are allowed"
              (doseq [[_ field-thunk] defective+field-thunk]
                (is (some? (field-thunk))))))
          (testing "Migrate up again succeeds"
            (migrate!)))))))

(deftest is-defective-duplicate-constraint-load-from-h2
  (testing "Test that you can use load-from-h2 with fields that meet the conditions for is_defective_duplicate=TRUE"
    ;; In this test:
    ;; 1. starting from an H2 app DB, create a field that meets the conditions for is_defective_duplicate=TRUE
    ;; 2. migrate, adding constraints around is_defective_duplicate to prevent duplicates
    ;; 3. test load-from-h2 works successfully by migrating to MySQL or Postgres
    ;; 4. test you can downgrade and upgrade again after that
    (when-let [test-drivers (set/intersection (tx.env/test-drivers) #{:mysql :postgres})]
      (mt/with-driver :h2
        (impl/test-migrations-for-driver!
         :h2
         ["v49.2024-06-27T00:00:00" "v49.2024-06-27T00:00:08"]
         (fn [migrate!]
           (let [db-id (t2/insert-returning-pk! :metabase_database
                                                {:details    "{}"
                                                 :created_at :%now
                                                 :updated_at :%now
                                                 :engine     "h2"
                                                 :is_sample  false
                                                 :name       ""})
                 table (t2/insert-returning-instance! :metabase_table
                                                      {:db_id      db-id
                                                       :name       (mt/random-name)
                                                       :created_at :%now
                                                       :updated_at :%now
                                                       :active     true})
                 field! (fn [values]
                          (t2/insert-returning-instance! :metabase_field
                                                         (merge {:table_id      (:id table)
                                                                 :active        true
                                                                 :parent_id     nil
                                                                 :base_type     "type/Text"
                                                                 :database_type "TEXT"
                                                                 :created_at    :%now
                                                                 :updated_at    :%now}
                                                                values)))
                 _normal-field           (field! {:name "F1", :parent_id nil})
                 create-defective-field! #(field! {:name "F1", :parent_id nil})
                 defective-field-id      (:id (create-defective-field!))]
             (testing "Before the migration, creating a defective duplicate field is allowed"
               (is (some? defective-field-id)))
             (migrate!)
             (testing "After the migration, defective duplicate fields are not allowed"
               (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unique index" (field! {:name "F1", :parent_id nil}))))
             (mt/with-temp-dir [dir nil]
               (let [h2-filename (str dir "/dump")]
                 (dump-to-h2/dump-to-h2! h2-filename) ; this migrates the DB back to the newest and creates a dump
                 (mt/test-drivers test-drivers
                   (let [db-def      {:database-name "field-test-db"}
                         data-source (load-from-h2-test/get-data-source driver/*driver* db-def)]
                     (load-from-h2-test/create-current-database driver/*driver* db-def data-source)
                     (binding [mdb.connection/*application-db* (mdb.connection/application-db driver/*driver* data-source)]
                       (load-from-h2/load-from-h2! h2-filename)
                       (testing "The defective field should still exist after loading from H2"
                         (is (= #{defective-field-id}
                                (t2/select-pks-set (t2/table-name :model/Field) :is_defective_duplicate true)))))
                     (when (not= driver/*driver* :mysql) ; skipping MySQL because of rollback flakes (metabase#37434)
                       (testing "Migrating down to 48 should still work"
                         (migrate! :down 48))
                       (testing "The defective field should still exist after loading from H2 and downgrading"
                         (is (t2/exists? (t2/table-name :model/Field) :id defective-field-id)))
                       (testing "Migrating up again should still work"
                         (migrate!))))))))))))))

(deftest deactivate-defective-duplicates-test
  (testing "Migration v49.2024-06-27T00:00:09"
    (impl/test-migrations ["v49.2024-06-27T00:00:09"] [migrate!]
      (let [db-id         (t2/insert-returning-pk! :metabase_database
                                                   {:details    "{}"
                                                    :created_at :%now
                                                    :updated_at :%now
                                                    :engine     "h2"
                                                    :is_sample  false
                                                    :name       "some_db"})
            table         (t2/insert-returning-instance! :metabase_table
                                                         {:db_id      db-id
                                                          :name       "some_table"
                                                          :created_at :%now
                                                          :updated_at :%now
                                                          :active     true})
            field!        (fn [values]
                            (t2/insert-returning-instance! :metabase_field
                                                           (merge {:table_id      (:id table)
                                                                   :active        true
                                                                   :parent_id     nil
                                                                   :base_type     "type/Text"
                                                                   :database_type "TEXT"
                                                                   :created_at    :%now
                                                                   :updated_at    :%now}
                                                                  values)))
            active+field [[true  (field! {:name "x", :is_defective_duplicate true,  :nfc_path "[\"x\",\"y\"]"})]
                          [true  (field! {:name "x", :is_defective_duplicate false, :nfc_path nil})]
                          [false (field! {:name "x", :is_defective_duplicate true,  :nfc_path nil})]
                          [false (field! {:name "x", :is_defective_duplicate true,  :nfc_path "[\"x\"]"})]]]
        (migrate!)
        (testing "After the migration, fields are deactivated correctly"
          (doseq [[active? field] active+field]
            (is (= active? (t2/select-one-fn :active :metabase_field (:id field))))))))))
