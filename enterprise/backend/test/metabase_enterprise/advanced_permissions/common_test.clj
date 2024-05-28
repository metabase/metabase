(ns metabase-enterprise.advanced-permissions.common-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.api.util-test
    :as advanced-perms.api.tu]
   [metabase-enterprise.advanced-permissions.common
    :as advanced-permissions.common]
   [metabase-enterprise.test :as met]
   [metabase.api.database :as api.database]
   [metabase.driver :as driver]
   [metabase.models
    :refer [Dashboard DashboardCard Database Field FieldValues Table]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.database :as database]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.sync.concurrent :as sync.concurrent]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.fixtures :as fixtures]
   [metabase.upload-test :as upload-test]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest current-user-test
  (testing "GET /api/user/current returns additional fields if advanced-permissions is enabled"
    (mt/with-premium-features #{:advanced-permissions}
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
            (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                           :create-queries :query-builder-and-native
                                                           :data-model     {:schemas {"PUBLIC" {id-1 :all
                                                                                                id-2 :none
                                                                                                id-3 :none
                                                                                                id-4 :none}}}}}
              (is (partial= {:can_access_data_model true}
                            (user-permissions :rasta))))))

        (testing "can_access_db_details is true if a user has any details perms"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:details :yes}}
            (is (partial= {:can_access_db_details true}
                          (user-permissions :rasta)))))))))

(deftest new-database-view-data-permission-level-test
  (mt/with-additional-premium-features #{:sandboxes :advanced-permissions}
    (mt/with-temp [:model/PermissionsGroup {group-id :id}   {}
                   :model/Database         {db-id :id}      {}]
      (testing "A new database defaults to `:unrestricted` if no other perms are set"
        ;; First delete the default permissions for the group so we start with a clean slate
        (t2/delete! :model/DataPermissions :group_id group-id)
        (is (= :unrestricted (advanced-permissions.common/new-database-view-data-permission-level group-id))))

      (testing "A new database defaults to `:blocked` if the group has `:blocked` for any other database"
        (data-perms/set-database-permission! group-id db-id :perms/view-data :blocked)
        (is (= :blocked (advanced-permissions.common/new-database-view-data-permission-level group-id))))

      (testing "A new database defaults to `:blocked` if the group has any connection impersonation"
        (data-perms/set-database-permission! group-id db-id :perms/view-data :unrestricted)
        (advanced-perms.api.tu/with-impersonations! {:impersonations [{:db-id      db-id
                                                                       :attribute  "impersonation_attr"
                                                                       :attributes {"impersonation_attr" "impersonation_role"}}]}
          (is (= :blocked (advanced-permissions.common/new-database-view-data-permission-level (u/the-id &group))))))

      (testing "A new database defaults to `:blocked` if the group has any sandbox"
        (data-perms/set-database-permission! group-id db-id :perms/view-data :unrestricted)
        (met/with-gtaps! {:gtaps {:venues {}}, :attributes {"a" 50}}
          (is (= :blocked (advanced-permissions.common/new-database-view-data-permission-level (u/the-id &group)))))))))

(deftest new-group-view-data-permission-level
  (mt/with-additional-premium-features #{:sandboxes :advanced-permissions}
    (mt/with-temp [:model/Database {db-id :id} {}]
      (let [all-users-group-id (u/the-id (perms-group/all-users))]
        (testing "A new group defaults to `:unrestricted` for a DB if All Users has `:unrestricted`"
          (data-perms/set-database-permission! all-users-group-id db-id :perms/view-data :unrestricted)
          (is (= :unrestricted (advanced-permissions.common/new-group-view-data-permission-level db-id))))

        (testing "A new group defaults to `:blocked` for a DB if All Users has `:blocked`"
          (data-perms/set-database-permission! all-users-group-id db-id :perms/view-data :blocked)
          (is (= :blocked (advanced-permissions.common/new-group-view-data-permission-level db-id))))

        (testing "A new group defaults to `:blocked` if All Users has any connection impersonation"
          (data-perms/set-database-permission! all-users-group-id db-id :perms/view-data :unrestricted)
          (advanced-perms.api.tu/with-impersonations! {:impersonations [{:db-id      db-id
                                                                         :attribute  "impersonation_attr"
                                                                         :attributes {"impersonation_attr" "impersonation_role"}}]}
            (is (= :blocked (advanced-permissions.common/new-group-view-data-permission-level db-id)))))

        (testing "A new database defaults to `:blocked` if All Users group has any sandbox"
          (data-perms/set-database-permission! all-users-group-id db-id :perms/view-data :unrestricted)
          (mt/with-temp [:model/Card                   {card-id :id}  {}
                         :model/Table                  {table-id :id} {:db_id db-id}
                         :model/GroupTableAccessPolicy _              {:table_id             table-id
                                                                       :group_id             all-users-group-id
                                                                       :card_id              card-id
                                                                       :attribute_remappings {"foo" 1}}]
            (is (= :blocked (advanced-permissions.common/new-group-view-data-permission-level db-id)))))))))


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
        (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                       :create-queries :query-builder-and-native
                                                       :data-model     {:schemas :all}}}
          (is (partial= {:id (mt/id)} (get-test-db)))))

      (testing "A non-admin cannot fetch a DB for which they do not have data model perms if
               include_editable_data_model=true"
        (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                       :create-queries :query-builder-and-native
                                                       :data-model     {:schemas :none}}}
          (is (= nil (get-test-db)))))

      (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
        (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                       :create-queries :query-builder-and-native
                                                       :data-model     {:schemas {"PUBLIC" {id-1 :all
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
          (mt/with-all-users-data-perms-graph! {(mt/id) {:details :yes}}
            (is (partial= {:id (mt/id)} (get-test-db)))))

        (testing "A non-admin cannot fetch a DB for which they do not not have 'manage' access"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:details :no}}
            (is (= nil (get-test-db)))))))))

(deftest fetch-database-test
  (testing "GET /api/database/:id?include_editable_data_model=true"
    (testing "A non-admin without data model perms for a DB cannot fetch the DB when include_editable_data_model=true"
      (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                     :create-queries :query-builder-and-native
                                                     :data-model     {:schemas :none}}}
        (mt/user-http-request :rasta :get 403 (format "database/%d?include_editable_data_model=true" (mt/id)))))

    (testing "A non-admin with only data model perms for a DB can fetch the DB when include_editable_data_model=true"
      (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                     :create-queries :no
                                                     :data-model     {:schemas :all}}}
        (mt/user-http-request :rasta :get 200 (format "database/%d?include_editable_data_model=true" (mt/id)))))))

(deftest fetch-database-metadata-test
  (testing "GET /api/database/:id/metadata?include_editable_data_model=true"
    (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
      (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                     :create-queries :query-builder-and-native
                                                     :data-model     {:schemas {"PUBLIC" {id-1 :all
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
        (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :blocked
                                                       :create-queries :no
                                                       :data-model     {:schemas {"PUBLIC" {id-1 :all
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
      (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                     :create-queries :query-builder-and-native
                                                     :data-model     {:schemas :none}}}
        (mt/user-http-request :rasta :get 403 (format "database/%d/idfields?include_editable_data_model=true" (mt/id)))))

    (testing "A non-admin with only data model perms for a DB can fetch id fields when include_editable_data_model=true"
      (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                     :create-queries :no
                                                     :data-model     {:schemas :all}}}
        (mt/user-http-request :rasta :get 200 (format "database/%d/idfields?include_editable_data_model=true" (mt/id)))))))

(deftest get-schema-with-advanced-perms-test
  (testing "Permissions: We can verify include_editable_data_model flag works for the `/:id/schema/:schema` endpoint"
    (mt/with-temp [Database {db-id :id} {}
                   Table    t1          {:db_id db-id :schema "schema1" :name "t1"}
                   Table    _t2         {:db_id db-id :schema "schema2"}
                   Table    t3          {:db_id db-id :schema "schema1" :name "t3"}]
      (testing "If a non-admin has data model perms, but no data perms"
        (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                     :create-queries :no
                                                     :data-model     {:schemas :all}}}
          (testing "and if data permissions are revoked, it should be a 403"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 (format "database/%d/schema/%s" db-id "schema1")))))
          (testing "and if include_editable_data_model=true and data permissions are revoked, it should return values"
            (is (= ["t1" "t3"]
                   (map :name (mt/user-http-request :rasta :get 200 (format "database/%d/schema/%s" db-id "schema1")
                                                    :include_editable_data_model true)))))))

      (testing "If include_editable_data_model=true and a non-admin does not have data model perms, it should respond
                with a 404"
        (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                     :create-queries :no
                                                     :data-model     {:schemas :none}}}
          (is (= "Not found."
                 (mt/user-http-request :rasta :get 404 (format "database/%d/schema/%s" db-id "schema1")
                                       :include_editable_data_model true)))))

      (testing "If include_editable_data_model=true and a non-admin has data model perms for a single table in a schema,
                the table is returned"
        (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                     :create-queries :no
                                                     :data-model     {:schemas {"schema1" {(u/the-id t1) :all
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
      (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                   :create-queries :no
                                                   :data-model     {:schemas :all}}}
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
        (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                     :create-queries :no
                                                     :data-model     {:schemas :none}}}
          (is (= "Not found."
                 (mt/user-http-request :rasta :get 404 (format "database/%d/schema/" db-id)
                                       :include_editable_data_model true)))))

      (testing "If include_editable_data_model=true and a non-admin has data model perms for a single table in an empty
                string schema, it should return the table"
        (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                     :create-queries :no
                                                     :data-model     {:schemas {"" {(u/the-id t1) :all
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
        (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                     :create-queries :no
                                                     :data-model     {:schemas :all}}}
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
        (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                     :create-queries :no
                                                     :data-model     {:schemas :none}}}
          (is (= []
                 (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id)
                                       :include_editable_data_model true)))))
      (testing "If include_editable_data_model=true and a non-admin has data model perms for a schema,
                  it should return the schema"
        (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                     :create-queries :no
                                                     :data-model     {:schemas {"schema1" :all}}}}
          (is (= ["schema1"]
                 (mt/user-http-request :rasta :get 200 (format "database/%d/schemas" db-id)
                                       :include_editable_data_model true)))))
      (testing "If include_editable_data_model=true and a non-admin has data model perms for a single table in a schema,
                  it should return the schema"
        (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                     :create-queries :no
                                                     :data-model     {:schemas {"schema1" {(u/the-id t1) :all}}}}}
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
          (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas :all}}}
            (is (= expected-target
                   (:target (get-field))))))
        (testing "target should not be hydrated if a non-admin does not have data model perms for the target's schema"
          (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas {"schema1" :none
                                                                              "schema2" :all}}}}
            (is (nil? (:target (get-field))))))
        (testing "target should not be hydrated if a non-admin does not have data model perms for the target's table"
          (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas {"schema1" {(:id table1) :none}
                                                                              "schema2" {(:id table2) :all}}}}}
            (is (nil? (:target (get-field))))))
        (testing "target should be hydrated if a non-admin does have data model perms for the target's table"
          (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas {"schema1" {(:id table1) :all}
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
          (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas :all}}}
            (is (= expected-target
                   (:target (update-target))))))
        (testing "target should not be hydrated if a non-admin does not have data model perms for the target's schema"
          (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas {"schema1" :none
                                                                              "schema2" :none
                                                                              "schema3" :all}}}}
            (is (nil? (:target (update-target))))))
        (testing "target should not be hydrated if a non-admin does not have data model perms for the target's table"
          (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas {"schema1" {(:id table1) :all}
                                                                              "schema2" {(:id table2) :none}
                                                                              "schema3" {(:id table3) :all}}}}}
            (is (nil? (:target (update-target))))))
        (testing "target should be hydrated if a non-admin does have data model perms for the target's table"
          (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas {"schema1" {(:id table1) :none}
                                                                              "schema2" {(:id table2) :all}
                                                                              "schema3" {(:id table3) :all}}}}}
            (is (= expected-target
                   (:target (update-target))))))))))

(deftest update-field-test
  (t2.with-temp/with-temp [Table {table-id :id}                     {:db_id (mt/id) :schema "PUBLIC"}
                           Table {table-id-2 :id}                   {:db_id (mt/id) :schema "PUBLIC"}
                           Field {field-id :id, table-id :table_id} {:name "Field" :table_id table-id}]
    (let [{table-id :id, schema :schema, db-id :db_id} (t2/select-one Table :id table-id)]
      (testing "PUT /api/field/:id"
        (let [endpoint (format "field/%d" field-id)]
          (testing "a non-admin cannot update field metadata if the advanced-permissions feature flag is not present"
            (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas {schema {table-id :all}}}}}
              (mt/with-premium-features #{}
                (mt/user-http-request :rasta :put 403 endpoint {:name "Field Test 4"}))))

          (testing "a non-admin cannot update field metadata if they have no data model permissions for the DB"
            (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas :none}}}
              (mt/user-http-request :rasta :put 403 endpoint {:name "Field Test 2"})))

          (testing "a non-admin cannot update field metadata if they only have data model permissions for other schemas"
            (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas {schema             :none
                                                                                "different schema" :all}}}}

              (mt/user-http-request :rasta :put 403 endpoint {:name "Field Test 2"})))

          (testing "a non-admin cannot update field metadata if they only have data model permissions for other tables"
            (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas {schema {table-id   :none
                                                                                        table-id-2 :all}}}}}
              (mt/user-http-request :rasta :put 403 endpoint {:name "Field Test 2"})))

          (testing "a non-admin can update field metadata if they have data model perms for the DB"
            (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas :all}}}
              (mt/user-http-request :rasta :put 200 endpoint {:name "Field Test 2"})))

          (testing "a non-admin can update field metadata if they have data model perms for the schema"
            (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas {schema :all}}}}
              (mt/user-http-request :rasta :put 200 endpoint {:name "Field Test 3"})))

          (testing "a non-admin can update field metadata if they have data model perms for the table"
            (mt/with-all-users-data-perms-graph! {db-id {:data-model {:schemas {schema {table-id :all}}}}}
              (mt/user-http-request :rasta :put 200 endpoint {:name "Field Test 3"})))))

      (testing "POST /api/field/:id/rescan_values"
        (testing "A non-admin can trigger a rescan of field values if they have data model perms for the table"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {schema {table-id :none}}}}}
            (mt/user-http-request :rasta :post 403 (format "field/%d/rescan_values" field-id)))

          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {schema {table-id :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/rescan_values" field-id))))

        (testing "A non-admin with no data access can trigger a re-scan of field values if they have data model perms"
          (t2/delete! FieldValues :field_id (mt/id :venues :price))
          (is (= nil (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))
          (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :blocked
                                                         :create-queries :no
                                                         :data-model     {:schemas {"PUBLIC" {(mt/id :venues) :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/rescan_values" (mt/id :venues :price))))
          (is (= [1 2 3 4] (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))))

      (testing "POST /api/field/:id/discard_values"
        (testing "A non-admin can discard field values if they have data model perms for the table"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {schema {table-id :none}}}}}
            (mt/user-http-request :rasta :post 403 (format "field/%d/discard_values" field-id)))

          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {schema {table-id :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/discard_values" field-id))))

        (testing "A non-admin with no data access can discard field values if they have data model perms"
          (is (= [1 2 3 4] (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))
          (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :blocked
                                                         :create-queries :no
                                                         :data-model     {:schemas {"PUBLIC" {(mt/id :venues) :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "field/%d/discard_values" (mt/id :venues :price))))
          (is (= nil (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price)))))))))

(deftest get-field-with-advanced-perms-test
  (testing "GET /api/field/:id?include_editable_data_model=true"
    (testing "A non-admin can fetch a field when they have data model perms if include_editable_data_model=true"
      (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :blocked
                                                     :create-queries :no
                                                     :data-model     {:schemas :all}}}
        (is (partial= {:id (mt/id :users :name)}
                      (mt/user-http-request :rasta :get 200 (format "field/%d?include_editable_data_model=true" (mt/id :users :name)))))))
    (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                   :create-queries :query-builder-and-native
                                                   :data-model     {:schemas {"PUBLIC" {(mt/id :categories) :all
                                                                                        (mt/id :users)      :none}}}}}
      (testing "A non-admin can fetch a field for which they have data model perms if include_editable_data_model=true"
        (is (partial= {:id (mt/id :categories :name)}
                      (mt/user-http-request :rasta :get 200 (format "field/%d?include_editable_data_model=true" (mt/id :categories :name))))))
      (testing "A non-admin cannot fetch a field for which they do not have data model perms if include_editable_data_model=true"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (format "field/%d?include_editable_data_model=true" (mt/id :users :name)))))))))

(deftest update-table-test
  (t2.with-temp/with-temp [Table {table-id :id}   {:db_id (mt/id) :schema "PUBLIC"}
                           Table {table-id-2 :id} {:db_id (mt/id) :schema "PUBLIC"}]
    (testing "PUT /api/table/:id"
      (let [endpoint (format "table/%d" table-id)]
        (testing "a non-admin cannot update table metadata if the advanced-permissions feature flag is not present"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas :all}}}
            (mt/with-premium-features #{}
              (mt/user-http-request :rasta :put 403 endpoint {:name "Table Test 2"}))))

        (testing "a non-admin cannot update table metadata if they have no data model permissions for the DB"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas :none}}}
            (mt/user-http-request :rasta :put 403 endpoint {:name "Table Test 2"})))

        (testing "a non-admin cannot update table metadata if they only have data model permissions for other schemas"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {"PUBLIC"           :none
                                                                                "different schema" :all}}}}
            (mt/user-http-request :rasta :put 403 endpoint {:name "Table Test 2"})))

        (testing "a non-admin cannot update table metadata if they only have data model permissions for other tables"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id   :none
                                                                                          table-id-2 :all}}}}}
            (mt/user-http-request :rasta :put 403 endpoint {:name "Table Test 2"})))

        (testing "a non-admin can update table metadata if they have data model perms for the DB"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas :all}}}
            (mt/user-http-request :rasta :put 200 endpoint {:name "Table Test 2"})))

        (testing "a non-admin can update table metadata if they have data model perms for the schema"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {"PUBLIC" :all}}}}
            (mt/user-http-request :rasta :put 200 endpoint {:name "Table Test 3"})))

        (testing "a non-admin can update table metadata if they have data model perms for the table"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
            (mt/user-http-request :rasta :put 200 endpoint {:name "Table Test 3"})))))

    (testing "POST /api/table/:id/rescan_values"
      (testing "A non-admin can trigger a rescan of field values if they have data model perms for the table"
        (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :none}}}}}
          (mt/user-http-request :rasta :post 403 (format "table/%d/rescan_values" table-id)))

        (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
          (mt/user-http-request :rasta :post 200 (format "table/%d/rescan_values" table-id))))

      (testing "A non-admin with no data access can trigger a re-scan of field values if they have data model perms"
        (t2/delete! FieldValues :field_id (mt/id :venues :price))
        (is (= nil (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))
        (with-redefs [sync.concurrent/submit-task (fn [task] (task))]
          (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :blocked
                                                         :create-queries :no
                                                         :data-model     {:schemas {"PUBLIC" {(mt/id :venues) :all}}}}}
            (mt/user-http-request :rasta :post 200 (format "table/%d/rescan_values" (mt/id :venues)))))
        (is (= [1 2 3 4] (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))))

    (testing "POST /api/table/:id/discard_values"
      (testing "A non-admin can discard field values if they have data model perms for the table"
        (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :none}}}}}
          (mt/user-http-request :rasta :post 403 (format "table/%d/discard_values" table-id)))

        (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
          (mt/user-http-request :rasta :post 200 (format "table/%d/discard_values" table-id)))))

    (testing "POST /api/table/:id/fields/order"
      (testing "A non-admin can set a custom field ordering if they have data model perms for the table"
        (mt/with-temp [Field {field-1-id :id} {:table_id table-id}
                       Field {field-2-id :id} {:table_id table-id}]
          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :none}}}}}
            (mt/user-http-request :rasta :put 403 (format "table/%d/fields/order" table-id)
                                  [field-2-id field-1-id]))

          (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
            (mt/user-http-request :rasta :put 200 (format "table/%d/fields/order" table-id)
                                  [field-2-id field-1-id])))))))

(deftest audit-log-generated-when-table-manual-scan
  (t2.with-temp/with-temp [Table {table-id :id} {:db_id (mt/id) :schema "PUBLIC"}]
    (testing "An audit log entry is generated when a manually triggered re-scan occurs"
      (mt/with-additional-premium-features #{:audit-app}
        (mt/with-all-users-data-perms-graph! {(mt/id) {:data-model {:schemas {"PUBLIC" {table-id :all}}}}}
          (mt/user-http-request :rasta :post 200 (format "table/%d/rescan_values" table-id))))
      (is (= table-id (:model_id (mt/latest-audit-log-entry :table-manual-scan))))
      (is (= table-id (-> (mt/latest-audit-log-entry :table-manual-scan) :details :id))))))

(deftest fetch-table-test
  (testing "GET /api/table/:id"
    (t2.with-temp/with-temp [Table {table-id :id} {:db_id (mt/id) :schema "PUBLIC"}]
      (testing "A non-admin without self-service perms for a table cannot fetch the table normally"
        (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :blocked
                                                       :create-queries :no}}
          (mt/user-http-request :rasta :get 403 (format "table/%d?include_editable_data_model=true" table-id))))

      (testing "A non-admin without self-service perms for a table can fetch the table if they have data model perms for
               the DB"
        (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                       :create-queries :no
                                                       :data-model     {:schemas :all}}}
          (mt/user-http-request :rasta :get 200 (format "table/%d?include_editable_data_model=true" table-id))))

      (testing "A non-admin without self-service perms for a table can fetch the table if they have data model perms for
               the schema"
        (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                       :create-queries :no
                                                       :data-model     {:schemas {"PUBLIC" :all}}}}
          (mt/user-http-request :rasta :get 200 (format "table/%d?include_editable_data_model=true" table-id))))

      (testing "A non-admin without self-service perms for a table can fetch the table if they have data model perms for
               the table"
        (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                       :create-queries :no
                                                       :data-model     {:schemas {"PUBLIC" {table-id :all}}}}}
          (mt/user-http-request :rasta :get 200 (format "table/%d?include_editable_data_model=true" table-id)))))))

(deftest fetch-query-metadata-test
  (testing "GET /api/table/:id/query_metadata?include_editable_data_model=true"
    (t2.with-temp/with-temp [Table {table-id :id} {:db_id (mt/id) :schema "PUBLIC"}]
      (testing "A non-admin without data model perms for a table cannot fetch the query metadata when
               include_editable_data_model=true"
        (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                       :create-queries :query-builder-and-native
                                                       :data-model     {:schemas :none}}}
          (mt/user-http-request :rasta :get 403
                                (format "table/%d/query_metadata?include_editable_data_model=true" table-id))))

      (testing "A non-admin with only data model perms for a table can fetch the query metadata when
               include_editable_data_model=true"
        (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                       :create-queries :no
                                                       :data-model     {:schemas :all}}}
          (mt/user-http-request :rasta :get 200
                                (format "table/%d/query_metadata?include_editable_data_model=true" table-id)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                  Database details permission enforcement                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-database-test
  (testing "PUT /api/database/:id"
    (t2.with-temp/with-temp [Database {db-id :id}]
      (testing "A non-admin cannot update database metadata if the advanced-permissions feature flag is not present"
        (mt/with-all-users-data-perms-graph! {db-id {:details :yes}}
          (mt/with-premium-features #{}
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (format "database/%d" db-id) {:name "Database Test"}))))))

      (testing "A non-admin cannot update database metadata if they do not have DB details permissions"
        (mt/with-all-users-data-perms-graph! {db-id {:details :no}}
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (format "database/%d" db-id) {:name "Database Test"})))))

      (testing "A non-admin can update database metadata if they have DB details permissions"
        (mt/with-all-users-data-perms-graph! {db-id {:details :yes}}
          (is (=? {:id db-id}
                  (mt/user-http-request :rasta :put 200 (format "database/%d" db-id) {:name "Database Test"}))))))))

(deftest delete-database-test
  (t2.with-temp/with-temp [Database {db-id :id}]
    (testing "A non-admin cannot delete a database even if they have DB details permissions"
      (mt/with-all-users-data-perms-graph! {db-id {:details :yes}}
        (mt/user-http-request :rasta :delete 403 (format "database/%d" db-id))))))

(deftest db-operations-test
  (mt/test-helpers-set-global-values!
    (mt/with-temp [Database    {db-id :id}     {:engine "h2", :details (:details (mt/db))}
                   Table       {table-id :id}  {:db_id db-id}
                   Field       {field-id :id}  {:table_id table-id}
                   FieldValues {values-id :id} {:field_id field-id, :values [1 2 3 4]}]
      (with-redefs [api.database/*rescan-values-async* false]
        (testing "A non-admin can trigger a sync of the DB schema if they have DB details permissions"
          (mt/with-all-users-data-perms-graph! {db-id {:details :yes}}
            (mt/user-http-request :rasta :post 200 (format "database/%d/sync_schema" db-id))))

        (testing "A non-admin can discard saved field values if they have DB details permissions"
          (mt/with-all-users-data-perms-graph! {db-id {:details :yes}}
            (mt/user-http-request :rasta :post 200 (format "database/%d/discard_values" db-id))))

        (testing "A non-admin with no data access can discard field values if they have DB details perms"
          (t2/insert! FieldValues :id values-id :field_id field-id :values [1 2 3 4])
          (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                       :create-queries :no
                                                       :details        :yes}}
            (mt/user-http-request :rasta :post 200 (format "database/%d/discard_values" db-id)))
          (is (= nil (t2/select-one-fn :values FieldValues, :field_id field-id)))
          (mt/user-http-request :crowberto :post 200 (format "database/%d/rescan_values" db-id)))

        ;; Use test database for rescan_values tests so we can verify that scan actually succeeds
        (testing "A non-admin can trigger a re-scan of field values if they have DB details permissions"
          (mt/with-all-users-data-perms-graph! {(mt/id) {:details :yes}}
            (mt/user-http-request :rasta :post 200 (format "database/%d/rescan_values" (mt/id)))))

        (testing "A non-admin with no data access can trigger a re-scan of field values if they have DB details perms"
          (t2/delete! FieldValues :field_id (mt/id :venues :price))
          (is (= nil (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price))))
          (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :blocked
                                                         :create-queries :no
                                                         :details        :yes}}
            (mt/user-http-request :rasta :post 200 (format "database/%d/rescan_values" (mt/id))))
          (is (= [1 2 3 4] (t2/select-one-fn :values FieldValues, :field_id (mt/id :venues :price)))))))))

(deftest fetch-db-test
  (t2.with-temp/with-temp [Database {db-id :id}]
    (testing "A non-admin without self-service perms for a DB cannot fetch the DB normally"
      (mt/with-all-users-data-perms-graph! {db-id {:view-data      :unrestricted
                                                   :create-queries :no}}
        (mt/user-http-request :rasta :get 403 (format "database/%d?exclude_uneditable_details=true" db-id))))

    (testing "A non-admin without self-service perms for a DB can fetch the DB if they have DB details permissions"
      (mt/with-all-users-data-perms-graph! {db-id {:view-data      :unrestricted
                                                   :create-queries :no
                                                   :details        :yes}}
        (mt/user-http-request :rasta :get 200 (format "database/%d?exclude_uneditable_details=true" db-id))))

    (testing "A non-admin with block perms for a DB can fetch the DB if they have DB details permissions"
      (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                   :create-queries :no
                                                   :details        :yes}}
        (mt/user-http-request :rasta :get 200 (format "database/%d?exclude_uneditable_details=true" db-id))))

    (testing "The returned database contains a :details field for a user with DB details permissions"
      (mt/with-all-users-data-perms-graph! {db-id {:view-data      :blocked
                                                   :create-queries :no
                                                   :details        :yes}}
        (is (partial= {:details {}}
                      (mt/user-http-request :rasta :get 200 (format "database/%d?exclude_uneditable_details=true" db-id))))))))

(deftest actions-test
  (mt/with-temp-copy-of-db
    (mt/with-actions-test-data
      (mt/with-actions [{:keys [action-id model-id]} {}]
        (testing "Executing dashcard with action"
          (mt/with-temp [Dashboard {dashboard-id :id} {}
                         DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                          :action_id    action-id
                                                          :card_id      model-id}]
            (mt/with-full-data-perms-for-all-users!
              (let [execute-path (format "dashboard/%s/dashcard/%s/execute"
                                         dashboard-id
                                         dashcard-id)]
                (testing "Works with access to the DB not blocked"
                  (mt/with-actions-enabled
                    (is (= {:rows-affected 1}
                           (mt/user-http-request :rasta :post 200 execute-path
                                                 {:parameters {"id" 1}})))))
                (testing "Fails with access to the DB blocked"
                  (mt/with-all-users-data-perms-graph! {(u/the-id (mt/db)) {:view-data      :blocked
                                                                            :create-queries :no
                                                                            :details        :yes}}
                    (mt/with-actions-enabled
                      (is (partial= {:message "You don't have permissions to do that."}
                                    (mt/user-http-request :rasta :post 403 execute-path
                                                          {:parameters {"id" 1}}))))))))))))))

(deftest settings-managers-can-have-uploads-db-access-revoked
  (perms/grant-application-permissions! (perms-group/all-users) :setting)
  (testing "Upload DB can be set with the right permission"
    (mt/with-all-users-data-perms-graph! {(mt/id) {:details :yes}}
      (mt/user-http-request :rasta :put 204 "setting/" {:uploads-settings {:db_id (mt/id) :schema_name nil :table_prefix nil}})))
  (testing "Upload DB cannot be set without the right permission"
    (mt/with-all-users-data-perms-graph! {(mt/id) {:details :no}}
      (mt/user-http-request :rasta :put 403 "setting/" {:uploads-settings {:db_id (mt/id) :schema_name nil :table_prefix nil}})))
  (perms/revoke-application-permissions! (perms-group/all-users) :setting))

(deftest upload-csv-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads :schemas)
    (testing "Uploads should be blocked without data access"
      (let [schema-name (sql.tx/session-schema driver/*driver*)]
        (upload-test/with-upload-table!
          [table (upload-test/create-upload-table!)]
          (let [db-id       (mt/id)
                upload-csv! (fn []
                              (upload-test/upload-example-csv! {:grant-permission? false
                                                                :schema-name       (:schema table)
                                                                :table-prefix      "uploaded_magic_"}))]
            (doseq [[schema-perms can-upload? description]
                    [[:query-builder               true  "Data permissions on schema should succeed"]
                     [:no                          false "No data permissions on schema should fail"]
                     [{(:id table) :query-builder} false "Data permissions on table should fail"]]]
              (testing description
                (mt/with-all-users-data-perms-graph! {db-id {:view-data      :unrestricted
                                                             :create-queries {"some_schema" :query-builder
                                                                              schema-name   schema-perms}}}
                  (if can-upload?
                    (is (some? (upload-csv!)))
                    (is (thrown-with-msg?
                         clojure.lang.ExceptionInfo
                         #"You don't have permissions to do that\."
                         (upload-csv!)))))))
            (mt/with-all-users-data-perms-graph! {db-id {:view-data      :unrestricted
                                                         :create-queries :query-builder-and-native}}
              (is (some? (upload-csv!))))))))))

(deftest update-csv-data-perms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action [:metabase.upload/append :metabase.upload/replace]]
      (testing (format "CSV %s should be blocked without data access to the schema" action)
        (let [schema-name (sql.tx/session-schema driver/*driver*)]
          (upload-test/with-upload-table!
            [table-a (upload-test/create-upload-table! :schema-name schema-name)]
            (upload-test/with-upload-table!
              [table-b (upload-test/create-upload-table! :schema-name schema-name)]
              (let [db-id       (u/the-id (mt/db))
                    append-csv! #(upload-test/update-csv-with-defaults!
                                  action
                                  :table-id (:id table-a)
                                  :user-id (mt/user->id :rasta))]
                (doseq [[schema-perms          can-append? test-string]
                        [[:query-builder                 true  "Data permissions on schema should succeed"]
                         [:no                            false "No permissions on schema should fail"]
                         [{(:id table-a) :query-builder} true  "Data permissions on table should succeed"]
                         [{(:id table-b) :query-builder} false "Data permissions only on another table in the same schema should fail"]]]
                  (testing test-string
                    (mt/with-all-users-data-perms-graph! {db-id {:view-data :unrestricted
                                                                 :create-queries {schema-name schema-perms}}}
                      (if can-append?
                        (is (some? (append-csv!)))
                        (is (thrown-with-msg?
                             clojure.lang.ExceptionInfo
                             #"You don't have permissions to do that\."
                             (append-csv!)))))))))))))))

(deftest update-csv-block-perms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (doseq [action [:metabase.upload/append :metabase.upload/replace]]
      (testing (format "We will block %s if the user has blocked data access to the database, even if they have native query editing"
                       action)
        (upload-test/with-upload-table!
          [table-a (upload-test/create-upload-table!)]
          (let [db-id       (u/the-id (mt/db))
                append-csv! #(upload-test/update-csv-with-defaults!
                              action
                              :table-id (:id table-a)
                              :user-id (mt/user->id :rasta))]
            (testing "With blocked perms it should fail"
              (mt/with-all-users-data-perms-graph! {db-id {:view-data :blocked
                                                           :create-queries :no}}
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"You don't have permissions to do that\."
                     (append-csv!)))))))))))

(deftest get-database-can-upload-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads :schemas)
    (testing "GET /api/database and GET /api/database/:id responses should include can_upload depending on unrestricted data access to the upload schema"
      (mt/with-model-cleanup [:model/Table]
        (let [schema-name (sql.tx/session-schema driver/*driver*)
              db-id       (u/the-id (mt/db))]
          (upload-test/with-upload-table! [table (upload-test/create-upload-table! :schema-name schema-name)]
            (mt/with-temp [:model/Table {} {:db_id db-id :schema "some_schema"}]
              (doseq [[schema-perms can-upload?] {:query-builder               true
                                                  :no                          false
                                                  {(:id table) :query-builder} false}]
                (testing (format "can_upload should be %s if the user has %s access to the upload schema"
                                 can-upload? schema-perms)
                  (mt/with-all-users-data-perms-graph! {db-id {:view-data :unrestricted
                                                               :create-queries {"some_schema" :query-builder
                                                                                schema-name schema-perms}}}
                    (testing "GET /api/database"
                      (let [result (->> (mt/user-http-request :rasta :get 200 "database")
                                        :data
                                        (filter #(= (:id %) db-id))
                                        first)]
                        (is (= can-upload? (:can_upload result)))))
                    (testing "GET /api/database/:id"
                      (let [result (mt/user-http-request :rasta :get 200 (format "database/%d" db-id))]
                        (is (= can-upload? (:can_upload result)))))))))))))))
