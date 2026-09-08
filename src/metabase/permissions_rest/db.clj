(ns metabase.permissions-rest.db
  "Application database queries for the permissions REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- managed-groups-clause
  [group-id-column manager-user-id]
  (when manager-user-id
    [:in group-id-column ^:allow-subquery {:select [:group_id]
                                           :from   [:permissions_group_membership]
                                           :where  [:and
                                                    [:= :user_id manager-user-id]
                                                    [:= :is_group_manager true]]}]))

(mu/defn permissions-groups :- [:sequential (ms/InstanceOf :model/PermissionsGroup)]
  "Up to `limit` PermissionsGroups starting at `offset` (both optional), ordered by lower-cased name.

  `tenancy` (\"external\"/\"internal\"/nil) narrows to tenant/non-tenant groups (nil returns both); when
  `tenancy` is \"external\" and `tenants-enabled?` is false, no groups are returned. `manager-user-id`, when given,
  restricts to the groups that User manages. `advanced-permissions-enabled?` false excludes the data-analyst magic
  group. `tenants-enabled?` false also excludes tenant groups outright, independent of `tenancy`."
  [limit  :- [:maybe ms/PositiveInt]
   offset :- [:maybe ms/IntGreaterThanOrEqualToZero]
   {:keys [tenancy manager-user-id tenants-enabled? advanced-permissions-enabled?]}
   :- [:map {:closed true}
       [:tenancy                        {:optional true} [:maybe [:enum "external" "internal"]]]
       [:manager-user-id                {:optional true} [:maybe ms/PositiveInt]]
       [:tenants-enabled?               {:optional true} :boolean]
       [:advanced-permissions-enabled?  {:optional true} :boolean]]]
  (let [base-where [:and
                    (managed-groups-clause :id manager-user-id)
                    (when-not tenants-enabled? [:not :is_tenant_group])
                    (when-not advanced-permissions-enabled?
                      [:or [:= nil :magic_group_type] [:not= "data-analyst" :magic_group_type]])]
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

(mu/defn permissions-group :- [:maybe (ms/InstanceOf :model/PermissionsGroup)]
  "The PermissionsGroup with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/PermissionsGroup :id id))

(mu/defn permissions-group-exists? :- :boolean
  "Whether a PermissionsGroup with `id` exists."
  [id :- ms/PositiveInt]
  (t2/exists? :model/PermissionsGroup :id id))

(mu/defn insert-permissions-group! :- (ms/InstanceOf :model/PermissionsGroup)
  "Insert a PermissionsGroup and return the inserted instance."
  [group-name    :- :string
   tenant-group? :- :boolean]
  (t2/insert-returning-instance! :model/PermissionsGroup :name group-name :is_tenant_group tenant-group?))

(mu/defn rename-permissions-group! :- :int
  "Set the name of the PermissionsGroup with `id`, returning the number updated."
  [id         :- ms/PositiveInt
   group-name :- :string]
  (t2/update! :model/PermissionsGroup id {:name group-name}))

(mu/defn delete-permissions-group! :- :int
  "Delete the PermissionsGroup with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/PermissionsGroup :id id))

(mu/defn group-memberships :- [:sequential (ms/InstanceOf :model/PermissionsGroupMembership)]
  "The membership id, group id, user id, and group manager flag of every PermissionsGroupMembership, optionally
  restricted to the groups `manager-user-id` manages, excluding `excluded-group-id`, and excluding tenant groups
  when `exclude-tenant-groups?`."
  [{:keys [manager-user-id excluded-group-id exclude-tenant-groups?]}
   :- [:map {:closed true}
       [:manager-user-id          {:optional true} [:maybe ms/PositiveInt]]
       [:excluded-group-id        {:optional true} [:maybe ms/PositiveInt]]
       [:exclude-tenant-groups?   {:optional true} :boolean]]]
  (t2/select [:model/PermissionsGroupMembership [:id :membership_id] :group_id :user_id :is_group_manager]
             {:where (into [:and]
                           (keep identity)
                           [(managed-groups-clause :group_id manager-user-id)
                            (when excluded-group-id [:not= :group_id excluded-group-id])
                            (when exclude-tenant-groups?
                              [:not-in :group_id ^:allow-subquery {:select [:id]
                                                                   :from   [:permissions_group]
                                                                   :where  [:= :is_tenant_group true]}])])}))

(mu/defn non-admin-user-exists? :- :boolean
  "Whether the User with `user-id` exists and is not a superuser."
  [user-id :- ms/PositiveInt]
  (t2/exists? :model/User :id user-id :is_superuser false))

(mu/defn group-membership :- [:maybe (ms/InstanceOf :model/PermissionsGroupMembership)]
  "The PermissionsGroupMembership with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/PermissionsGroupMembership :id id))

(mu/defn set-group-membership-manager! :- :int
  "Set the group manager flag of the PermissionsGroupMembership with `id`, returning the number updated."
  [id             :- ms/PositiveInt
   group-manager? :- :boolean]
  (t2/update! :model/PermissionsGroupMembership id {:is_group_manager group-manager?}))

(mu/defn non-destination-database-ids :- [:maybe [:sequential ms/PositiveInt]]
  "The ids of the Databases that are not routing destinations, excluding `excluded-database-id` (nil for no
  exclusion)."
  [excluded-database-id :- [:maybe ms/PositiveInt]]
  (t2/select-pks-vec :model/Database {:where [:and
                                              (when excluded-database-id [:not= :id excluded-database-id])
                                              [:= :router_database_id nil]]}))

(mu/defn data-permissions-reducible
  "A reducible of the type, group id, value, database id, schema, and table id of the DataPermissions rows of
  non-destination Databases, optionally narrowed to `perm-type`, `db-id`, `group-id`, `group-ids`, and excluding
  `excluded-database-id` (nil for no restriction), ordered by group and database."
  [{:keys [perm-type db-id group-id group-ids excluded-database-id]}
   :- [:map {:closed true}
       [:perm-type              {:optional true} [:maybe [:or :keyword :string]]]
       [:db-id                  {:optional true} [:maybe ms/PositiveInt]]
       [:group-id               {:optional true} [:maybe ms/PositiveInt]]
       [:group-ids              {:optional true} [:maybe [:seqable ms/PositiveInt]]]
       [:excluded-database-id   {:optional true} [:maybe ms/PositiveInt]]]]
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

(mu/defn tables-for-databases :- [:sequential (ms/InstanceOf :model/Table)]
  "The id, Database id, and schema of the Tables of the Databases with `database-ids`."
  [database-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Table :id :db_id :schema] :db_id [:in database-ids]))
