(ns metabase-enterprise.advanced-permissions.common
  (:require
   [metabase-enterprise.advanced-permissions.db :as advanced-permissions.db]
   [metabase.api.common :as api]
   [metabase.audit-app.core :as audit]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.warehouses.models.database :as database]))

(defenterprise current-user-can-write-field?
  "Enterprise version: whether the current user can manage the metadata of the table of the field `instance`, which
  nobody can when a read-only instance syncs the table."
  :feature :advanced-permissions
  [instance]
  (let [table (or (:table instance)
                  (advanced-permissions.db/table (:table_id instance)))]
    (and (collection/remote-sync-writable-table? table)
         (let [db-id (or (:db_id table)
                         (database/table-id->database-id (:table_id instance)))]
           (perms/user-has-permission-for-tables? (perms/user-info api/*current-user-id*) :perms/manage-table-metadata :yes {(:table_id instance) db-id})))))

(defenterprise current-user-can-manage-schema-metadata?
  "Enterprise version. Returns a boolean whether the current user has permission to edit table metadata for any tables
  in the schema"
  :feature :advanced-permissions
  [db-id schema-name]
  (perms/at-least-as-permissive? :perms/manage-table-metadata (perms/some-table-in-schema-permission-for-user (perms/user-info api/*current-user-id*) :perms/manage-table-metadata db-id schema-name) :yes))

(defenterprise current-user-can-write-db?
  "Enterprise version. Returns a boolean whether the current user can write the given db"
  :feature :advanced-permissions
  [db-id]
  (perms/user-has-permission-for-databases? (perms/user-info api/*current-user-id*) :perms/manage-database :yes [db-id]))

(defenterprise current-user-can-write-table?
  "Enterprise version: whether the current user can manage the metadata of `table`, which nobody can when a read-only
  instance syncs it."
  :feature :advanced-permissions
  [table]
  (and (collection/remote-sync-writable-table? table)
       (perms/user-has-permission-for-tables? (perms/user-info api/*current-user-id*) :perms/manage-table-metadata :yes {(:id table) (:db_id table)})))

(defn with-advanced-permissions
  "Adds to `user` a set of boolean flags indicating whether or not current user has access to advanced permissions.
  This function is meant to be used for GET /api/user/current."
  [user]
  (let [user-id               api/*current-user-id*
        application           (perms/application-permissions-for-user (api/current-user-info))
        can-access-data-model (perms/user-has-highest-permission-anywhere? (perms/user-info user-id) :perms/manage-table-metadata)]
    (update user :permissions assoc
            :can_access_setting      (contains? application :setting)
            :can_access_subscription (contains? application :subscription)
            :can_access_monitoring   (contains? application :monitoring)
            :can_access_data_model   can-access-data-model
            :can_access_db_details   (perms/user-has-highest-permission-anywhere? (perms/user-info user-id) :perms/manage-database)
            :can_access_transforms   (or api/*is-superuser?* (and (api/entitled-data-analyst?)
                                                                  (perms/user-has-highest-permission-anywhere? (perms/user-info api/*current-user-id*) :perms/transforms :exclude-db-ids [audit/audit-db-id])))
            :can_access_workspaces   (or api/*is-superuser?* (and api/*is-data-analyst?*
                                                                  (perms/user-has-highest-permission-anywhere? (perms/user-info api/*current-user-id*) :perms/view-data :exclude-db-ids [audit/audit-db-id])))
            :is_data_analyst         api/*is-data-analyst?*
            :is_group_manager        api/*is-group-manager?*)))

(defenterprise current-user-has-application-permissions?
  "Check if `*current-user*` has permissions for a application permissions of type `perm-type`."
  :feature :advanced-permissions
  [perm-type]
  (contains? (perms/application-permissions-for-user (api/current-user-info)) perm-type))

(defenterprise has-advanced-setting-access?
  "Check if `*current-user*` has permissions to edit settings."
  :feature :advanced-permissions
  []
  (current-user-has-application-permissions? :setting))

(defn current-user-is-manager-of-group?
  "Return true if current-user is a manager of `group-or-id`."
  [group-or-id]
  (advanced-permissions.db/group-manager? api/*current-user-id* (u/the-id group-or-id)))

(defenterprise filter-tables-by-data-model-perms
  "Given a list of tables, removes the ones for which `*current-user*` does not have data model editing permissions."
  :feature :advanced-permissions
  [tables]
  (if api/*is-superuser?*
    tables
    (filter
     (fn [{table-id :id db-id :db_id}]
       (perms/user-has-permission-for-tables? (perms/user-info api/*current-user-id*) :perms/manage-table-metadata :yes {table-id db-id}))
     tables)))

(defenterprise filter-schema-by-data-model-perms
  "Given a list of schema, remove the ones for which `*current-user*` does not have data model editing permissions."
  :feature :advanced-permissions
  [schema]
  (if api/*is-superuser?*
    schema
    (filter
     (fn [{db-id :db_id schema :schema}]
       (perms/at-least-as-permissive? :perms/manage-table-metadata (perms/some-table-in-schema-permission-for-user (perms/user-info api/*current-user-id*) :perms/manage-table-metadata db-id schema) :yes))
     schema)))

(defenterprise filter-databases-by-data-model-perms
  "Given a list of databases, removes the ones for which `*current-user*` has no data model editing permissions.
  If databases are already hydrated with their tables, also removes tables for which `*current-user*` has no data
  model editing perms."
  :feature :advanced-permissions
  [dbs]
  (if api/*is-superuser?*
    dbs
    (reduce
     (fn [result {db-id :id tables :tables :as db}]
       (if (= (get (perms/some-table-in-database-permissions-for-user (perms/user-info api/*current-user-id*) :perms/manage-table-metadata [db-id]) db-id)
              :yes)
         (if tables
           (conj result (update db :tables filter-tables-by-data-model-perms))
           (conj result db))
         result))
     []
     dbs)))

(defenterprise new-group-view-data-permission-levels
  "Returns a map of {db-id → permission-level} for multiple databases."
  :feature :none ;; fail CLOSED if the feature is unavailable
  [db-ids]
  (if (empty? db-ids)
    {}
    (let [all-users-group-id (u/the-id (perms/all-users-group))
          blocked-db-ids     (advanced-permissions.db/blocked-database-ids-for-group all-users-group-id db-ids)
          impersonation-db-ids (advanced-permissions.db/impersonated-database-ids-for-group all-users-group-id db-ids)
          sandbox-db-ids     (into #{}
                                   (map :db_id)
                                   (advanced-permissions.db/sandboxed-database-ids-for-group all-users-group-id db-ids))
          blocked-dbs        (into (or blocked-db-ids #{})
                                   (concat impersonation-db-ids sandbox-db-ids))]
      (zipmap db-ids (map #(if (blocked-dbs %) :blocked :unrestricted) db-ids)))))

(defenterprise new-database-view-data-permission-levels
  "Returns a map of {group-id → permission-level} for multiple groups."
  :feature :none ;; fail CLOSED if the feature is unavailable
  [group-ids]
  (if (empty? group-ids)
    {}
    (let [blocked-group-ids   (advanced-permissions.db/blocked-group-ids group-ids)
          impersonation-group-ids (advanced-permissions.db/impersonated-group-ids group-ids)
          sandbox-group-ids   (advanced-permissions.db/sandboxed-group-ids group-ids)
          blocked-groups      (into (or blocked-group-ids #{})
                                    (concat impersonation-group-ids sandbox-group-ids))]
      (zipmap group-ids (map #(if (blocked-groups %) :blocked :unrestricted) group-ids)))))

(defenterprise new-table-sandboxed-groups
  "Returns the subset of `group-ids` that must have new tables on `db-id` forced to `:blocked` view-data regardless of
  the new table's schema, because they have a sandbox on a table in this DB. A sandbox is a stronger condition than
  a few specific tables being blocked, so the presence of a sandbox on this DB for a group is sufficient to make any
  new table `:blocked` for that group, even if the table came from a CSV upload.

  OSS has no sandboxes, so the OSS implementation returns the empty set. On EE we deliberately do *not* consult
  `enable-sandboxes?`: as with `apply-sandboxing`, we block *setting up* a sandbox without the feature (see
  `metabase-enterprise.sandbox.api.gtap`) but keep enforcing one that is already configured, rather than silently
  ignoring it when a token lapses. See UXW-4927 for the incident where an unlicensed EE instance leaked a
  newly-synced table to a sandboxed group."
  :feature :none ;; fail CLOSED if the feature is unavailable.
  [db-id group-ids]
  (if (empty? group-ids)
    #{}
    (into #{}
          (map :group_id)
          (advanced-permissions.db/sandboxed-group-ids-for-database db-id group-ids))))

(defenterprise new-table-view-data-permission-levels
  "Returns a map of {group-id → permission-level} for multiple groups and a single DB."
  :feature :none ;; fail CLOSED if the feature is unavailable.
  [db-id group-ids]
  (if (empty? group-ids)
    {}
    ;; We don't check for connection impersonations here, because impersonations are set at the
    ;; DB-level, so a new table should get `:unrestricted` and inherit the DB-level impersonation policy.
    (let [blocked-group-ids (advanced-permissions.db/blocked-group-ids-for-database db-id group-ids)
          sandbox-group-ids (new-table-sandboxed-groups db-id group-ids)
          blocked-groups    (into (or blocked-group-ids #{}) sandbox-group-ids)]
      (into {} (map (fn [group-id]
                      [group-id (cond
                                  (blocked-groups group-id) :blocked
                                  :else :unrestricted)]))
            group-ids))))
