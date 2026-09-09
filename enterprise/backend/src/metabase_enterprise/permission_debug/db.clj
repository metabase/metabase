(ns metabase-enterprise.permission-debug.db
  "Application database queries for the permission-debug module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn user-superuser? :- [:maybe :boolean]
  "Whether the User with `user-id` is a superuser."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :is_superuser :model/User :id user-id))

(mu/defn card :- [:maybe ::queries.schema/card]
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
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

(def ^:private BlockedTableRow
  [:map {:closed true}
   [:db_name :string]
   [:schema [:maybe :string]]
   [:table_name :string]
   [:group_name :string]])

(mu/defn blocked-tables-in-database :- [:sequential BlockedTableRow]
  "The `[db-name schema table-name group-name]` rows of every Table in the Database with `database-id` blocked (per
  `permissions-blocking`) for the User with `user-id`, excluding those granted (per `permissions-granting`)."
  [user-id              :- ::lib.schema.id/user
   database-id          :- ::lib.schema.id/database
   permissions-blocking :- :map
   permissions-granting :- :map]
  (t2/query (blocked-tables-select user-id [:= :blocked.db_id database-id] permissions-blocking permissions-granting)))

(mu/defn blocked-tables-among :- [:sequential BlockedTableRow]
  "The `[db-name schema table-name group-name]` rows of the Tables with `table-ids` blocked (per
  `permissions-blocking`) for the User with `user-id`, excluding those granted (per `permissions-granting`)."
  [user-id              :- ::lib.schema.id/user
   table-ids            :- [:set ::lib.schema.id/table]
   permissions-blocking :- :map
   permissions-granting :- :map]
  (t2/query (blocked-tables-select user-id [:in :blocked.id table-ids] permissions-blocking permissions-granting)))
