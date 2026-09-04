(ns metabase.permissions-rest.db
  "Application database queries for the permissions REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- managed-groups-clause
  [group-id-column manager-user-id]
  (when manager-user-id
    [:in group-id-column ^:allow-subquery {:select [:group_id]
                                           :from   [:permissions_group_membership]
                                           :where  [:and
                                                    [:= :user_id manager-user-id]
                                                    [:= :is_group_manager true]]}]))

(defn- data-analyst-visibility-clause
  "Clause over a `permissions_group` query keeping every group except the data-analyst magic group, plus that group
  when it has at least one active member."
  []
  [:or
   [:= nil :magic_group_type]
   [:not= "data-analyst" :magic_group_type]
   [:exists ^:allow-subquery {:select [1]
                              :from   [[:permissions_group_membership :pgm]]
                              :join   [[:core_user :member] [:= :member.id :pgm.user_id]]
                              :where  [:and
                                       [:= :pgm.group_id :permissions_group.id]
                                       [:= :member.is_active true]]}]])

(defn permissions-groups
  "Up to `limit` PermissionsGroups starting at `offset` (both optional), ordered by lower-cased name.

  `tenancy` (\"external\"/\"internal\"/nil) narrows to tenant/non-tenant groups (nil returns both); when
  `tenancy` is \"external\" and `tenants-enabled?` is false, no groups are returned. `manager-user-id`, when given,
  restricts to the groups that User manages. `advanced-permissions-enabled?` false excludes the data-analyst magic
  group unless it has at least one active member. `tenants-enabled?` false also excludes tenant groups outright,
  independent of `tenancy`."
  [limit offset {:keys [tenancy manager-user-id tenants-enabled? advanced-permissions-enabled?]}]
  (let [base-where [:and
                    (managed-groups-clause :id manager-user-id)
                    (when-not tenants-enabled? [:not :is_tenant_group])
                    (when-not advanced-permissions-enabled? (data-analyst-visibility-clause))]
        where (case tenancy
                "external" (if tenants-enabled?
                             [:and base-where [:= :is_tenant_group true]]
                             [:= 1 0])
                "internal" [:and base-where [:or [:= :is_tenant_group false] [:= :is_tenant_group nil]]]
                base-where)]
    (t2/select :model/PermissionsGroup
               (cond-> {:where where :order-by [:%lower.name]}
                 limit  (assoc :limit limit)
                 offset (assoc :offset offset)))))

(defn permissions-group
  "The PermissionsGroup with `id`, or nil."
  [id]
  (t2/select-one :model/PermissionsGroup :id id))

(defn permissions-group-exists?
  "Whether a PermissionsGroup with `id` exists."
  [id]
  (t2/exists? :model/PermissionsGroup :id id))

(defn insert-permissions-group!
  "Insert a PermissionsGroup and return the inserted instance."
  [group-name tenant-group?]
  (t2/insert-returning-instance! :model/PermissionsGroup :name group-name :is_tenant_group tenant-group?))

(defn rename-permissions-group!
  "Set the name of the PermissionsGroup with `id`."
  [id group-name]
  (t2/update! :model/PermissionsGroup id {:name group-name}))

(defn delete-permissions-group!
  "Delete the PermissionsGroup with `id`."
  [id]
  (t2/delete! :model/PermissionsGroup :id id))

(defn group-memberships
  "The membership id, group id, user id, and group manager flag of every PermissionsGroupMembership, optionally
  restricted to the groups `manager-user-id` manages, and excluding tenant groups when `exclude-tenant-groups?`."
  [{:keys [manager-user-id exclude-tenant-groups?]}]
  (t2/select [:model/PermissionsGroupMembership [:id :membership_id] :group_id :user_id :is_group_manager]
             {:where (into [:and]
                           (keep identity)
                           [(managed-groups-clause :group_id manager-user-id)
                            (when exclude-tenant-groups?
                              [:not-in :group_id ^:allow-subquery {:select [:id]
                                                                   :from   [:permissions_group]
                                                                   :where  [:= :is_tenant_group true]}])])}))

(defn non-admin-user-exists?
  "Whether the User with `user-id` exists and is not a superuser."
  [user-id]
  (t2/exists? :model/User :id user-id :is_superuser false))

(defn group-membership
  "The PermissionsGroupMembership with `id`, or nil."
  [id]
  (t2/select-one :model/PermissionsGroupMembership :id id))

(defn set-group-membership-manager!
  "Set the group manager flag of the PermissionsGroupMembership with `id`."
  [id group-manager?]
  (t2/update! :model/PermissionsGroupMembership id {:is_group_manager group-manager?}))

(defn non-destination-database-ids
  "The ids of the Databases that are not routing destinations, excluding `excluded-database-id` (nil for no
  exclusion)."
  [excluded-database-id]
  (t2/select-pks-vec :model/Database {:where [:and
                                              (when excluded-database-id [:not= :id excluded-database-id])
                                              [:= :router_database_id nil]]}))

(defn data-permissions-reducible
  "A reducible of the type, group id, value, database id, schema, and table id of the DataPermissions rows of
  non-destination Databases, optionally narrowed to `perm-type`, `db-id`, `group-id`, `group-ids`, and excluding
  `excluded-database-id` (nil for no restriction), ordered by group and database."
  [{:keys [perm-type db-id group-id group-ids excluded-database-id]}]
  (t2/reducible-query
   {:select   [[:perm_type :type]
               [:group_id :group-id]
               [:perm_value :value]
               [:db_id :db-id]
               [:schema_name :schema]
               [:table_id :table-id]]
    :from     [(t2/table-name :model/DataPermissions)]
    :where    (conj (into [:and]
                          (keep identity)
                          [(when perm-type [:= :perm_type (u/qualified-name perm-type)])
                           (when db-id [:= :db_id db-id])
                           (when group-id [:= :group_id group-id])
                           (when group-ids [:in :group_id group-ids])
                           (when excluded-database-id [:not= :db_id excluded-database-id])])
                    [:not [:exists ^:allow-subquery {:select [1]
                                                     :from   [[(t2/table-name :model/Database) :router_db]]
                                                     :where  [:and
                                                              [:not= :router_db.router_database_id nil]
                                                              [:= :router_db.id :db_id]]}]])
    :order-by [:group_id :db_id]}))

(defn tables-for-databases
  "The id, Database id, and schema of the Tables of the Databases with `database-ids`."
  [database-ids]
  (t2/select [:model/Table :id :db_id :schema] :db_id [:in database-ids]))
