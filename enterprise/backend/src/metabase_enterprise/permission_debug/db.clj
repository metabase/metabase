(ns metabase-enterprise.permission-debug.db
  "Application database queries for the permission-debug module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.permissions.core :as perms]
   [toucan2.core :as t2]))

(defn user-superuser?
  "Whether the User with `user-id` is a superuser."
  [user-id]
  (t2/select-one-fn :is_superuser :model/User :id user-id))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn- blocked-tables-select
  [user-id tables-expr permissions-blocking permissions-granting]
  {:select [[:db.name :db_name] :blocked.schema [:blocked.name :table_name] [:pg.name :group_name]]
   :from   [[:metabase_table :blocked]]
   :join   [[(perms/select-tables-and-groups-granting-perm
              {:user-id user-id :is-superuser? false}
              permissions-blocking) :perm_grant] [:= :blocked.id :perm_grant.id]
            [:metabase_database :db] [:= :blocked.db_id :db.id]
            [:permissions_group :pg] [:= :perm_grant.group_id :pg.id]]
   :where  [:and tables-expr
            [:not
             [:in :blocked.id (perms/visible-table-filter-select
                               :id
                               {:user-id user-id :is-superuser? false}
                               permissions-granting)]]]})

(defn blocked-tables-in-database
  "The `[db-name schema table-name group-name]` rows of every Table in the Database with `database-id` blocked (per
  `permissions-blocking`) for the User with `user-id`, excluding those granted (per `permissions-granting`)."
  [user-id database-id permissions-blocking permissions-granting]
  (t2/query (blocked-tables-select user-id [:= :blocked.db_id database-id] permissions-blocking permissions-granting)))

(defn blocked-tables-among
  "The `[db-name schema table-name group-name]` rows of the Tables with `table-ids` blocked (per
  `permissions-blocking`) for the User with `user-id`, excluding those granted (per `permissions-granting`)."
  [user-id table-ids permissions-blocking permissions-granting]
  (t2/query (blocked-tables-select user-id [:in :blocked.id table-ids] permissions-blocking permissions-granting)))
