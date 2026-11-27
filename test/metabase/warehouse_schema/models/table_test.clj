(ns metabase.warehouse-schema.models.table-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.permissions-rest.data-permissions.graph :as data-perms.graph]
   [metabase.permissions.core :as perms]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.serialization.core :as serialization]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.models.table-user-settings :as table-user-settings]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest valid-field-order?-test
  (testing "A valid field ordering is a set IDs  of all active fields in a given table"
    (is (#'table-user-settings/valid-field-order? (mt/id :venues)
                                                  [(mt/id :venues :name)
                                                   (mt/id :venues :category_id)
                                                   (mt/id :venues :latitude)
                                                   (mt/id :venues :longitude)
                                                   (mt/id :venues :price)
                                                   (mt/id :venues :id)])))
  (testing "Field ordering is invalid if some fields are missing"
    (is (false? (#'table-user-settings/valid-field-order? (mt/id :venues)
                                                          [(mt/id :venues :category_id)
                                                           (mt/id :venues :latitude)
                                                           (mt/id :venues :longitude)
                                                           (mt/id :venues :price)
                                                           (mt/id :venues :id)]))))
  (testing "Field ordering is invalid if some fields are from a differnt table"
    (is (false? (#'table-user-settings/valid-field-order? (mt/id :venues)
                                                          [(mt/id :venues :name)
                                                           (mt/id :venues :category_id)
                                                           (mt/id :venues :latitude)
                                                           (mt/id :venues :longitude)
                                                           (mt/id :venues :price)
                                                           (mt/id :checkins :id)]))))
  (testing "Only active fields should be considerd when checking field order"
    (one-off-dbs/with-blank-db
      (doseq [statement [;; H2 needs that 'guest' user for QP purposes. Set that up
                         "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                         ;; Keep DB open until we say otherwise :)
                         "SET DB_CLOSE_DELAY -1;"
                         ;; create table & load data
                         "DROP TABLE IF EXISTS \"BIRDS\";"
                         "CREATE TABLE \"BIRDS\" (\"SPECIES\" VARCHAR PRIMARY KEY, \"EXAMPLE_NAME\" VARCHAR);"
                         "GRANT ALL ON \"BIRDS\" TO GUEST;"
                         (str "INSERT INTO \"BIRDS\" (\"SPECIES\", \"EXAMPLE_NAME\") VALUES "
                              "('House Finch', 'Marshawn Finch'),  "
                              "('California Gull', 'Steven Seagull'), "
                              "('Chicken', 'Colin Fowl');")]]
        (jdbc/execute! one-off-dbs/*conn* [statement]))
      (sync/sync-database! (mt/id))
      (is (#'table-user-settings/valid-field-order? (mt/id :birds)
                                                    [(mt/id :birds :species)
                                                     (mt/id :birds :example_name)]))
      (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"BIRDS\" DROP COLUMN \"EXAMPLE_NAME\";"])
      (sync/sync-database! (mt/id))
      (is (#'table-user-settings/valid-field-order? (mt/id :birds)
                                                    [(mt/id :birds :species)])))))

(deftest slashes-in-schema-names-test
  (testing "Schema names should allow forward or back slashes (#8693, #12450)"
    (doseq [schema-name ["my\\schema"
                         "my\\\\schema"
                         "my/schema"
                         "my\\/schema"
                         "my\\\\/schema"]]
      (testing (format "Should be able to create/delete Table with schema name %s" (pr-str schema-name))
        (mt/with-temp [:model/Table {table-id :id} {:schema schema-name}]
          (is (= schema-name
                 (t2/select-one-fn :schema :model/Table :id table-id))))))))

(deftest set-new-table-permissions!-test
  (testing "New permissions are set appropriately for a new table, for all groups"
    (mt/with-full-data-perms-for-all-users!
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/Database         {db-id :id}    {}
                     :model/Table            {table-id-1 :id} {:db_id  db-id
                                                               :schema "PUBLIC"}
                     :model/Table            {table-id-2 :id} {:db_id  db-id
                                                               :schema "PUBLIC"}]
        ;; Perms for new tables are the same as the DB-level perms, if they exist
        (let [all-users-group-id (u/the-id (perms-group/all-users))]
          (is (partial=
               {all-users-group-id
                {db-id
                 {:perms/view-data             :unrestricted
                  :perms/create-queries        :query-builder-and-native
                  :perms/download-results      :one-million-rows
                  :perms/manage-table-metadata :no
                  :perms/manage-database       :no}}}
               (data-perms.graph/data-permissions-graph :group-id all-users-group-id :db-id db-id))))
        ;; A new group starts with the same perms as All Users
        (is (partial=
             {group-id
              {db-id
               {:perms/view-data             :unrestricted
                :perms/create-queries        :query-builder-and-native
                :perms/download-results      :one-million-rows
                :perms/manage-table-metadata :no
                :perms/manage-database       :no}}}
             (data-perms.graph/data-permissions-graph :group-id group-id :db-id db-id)))
        (testing "A new table has appropriate defaults, when perms are already set granularly for the DB"
          (data-perms/set-table-permission! group-id table-id-1 :perms/create-queries :no)
          (data-perms/set-table-permission! group-id table-id-1 :perms/download-results :no)
          (data-perms/set-table-permission! group-id table-id-1 :perms/manage-table-metadata :no)
          (data-perms/set-table-permission! group-id table-id-2 :perms/create-queries :query-builder)
          (data-perms/set-table-permission! group-id table-id-2 :perms/download-results :one-million-rows)
          (data-perms/set-table-permission! group-id table-id-2 :perms/manage-table-metadata :yes)
          (mt/with-model-cleanup [:model/Table]
            (let [[{table-id-3 :id}] (table/create-tables! [{:db_id db-id :schema "PUBLIC" :name "new_table" :active true}])]
              (is (partial=
                   {group-id
                    {db-id
                     {:perms/view-data             :unrestricted
                      :perms/create-queries        {"PUBLIC"
                                                    {table-id-1 :no
                                                     table-id-2 :query-builder
                                                     table-id-3 :no}}
                      :perms/download-results      {"PUBLIC"
                                                    {table-id-1 :no
                                                     table-id-2 :one-million-rows
                                                     table-id-3 :no}}
                      :perms/manage-table-metadata {"PUBLIC"
                                                    {table-id-1 :no
                                                     table-id-2 :yes
                                                     table-id-3 :no}}
                      :perms/manage-database       :no}}}
                   (data-perms.graph/data-permissions-graph :group-id group-id :db-id db-id))))))))))

(deftest cleanup-permissions-after-delete-table-test
  (mt/with-temp
    [:model/Database {db-id :id}      {}
     :model/Table    {table-id-1 :id} {:db_id db-id}
     :model/Table    {}               {:db_id db-id}]
    (data-perms/set-table-permission! (perms-group/all-users) table-id-1 :perms/create-queries :query-builder-and-native)
    (data-perms/set-table-permission! (perms-group/all-users) table-id-1 :perms/view-data :unrestricted)
    (data-perms/set-table-permission! (perms-group/all-users) table-id-1 :perms/download-results :one-million-rows)
    (data-perms/set-table-permission! (perms-group/all-users) table-id-1 :perms/manage-table-metadata :yes)
    (is (true? (t2/exists? :model/DataPermissions :table_id table-id-1)))
    (t2/delete! :model/Table :id table-id-1)
    (testing "Table-level permissions are deleted when we delete the table"
      (is (false? (t2/exists? :model/DataPermissions :table_id table-id-1))))))

;; hydration tests
(deftest field-values-hydration-test
  ;; Manually activate Field values since they are not created during sync (#53387)
  (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :venues :price)))
  (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :venues :name)))
  (is (=? {(mt/id :venues :price) (mt/malli=? [:sequential {:min 1} :any])
           (mt/id :venues :name)  (mt/malli=? [:sequential {:min 1} :any])}
          (-> (t2/select-one :model/Table :id (mt/id :venues))
              (t2/hydrate :field_values)
              :field_values)))
  (testing "batched hydration of several tables"
    (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :categories :name)))
    (is (=? {(mt/id :venues)     {(mt/id :venues :price)    (mt/malli=? [:sequential {:min 1} :any])
                                  (mt/id :venues :name)     (mt/malli=? [:sequential {:min 1} :any])}
             (mt/id :categories) {(mt/id :categories :name) (mt/malli=? [:sequential {:min 1} :any])}}
            (->> (t2/select :model/Table :id [:in [(mt/id :venues) (mt/id :categories)]])
                 (#(t2/hydrate % :field_values))
                 (map (juxt :id :field_values))
                 (into {}))))))

(deftest pk-field-hydration-test
  (is (= (mt/id :venues :id)
         (-> (t2/select-one :model/Table :id (mt/id :venues))
             (t2/hydrate :pk_field)
             :pk_field))))

;;; --------------------------------------- visible-tables-filter-clause tests ---------------------------------------

(defn- fetch-visible-table-ids
  "Fetches visible table IDs using `perms/visible-tables-filter-clause`."
  [db-id user-info permission-mapping table-id-field]
  (t2/select-pks-set [:model/Table]
                     {:where [:and [:= :db_id db-id]
                              (perms/visible-tables-filter-clause table-id-field user-info permission-mapping
                                                                  {:active-only? false, :include-published-via-collection? false})]}))

(defn- superuser-info
  "Returns user-info map for a superuser."
  [user-id]
  {:user-id       user-id
   :is-superuser? true :is-data-analyst? false})

(defn- regular-user-info
  "Returns user-info map for a non-superuser."
  [user-id]
  {:user-id       user-id
   :is-superuser? false :is-data-analyst? false})

(deftest visible-tables-filter-clause-superuser-sees-all-tables-test
  (testing "Superuser should see all tables regardless of permissions"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}    {}
                     :model/Table            {table-1 :id}  {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id}  {:db_id db-id :name "Table2"}
                     :model/Table            {table-3 :id}  {:db_id db-id :name "Table3"}
                     :model/PermissionsGroup pg             {}]
        (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
        (t2/delete! :model/DataPermissions :db_id db-id)
        (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
        (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
        (is (= #{table-1 table-2 table-3}
               (fetch-visible-table-ids db-id
                                        (superuser-info (mt/user->id :rasta))
                                        {:perms/view-data      :unrestricted
                                         :perms/create-queries :query-builder}
                                        :id)))))))

(deftest visible-tables-filter-clause-filters-by-view-and-query-perms-test
  (testing "Non-superuser sees only tables where they have both view and query permissions"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}       {}
                     :model/Table            {table-1 :id}     {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id}     {:db_id db-id :name "Table2"}
                     :model/Table            {table-blocked :id} {:db_id db-id :name "Table3"}
                     :model/PermissionsGroup pg                {}]
        (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
        (t2/delete! :model/DataPermissions :db_id db-id)
        (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
        (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
        (data-perms/set-table-permission! pg table-1 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg table-1 :perms/create-queries :query-builder)
        (data-perms/set-table-permission! pg table-2 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg table-2 :perms/create-queries :query-builder-and-native)
        (data-perms/set-table-permission! pg table-blocked :perms/view-data :blocked)
        (data-perms/set-table-permission! pg table-blocked :perms/create-queries :no)
        (is (= #{table-1 table-2}
               (fetch-visible-table-ids db-id
                                        (regular-user-info (mt/user->id :rasta))
                                        {:perms/view-data      :unrestricted
                                         :perms/create-queries :query-builder}
                                        :id)))))))

(deftest visible-tables-filter-clause-coalesce-expression-test
  (testing "Filter clause works with coalesce expression for table ID"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}   {}
                     :model/Table            {table-1 :id} {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id} {:db_id db-id :name "Table2"}
                     :model/PermissionsGroup pg            {}]
        (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
        (t2/delete! :model/DataPermissions :db_id db-id)
        (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
        (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
        (data-perms/set-table-permission! pg table-1 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg table-1 :perms/create-queries :query-builder)
        (data-perms/set-table-permission! pg table-2 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg table-2 :perms/create-queries :query-builder-and-native)
        (is (= #{table-1 table-2}
               (fetch-visible-table-ids db-id
                                        (regular-user-info (mt/user->id :rasta))
                                        {:perms/view-data      :unrestricted
                                         :perms/create-queries :query-builder}
                                        [:coalesce :id (u/qualified-key (t2/table-name :model/Table) :id)])))))))

(deftest visible-tables-filter-clause-qualified-keyword-test
  (testing "Filter clause works with qualified keyword for table ID"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}   {}
                     :model/Table            {table-1 :id} {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id} {:db_id db-id :name "Table2"}
                     :model/PermissionsGroup pg            {}]
        (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
        (t2/delete! :model/DataPermissions :db_id db-id)
        (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
        (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
        (data-perms/set-table-permission! pg table-1 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg table-1 :perms/create-queries :query-builder)
        (data-perms/set-table-permission! pg table-2 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg table-2 :perms/create-queries :query-builder-and-native)
        (is (= #{table-1 table-2}
               (fetch-visible-table-ids db-id
                                        (regular-user-info (mt/user->id :rasta))
                                        {:perms/view-data      :unrestricted
                                         :perms/create-queries :query-builder}
                                        (u/qualified-key (t2/table-name :model/Table) :id))))))))

(deftest visible-tables-filter-clause-view-data-only-test
  (testing "Non-superuser requiring only :view-data :unrestricted sees tables with that permission"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}       {}
                     :model/Table            {table-1 :id}     {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id}     {:db_id db-id :name "Table2"}
                     :model/Table            {table-blocked :id} {:db_id db-id :name "Table3"}
                     :model/PermissionsGroup pg                {}]
        (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
        (t2/delete! :model/DataPermissions :db_id db-id)
        (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
        (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
        (data-perms/set-table-permission! pg table-1 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg table-1 :perms/create-queries :query-builder)
        (data-perms/set-table-permission! pg table-2 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg table-2 :perms/create-queries :query-builder-and-native)
        (data-perms/set-table-permission! pg table-blocked :perms/view-data :blocked)
        (data-perms/set-table-permission! pg table-blocked :perms/create-queries :no)
        (is (= #{table-1 table-2}
               (fetch-visible-table-ids db-id
                                        (regular-user-info (mt/user->id :rasta))
                                        {:perms/view-data      :unrestricted
                                         :perms/create-queries :no}
                                        :id)))))))

(deftest visible-tables-filter-clause-legacy-no-self-service-test
  (testing "Non-superuser requiring :view-data :legacy-no-self-service sees tables at that level or above"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}       {}
                     :model/Table            {table-1 :id}     {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id}     {:db_id db-id :name "Table2"}
                     :model/Table            {table-blocked :id} {:db_id db-id :name "Table3"}
                     :model/Table            {table-legacy :id}  {:db_id db-id :name "Table4"}
                     :model/PermissionsGroup pg                {}]
        (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
        (t2/delete! :model/DataPermissions :db_id db-id)
        (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
        (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
        (data-perms/set-table-permission! pg table-1 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg table-1 :perms/create-queries :query-builder)
        (data-perms/set-table-permission! pg table-2 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg table-2 :perms/create-queries :query-builder-and-native)
        (data-perms/set-table-permission! pg table-blocked :perms/view-data :blocked)
        (data-perms/set-table-permission! pg table-blocked :perms/create-queries :no)
        (data-perms/set-table-permission! pg table-legacy :perms/view-data :legacy-no-self-service)
        (data-perms/set-table-permission! pg table-legacy :perms/create-queries :no)
        (is (= #{table-1 table-2 table-legacy}
               (fetch-visible-table-ids db-id
                                        (regular-user-info (mt/user->id :rasta))
                                        {:perms/view-data      :legacy-no-self-service
                                         :perms/create-queries :no}
                                        :id)))))))

(deftest visible-tables-filter-clause-blocked-level-sees-all-test
  (testing "Non-superuser requiring :view-data :blocked sees all tables since all values are more permissive"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}       {}
                     :model/Table            {table-1 :id}     {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id}     {:db_id db-id :name "Table2"}
                     :model/Table            {table-blocked :id} {:db_id db-id :name "Table3"}
                     :model/Table            {table-legacy :id}  {:db_id db-id :name "Table4"}
                     :model/PermissionsGroup pg                {}]
        (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
        (t2/delete! :model/DataPermissions :db_id db-id)
        (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
        (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
        (data-perms/set-table-permission! pg table-1 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg table-1 :perms/create-queries :query-builder)
        (data-perms/set-table-permission! pg table-2 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg table-2 :perms/create-queries :query-builder-and-native)
        (data-perms/set-table-permission! pg table-blocked :perms/view-data :blocked)
        (data-perms/set-table-permission! pg table-blocked :perms/create-queries :no)
        (data-perms/set-table-permission! pg table-legacy :perms/view-data :legacy-no-self-service)
        (data-perms/set-table-permission! pg table-legacy :perms/create-queries :no)
        (is (= #{table-1 table-2 table-blocked table-legacy}
               (fetch-visible-table-ids db-id
                                        (regular-user-info (mt/user->id :rasta))
                                        {:perms/view-data      :blocked
                                         :perms/create-queries :no}
                                        :id)))))))

(deftest visible-tables-filter-clause-blocked-takes-precedence-test
  (testing "Blocked permission takes precedence over legacy-no-self-service across groups"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}       {}
                     :model/Table            {table-1 :id}     {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id}     {:db_id db-id :name "Table2"}
                     :model/Table            {table-legacy :id}  {:db_id db-id :name "Table4"}
                     :model/PermissionsGroup pg1               {}
                     :model/PermissionsGroup pg2               {}]
        (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg1}])
        (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg2}])
        (t2/delete! :model/DataPermissions :db_id db-id)
        ;; pg1 has legacy-no-self-service for table-legacy
        (data-perms/set-database-permission! pg1 db-id :perms/view-data :blocked)
        (data-perms/set-database-permission! pg1 db-id :perms/create-queries :no)
        (data-perms/set-table-permission! pg1 table-1 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg1 table-1 :perms/create-queries :query-builder)
        (data-perms/set-table-permission! pg1 table-2 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! pg1 table-2 :perms/create-queries :query-builder-and-native)
        (data-perms/set-table-permission! pg1 table-legacy :perms/view-data :legacy-no-self-service)
        (data-perms/set-table-permission! pg1 table-legacy :perms/create-queries :no)
        ;; pg2 blocks table-legacy, which should take precedence
        (data-perms/set-database-permission! pg2 db-id :perms/view-data :legacy-no-self-service)
        (data-perms/set-database-permission! pg2 db-id :perms/create-queries :no)
        (data-perms/set-table-permission! pg2 table-legacy :perms/view-data :blocked)
        (data-perms/set-table-permission! pg2 table-legacy :perms/create-queries :no)
        (is (= #{table-1 table-2}
               (fetch-visible-table-ids db-id
                                        (regular-user-info (mt/user->id :rasta))
                                        {:perms/view-data      :legacy-no-self-service
                                         :perms/create-queries :no}
                                        :id)))))))

;;; ---------------------------------------- DB-level permissions tests ----------------------------------------

(deftest visible-tables-filter-clause-db-level-superuser-test
  (testing "Superuser sees all tables with DB-level permissions"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {table-1 :id}  {:db_id db-id :name "Table1"}
                   :model/Table    {table-2 :id}  {:db_id db-id :name "Table2"}
                   :model/Table    {table-3 :id}  {:db_id db-id :name "Table3"}]
      (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
      (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/create-queries :no)
      (is (= #{table-1 table-2 table-3}
             (fetch-visible-table-ids db-id
                                      (superuser-info (mt/user->id :rasta))
                                      {:perms/view-data      :unrestricted
                                       :perms/create-queries :query-builder}
                                      :id))))))

(deftest visible-tables-filter-clause-db-level-no-query-perms-test
  (testing "Non-superuser with DB-level view but no query perms sees no tables when both are required"
    (mt/with-temp [:model/Database {db-id :id}   {}
                   :model/Table    {_table-1 :id} {:db_id db-id :name "Table1"}
                   :model/Table    {_table-2 :id} {:db_id db-id :name "Table2"}
                   :model/Table    {_table-3 :id} {:db_id db-id :name "Table3"}]
      (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
      (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/create-queries :no)
      (is (empty? (fetch-visible-table-ids db-id
                                           (regular-user-info (mt/user->id :rasta))
                                           {:perms/view-data      :unrestricted
                                            :perms/create-queries :query-builder}
                                           :id))))))

(deftest visible-tables-filter-clause-db-level-coalesce-test
  (testing "Filter clause with coalesce works for DB-level permissions"
    (mt/with-temp [:model/Database {db-id :id}   {}
                   :model/Table    {_table-1 :id} {:db_id db-id :name "Table1"}
                   :model/Table    {_table-2 :id} {:db_id db-id :name "Table2"}]
      (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
      (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/create-queries :no)
      (is (empty? (fetch-visible-table-ids db-id
                                           (regular-user-info (mt/user->id :rasta))
                                           {:perms/view-data      :unrestricted
                                            :perms/create-queries :query-builder}
                                           [:coalesce :id (u/qualified-key (t2/table-name :model/Table) :id)]))))))

(deftest visible-tables-filter-clause-db-level-qualified-keyword-test
  (testing "Filter clause with qualified keyword works for DB-level permissions"
    (mt/with-temp [:model/Database {db-id :id}   {}
                   :model/Table    {_table-1 :id} {:db_id db-id :name "Table1"}
                   :model/Table    {_table-2 :id} {:db_id db-id :name "Table2"}]
      (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
      (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/create-queries :no)
      (is (empty? (fetch-visible-table-ids db-id
                                           (regular-user-info (mt/user->id :rasta))
                                           {:perms/view-data      :unrestricted
                                            :perms/create-queries :query-builder}
                                           (u/qualified-key (t2/table-name :model/Table) :id)))))))

(deftest visible-tables-filter-clause-db-level-view-only-test
  (testing "Non-superuser requiring only :view-data :unrestricted sees all tables with DB-level unrestricted"
    (mt/with-temp [:model/Database {db-id :id}   {}
                   :model/Table    {table-1 :id} {:db_id db-id :name "Table1"}
                   :model/Table    {table-2 :id} {:db_id db-id :name "Table2"}
                   :model/Table    {table-3 :id} {:db_id db-id :name "Table3"}]
      (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
      (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/create-queries :no)
      (is (= #{table-1 table-2 table-3}
             (fetch-visible-table-ids db-id
                                      (regular-user-info (mt/user->id :rasta))
                                      {:perms/view-data      :unrestricted
                                       :perms/create-queries :no}
                                      :id))))))

(deftest visible-tables-filter-clause-db-level-blocked-test
  (testing "Non-superuser requiring :blocked sees all tables since all values are more permissive"
    (mt/with-temp [:model/Database {db-id :id}   {}
                   :model/Table    {table-1 :id} {:db_id db-id :name "Table1"}
                   :model/Table    {table-2 :id} {:db_id db-id :name "Table2"}
                   :model/Table    {table-3 :id} {:db_id db-id :name "Table3"}]
      (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
      (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/create-queries :no)
      (is (= #{table-1 table-2 table-3}
             (fetch-visible-table-ids db-id
                                      (regular-user-info (mt/user->id :rasta))
                                      {:perms/view-data      :blocked
                                       :perms/create-queries :no}
                                      :id))))))

(deftest prevent-metabase-transform-data-source-change-test
  (testing "Cannot change data_source from metabase-transform"
    (mt/with-temp [:model/Table {table-id :id} {:data_source :metabase-transform}]
      (testing "to another value"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Cannot change data_source from metabase-transform"
             (t2/update! :model/Table :id table-id {:data_source :transform}))))
      (testing "to nil"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Cannot change data_source from metabase-transform"
             (t2/update! :model/Table :id table-id {:data_source nil}))))))
  (testing "Any writer can set data_source to metabase-transform"
    (mt/with-temp [:model/Table {table-id :id} {:data_source :ingested}]
      (t2/update! :model/Table :id table-id {:data_source :metabase-transform})
      (is (= :metabase-transform (t2/select-one-fn :data_source :model/Table :id table-id))))))

(deftest db-id-is-frozen-test
  (testing "A Table cannot move to another Database"
    (mt/with-temp [:model/Database {db-1 :id} {}
                   :model/Database {db-2 :id} {}
                   :model/Table    {table-id :id} {:db_id db-1}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You cannot move a Table to another Database"
                            (t2/update! :model/Table :id table-id {:db_id db-2})))
      (is (= db-1 (t2/select-one-fn :db_id :model/Table :id table-id))))))

(deftest field-order-change-repositions-fields-test
  (testing "Changing field_order repositions the Table's Fields, whoever writes it"
    (mt/with-temp [:model/Table {table-id :id} {:field_order :database}
                   :model/Field {f-b :id} {:table_id table-id :name "b" :database_position 0 :position 0}
                   :model/Field {f-a :id} {:table_id table-id :name "a" :database_position 1 :position 1}]
      (table/update-tables! [{:id table-id :field_order :alphabetical}])
      (is (= {f-a 0, f-b 1} (t2/select-pk->fn :position :model/Field :table_id table-id))))))

(deftest collection-hydration-test
  (testing "hydrating :collection on published table"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Table {table-id :id :as table} {}
                   :model/TableUserSettings _ {:table_id table-id :is_published true :collection_id coll-id}]
      (let [hydrated (t2/hydrate table :collection)]
        (is (= coll-id (-> hydrated :collection :id)))
        (is (= "Test Collection" (-> hydrated :collection :name))))))
  (testing "hydrating :collection on table published with nil collection_id returns root collection"
    (mt/with-temp [:model/Table {table-id :id :as table} {}
                   :model/TableUserSettings _ {:table_id table-id :is_published true :collection_id nil}]
      (let [hydrated (t2/hydrate table :collection)]
        (is (= "root" (-> hydrated :collection :id))))))
  (testing "hydrating :collection on unpublished table returns nil"
    (mt/with-temp [:model/Table table-1 {}
                   :model/Table {table-2-id :id :as table-2} {}
                   :model/TableUserSettings _ {:table_id table-2-id :display_name "Unpublished"}]
      (doseq [table [table-1 table-2]]
        (let [hydrated (t2/hydrate table :collection)]
          (is (contains? hydrated :collection))
          (is (nil? (:collection hydrated)))))))
  (testing "batched hydration works for multiple tables"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1"}
                   :model/Collection {coll2-id :id} {:name "Collection 2"}
                   :model/Table {table1-id :id :as table1} {}
                   :model/TableUserSettings _ {:table_id table1-id :is_published true :collection_id coll1-id}
                   :model/Table {table2-id :id :as table2} {}
                   :model/TableUserSettings _ {:table_id table2-id :is_published true :collection_id coll2-id}
                   :model/Table table3 {}]
      (let [hydrated (t2/hydrate [table1 table2 table3] :collection)]
        (is (= coll1-id (-> hydrated first :collection :id)))
        (is (= coll2-id (-> hydrated second :collection :id)))
        (is (nil? (-> hydrated (nth 2) :collection)))))))

(deftest owner-hydration-test
  (testing "hydrating :owner on a table with :owner_user_id"
    (mt/with-temp [:model/Table table {:owner_user_id (mt/user->id :crowberto)}]
      (is (=? {:owner {:id    (mt/user->id :crowberto)
                       :email "crowberto@metabase.com"}}
              (t2/hydrate table :owner)))))
  (testing "hydrating :owner on a table with :owner_email"
    (mt/with-temp [:model/Table table {:owner_email "external@example.com"}]
      (is (=? {:owner {:email "external@example.com"}}
              (t2/hydrate table :owner))))))

;;; ---------------------------------------- can-read? permission tests ----------------------------------------

(deftest table-can-read?-with-view-data-and-create-queries-permission-test
  (testing "User with view-data and create-queries permission can read table"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :query-builder)
      (data-perms/set-table-permission! pg table-id :perms/view-data :unrestricted)
      (mt/with-test-user :rasta
        (is (true? (mi/can-read? (t2/hydrate (t2/select-one :model/Table :id table-id) :can_read))))))))

(deftest table-can-read?-with-view-data-permission-test
  (testing "User with view-data and create-queries permission can read table"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      (data-perms/set-table-permission! pg table-id :perms/view-data :unrestricted)
      (mt/with-test-user :rasta
        (is (false? (boolean (mi/can-read? (t2/hydrate (t2/select-one :model/Table :id table-id) :can_read)))))))))

(deftest table-can-read?-with-manage-table-metadata-permission-test
  (testing "User with manage-table-metadata permission can read table"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      (data-perms/set-table-permission! pg table-id :perms/manage-table-metadata :yes)
      (mt/with-test-user :rasta
        (is (true? (mi/can-read? (t2/hydrate (t2/select-one :model/Table :id table-id) :can_read))))))))

(deftest table-can-read?-without-permissions-test
  (testing "User with neither permission cannot read table"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      (mt/with-test-user :rasta
        (is (false? (mi/can-read? (t2/hydrate (t2/select-one :model/Table :id table-id) :can_read))))))))

;;; ---------------------------------------- can-query? permission tests ----------------------------------------

(deftest table-can-query?-requires-both-view-data-and-create-queries-test
  (testing "User needs BOTH view-data AND create-queries to query"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      ;; Only view-data - not enough
      (data-perms/set-table-permission! pg table-id :perms/view-data :unrestricted)
      (mt/with-test-user :rasta
        (is (false? (mi/can-query? (t2/hydrate (t2/select-one :model/Table :id table-id) :can_query)))))
      ;; Add create-queries - now can query
      (data-perms/set-table-permission! pg table-id :perms/create-queries :query-builder)
      (mt/with-test-user :rasta
        (is (true? (mi/can-query? (t2/hydrate (t2/select-one :model/Table :id table-id) :can_query))))))))

(deftest table-can-query?-manage-table-metadata-does-not-grant-query-access-test
  (testing "manage-table-metadata alone does NOT grant query access"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      (data-perms/set-table-permission! pg table-id :perms/manage-table-metadata :yes)
      (mt/with-test-user :rasta
        (is (false? (mi/can-query? (t2/hydrate (t2/select-one :model/Table :id table-id) :can_query))))))))

;;; ---------------------------------------- can_query hydration test ----------------------------------------

(deftest table-can-query-hydration-test
  (testing ":can_query hydration works for tables"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table table {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms-group-membership/add-users-to-groups! [{:user (mt/user->id :rasta) :group pg}])
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :unrestricted)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :query-builder)
      (mt/with-test-user :rasta
        (let [hydrated (t2/hydrate table :can_query)]
          (is (contains? hydrated :can_query))
          (is (boolean? (:can_query hydrated))))))))

(defn- do-with-external-remaps!
  "Runs `thunk` with each `[field-id readable-field-id fk-target-field-id]` of `remaps` set up as an external remap of
  the Field to the readable Field through a foreign key to the target Field."
  [remaps thunk]
  (if-let [[[field-id readable-field-id fk-target-field-id] & more] (seq remaps)]
    (mt/with-temp-vals-in-db :model/Field field-id {:fk_target_field_id fk-target-field-id}
      (mt/with-temp [:model/Dimension _ {:field_id                field-id
                                         :name                    "Remap"
                                         :type                    :external
                                         :human_readable_field_id readable-field-id}]
        (do-with-external-remaps! more thunk)))
    (thunk)))

(defn- can-query-by-table
  "The `:can_query` of the test Tables with `table-kws` hydrated together, by Table keyword."
  [table-kws]
  (let [tables (t2/hydrate (t2/select :model/Table :id [:in (mapv mt/id table-kws)]) :can_query)]
    (into {} (map (fn [table-kw] [table-kw (:can_query (first (filter #(= (mt/id table-kw) (:id %)) tables)))]))
          table-kws)))

(deftest table-can-query-hydration-external-remaps-test
  (testing ":can_query of Table needs query access to Tables its Fields show values of"
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
      (doseq [table-kw [:venues :orders :people :checkins]]
        (perms/set-table-permission! (perms/all-users-group) (mt/id table-kw) :perms/create-queries :query-builder))
      (do-with-external-remaps!
       [[(mt/id :venues :category_id) (mt/id :categories :name) (mt/id :categories :id)]
        [(mt/id :orders :user_id) (mt/id :people :name) (mt/id :people :id)]]
       (fn []
         (testing "non-admin in one batch"
           (mt/with-test-user :rasta
             (is (= {:venues     false
                     :orders     true
                     :checkins   true
                     :categories false}
                    (can-query-by-table [:venues :orders :checkins :categories])))
             (testing ":can_read keeps plain rule"
               (is (mi/can-read? (t2/hydrate (t2/select-one :model/Table :id (mt/id :venues)) :can_read))))))
         (testing "superuser"
           (mt/with-test-user :crowberto
             (is (= {:venues true :orders true :checkins true :categories true}
                    (can-query-by-table [:venues :orders :checkins :categories]))))))))))

(deftest table-can-query-hydration-statement-count-test
  (testing ":can_query of many Tables with remaps takes as many statements as of few, as a non-admin"
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
      (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
      (do-with-external-remaps!
       [[(mt/id :venues :category_id) (mt/id :categories :name) (mt/id :categories :id)]
        [(mt/id :checkins :venue_id) (mt/id :venues :name) (mt/id :venues :id)]
        [(mt/id :orders :user_id) (mt/id :people :name) (mt/id :people :id)]
        [(mt/id :reviews :product_id) (mt/id :products :title) (mt/id :products :id)]
        [(mt/id :categories :name) (mt/id :users :name) (mt/id :users :id)]
        [(mt/id :users :name) (mt/id :categories :name) (mt/id :categories :id)]]
       (fn []
         (mt/with-test-user :rasta
           (let [tables (t2/select :model/Table :id [:in (mapv mt/id [:venues :checkins :orders :reviews :categories :users])])
                 count! (fn [n]
                          (t2/hydrate (take n tables) :can_query)
                          (t2/with-call-count [call-count]
                            (doall (t2/hydrate (take n tables) :can_query))
                            (call-count)))]
             (is (= 6 (count tables)))
             (is (every? :can_query (t2/hydrate tables :can_query)))
             (is (= (count! 2) (count! 6))))))))))

(deftest data-layer-legacy-serdes-round-trip-test
  (testing "Importing a v58 serialization export with legacy medallion data_layer values maps them to current values"
    (mt/with-temp [:model/Database {db-id :id} {:name "Test DB"}
                   :model/Table {table-id :id} {:db_id db-id}]
      (let [table      (t2/select-one :model/Table :id table-id)
            extracted  (first (serialization/export-batch :model/Table [table]))]
        (doseq [[legacy-value expected] {"copper" "hidden"
                                         "bronze" "final"
                                         "silver" "final"
                                         "gold"   "final"}]
          (testing (format "legacy data_layer %s -> %s" legacy-value expected)
            ;; simulate a v58 export by substituting the legacy value
            (let [entity (assoc extracted :data_layer legacy-value)]
              (serialization/load :model/Table [entity])
              (is (= (keyword expected)
                     (t2/select-one-fn :data_layer :model/Table :id table-id))))))))))

(deftest curation-column-defaults-test
  (testing "a new table gets consistent non-null data_layer and data_authority defaults"
    (testing "via the model before-insert (the path sync uses)"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {table-id :id} {:db_id db-id}]
        (is (=? {:data_layer :internal :data_authority :unconfigured}
                (t2/select-one [:model/Table :data_layer :data_authority] :id table-id)))))
    (testing "via the DB-level column default when before-insert is bypassed (raw insert)"
      ;; Exercises the non-model insert path, guarding the migration that asserts the DB-level defaults.
      (mt/with-temp [:model/Database {db-id :id} {}]
        (t2/query-one {:insert-into (t2/table-name :model/Table)
                       :values      [{:name       "raw-insert-probe"
                                      :db_id      db-id
                                      :active     true
                                      :created_at :%now
                                      :updated_at :%now}]})
        (is (=? {:data_layer :internal :data_authority :unconfigured}
                (t2/select-one [:model/Table :data_layer :data_authority]
                               :name "raw-insert-probe" :db_id db-id)))))))

(deftest insert-keeps-visibility-type-and-data-layer-in-step-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table {cruft :id}   {:db_id db-id :visibility_type :cruft}
                 :model/Table {hidden :id}  {:db_id db-id :data_layer :hidden}
                 :model/Table {final :id}   {:db_id db-id :data_layer :final}
                 :model/Table {visible :id} {:db_id db-id}]
    (is (= {cruft   [:cruft :hidden]
            hidden  [:hidden :hidden]
            final   [nil :final]
            visible [nil :internal]}
           (t2/select-pk->fn (juxt :visibility_type :data_layer) :model/Table
                             :id [:in [cruft hidden final visible]])))))

(deftest update-accepts-agreeing-visibility-type-and-data-layer-test
  (mt/with-temp [:model/Table {hidden :id}   {}
                 :model/Table {rejected :id} {}]
    (testing "agreeing pair is stored"
      (t2/update! :model/Table :id hidden {:visibility_type :hidden :data_layer :hidden})
      (is (= [:hidden :hidden]
             (t2/select-one-fn (juxt :visibility_type :data_layer) :model/Table :id hidden))))
    (testing "disagreeing pair is rejected"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot update both visibility_type and data_layer"
                            (t2/update! :model/Table :id rejected {:visibility_type :hidden :data_layer :final}))))))
