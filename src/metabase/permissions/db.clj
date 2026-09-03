(ns metabase.permissions.db
  "Application database queries for the permissions module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [toucan2.core :as t2]))

;;; --------------------------------------------- DataPermissions ---------------------------------------------

(defn query-rows
  "The rows of the Honey SQL `query`."
  [query]
  (t2/query query))

(defn table-permission-values-for-groups
  "The set of `perm-type` values `group-ids` hold for the Table with `table-id` or for its whole Database."
  [group-ids perm-type database-id table-id]
  (t2/select-fn-set :value :model/DataPermissions
                    {:select [[:p.perm_value :value]]
                     :from   [[:data_permissions :p]]
                     :where  [:and
                              [:in :p.group_id group-ids]
                              [:= :p.perm_type perm-type]
                              [:= :p.db_id database-id]
                              [:or
                               [:= :table_id table-id]
                               [:= :table_id nil]]]}))

(defn user-data-permissions
  "The permission type, group, value, database, and table of every DataPermissions row of the groups the User with
  `user-id` belongs to, narrowed by the optional Honey SQL `database-clause` and `perm-type-clause`."
  [user-id database-clause perm-type-clause]
  (t2/select :model/DataPermissions
             {:select [[:p.perm_type :perm-type]
                       [:p.group_id :group-id]
                       [:p.perm_value :value]
                       [:p.db_id :db-id]
                       [:p.table_id :table-id]]
              :from   [[:permissions_group_membership :pgm]]
              :join   [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                       [:data_permissions :p]   [:= :p.group_id :pg.id]]
              :where  [:and
                       [:= :pgm.user_id user-id]
                       database-clause
                       perm-type-clause]}))

(defn data-permissions-for-groups-and-databases
  "The DataPermissions of `group-ids` on the Databases with `database-ids`."
  [group-ids database-ids]
  (t2/select :model/DataPermissions :group_id [:in group-ids] :db_id [:in database-ids]))

(defn database-level-permission
  "The database-level `perm-type` DataPermissions row of the group with `group-id` on the Database with
  `database-id`, or nil."
  [perm-type group-id database-id]
  (t2/select-one :model/DataPermissions
                 {:where [:and
                          [:= :perm_type perm-type]
                          [:= :group_id  group-id]
                          [:= :db_id     database-id]
                          [:= :table_id  nil]]}))

(defn database-level-permissions
  "The database-level DataPermissions rows of `perm-types` for `group-ids` on the Database with `database-id`."
  [database-id group-ids perm-types]
  (t2/select :model/DataPermissions
             {:where [:and [:= :db_id database-id] [:= :table_id nil]
                      [:in :group_id group-ids] [:in :perm_type perm-types]]}))

(defn distinct-table-level-permission-values
  "The distinct group, permission type, schema, and value combinations of the table-level DataPermissions rows of
  `perm-types` for `group-ids` on the Database with `database-id`."
  [database-id group-ids perm-types]
  (t2/select :model/DataPermissions
             {:select-distinct [:group_id :perm_type :schema_name :perm_value]
              :where           [:and [:= :db_id database-id] [:not= :table_id nil]
                                [:in :group_id group-ids] [:in :perm_type perm-types]]}))

(defn distinct-database-permission-values-for-group
  "The distinct database, permission type, and value combinations of the DataPermissions rows of the group with
  `group-id`."
  [group-id]
  (t2/select :model/DataPermissions
             {:select-distinct [:db_id :perm_type :perm_value]
              :where           [:= :group_id group-id]}))

(defn other-table-permission-values
  "The distinct `perm-type` values of the group with `group-id` on tables of the Database with `database-id` other
  than `table-ids`."
  [group-id database-id perm-type table-ids]
  (t2/query {:select-distinct [:perm_value]
             :from            [(t2/table-name :model/DataPermissions)]
             :where           [:and
                               [:= :group_id group-id]
                               [:= :db_id database-id]
                               [:= :perm_type perm-type]
                               [:not= :table_id nil]
                               [:not [:in :table_id table-ids]]]}))

(defn table-permission-ids
  "The IDs of the `perm-type` DataPermissions rows of the group with `group-id` on the Tables with `table-ids`."
  [perm-type group-id table-ids]
  (t2/select [:model/DataPermissions :id]
             {:where [:and
                      [:= :perm_type perm-type]
                      [:= :group_id group-id]
                      [:in :table_id table-ids]]}))

(defn non-audit-permission-values-for-groups
  "The distinct group, permission type, and value combinations of the DataPermissions rows of `group-ids` for
  `perm-types`, excluding rows on the audit Database."
  [group-ids perm-types]
  (t2/query {:select-distinct [:group_id :perm_type :perm_value]
             :from            [[(t2/table-name :model/DataPermissions)]]
             :where           [:and
                               [:in :group_id group-ids]
                               [:in :perm_type perm-types]
                               [:not [:exists ^:allow-subquery {:select [1]
                                                                :from   [[(t2/table-name :model/Database) :audit_db]]
                                                                :where  [:and
                                                                         [:= :audit_db.is_audit true]
                                                                         [:= :audit_db.id :data_permissions.db_id]]}]]]}))

(defn insert-data-permissions!
  "Insert the DataPermissions `rows`."
  [rows]
  (t2/insert! :model/DataPermissions rows))

(defn delete-data-permissions!
  "Delete the DataPermissions with `ids`."
  [ids]
  (t2/delete! :model/DataPermissions :id [:in ids]))

;;; ----------------------------------------------- Permissions -----------------------------------------------

(defn group-ids-with-permission-objects
  "The set of group IDs holding a Permissions row for one of `objects`."
  [objects]
  (t2/select-fn-set :group_id :model/Permissions {:where [:in :object objects]}))

(defn permission-objects-where
  "The set of Permissions objects matching the Honey SQL `where` map."
  [where]
  (t2/select-fn-set :object :model/Permissions where))

(defn delete-permissions-where!
  "Delete the Permissions rows matching the Honey SQL `where` map."
  [where]
  (t2/delete! :model/Permissions where))

(defn insert-permissions!
  "Insert the Permissions `rows`."
  [rows]
  (t2/insert! :model/Permissions rows))

;;; --------------------------------------------- PermissionsGroup ---------------------------------------------

(defn magic-group
  "The ID, name, and type of the magic PermissionsGroup of `magic-group-type`, or nil."
  [magic-group-type]
  (t2/select-one [:model/PermissionsGroup :id :name :magic_group_type] :magic_group_type magic-group-type))

(defn group-by-magic-type
  "The PermissionsGroup of `magic-group-type`, or nil."
  [magic-group-type]
  (t2/select-one :model/PermissionsGroup :magic_group_type magic-group-type))

(defn group-id-by-magic-type
  "The ID of the PermissionsGroup of `magic-group-type`, or nil."
  [magic-group-type]
  (t2/select-one-pk :model/PermissionsGroup :magic_group_type magic-group-type))

(defn group-exists-with-lower-name?
  "Whether a PermissionsGroup whose lower-cased name is `lower-name` exists."
  [lower-name]
  (t2/exists? :model/PermissionsGroup :%lower.name lower-name))

(defn groups-except-magic-type
  "The PermissionsGroups other than the magic group of `magic-group-type`."
  [magic-group-type]
  (t2/select :model/PermissionsGroup :magic_group_type [:not= magic-group-type]))

(defn non-magic-groups
  "The PermissionsGroups that are not magic groups."
  []
  (t2/select :model/PermissionsGroup {:where [:= :magic_group_type nil]}))

(defn tenant-group?
  "Whether the PermissionsGroup with `group-id` is a tenant group."
  [group-id]
  (t2/select-one-fn :is_tenant_group :model/PermissionsGroup :id group-id))

(defn tenant-group-ids
  "The IDs of every tenant PermissionsGroup."
  []
  (t2/select-pks-set :model/PermissionsGroup :is_tenant_group true))

(defn group-tenant-flags
  "A map of group ID to `:is_tenant_group` for `group-ids`."
  [group-ids]
  (t2/select-pk->fn :is_tenant_group [:model/PermissionsGroup :id :is_tenant_group] :id [:in group-ids]))

(defn group-names-like
  "The set of PermissionsGroup names matching the SQL `pattern`."
  [pattern]
  (t2/select-fn-set :name :model/PermissionsGroup :name [:like pattern]))

(defn group-members
  "The active Users in the PermissionsGroups with `group-ids`, with the optional extra `group-manager-column`."
  [group-ids group-manager-column]
  (t2/select :model/User {:select    [:u.id
                                      [:u.id :user_id]
                                      :u.first_name
                                      :u.last_name
                                      :u.email
                                      :u.is_superuser
                                      :u.type
                                      :pgm.group_id
                                      [:pgm.id :membership_id]
                                      group-manager-column]
                          :from      [[:core_user :u]]
                          :left-join [[:permissions_group_membership :pgm] [:= :u.id :pgm.user_id]]
                          :where     [:and
                                      [:= :u.is_active true]
                                      [:in :pgm.group_id group-ids]]
                          :order-by  [[[:lower :u.first_name] :asc]
                                      [[:lower :u.last_name] :asc]]}))

(defn insert-group!
  "Insert `group` and return the new instance."
  [group]
  (t2/insert-returning-instance! :model/PermissionsGroup group))

(defn update-group!
  "Apply `changes` to the PermissionsGroup with `group-id`."
  [group-id changes]
  (t2/update! :model/PermissionsGroup group-id changes))

;;; ---------------------------------------- PermissionsGroupMembership ----------------------------------------

(defn execute-one!
  "Run the Honey SQL statement `query` and return its single result."
  [query]
  (t2/query-one query))

(defn group-membership-count
  "The number of memberships of the PermissionsGroup with `group-id`."
  [group-id]
  (t2/count :model/PermissionsGroupMembership :group_id group-id))

(defn other-active-member-count
  "The number of active Users other than `user-id` in the PermissionsGroup with `group-id`."
  [group-id user-id]
  (t2/count :model/PermissionsGroupMembership
            {:join  [[:core_user :user] [:= :user.id :user_id]]
             :where [:and
                     [:= :group_id group-id]
                     [:= :user.is_active true]
                     [:not= :user.id user-id]]}))

(defn memberships-for-user
  "The PermissionsGroupMemberships of the User with `user-id`."
  [user-id]
  (t2/select :model/PermissionsGroupMembership :user_id user-id))

(defn memberships-for-user-in-groups
  "The PermissionsGroupMemberships of the User with `user-id` in the groups with `group-ids`."
  [user-id group-ids]
  (t2/select :model/PermissionsGroupMembership :user_id user-id :group_id [:in group-ids]))

(defn memberships-for-group
  "The PermissionsGroupMemberships of the PermissionsGroup with `group-id`."
  [group-id]
  (t2/select :model/PermissionsGroupMembership :group_id group-id))

(defn delete-memberships-for-user!
  "Delete the PermissionsGroupMemberships of the User with `user-id`."
  [user-id]
  (t2/delete! :model/PermissionsGroupMembership :user_id user-id))

(defn delete-memberships-for-user-in-groups!
  "Delete the PermissionsGroupMemberships of the User with `user-id` in the groups with `group-ids`."
  [user-id group-ids]
  (t2/delete! :model/PermissionsGroupMembership :user_id user-id :group_id [:in group-ids]))

(defn delete-memberships-for-group!
  "Delete the PermissionsGroupMemberships of the PermissionsGroup with `group-id`."
  [group-id]
  (t2/delete! :model/PermissionsGroupMembership :group_id group-id))

;;; ------------------------------------------------ Revisions ------------------------------------------------

(defn latest-revision-row
  "The `:id` row holding the highest ID of `revision-model`."
  [revision-model]
  (t2/select-one [revision-model [:%max.id :id]]))

(defn insert-revision!
  "Insert `revision` into `revision-model`."
  [revision-model revision]
  (t2/insert! revision-model revision))

(defn insert-revision-returning-instance!
  "Insert `revision` into `revision-model` and return the new instance."
  [revision-model revision]
  (first (t2/insert-returning-instances! revision-model revision)))

(defn update-collection-graph-revision!
  "Apply `changes` to the CollectionPermissionGraphRevision with `revision-id`."
  [revision-id changes]
  (t2/update! :model/CollectionPermissionGraphRevision revision-id changes))

;;; ----------------------------------------------- Collections -----------------------------------------------

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection :id collection-id))

(defn collection-ids-where
  "The set of IDs of the Collections matching the Honey SQL `where`."
  [where]
  (t2/select-pks-set :model/Collection {:where where}))

(defn library-collection-ids
  "The IDs of the library Collections."
  []
  (t2/select-pks-set :model/Collection :type [:in ["library" "library-data" "library-metrics"]]))

(defn collection-graph-rows-reducible
  "Reducible rows of the collection permissions graph Honey SQL `query`."
  [query]
  (t2/reducible-query query))

;;; ------------------------------------------------- Users -------------------------------------------------

(defn user-superuser?
  "Whether the User with `user-id` is a superuser."
  [user-id]
  (t2/select-one-fn :is_superuser :model/User :id user-id))

(defn user-data-analyst?
  "Whether the User with `user-id` is a data analyst."
  [user-id]
  (t2/select-one-fn :is_data_analyst :model/User :id user-id))

(defn user-tenant-ids
  "A map of User ID to `:tenant_id` for `user-ids`."
  [user-ids]
  (t2/select-pk->fn :tenant_id [:model/User :id :tenant_id] :id [:in user-ids]))

(defn earliest-user-join-row
  "The `:min` row holding the earliest `date_joined` of any User."
  []
  (t2/select-one [:model/User [:%min.date_joined :min]]))

(defn update-user!
  "Apply `changes` to the User with `user-id`."
  [user-id changes]
  (t2/update! :model/User user-id changes))

(defn update-users!
  "Apply `changes` to the Users with `user-ids`."
  [user-ids changes]
  (t2/update! :model/User :id [:in user-ids] changes))

(defn clear-data-analyst-flags!
  "Unset `is_data_analyst` on every User that has it set."
  []
  (t2/update! :model/User {:is_data_analyst true} {:is_data_analyst false}))

(defn deactivate-active-tenant-users!
  "Deactivate every active tenant User, marking them as deactivated with their tenant."
  []
  (t2/update! :model/User :tenant_id [:not= nil] :is_active true {:is_active false :deactivated_with_tenant true}))

(defn deactivate-all-tenants!
  "Mark every tenant row inactive."
  []
  (t2/query {:update :tenant
             :set    {:is_active false}}))

;;; --------------------------------------------- Databases and Tables ---------------------------------------------

(defn non-destination-database-ids
  "The IDs of the Databases that are not routing destinations."
  []
  (t2/select-pks-vec :model/Database :router_database_id nil))

(defn destination-database?
  "Whether the Database with `database-id` is a routing destination."
  [database-id]
  (t2/exists? :model/Database :id database-id :router_database_id [:not= nil]))

(defn table-location
  "The ID, Database ID, and schema of the Table with `table-id`."
  [table-id]
  (t2/select-one [:model/Table :id :db_id :schema] :id table-id))

(defn table-database-id
  "The Database ID of the Table with `table-id`."
  [table-id]
  (t2/select-one-fn :db_id :model/Table table-id))

(defn table-database-id-rows
  "The ID and Database ID of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Table :id :db_id] :id [:in table-ids]))

(defn active-table-locations-for-database
  "The ID, Database ID, and schema of the active Tables of the Database with `database-id`."
  [database-id]
  (t2/select [:model/Table :id :db_id :schema] :db_id database-id :active true))

(defn table-ids-and-schemas-excluding
  "The ID and schema of the Tables of the Database with `database-id` other than `excluded-table-ids`."
  [database-id excluded-table-ids]
  (t2/select [:model/Table :id :schema]
             {:where [:and
                      [:= :db_id database-id]
                      [:not [:in :id excluded-table-ids]]]}))

(defn field-visibility-rows
  "The ID, visibility type, and Table ID of the Fields with `field-ids`."
  [field-ids]
  (t2/select [:model/Field :id :visibility_type :table_id] :id [:in field-ids]))

(defn instance-by-id
  "The instance of `model` with `id`, or nil."
  [model id]
  (t2/select-one model :id id))
