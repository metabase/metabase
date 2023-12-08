(ns metabase-enterprise.advanced-permissions.common-test
  (:require
   [cheshire.core :as json]
   [clojure.core.memoize :as memoize]
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.api.database :as api.database]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.models :refer [Dashboard DashboardCard Database Field FieldValues
                            Permissions Table]]
   [metabase.models.database :as database]
   [metabase.models.field :as field]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.sync :as sync]
   [metabase.sync.concurrent :as sync.concurrent]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.upload-test :as upload-test]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- do-with-all-user-data-perms
  "Implementation for [[with-all-users-data-perms]]"
  [graph f]
  (let [all-users-group-id  (u/the-id (perms-group/all-users))
        current-graph       (get-in (perms/data-perms-graph) [:groups all-users-group-id])]
    (premium-features-test/with-additional-premium-features #{:advanced-permissions}
      (memoize/memo-clear! @#'field/cached-perms-object-set)
      (try
        (mt/with-model-cleanup [Permissions]
          (u/ignore-exceptions
           (@#'perms/update-group-permissions! all-users-group-id graph))
          (f))
        (finally
          (u/ignore-exceptions
           (@#'perms/update-group-permissions! all-users-group-id current-graph)))))))

(defmacro ^:private with-all-users-data-perms
  "Runs `body` with perms for the All Users group temporarily set to the values in `graph`. Also enables the advanced
  permissions feature flag, and clears the (5 second TTL) cache used for Field permissions, for convenience."
  {:style/indent 1}
  [graph & body]
  `(do-with-all-user-data-perms ~graph (fn [] ~@body)))

(deftest current-user-test
  (testing "GET /api/user/current returns additional fields if advanced-permissions is enabled"
    (premium-features-test/with-premium-features #{:advanced-permissions}
      (letfn [(user-permissions [user]
                (-> (mt/user-http-request user :get 200 "user/current")
                    :permissions))]
        (testing "admins should have full advanced permisions"
          (is (= {:can_access_setting      true
                  :can_access_subscription true
                  :can_access_monitoring   true
                  :can_access_data_model   true
                  :is_group_manager        false
                  :can_access_db_details   true}
                 (user-permissions :crowberto))))

        (testing "non-admin users should only have subscriptions enabled by default"
          (is (= {:can_access_setting      false
                  :can_access_subscription true
                  :can_access_monitoring   false
                  :can_access_data_model   false
                  :is_group_manager        false
                  :can_access_db_details   false}
                 (user-permissions :rasta))))

        (testing "can_access_data_model is true if a user has any data model perms"
          (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
            (with-all-users-data-perms {(mt/id) {:data       {:schemas :all :native :write}
                                                 :data-model {:schemas {"PUBLIC" {id-1 :all
                                                                                  id-2 :none
                                                                                  id-3 :none
                                                                                  id-4 :none}}}}}
              (is (partial= {:can_access_data_model true}
                            (user-permissions :rasta))))))

        (testing "can_access_db_details is true if a user has any details perms"
          (with-all-users-data-perms {(mt/id) {:details :yes}}
            (is (partial= {:can_access_db_details true}
                          (user-permissions :rasta)))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Data model permission enforcement                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-databases-test
  (testing "GET /api/database?include_editable_data_model=true"
    (letfn [(get-test-db
              ([] (get-test-db "database?include_editable_data_model=true"))
              ([url] (->> (mt/user-http-request :rasta :get 200 url)
                          :data
                          (filter (fn [db] (= (mt/id) (:id db))))
                          first)))]
      (testing "Sanity check: a non-admin can fetch a DB when they have full data access and data model perms"
        (with-all-users-data-perms {(mt/id) {:data       {:schemas :all :native :write}
                                             :data-model {:schemas :all}}}
          (is (partial= {:id (mt/id)} (get-test-db)))))

      (testing "A non-admin cannot fetch a DB for which they do not have data model perms if
               include_editable_data_model=true"
        (with-all-users-data-perms {(mt/id) {:data       {:schemas :all :native :write}
                                             :data-model {:schemas :none}}}
          (is (= nil (get-test-db)))))

      (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
        (with-all-users-data-perms {(mt/id) {:data       {:schemas :all :native :write}
                                             :data-model {:schemas {"PUBLIC" {id-1 :all
                                                                              id-2 :none
                                                                              id-3 :none
                                                                              id-4 :none}}}}}
          (testing "If a non-admin has data model perms for a single table in a DB, the DB is returned when listing
                   all DBs"
            (is (partial= {:id (mt/id)} (get-test-db))))

          (testing "if include=tables, only tables with data model perms are included"
            (is (= [id-1] (->> (get-test-db "database?include_editable_data_model=true&include=tables")
                               :tables
                               (map :id)))))))))
  (doseq [query-param ["exclude_uneditable_details=true"
                       "include_only_uploadable=true"]]
    (testing (format "GET /api/database?%s" query-param)
      (letfn [(get-test-db
                ([] (get-test-db (str "database?" query-param)))
                ([url] (->> (mt/user-http-request :rasta :get 200 url)
                            :data
                            (filter (fn [db] (= (mt/id) (:id db))))
                            first)))]
        (testing "Sanity check: a non-admin can fetch a DB when they have 'manage' access"
          (with-all-users-data-perms {(mt/id) {:details :yes}}
            (is (partial= {:id (mt/id)} (get-test-db)))))

        (testing "A non-admin cannot fetch a DB for which they do not not have 'manage' access"
          (with-all-users-data-perms {(mt/id) {:details :no}}
            (is (= nil (get-test-db)))))))))

(deftest fetch-database-test
  (testing "GET /api/database/:id?include_editable_data_model=true"
    (testing "A non-admin without data model perms for a DB cannot fetch the DB when include_editable_data_model=true"
      (with-all-users-data-perms {(mt/id) {:data       {:native :write :schemas :all}
                                           :data-model {:schemas :none}}}
        (mt/user-http-request :rasta :get 403 (format "database/%d?include_editable_data_model=true" (mt/id)))))

    (testing "A non-admin with only data model perms for a DB can fetch the DB when include_editable_data_model=true"
      (with-all-users-data-perms {(mt/id) {:data       {:native :none :schemas :none}
                                           :data-model {:schemas :all}}}
        (mt/user-http-request :rasta :get 200 (format "database/%d?include_editable_data_model=true" (mt/id)))))))

(deftest fetch-database-metadata-test
  (testing "GET /api/database/:id/metadata?include_editable_data_model=true"
    (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
      (with-all-users-data-perms {(mt/id) {:data       {:schemas :all :native :write}
                                           :data-model {:schemas {"PUBLIC" {id-1 :all
                                                                            id-2 :none
                                                                            id-3 :none
                                                                            id-4 :none}}}}}
        (let [tables (->> (mt/user-http-request :rasta
                                                :get
                                                200
                                                (format "database/%d/metadata?include_editable_data_model=true" (mt/id)))
                          :tables)]
          (is (= [id-1] (map :id tables))))))


    (testing "A user with data model perms can still fetch a DB name and tables if they have block perms for a DB"
      (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
        (with-all-users-data-perms {(mt/id) {:data       {:schemas :block :native :none}
                                             :data-model {:schemas {"PUBLIC" {id-1 :all
                                                                              id-2 :none
                                                                              id-3 :none
                                                                              id-4 :none}}}}}
          (let [result (mt/user-http-request :rasta
                                             :get
                                             200
                                             (format "database/%d/metadata?include_editable_data_model=true" (mt/id)))]
            (is (= {:id (mt/id) :name (:name (mt/db))} (dissoc result :tables)))
            (is (= [id-1] (map :id (:tables result))))))))))

(deftest fetch-id-fields-test
  (testing "GET /api/database/:id/idfields?include_editable_data_model=true"
    (testing "A non-admin without data model perms for a DB cannot fetch id fields when include_editable_data_model=true"
      (with-all-users-data-perms {(mt/id) {:data       {:native :write :schemas :all}
                                           :data-model {:schemas :none}}}
        (mt/user-http-request :rasta :get 403 (format "database/%d/idfields?include_editable_data_model=true" (mt/id)))))

    (testing "A non-admin with only data model perms for a DB can fetch id fields when include_editable_data_model=true"
      (with-all-users-data-perms {(mt/id) {:data       {:native :none :schemas :none}
                                           :data-model {:schemas :all}}}
        (mt/user-http-request :rasta :get 200 (format "database/%d/idfields?include_editable_data_model=true" (mt/id)))))))

(deftest get-schema-with-advanced-perms-test
  (testing "Permissions: We can verify include_editable_data_model flag works for the `/:id/schema/:schema` endpoint"
    (mt/with-temp [Database {db-id :id} {}
                   Table    t1          {:db_id db-id :schema "schema1" :name "t1"}
                   Table    _t2         {:db_id db-id :schema "schema2"}
                   Table    t3          {:db_id db-id :schema "schema1" :name "t3"}]
      (testing "If a non-admin has data model perms, but no data perms"
        (with-all-users-data-perms {db-id {:data       {:schemas :block :native :none}
                                           :data-model {:schemas :all}}}
          (testing "and if data permissions are revoked, it should be a 403"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 (format "database/%d/schema/%s" db-id "schema1")))))
          (testing "and if include_editable_data_model=true and data permissions are revoked, it should return values"
            (is (= ["t1" "t3"]
                   (map :name (mt/user-http-request :rasta :get 200 (format "database/%d/schema/%s" db-id "schema1")
                                                    :include_editable_data_model true)))))))

      (testing "If include_editable_data_model=true and a non-admin does not have data model perms, it should respond
                with a 404"
        (with-all-users-data-perms {db-id {:data       {:schemas :block :native :none}
                                           :data-model {:schemas :none}}}
          (is (= "Not found."
                 (mt/user-http-request :rasta :get 404 (format "database/%d/schema/%s" db-id "schema1")
                                       :include_editable_data_model true)))))

      (testing "If include_editable_data_model=true and a non-admin has data model perms for a single table in a schema,
                the table is returned"
        (with-all-users-data-perms {db-id {:data       {:schemas :block :native :none}
                                           :data-model {:schemas {"schema1" {(u/the-id t1) :all
                                                                             (u/the-id t3) :none}}}}}
          (is (= ["t1"]
                 (map :name (mt/user-http-request :rasta :get 200 (format "database/%d/schema/%s" db-id "schema1")
                                                  :include_editable_data_model true)))))))))

(deftest get-schema-with-empty-name-and-advanced-perms-test
  (testing "Permissions: We can verify include_editable_data_model flag works for the `/:id/schema/` endpoint"
    (mt/with-temp [Database {db-id :id} {}
                   Table    t1 {:db_id db-id :schema nil :name "t1"}
                   Table    _t2 {:db_id db-id :schema "public"}
                   Table    t3 {:db_id db-id :schema "" :name "t3"}]
      (with-all-users-data-perms {db-id {:data       {:schemas :block :native :none}
                                         :data-model {:schemas :all}}}
        (perms/revoke-data-perms! (perms-group/all-users) db-id)
        (testing "If data permissions are revoked, it should be a 403"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (format "database/%d/schema/" db-id)))))
        (testing "If include_editable_data_model=true and data permissions are revoked, it should return tables with both
                  `nil` and \"\" as its schema"
          (is (= ["t1" "t3"]
                 (map :name (mt/user-http-request :rasta :get 200 (format "database/%d/schema/" db-id)
                                                  :include_editable_data_model true))))))

      (testing "If include_editable_data_model=true and a non-admin does not have data model perms, it should respond
                with a 404"
        (with-all-users-data-perms {db-id {:data       {:schemas :block :native :none}
                                           :data-model {:schemas :none}}}
          (is (= "Not found."
                 (mt/user-http-request :rasta :get 404 (format "database/%d/schema/" db-id)
                                       :include_editable_data_model true)))))

      (testing "If include_editable_data_model=true and a non-admin has data model perms for a single table in an empty
                string schema, it should return the table"
        (with-all-users-data-perms {db-id {:data       {:schemas :block :native :none}
                                           :data-model {:schemas {"" {(u/the-id t1) :all
                                                                      (u/the-id t3) :none}}}}}
          (is (= ["t1"]
                 (map :name (mt/user-http-request :rasta :get 200 (format "database/%d/schema/" db-id)
                                                  :include_editable_data_model true)))))))))

(deftest get-schemas-with-advanced-perms-test
  (testing "Permissions: We can verify include_editable_data_model flag works for the `/:id/:schemas` endpoint"
    (mt/with-temp [Database {db-id :id} {}
                   Table    t1 {:db_id db-id, :schema "schema1", :name "t1"}
                   Table    _t2 {:db_id db-id, :schema "schema2"}
                   Table    _t3 {:db_id db-id, :schema "schema1", :name "t3"}]
      (testing "If a non-admin has data model perms, but no data perms"
        (with-all-users-data-perms {db-id {:data       {:schemas :block :native :none}
                                           :data-model {:schemas :all}}}
          (testing "if include_editable_data_model=nil, it should be a 403"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 (format "database/%d/schemas" db-id)))))
          (testing "and if include_editable_data_model=true, it should return values"
            (is (= ["schema1" "schema2"]
                   (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id)
                                         :include_editable_data_model true))))
          (testing "and if the database doesn't exist, it should be a 404"
            (is (= "Not found."
                   (mt/user-http-request :rasta :get 404 (format "database/%d/schemas" Integer/MAX_VALUE)
                                         :include_editable_data_model true))))))
      (testing "If include_editable_data_model=true and a non-admin does not have data model perms, it should return []"
        (with-all-users-data-perms {db-id {:data       {:schemas :block :native :none}
                                           :data-model {:schemas :none}}}
          (is (= []
                 (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id)
                                       :include_editable_data_model true)))))
      (testing "If include_editable_data_model=true and a non-admin has data model perms for a schema,
                  it should return the schema"
        (with-all-users-data-perms {db-id {:data       {:schemas :block :native :none}
                                           :data-model {:schemas {"schema1" :all}}}}
          (is (= ["schema1"]
                 (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id)
                                       :include_editable_data_model true)))))
      (testing "If include_editable_data_model=true and a non-admin has data model perms for a single table in a schema,
                  it should return the schema"
        (with-all-users-data-perms {db-id {:data       {:schemas :block :native :none}
                                           :data-model {:schemas {"schema1" {(u/the-id t1) :all}}}}}
          (is (= ["schema1"]
                 (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id)
                                       :include_editable_data_model true))))))))

(deftest get-field-hydrated-target-with-advanced-perms-test
  (testing "GET /api/field/:id"
    (mt/with-temp [Database {db-id :id} {}
                   Table    table1 {:db_id db-id, :schema "schema1"}
                   Table    table2 {:db_id db-id, :schema "schema2"}
                   Field    fk-field {:table_id (:id table1)}
                   Field    field {:table_id           (:id table2)
                                   :semantic_type      :type/FK
                                   :fk_target_field_id (:id fk-field)}]
      (let [expected-target (-> fk-field
                                (update :base_type u/qualified-name)
                                (update :visibility_type u/qualified-name))
            get-field       (fn []
                              (mt/user-http-request :rasta :get 200 (format "field/%d?include_editable_data_model=true" (:id field))))]
        (testing "target should be hydrated if a non-admin has data model perms for the DB"
          (with-all-users-data-perms {db-id {:data-model {:schemas :all}}}
            (is (= expected-target
                   (:target (get-field))))))
        (testing "target should not be hydrated if a non-admin does not have data model perms for the target's schema"
          (with-all-users-data-perms {db-id {:data-model {:schemas {"schema1" :none
                                                                    "schema2" :all}}}}
            (is (nil? (:target (get-field))))))
        (testing "target should not be hydrated if a non-admin does not have data model perms for the target's table"
          (with-all-users-data-perms {db-id {:data-model {:schemas {"schema1" {(:id table1) :none}
                                                                    "schema2" {(:id table2) :all}}}}}
            (is (nil? (:target (get-field))))))
        (testing "target should be hydrated if a non-admin does have data model perms for the target's table"
          (with-all-users-data-perms {db-id {:data-model {:schemas {"schema1" {(:id table1) :all}
                                                                    "schema2" {(:id table2) :all}}}}}
            (is (= expected-target
                   (:target (get-field))))))))))

(deftest update-field-hydrated-target-with-advanced-perms-test
  (testing "PUT /api/field/:id"
    (mt/with-temp [Database {db-id :id} {}
                   Table    table1 {:db_id db-id, :schema "schema1"}
                   Table    table2 {:db_id db-id, :schema "schema2"}
                   Table    table3 {:db_id db-id, :schema "schema3"}
                   Field    fk-field-1 {:table_id (:id table1)}
                   Field    fk-field-2 {:table_id (:id table2)}
                   Field    field {:table_id           (:id table3)
                                   :semantic_type      :type/FK
                                   :fk_target_field_id (:id fk-field-1)}]
      (let [expected-target (-> fk-field-2
                                (update :base_type u/qualified-name)
                                (update :visibility_type u/qualified-name))
            update-target   (fn []
                              (mt/user-http-request :rasta :put 200 (format "field/%d" (:id field)) (assoc field :fk_target_field_id (:id fk-field-2))))]
        (testing "target should be hydrated if a non-admin has data model perms for the DB"
          (with-all-users-data-perms {db-id {:data-model {:schemas :all}}}
            (is (= expected-target
                   (:target (update-target))))))
        (testing "target should not be hydrated if a non-admin does not have data model perms for the target's schema"
          (with-all-users-data-perms {db-id {:data-model {:schemas {"schema1" :none
                                                                    "schema2" :none
                                                                    "schema3" :all}}}}
            (is (nil? (:target (update-target))))))
        (testing "target should not be hydrated if a non-admin does not have data model perms for the target's table"
          (with-all-users-data-perms {db-id {:data-model {:schemas {"schema1" {(:id table1) :all}
                                                                    "schema2" {(:id table2) :none}
                                                                    "schema3" {(:id table3) :all}}}}}
            (is (nil? (:target (update-target))))))
        (testing "target should be hydrated if a non-admin does have data model perms for the target's table"
          (with-all-users-data-perms {db-id {:data-model {:schemas {"schema1" {(:id table1) :none}
                                                                    "schema2" {(:id table2) :all}
                                                                    "schema3" {(:id table3) :all}}}}}
            (is (= expected-target
                   (:target (update-target))))))))))

(deftest update-field-test
  (t2.with-temp/with-temp [Field {field-id :id, table-id :table_id} {:name "Field "}]
    (let [{table-id :id, schema :schema, db-id :db_id} (t2/select-one Table :id table-id)]
      (testing "PUT /api/field/:id"
        (let [endpoint (format "field/%d" field-id)]
          (testing "a non-admin cannot update field metadata if the advanced-permissions feature flag is not present"
            (with-all-users-data-perms {db-id {:data-model {:schemas {schema {table-id :all}}}}}
              (premium-features-test/with-premium-features #{}
                (mt/user-http-request :rasta :put 403 endpoint {:name "Field Test 4"}))))

          (testing "a non-admin cannot update field metadata if they have no data model permissions for the DB"
            (with-all-users-data-perms {db-id {:data-model {:schemas :none}}}
              (mt/user-http-request :rasta :put 403 endpoint {:name "Field Test 2"})))

          (testing "a non-admin cannot update field metadata if they only have data model permissions for other schemas"
            (with-all-users-data-perms {db-id {:data-model {:schemas {schema             :none
                                                                      "different schema" :all}}}}

              (mt/user-http-request :rasta :put 403 endpoint {:name "Field Test 2"})))

          (testing "a non-admin cannot update field metadata if they only have data model permissions for other tables"
            (with-all-users-data-perms {db-id {:data-model {:schemas {schema {table-id       :none
                                                                              (inc table-id) :all}}}}}
              (mt/user-http-request :rasta :put 403 endpoint {:name "Field Test 2"})))

          (testing "a non-admin can update field metadata if they have data model perms for the DB"
            (with-all-users-data-perms {db-id {:data-model {:schemas :all}}}
              (mt/user-http-request :rasta :put 200 endpoint {:name "Field Test 2"})))

          (testing "a non-admin can update field metadata if they have data model perms for the schema"
            (with-all-users-data-perms {db-id {:data-model {:schemas {schema :all}}}}
              (mt/user-http-request :rasta :put 200 endpoint {:name "Field Test 3"})))

          (testing "a non-admin can update field metadata if they have data model perms for the table"
            (with-all-users-data-perms {db-id {:data-model {:schemas {schema {table-id :all}}}}}
              (mt/user-http-request :rasta :put 200 endpoint {:name "Field Test 3"})))))

      (testing "POST /api/field/:id/rescan_values"
        (testing "A non-admin can trigger a rescan of field values if they have data model perms for the table"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {schema {table-id :none}}}}}
            (mt/user-http-request :rasta :post 403 (format "field/%d/rescan_values" field-id)))

          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {schema {table-id :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/rescan_values" field-id))))

        (testing "A non-admin with no data access can trigger a re-scan of field values if they have data model perms"
          (t2/delete! FieldValues :field_id (mt/id :venues :price))
          (is (= nil (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))
          (with-all-users-data-perms {(mt/id) {:data       {:schemas :block :native :none}
                                               :data-model {:schemas {"PUBLIC" {(mt/id :venues) :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/rescan_values" (mt/id :venues :price))))
          (is (= [1 2 3 4] (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))))

      (testing "POST /api/field/:id/discard_values"
        (testing "A non-admin can discard field values if they have data model perms for the table"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {schema {table-id :none}}}}}
            (mt/user-http-request :rasta :post 403 (format "field/%d/discard_values" field-id)))

          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {schema {table-id :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/discard_values" field-id))))

        (testing "A non-admin with no data access can discard field values if they have data model perms"
          (is (= [1 2 3 4] (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))
          (with-all-users-data-perms {(mt/id) {:data       {:schemas :block :native :none}
                                               :data-model {:schemas {"PUBLIC" {(mt/id :venues) :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/discard_values" (mt/id :venues :price))))
          (is (= nil (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price)))))))))

(deftest get-field-with-advanced-perms-test
  (testing "GET /api/field/:id?include_editable_data_model=true"
    (testing "A non-admin can fetch a field when they have data model perms if include_editable_data_model=true"
      (with-all-users-data-perms {(mt/id) {:data       {:schemas :block :native :none}
                                           :data-model {:schemas :all}}}
        (is (partial= {:id (mt/id :users :name)}
                      (mt/user-http-request :rasta :get 200 (format "field/%d?include_editable_data_model=true" (mt/id :users :name)))))))
    (with-all-users-data-perms {(mt/id) {:data       {:schemas :all :native :write}
                                         :data-model {:schemas {"PUBLIC" {(mt/id :categories) :all
                                                                          (mt/id :users)      :none}}}}}
      (testing "A non-admin can fetch a field for which they have data model perms if include_editable_data_model=true"
        (is (partial= {:id (mt/id :categories :name)}
                      (mt/user-http-request :rasta :get 200 (format "field/%d?include_editable_data_model=true" (mt/id :categories :name))))))
      (testing "A non-admin cannot fetch a field for which they do not have data model perms if include_editable_data_model=true"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (format "field/%d?include_editable_data_model=true" (mt/id :users :name)))))))))

(deftest update-table-test
  (t2.with-temp/with-temp [Table {table-id :id} {:db_id (mt/id) :schema "PUBLIC"}]
    (testing "PUT /api/table/:id"
      (let [endpoint (format "table/%d" table-id)]
        (testing "a non-admin cannot update table metadata if the advanced-permissions feature flag is not present"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas :all}}}
            (premium-features-test/with-premium-features #{}
              (mt/user-http-request :rasta :put 403 endpoint {:name "Table Test 2"}))))

        (testing "a non-admin cannot update table metadata if they have no data model permissions for the DB"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas :none}}}
            (mt/user-http-request :rasta :put 403 endpoint {:name "Table Test 2"})))

        (testing "a non-admin cannot update table metadata if they only have data model permissions for other schemas"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC"           :none
                                                                      "different schema" :all}}}}
            (mt/user-http-request :rasta :put 403 endpoint {:name "Table Test 2"})))

        (testing "a non-admin cannot update table metadata if they only have data model permissions for other tables"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id       :none
                                                                                (inc table-id) :all}}}}}
            (mt/user-http-request :rasta :put 403 endpoint {:name "Table Test 2"})))

        (testing "a non-admin can update table metadata if they have data model perms for the DB"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas :all}}}
            (mt/user-http-request :rasta :put 200 endpoint {:name "Table Test 2"})))

        (testing "a non-admin can update table metadata if they have data model perms for the schema"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" :all}}}}
            (mt/user-http-request :rasta :put 200 endpoint {:name "Table Test 3"})))

        (testing "a non-admin can update table metadata if they have data model perms for the table"
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
            (mt/user-http-request :rasta :put 200 endpoint {:name "Table Test 3"})))))

    (testing "POST /api/table/:id/rescan_values"
      (testing "A non-admin can trigger a rescan of field values if they have data model perms for the table"
        (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :none}}}}}
          (mt/user-http-request :rasta :post 403 (format "table/%d/rescan_values" table-id)))

        (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
          (mt/user-http-request :rasta :post 200 (format "table/%d/rescan_values" table-id))))

      (testing "A non-admin with no data access can trigger a re-scan of field values if they have data model perms"
        (t2/delete! FieldValues :field_id (mt/id :venues :price))
        (is (= nil (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))
        (with-redefs [sync.concurrent/submit-task (fn [task] (task))]
          (with-all-users-data-perms {(mt/id) {:data       {:schemas :block :native :none}
                                               :data-model {:schemas {"PUBLIC" {(mt/id :venues) :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "table/%d/rescan_values" (mt/id :venues)))))
        (is (= [1 2 3 4] (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))))

    (testing "POST /api/table/:id/discard_values"
      (testing "A non-admin can discard field values if they have data model perms for the table"
        (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :none}}}}}
          (mt/user-http-request :rasta :post 403 (format "table/%d/discard_values" table-id)))

        (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
          (mt/user-http-request :rasta :post 200 (format "table/%d/discard_values" table-id)))))

    (testing "POST /api/table/:id/fields/order"
      (testing "A non-admin can set a custom field ordering if they have data model perms for the table"
        (mt/with-temp [Field {field-1-id :id} {:table_id table-id}
                       Field {field-2-id :id} {:table_id table-id}]
          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :none}}}}}
            (mt/user-http-request :rasta :put 403 (format "table/%d/fields/order" table-id)
                                  {:request-options {:body (json/encode [field-2-id field-1-id])}}))

          (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
            (mt/user-http-request :rasta :put 200 (format "table/%d/fields/order" table-id)
                                  {:request-options {:body (json/encode [field-2-id field-1-id])}})))))))

(deftest audit-log-generated-when-table-manual-scan
  (t2.with-temp/with-temp [Table {table-id :id} {:db_id (mt/id) :schema "PUBLIC"}]
    (testing "An audit log entry is generated when a manually triggered re-scan occurs"
      (premium-features-test/with-additional-premium-features #{:audit-app}
        (with-all-users-data-perms {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
          (mt/user-http-request :rasta :post 200 (format "table/%d/rescan_values" table-id))))
      (is (= table-id (:model_id (mt/latest-audit-log-entry :table-manual-scan))))
      (is (= table-id (-> (mt/latest-audit-log-entry :table-manual-scan) :details :id))))))

(deftest fetch-table-test
  (testing "GET /api/table/:id"
    (t2.with-temp/with-temp [Table {table-id :id} {:db_id (mt/id) :schema "PUBLIC"}]
      (testing "A non-admin without self-service perms for a table cannot fetch the table normally"
        (with-all-users-data-perms {(mt/id) {:data {:native :none :schemas :none}}}
          (mt/user-http-request :rasta :get 403 (format "table/%d?include_editable_data_model=true" table-id))))

      (testing "A non-admin without self-service perms for a table can fetch the table if they have data model perms for
               the DB"
        (with-all-users-data-perms {(mt/id) {:data       {:native :none :schemas :none}
                                             :data-model {:schemas :all}}}
          (mt/user-http-request :rasta :get 200 (format "table/%d?include_editable_data_model=true" table-id))))

      (testing "A non-admin without self-service perms for a table can fetch the table if they have data model perms for
               the schema"
        (with-all-users-data-perms {(mt/id) {:data       {:native :none :schemas :none}
                                             :data-model {:schemas {"PUBLIC" :all}}}}
          (mt/user-http-request :rasta :get 200 (format "table/%d?include_editable_data_model=true" table-id))))

      (testing "A non-admin without self-service perms for a table can fetch the table if they have data model perms for
               the table"
        (with-all-users-data-perms {(mt/id) {:data       {:native :none :schemas :none}
                                             :data-model {:schemas {"PUBLIC" {table-id :all}}}}}
          (mt/user-http-request :rasta :get 200 (format "table/%d?include_editable_data_model=true" table-id)))))))

(deftest fetch-query-metadata-test
  (testing "GET /api/table/:id/query_metadata?include_editable_data_model=true"
    (t2.with-temp/with-temp [Table {table-id :id} {:db_id (mt/id) :schema "PUBLIC"}]
      (testing "A non-admin without data model perms for a table cannot fetch the query metadata when
               include_editable_data_model=true"
        (with-all-users-data-perms {(mt/id) {:data       {:native :write :schemas :all}
                                             :data-model {:schemas :none}}}
          (mt/user-http-request :rasta :get 403
                                (format "table/%d/query_metadata?include_editable_data_model=true" table-id))))

      (testing "A non-admin with only data model perms for a table can fetch the query metadata when
               include_editable_data_model=true"
        (with-all-users-data-perms {(mt/id) {:data       {:native :none :schemas :none}
                                             :data-model {:schemas :all}}}
          (mt/user-http-request :rasta :get 200
                                (format "table/%d/query_metadata?include_editable_data_model=true" table-id)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                  Database details permission enforcement                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-database-test
  (testing "PUT /api/database/:id"
    (t2.with-temp/with-temp [Database {db-id :id}]
      (testing "A non-admin cannot update database metadata if the advanced-permissions feature flag is not present"
        (with-all-users-data-perms {db-id {:details :yes}}
          (premium-features-test/with-premium-features #{}
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (format "database/%d" db-id) {:name "Database Test"}))))))

      (testing "A non-admin cannot update database metadata if they do not have DB details permissions"
        (with-all-users-data-perms {db-id {:details :no}}
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (format "database/%d" db-id) {:name "Database Test"})))))

      (testing "A non-admin can update database metadata if they have DB details permissions"
        (with-all-users-data-perms {db-id {:details :yes}}
          (is (=? {:id db-id}
                  (mt/user-http-request :rasta :put 200 (format "database/%d" db-id) {:name "Database Test"}))))))))

(deftest delete-database-test
  (t2.with-temp/with-temp [Database {db-id :id}]
    (testing "A non-admin cannot delete a database even if they have DB details permissions"
      (with-all-users-data-perms {db-id {:details :yes}}
        (mt/user-http-request :rasta :delete 403 (format "database/%d" db-id))))))

(deftest db-operations-test
  (mt/with-temp! [Database    {db-id :id}     {:engine "h2", :details (:details (mt/db))}
                  Table       {table-id :id}  {:db_id db-id}
                  Field       {field-id :id}  {:table_id table-id}
                  FieldValues {values-id :id} {:field_id field-id, :values [1 2 3 4]}]
    (with-redefs [api.database/*rescan-values-async* false]
      (testing "A non-admin can trigger a sync of the DB schema if they have DB details permissions"
        (with-all-users-data-perms {db-id {:details :yes}}
          (mt/user-http-request :rasta :post 200 (format "database/%d/sync_schema" db-id))))

      (testing "A non-admin can discard saved field values if they have DB details permissions"
        (with-all-users-data-perms {db-id {:details :yes}}
          (mt/user-http-request :rasta :post 200 (format "database/%d/discard_values" db-id))))

      (testing "A non-admin with no data access can discard field values if they have DB details perms"
        (t2/insert! FieldValues :id values-id :field_id field-id :values [1 2 3 4])
        (with-all-users-data-perms {db-id {:data    {:schemas :block :native :none}
                                           :details :yes}}
          (mt/user-http-request :rasta :post 200 (format "database/%d/discard_values" db-id)))
        (is (= nil (t2/select-one-fn :values FieldValues, :field_id field-id)))
        (mt/user-http-request :crowberto :post 200 (format "database/%d/rescan_values" db-id)))

      ;; Use test database for rescan_values tests so we can verify that scan actually succeeds
      (testing "A non-admin can trigger a re-scan of field values if they have DB details permissions"
        (with-all-users-data-perms {(mt/id) {:details :yes}}
          (mt/user-http-request :rasta :post 200 (format "database/%d/rescan_values" (mt/id)))))

      (testing "A non-admin with no data access can trigger a re-scan of field values if they have DB details perms"
        (t2/delete! FieldValues :field_id (mt/id :venues :price))
        (is (= nil (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))
        (with-all-users-data-perms {(mt/id) {:data   {:schemas :block :native :none}
                                             :details :yes}}
          (mt/user-http-request :rasta :post 200 (format "database/%d/rescan_values" (mt/id))))
        (is (= [1 2 3 4] (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))))))

(deftest fetch-db-test
  (t2.with-temp/with-temp [Database {db-id :id}]
    (testing "A non-admin without self-service perms for a DB cannot fetch the DB normally"
      (with-all-users-data-perms {db-id {:data {:native :none :schemas :none}}}
        (mt/user-http-request :rasta :get 403 (format "database/%d?exclude_uneditable_details=true" db-id))))

    (testing "A non-admin without self-service perms for a DB can fetch the DB if they have DB details permissions"
      (with-all-users-data-perms {db-id {:data    {:native :none :schemas :none}
                                         :details :yes}}
        (mt/user-http-request :rasta :get 200 (format "database/%d?exclude_uneditable_details=true" db-id))))

    (testing "A non-admin with block perms for a DB can fetch the DB if they have DB details permissions"
      (with-all-users-data-perms {db-id {:data    {:native :none :schemas :block}
                                         :details :yes}}
        (mt/user-http-request :rasta :get 200 (format "database/%d?exclude_uneditable_details=true" db-id))))

    (testing "The returned database contains a :details field for a user with DB details permissions"
      (with-all-users-data-perms {db-id {:data    {:native :none :schemas :block}
                                         :details :yes}}
        (is (partial= {:details {}}
                      (mt/user-http-request :rasta :get 200 (format "database/%d?exclude_uneditable_details=true" db-id))))))))

(deftest actions-test
  (mt/with-temp-copy-of-db
    (mt/with-actions-test-data
      (mt/with-actions [{:keys [action-id model-id]} {}]
        (testing "Executing dashcard with action"
          (mt/with-temp [Dashboard {dashboard-id :id} {}
                         DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                          :action_id action-id
                                                          :card_id model-id}]
            (let [execute-path (format "dashboard/%s/dashcard/%s/execute"
                                       dashboard-id
                                       dashcard-id)]
              (testing "Fails with access to the DB blocked"
                (with-all-users-data-perms {(u/the-id (mt/db)) {:data    {:native :none :schemas :block}
                                                                :details :yes}}
                  (mt/with-actions-enabled
                    (is (partial= {:message "You don't have permissions to do that."}
                                  (mt/user-http-request :rasta :post 403 execute-path
                                                        {:parameters {"id" 1}}))))))
              (testing "Works with access to the DB not blocked"
                (mt/with-actions-enabled
                  (is (= {:rows-affected 1}
                         (mt/user-http-request :rasta :post 200 execute-path
                                               {:parameters {"id" 1}}))))))))))))

(deftest settings-managers-can-have-uploads-db-access-revoked
  (perms/grant-application-permissions! (perms-group/all-users) :setting)
  (testing "Upload DB can be set with the right permission"
    (with-all-users-data-perms {(mt/id) {:details :yes}}
      (mt/user-http-request :rasta :put 204 "setting/" {:uploads-database-id (mt/id)})))
  (testing "Upload DB cannot be set without the right permission"
    (with-all-users-data-perms {(mt/id) {:details :no}}
      (mt/user-http-request :rasta :put 403 "setting/" {:uploads-database-id (mt/id)})))
  (perms/revoke-application-permissions! (perms-group/all-users) :setting))

(deftest upload-csv-test
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :uploads) :mysql) ; MySQL doesn't support schemas
    (testing "Uploads should be blocked without data access"
      (mt/with-empty-db
        (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
          ;; Create not_public schema
          (jdbc/execute! conn-spec "CREATE SCHEMA \"not_public\"; CREATE TABLE \"not_public\".\"table_name\" (id INTEGER)"))
        (sync/sync-database! (mt/db))
        (let [db-id    (u/the-id (mt/db))
              table-id (t2/select-one-pk :model/Table :db_id db-id)
              upload-csv! (fn []
                            (upload-test/upload-example-csv! {:grant-permission? false
                                                              :schema-name       "not_public"
                                                              :table-prefix      "uploaded_magic_"}))]
          (doseq [[schema-perms can-upload?] {:all            true
                                              :none           false
                                              {table-id :all} false}]
            (with-all-users-data-perms {db-id {:data {:native :none, :schemas {"public"     :all
                                                                               "not_public" schema-perms}}}}
              (if can-upload?
                (is (some? (upload-csv!)))
                (is (thrown-with-msg?
                      clojure.lang.ExceptionInfo
                      #"You don't have permissions to do that\."
                      (upload-csv!)))))
            (with-all-users-data-perms {db-id {:data {:native :write, :schemas ["not_public"]}}}
              (is (some? (upload-csv!))))))))))

(deftest get-database-can-upload-test
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :uploads) :mysql) ; MySQL doesn't support schemas
    (testing "GET /api/database and GET /api/database/:id responses should include can_upload depending on unrestricted data access to the upload schema"
      (mt/with-empty-db
        (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
          (jdbc/execute! conn-spec "CREATE SCHEMA \"not_public\"; CREATE TABLE \"not_public\".\"table_name\" (id INTEGER)"))
        (sync/sync-database! (mt/db))
        (let [db-id     (u/the-id (mt/db))
              table-id (t2/select-one-pk :model/Table :db_id db-id)]
          (mt/with-temporary-setting-values [uploads-enabled      true
                                             uploads-database-id  db-id
                                             uploads-schema-name  "not_public"
                                             uploads-table-prefix "uploaded_magic_"]
            (doseq [[schema-perms can-upload?] {:all            true
                                                :none           false
                                                {table-id :all} false}]
              (testing (format "can_upload should be %s if the user has %s access to the upload schema"
                               can-upload? schema-perms)
                (with-all-users-data-perms {db-id {:data {:native :none
                                                          :schemas {"public"     :all
                                                                    "not_public" schema-perms}}}}
                  (testing "GET /api/database"
                    (let [result (->> (mt/user-http-request :rasta :get 200 "database")
                                      :data
                                      (filter #(= (:id %) db-id))
                                      first)]
                      (is (= can-upload? (:can_upload result)))))
                  (testing "GET /api/database/:id"
                    (let [result (mt/user-http-request :rasta :get 200 (format "database/%d" db-id))]
                      (is (= can-upload? (:can_upload result))))))))))))))
