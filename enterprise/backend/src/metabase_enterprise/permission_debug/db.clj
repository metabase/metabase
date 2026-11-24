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
  {:select [[:db.name :db_name] :blocked.schema [:blocked.name :table_name] [:pg.name :group_name]]
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
