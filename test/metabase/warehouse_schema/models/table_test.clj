(ns metabase.warehouse-schema.models.table-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions-rest.data-permissions.graph :as data-perms.graph]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest valid-field-order?-test
  (testing "A valid field ordering is a set IDs  of all active fields in a given table"
    (is (#'table/valid-field-order? (mt/id :venues)
                                    [(mt/id :venues :name)
                                     (mt/id :venues :category_id)
                                     (mt/id :venues :latitude)
                                     (mt/id :venues :longitude)
                                     (mt/id :venues :price)
                                     (mt/id :venues :id)])))
  (testing "Field ordering is invalid if some fields are missing"
    (is (false? (#'table/valid-field-order? (mt/id :venues)
                                            [(mt/id :venues :category_id)
                                             (mt/id :venues :latitude)
                                             (mt/id :venues :longitude)
                                             (mt/id :venues :price)
                                             (mt/id :venues :id)]))))
  (testing "Field ordering is invalid if some fields are from a differnt table"
    (is (false? (#'table/valid-field-order? (mt/id :venues)
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
      (sync/sync-database! (mt/db))
      (is (#'table/valid-field-order? (mt/id :birds)
                                      [(mt/id :birds :species)
                                       (mt/id :birds :example_name)]))
      (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"BIRDS\" DROP COLUMN \"EXAMPLE_NAME\";"])
      (sync/sync-database! (mt/db))
      (is (#'table/valid-field-order? (mt/id :birds)
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

(deftest identity-hash-test
  (testing "Table hashes are composed of the schema name, table name and the database's identity-hash"
    (mt/with-temp [:model/Database db    {:name "field-db" :engine :h2}
                   :model/Table    table {:schema "PUBLIC" :name "widget" :db_id (:id db)}]
      (let [db-hash (serdes/identity-hash db)]
        (is (= "0395fe49"
               (serdes/raw-hash ["PUBLIC" "widget" db-hash])
               (serdes/identity-hash table)))))))

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
          (mt/with-temp [:model/Table {table-id-3 :id} {:db_id  db-id
                                                        :schema "PUBLIC"}]
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
                 (data-perms.graph/data-permissions-graph :group-id group-id :db-id db-id)))))))))

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
    (t2/delete! :model/Table table-id-1)
    (testing "Table-level permissions are deleted when we delete the table"
      (is (false? (t2/exists? :model/DataPermissions :table_id table-id-1))))))

;; hydration tests
(deftest field-values-hydration-test
  ;; Manually activate Field values since they are not created during sync (#53387)
  (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :venues :price)))
  (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :venues :name)))

  (is (=? {(mt/id :venues :price) (mt/malli=? [:sequential {:min 1} :any])
           (mt/id :venues :name)  (mt/malli=? [:sequential {:min 1} :any])}
          (-> (t2/select-one :model/Table (mt/id :venues))
              (t2/hydrate :field_values)
              :field_values))))

(deftest pk-field-hydration-test
  (is (= (mt/id :venues :id)
         (-> (t2/select-one :model/Table (mt/id :venues))
             (t2/hydrate :pk_field)
             :pk_field))))

;;; ------------------------------------------ visible-filter-clause tests ------------------------------------------

(defn- fetch-visible-table-ids
  "Fetches visible table IDs using `visible-filter-clause` with the new `:clause/:with` return structure."
  [db-id user-info permission-mapping table-id-field]
  (let [{:keys [clause with]} (mi/visible-filter-clause :model/Table table-id-field user-info permission-mapping)]
    (t2/select-pks-set [:model/Table]
                       (cond-> {:where [:and [:= :db_id db-id] clause]}
                         with (assoc :with with)))))

(defn- superuser-info
  "Returns user-info map for a superuser."
  [user-id]
  {:user-id       user-id
   :is-superuser? true})

(defn- regular-user-info
  "Returns user-info map for a non-superuser."
  [user-id]
  {:user-id       user-id
   :is-superuser? false})

(deftest visible-filter-clause-superuser-sees-all-tables-test
  (testing "Superuser should see all tables regardless of permissions"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}    {}
                     :model/Table            {table-1 :id}  {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id}  {:db_id db-id :name "Table2"}
                     :model/Table            {table-3 :id}  {:db_id db-id :name "Table3"}
                     :model/PermissionsGroup pg             {}]
        (perms/add-user-to-group! (mt/user->id :rasta) pg)
        (t2/delete! :model/DataPermissions :db_id db-id)
        (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
        (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
        (is (= #{table-1 table-2 table-3}
               (fetch-visible-table-ids db-id
                                        (superuser-info (mt/user->id :rasta))
                                        {:perms/view-data      :unrestricted
                                         :perms/create-queries :query-builder}
                                        :id)))))))

(deftest visible-filter-clause-filters-by-view-and-query-perms-test
  (testing "Non-superuser sees only tables where they have both view and query permissions"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}       {}
                     :model/Table            {table-1 :id}     {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id}     {:db_id db-id :name "Table2"}
                     :model/Table            {table-blocked :id} {:db_id db-id :name "Table3"}
                     :model/PermissionsGroup pg                {}]
        (perms/add-user-to-group! (mt/user->id :rasta) pg)
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

(deftest visible-filter-clause-coalesce-expression-test
  (testing "Filter clause works with coalesce expression for table ID"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}   {}
                     :model/Table            {table-1 :id} {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id} {:db_id db-id :name "Table2"}
                     :model/PermissionsGroup pg            {}]
        (perms/add-user-to-group! (mt/user->id :rasta) pg)
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
                                        [:coalesce :id :metabase_table.id])))))))

(deftest visible-filter-clause-qualified-keyword-test
  (testing "Filter clause works with qualified keyword for table ID"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}   {}
                     :model/Table            {table-1 :id} {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id} {:db_id db-id :name "Table2"}
                     :model/PermissionsGroup pg            {}]
        (perms/add-user-to-group! (mt/user->id :rasta) pg)
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
                                        :metabase_table.id)))))))

(deftest visible-filter-clause-view-data-only-test
  (testing "Non-superuser requiring only :view-data :unrestricted sees tables with that permission"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}       {}
                     :model/Table            {table-1 :id}     {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id}     {:db_id db-id :name "Table2"}
                     :model/Table            {table-blocked :id} {:db_id db-id :name "Table3"}
                     :model/PermissionsGroup pg                {}]
        (perms/add-user-to-group! (mt/user->id :rasta) pg)
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

(deftest visible-filter-clause-legacy-no-self-service-test
  (testing "Non-superuser requiring :view-data :legacy-no-self-service sees tables at that level or above"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}       {}
                     :model/Table            {table-1 :id}     {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id}     {:db_id db-id :name "Table2"}
                     :model/Table            {table-blocked :id} {:db_id db-id :name "Table3"}
                     :model/Table            {table-legacy :id}  {:db_id db-id :name "Table4"}
                     :model/PermissionsGroup pg                {}]
        (perms/add-user-to-group! (mt/user->id :rasta) pg)
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

(deftest visible-filter-clause-blocked-level-sees-all-test
  (testing "Non-superuser requiring :view-data :blocked sees all tables since all values are more permissive"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}       {}
                     :model/Table            {table-1 :id}     {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id}     {:db_id db-id :name "Table2"}
                     :model/Table            {table-blocked :id} {:db_id db-id :name "Table3"}
                     :model/Table            {table-legacy :id}  {:db_id db-id :name "Table4"}
                     :model/PermissionsGroup pg                {}]
        (perms/add-user-to-group! (mt/user->id :rasta) pg)
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

(deftest visible-filter-clause-blocked-takes-precedence-test
  (testing "Blocked permission takes precedence over legacy-no-self-service across groups"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/Database         {db-id :id}       {}
                     :model/Table            {table-1 :id}     {:db_id db-id :name "Table1"}
                     :model/Table            {table-2 :id}     {:db_id db-id :name "Table2"}
                     :model/Table            {table-legacy :id}  {:db_id db-id :name "Table4"}
                     :model/PermissionsGroup pg1               {}
                     :model/PermissionsGroup pg2               {}]
        (perms/add-user-to-group! (mt/user->id :rasta) pg1)
        (perms/add-user-to-group! (mt/user->id :rasta) pg2)
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

(deftest visible-filter-clause-db-level-superuser-test
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

(deftest visible-filter-clause-db-level-no-query-perms-test
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

(deftest visible-filter-clause-db-level-coalesce-test
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
                                           [:coalesce :id :metabase_table.id]))))))

(deftest visible-filter-clause-db-level-qualified-keyword-test
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
                                           :metabase_table.id))))))

(deftest visible-filter-clause-db-level-view-only-test
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

(deftest visible-filter-clause-db-level-blocked-test
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
             (t2/update! :model/Table table-id {:data_source :transform}))))
      (testing "to nil"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Cannot change data_source from metabase-transform"
             (t2/update! :model/Table table-id {:data_source nil}))))))

  (testing "Cannot change data_source to metabase-transform"
    (mt/with-temp [:model/Table {table-id :id} {:data_source :ingested}]
      (testing "from another value"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Cannot set data_source to metabase-transform"
             (t2/update! :model/Table table-id {:data_source :metabase-transform}))))
      (testing "but can change to other non-metabase-transform values"
        (is (some? (t2/update! :model/Table table-id {:data_source :ingested})))
        (is (= :ingested (t2/select-one-fn :data_source :model/Table :id table-id))))
      (testing "can also change it to nil"
        (is (some? (t2/update! :model/Table table-id {:data_source nil})))
        (is (nil? (t2/select-one-fn :data_source :model/Table :id table-id)))))))

(deftest is-published-and-collection-id-test
  (testing "is_published defaults to false"
    (mt/with-temp [:model/Table {table-id :id} {}]
      (is (false? (t2/select-one-fn :is_published :model/Table :id table-id)))))
  (testing "can create a table with is_published=true and collection_id"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Table {table-id :id} {:is_published true :collection_id coll-id}]
      (let [table (t2/select-one :model/Table :id table-id)]
        (is (true? (:is_published table)))
        (is (= coll-id (:collection_id table))))))
  (testing "collection_id FK constraint prevents referencing non-existent collection"
    (is (thrown?
         Exception
         (mt/with-temp [:model/Table _ {:collection_id Integer/MAX_VALUE}]))))
  (testing "deleting a collection unpublishes the tables in it"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Table {table-1-id :id} {:is_published true :collection_id coll-id}
                   :model/Table {table-2-id :id} {:is_published true :collection_id coll-id}]
      (t2/delete! :model/Collection :id coll-id)
      (is (= #{[false nil]} (t2/select-fn-set (juxt :is_published :collection_id) :model/Table
                                              :id [:in [table-1-id table-2-id]]))))))

(deftest collection-hydration-test
  (testing "hydrating :collection on a table"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Table table {:is_published true :collection_id coll-id}]
      (let [hydrated (t2/hydrate table :collection)]
        (is (= coll-id (-> hydrated :collection :id)))
        (is (= "Test Collection" (-> hydrated :collection :name))))))
  (testing "hydrating :collection on a table with no collection_id returns nil"
    (mt/with-temp [:model/Table table {}]
      (let [hydrated (t2/hydrate table :collection)]
        (is (nil? (:collection hydrated))))))
  (testing "batched hydration works for multiple tables"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1"}
                   :model/Collection {coll2-id :id} {:name "Collection 2"}
                   :model/Table table1 {:is_published true :collection_id coll1-id}
                   :model/Table table2 {:is_published true :collection_id coll2-id}
                   :model/Table table3 {}]
      (let [hydrated (t2/hydrate [table1 table2 table3] :collection)]
        (is (= coll1-id (-> hydrated first :collection :id)))
        (is (= coll2-id (-> hydrated second :collection :id)))
        (is (nil? (-> hydrated (nth 2) :collection)))))))

;;; ---------------------------------------- can-read? permission tests ----------------------------------------

(deftest table-can-read?-with-view-data-and-create-queries-permission-test
  (testing "User with view-data and create-queries permission can read table"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms/add-user-to-group! (mt/user->id :rasta) pg)
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :query-builder)
      (data-perms/set-table-permission! pg table-id :perms/view-data :unrestricted)
      (mt/with-test-user :rasta
        (is (true? (mi/can-read? (t2/select-one :model/Table table-id))))))))

(deftest table-can-read?-with-view-data-permission-test
  (testing "User with view-data and create-queries permission can read table"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms/add-user-to-group! (mt/user->id :rasta) pg)
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      (data-perms/set-table-permission! pg table-id :perms/view-data :unrestricted)
      (mt/with-test-user :rasta
        (is (false? (boolean (mi/can-read? (t2/select-one :model/Table table-id)))))))))

(deftest table-can-read?-with-manage-table-metadata-permission-test
  (testing "User with manage-table-metadata permission can read table"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms/add-user-to-group! (mt/user->id :rasta) pg)
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      (data-perms/set-table-permission! pg table-id :perms/manage-table-metadata :yes)
      (mt/with-test-user :rasta
        (is (true? (mi/can-read? (t2/select-one :model/Table table-id))))))))

(deftest table-can-read?-without-permissions-test
  (testing "User with neither permission cannot read table"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms/add-user-to-group! (mt/user->id :rasta) pg)
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      (mt/with-test-user :rasta
        (is (false? (mi/can-read? (t2/select-one :model/Table table-id))))))))

;;; ---------------------------------------- can-query? permission tests ----------------------------------------

(deftest table-can-query?-requires-both-view-data-and-create-queries-test
  (testing "User needs BOTH view-data AND create-queries to query"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms/add-user-to-group! (mt/user->id :rasta) pg)
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      ;; Only view-data - not enough
      (data-perms/set-table-permission! pg table-id :perms/view-data :unrestricted)
      (mt/with-test-user :rasta
        (is (false? (mi/can-query? (t2/select-one :model/Table table-id)))))
      ;; Add create-queries - now can query
      (data-perms/set-table-permission! pg table-id :perms/create-queries :query-builder)
      (mt/with-test-user :rasta
        (is (true? (mi/can-query? (t2/select-one :model/Table table-id))))))))

(deftest table-can-query?-manage-table-metadata-does-not-grant-query-access-test
  (testing "manage-table-metadata alone does NOT grant query access"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {table-id :id} {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms/add-user-to-group! (mt/user->id :rasta) pg)
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :blocked)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :no)
      (data-perms/set-table-permission! pg table-id :perms/manage-table-metadata :yes)
      (mt/with-test-user :rasta
        (is (false? (mi/can-query? (t2/select-one :model/Table table-id))))))))

;;; ---------------------------------------- can_query hydration test ----------------------------------------

(deftest table-can-query-hydration-test
  (testing ":can_query hydration works for tables"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table table {:db_id db-id}
                   :model/PermissionsGroup pg {}]
      (perms/add-user-to-group! (mt/user->id :rasta) pg)
      (t2/delete! :model/DataPermissions :db_id db-id)
      (data-perms/set-database-permission! pg db-id :perms/view-data :unrestricted)
      (data-perms/set-database-permission! pg db-id :perms/create-queries :query-builder)
      (mt/with-test-user :rasta
        (let [hydrated (t2/hydrate table :can_query)]
          (is (contains? hydrated :can_query))
          (is (boolean? (:can_query hydrated))))))))

(deftest serdes-descendants-includes-fields-and-segments-test
  (testing "Table descendants includes Fields and Segments"
    (mt/with-temp [:model/Database {db-id :id}      {:name "Test DB"}
                   :model/Table    {table-id :id}   {:name "Test Table" :db_id db-id}
                   :model/Field    {field1-id :id}  {:name "Field 1" :table_id table-id :base_type :type/Integer}
                   :model/Field    {field2-id :id}  {:name "Field 2" :table_id table-id :base_type :type/Text}
                   :model/Segment  {segment-id :id} {:name "Test Segment" :table_id table-id :definition {}}]
      (let [descendants (serdes/descendants "Table" table-id {})]
        (testing "Fields are included"
          (is (contains? descendants ["Field" field1-id]))
          (is (contains? descendants ["Field" field2-id])))
        (testing "Segments are included"
          (is (contains? descendants ["Segment" segment-id]))))))
  (testing "Table with no fields or segments returns empty map"
    (mt/with-temp [:model/Database {db-id :id}    {:name "Test DB"}
                   :model/Table    {table-id :id} {:name "Empty Table" :db_id db-id}]
      (is (= {} (serdes/descendants "Table" table-id {}))))))

(deftest serdes-descendants-skip-archived-segments-test
  (testing "Table descendants respects skip-archived option for Segments"
    (mt/with-temp [:model/Database {db-id :id}           {:name "Test DB"}
                   :model/Table    {table-id :id}        {:name "Test Table" :db_id db-id}
                   :model/Field    {field-id :id}        {:name "Test Field" :table_id table-id :base_type :type/Integer}
                   :model/Segment  {active-seg-id :id}   {:name "Active Segment" :table_id table-id :definition {} :archived false}
                   :model/Segment  {archived-seg-id :id} {:name "Archived Segment" :table_id table-id :definition {} :archived true}]
      (testing "archived segments are excluded when skip-archived: true"
        (let [descendants (serdes/descendants "Table" table-id {:skip-archived true})]
          (is (contains? descendants ["Field" field-id])
              "Fields are still included")
          (is (contains? descendants ["Segment" active-seg-id])
              "Active segments are included")
          (is (not (contains? descendants ["Segment" archived-seg-id]))
              "Archived segments are excluded")))
      (testing "archived segments are included when skip-archived: false"
        (let [descendants (serdes/descendants "Table" table-id {:skip-archived false})]
          (is (contains? descendants ["Segment" active-seg-id]))
          (is (contains? descendants ["Segment" archived-seg-id]))))
      (testing "archived segments are included when skip-archived is not specified"
        (let [descendants (serdes/descendants "Table" table-id {})]
          (is (contains? descendants ["Segment" active-seg-id]))
          (is (contains? descendants ["Segment" archived-seg-id])))))))
