(ns metabase-enterprise.advanced-permissions.common
  (:require
   [metabase.api.common :as api]
   [metabase.models :refer [PermissionsGroupMembership]]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn with-advanced-permissions
  "Adds to `user` a set of boolean flag indiciate whether or not current user has access to an advanced permissions.
  This function is meant to be used for GET /api/user/current "
  [user]
  (let [permissions-set @api/*current-user-permissions-set*]
    (assoc user :permissions
           {:can_access_setting      (perms/set-has-application-permission-of-type? permissions-set :setting)
            :can_access_subscription (perms/set-has-application-permission-of-type? permissions-set :subscription)
            :can_access_monitoring   (perms/set-has-application-permission-of-type? permissions-set :monitoring)
            :can_access_data_model   (perms/set-has-partial-permissions? permissions-set "/data-model/")
            :can_access_db_details   (perms/set-has-partial-permissions? permissions-set "/details/")
            :is_group_manager        api/*is-group-manager?*})))

(defn current-user-has-application-permissions?
  "Check if `*current-user*` has permissions for a application permissions of type `perm-type`."
  [perm-type]
  (or api/*is-superuser?*
      (perms/set-has-application-permission-of-type? @api/*current-user-permissions-set* perm-type)))

(defn current-user-is-manager-of-group?
  "Return true if current-user is a manager of `group-or-id`."
  [group-or-id]
  (t2/select-one-fn :is_group_manager PermissionsGroupMembership
                       :user_id api/*current-user-id* :group_id (u/the-id group-or-id)))

(defn filter-tables-by-data-model-perms
  "Given a list of tables, removes the ones for which `*current-user*` does not have data model editing permissions."
  [tables]
  (cond
    api/*is-superuser?*
    tables

    ;; If advanced-permissions is not enabled, no non-admins have any data-model editing perms, so return an empty list
    (not (premium-features/enable-advanced-permissions?))
    (empty tables)

    :else
    (filter
     (fn [{table-id :id db-id :db_id schema :schema}]
       (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                                        (perms/feature-perms-path :data-model :all db-id schema table-id)))
     tables)))

(defn filter-schema-by-data-model-perms
  "Given a list of schema, remove the ones for which `*current-user*` does not have data model editing permissions."
  [schema]
  (cond
    api/*is-superuser?*
    schema

    ;; If advanced-permissions is not enabled, no non-admins have any data-model editing perms, so return an empty list
    (not (premium-features/enable-advanced-permissions?))
    (empty schema)

    :else
    (filter
     (fn [{db-id :db_id schema :schema}]
       (perms/set-has-partial-permissions? @api/*current-user-permissions-set*
                                           (perms/feature-perms-path :data-model :all db-id schema)))
     schema)))

(defn filter-databases-by-data-model-perms
  "Given a list of databases, removes the ones for which `*current-user*` has no data model editing permissions.
  If databases are already hydrated with their tables, also removes tables for which `*current-user*` has no data
  model editing perms."
  [dbs]
  (cond
    api/*is-superuser?*
    dbs

    ;; If advanced-permissions is not enabled, no non-admins have any data-model editing perms, so return an empty list
    (not (premium-features/enable-advanced-permissions?))
    (empty dbs)

    :else
    (reduce
     (fn [result {db-id :id tables :tables :as db}]
       (if (perms/set-has-partial-permissions? @api/*current-user-permissions-set*
                                               (perms/feature-perms-path :data-model :all db-id))
         (if tables
           (conj result (update db :tables filter-tables-by-data-model-perms))
           (conj result db))
         result))
     []
     dbs)))
