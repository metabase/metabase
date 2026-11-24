(ns metabase-enterprise.permission-debug.db
  "Application database queries for the permission-debug module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn user-superuser?
  "Whether the User with `user-id` is a superuser."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :is_superuser :model/User :id user-id))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(defn- blocked-tables-select
  [user-id tables-expr permissions-blocking permissions-granting]
  {:select [[:blocked.id :table_id] [:db.name :db_name] :blocked.schema [:blocked.name :table_name] [:pg.name :group_name]]
   :from   [[(t2/table-name :model/Table) :blocked]]
   :join   [[(perms/select-tables-and-groups-granting-perm
              {:user-id user-id :is-superuser? false :is-data-analyst? false}
              permissions-blocking) :perm_grant] [:= :blocked.id :perm_grant.id]
            [(t2/table-name :model/Database) :db] [:= :blocked.db_id :db.id]
            [(t2/table-name :model/PermissionsGroup) :pg] [:= :perm_grant.group_id :pg.id]]
   :where  [:and tables-expr
            [:not (perms/visible-tables-filter-clause
                   :blocked.id
                   {:user-id user-id :is-superuser? false :is-data-analyst? false}
                   permissions-granting
                   {:active-only? false, :include-published-via-collection? false})]]})

(mu/defn blocked-tables-in-database
  "The `[db-name schema table-name group-name]` rows of every Table in the Database with `database-id` blocked (per
  `permissions-blocking`) for the User with `user-id`, excluding those granted (per `permissions-granting`).

  `permissions-blocking`/`permissions-granting` are permission-type -> permission-value mappings, per
  `::permissions.schema/permission-mapping`; db.clj builds the Honey SQL from them."
  [user-id              :- ::lib.schema.id/user
   database-id          :- ::lib.schema.id/database
   permissions-blocking :- ::permissions.schema/permission-mapping
   permissions-granting :- ::permissions.schema/permission-mapping]
  (t2/query (blocked-tables-select user-id [:= :blocked.db_id database-id] permissions-blocking permissions-granting)))

(mu/defn blocked-tables-among
  "The `[db-name schema table-name group-name]` rows of the Tables with `table-ids` blocked (per
  `permissions-blocking`) for the User with `user-id`, excluding those granted (per `permissions-granting`).

  `permissions-blocking`/`permissions-granting` are permission-type -> permission-value mappings, per
  `::permissions.schema/permission-mapping`; db.clj builds the Honey SQL from them."
  [user-id              :- ::lib.schema.id/user
   table-ids            :- [:set ::lib.schema.id/table]
   permissions-blocking :- ::permissions.schema/permission-mapping
   permissions-granting :- ::permissions.schema/permission-mapping]
  (mdb/select-batched #(t2/query (blocked-tables-select user-id [:in :blocked.id %] permissions-blocking permissions-granting))
                      table-ids))

(mu/defn stand-in
  "The id and tenant id of the stand-in user with `email`, or nil."
  [email :- :string]
  (t2/select-one [:model/User :id :tenant_id] :email email :type :permission-preview))

(mu/defn most-common-tenant-id
  "The id of the active Tenant that most of the active personal Users in the PermissionsGroup with `group-id` belong
  to, the lowest id among equals, or nil when no member belongs to one."
  [group-id :- ms/PositiveInt]
  (:tenant_id (t2/query-one {:select    [[:u.tenant_id :tenant_id]]
                             :from      [[(t2/table-name :model/PermissionsGroupMembership) :pgm]]
                             :join      [[(t2/table-name :model/User) :u]   [:= :u.id :pgm.user_id]
                                         [(t2/table-name :model/Tenant) :t] [:= :t.id :u.tenant_id]]
                             :where     [:and
                                         [:= :pgm.group_id group-id]
                                         [:= :u.is_active true]
                                         [:= :u.type "personal"]
                                         [:= :t.is_active true]]
                             :group-by  [:u.tenant_id]
                             :order-by  [[[:count :*] :desc] [:u.tenant_id :asc]]
                             :limit     1})))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboard-cards
  "The Cards on the Dashboard with `dashboard-id`, each once."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (when-let [card-ids (not-empty (t2/select-fn-set :card_id :model/DashboardCard
                                                   :dashboard_id dashboard-id
                                                   :card_id [:not= nil]))]
    (t2/select :model/Card :id [:in card-ids] {:order-by [[:id :asc]]})))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn accessible-collections
  "The `:id`, `:name`, `:location` and `:personal_owner_id` of the Collections of the default namespace that are worth
  explaining for the User with `user-id`: not archived, not the Trash or analytics, and not another person's personal
  Collection."
  [user-id :- ::lib.schema.id/user]
  (t2/select [:model/Collection :id :name :location :personal_owner_id]
             :archived false
             :namespace nil
             {:where    [:and
                         [:or [:= :type nil] [:not-in :type ["trash" "instance-analytics"]]]
                         [:or [:= :personal_owner_id nil] [:= :personal_owner_id user-id]]]
              :order-by [[:name :asc] [:id :asc]]}))

(mu/defn active-table-ids
  "The ids of the active Tables of every Database that isn't the audit Database."
  []
  (when-let [database-ids (not-empty (t2/select-pks-set :model/Database :is_audit false))]
    (t2/select-pks-set :model/Table :active true :db_id [:in database-ids])))

(mu/defn user-groups
  "The `:id`, `:name` and `:magic_group_type` of the PermissionsGroups the User with `user-id` belongs to, in ID order."
  [user-id :- ::lib.schema.id/user]
  (t2/select [:model/PermissionsGroup :id :name :magic_group_type]
             :id [:in (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id)]
             {:order-by [[:id :asc]]}))

(mu/defn collection-grant-objects
  "The `[group-id object]` pairs of the Permissions rows of the groups with `group-ids` on the Collection permission
  paths `objects`."
  [group-ids :- [:set ms/PositiveInt]
   objects   :- [:sequential :string]]
  (when (seq group-ids)
    (t2/select-fn-vec (juxt :group_id :object) :model/Permissions :group_id [:in group-ids] :object [:in objects])))

(mu/defn tables-with-database
  "The `:id`, `:db_id`, `:schema`, `:name` and `:db_name` of the Tables with `table-ids`, in ID order."
  [table-ids :- [:set ::lib.schema.id/table]]
  (when (seq table-ids)
    (t2/query {:select   [:t.id :t.db_id :t.schema :t.name [:db.name :db_name]]
               :from     [[(t2/table-name :model/Table) :t]]
               :join     [[:metabase_database :db] [:= :t.db_id :db.id]]
               :where    [:in :t.id table-ids]
               :order-by [[:t.id :asc]]})))

(mu/defn table-ids-of-database
  "The ids of the Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-pks-set :model/Table :db_id database-id))

(mu/defn sandboxes
  "The Sandboxes of the groups with `group-ids` on the Tables with `table-ids`, with their `:id`, `:group_id`,
  `:table_id`, `:card_id` and `:attribute_remappings`."
  [group-ids :- [:set ms/PositiveInt]
   table-ids :- [:set ::lib.schema.id/table]]
  (when (and (seq group-ids) (seq table-ids))
    (t2/select :model/Sandbox :group_id [:in group-ids] :table_id [:in table-ids] {:order-by [[:id :asc]]})))

(mu/defn field-labels
  "A map of Field id to `Table.Field` of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (when (seq field-ids)
    (into {}
          (map (fn [{:keys [id name table_name]}] [id (str table_name "." name)]))
          (t2/query {:select [:f.id :f.name [:t.name :table_name]]
                     :from   [[(t2/table-name :model/Field) :f]]
                     :join   [[(t2/table-name :model/Table) :t] [:= :f.table_id :t.id]]
                     :where  [:in :f.id field-ids]}))))

(mu/defn impersonations
  "The ConnectionImpersonations of the groups with `group-ids` on the Databases with `database-ids`."
  [group-ids    :- [:set ms/PositiveInt]
   database-ids :- [:set ::lib.schema.id/database]]
  (when (and (seq group-ids) (seq database-ids))
    (t2/select :model/ConnectionImpersonation :group_id [:in group-ids] :db_id [:in database-ids]
               {:order-by [[:id :asc]]})))

(mu/defn routers
  "The DatabaseRouters of the Databases with `database-ids`, each with its `:name`."
  [database-ids :- [:set ::lib.schema.id/database]]
  (when (seq database-ids)
    (t2/query {:select [:r.database_id :r.user_attribute [:db.name :name]]
               :from   [[(t2/table-name :model/DatabaseRouter) :r]]
               :join   [[:metabase_database :db] [:= :r.database_id :db.id]]
               :where  [:in :r.database_id database-ids]})))

(mu/defn destination-database
  "The `:id` and `:name` of the destination Database of the router Database `router-database-id` named
  `destination-name`, or nil."
  [router-database-id :- ::lib.schema.id/database
   destination-name   :- :string]
  (t2/select-one [:model/Database :id :name] :router_database_id router-database-id :name destination-name))
