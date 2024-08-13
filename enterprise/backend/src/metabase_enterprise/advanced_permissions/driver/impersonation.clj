(ns metabase-enterprise.advanced-permissions.driver.impersonation
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.util :as driver.u]
   [metabase.models.field :as field]
   [metabase.models.permissions-group-membership
    :refer [PermissionsGroupMembership]]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(defn- enforce-impersonations?
  "Given a list of Connection Impersonation policies and a list of permission group IDs that the current user is in,
  returns a Boolean indicating whether the policies should be enforced. They are not enforced if any of the *other*
  groups the user is in provide unrestricted data access to the DB."
  [db-or-id impersonations group-ids]
  (let [non-impersonated-group-ids (set/difference (set group-ids)
                                                   (set (map :group_id impersonations)))
        perm-values                (when (seq non-impersonated-group-ids)
                                     (t2/select-fn-set :perm_value
                                                       :model/DataPermissions
                                                       {:where
                                                        [:and
                                                         [:= :db_id (u/the-id db-or-id)]
                                                         [:= :table_id nil]
                                                         [:= :perm_type (u/qualified-name :perms/view-data)]
                                                         [:in :group_id non-impersonated-group-ids]]}))]
    ;; Just check if any other non-impersonated groups have unrestricted access to the DB. We don't need to worry
    ;; about block permissions here because it would have been enforced earlier in the QP middleware stack.
    (not (contains? perm-values :unrestricted))))

(defn- impersonation-enabled-for-db?
  "Is impersonation enabled for the given database, for any groups?"
  [db-or-id]
  (boolean
   (when (and db-or-id (premium-features/enable-advanced-permissions?))
     (t2/exists? :model/ConnectionImpersonation :db_id (u/id db-or-id)))))

(defn connection-impersonation-role
  "Fetches the database role that should be used for the current user, if connection impersonation is in effect.
  Returns `nil` if connection impersonation should not be used for the current user. Throws an exception if multiple
  conflicting connection impersonation policies are found."
  [database-or-id]
  (when (and database-or-id (not api/*is-superuser?*))
    (let [group-ids           (t2/select-fn-set :group_id PermissionsGroupMembership :user_id api/*current-user-id*)
          conn-impersonations (when (seq group-ids)
                                (t2/select :model/ConnectionImpersonation
                                           :group_id [:in group-ids]
                                           :db_id (u/the-id database-or-id)))
          role-attributes     (set (map :attribute conn-impersonations))]
      (when (enforce-impersonations? database-or-id conn-impersonations group-ids)
        (when (> (count role-attributes) 1)
          (throw (ex-info (tru "Multiple conflicting connection impersonation policies found for current user")
                          {:user-id api/*current-user-id*
                           :conn-impersonations conn-impersonations})))
        (when (not-empty role-attributes)
          (let [conn-impersonation (first conn-impersonations)
                role-attribute     (:attribute conn-impersonation)
                user-attributes    (:login_attributes @api/*current-user*)
                role               (get user-attributes role-attribute)]
            (if (str/blank? role)
              (throw (ex-info (tru "User does not have attribute required for connection impersonation.")
                              {:user-id api/*current-user-id*
                               :conn-impersonations conn-impersonations}))
              role)))))))

(defenterprise hash-key-for-impersonation
  "Returns a hash-key for FieldValues if the current user uses impersonation for the database."
  :feature :advanced-permissions
  [field-id]
  ;; Include the role in the hash key, so that we can cache the results of the query for each role.
  (let [db-id (field/field-id->database-id field-id)]
    (str (hash [field-id (connection-impersonation-role db-id)]))))

(defenterprise set-role-if-supported!
  "Executes a `USE ROLE` or similar statement on the given connection, if connection impersonation is enabled for the
  given driver. For these drivers, the role is set to either the default role, or to a specific role configured for
  the current user, depending on the connection impersonation settings. This is a no-op for databases that do not
  support connection impersonation, or for non-EE instances."
  :feature :advanced-permissions
  [driver ^Connection conn database]
  (when (driver.u/supports? driver :connection-impersonation database)
    (try
      (let [enabled?           (impersonation-enabled-for-db? database)
            default-role       (driver.sql/default-database-role driver database)
            impersonation-role (and enabled? (connection-impersonation-role database))]
        (when (and enabled? (not default-role))
          (throw (ex-info (tru "Connection impersonation is enabled for this database, but no default role is found")
                          {:user-id api/*current-user-id*
                           :database-id (u/the-id database)})))
        (when-let [role (or impersonation-role default-role)]
          ;; If impersonation is not enabled for any groups but we have a default role, we should still set it, just
          ;; in case impersonation used to be enabled and the connection still uses an impersonated role.
          (driver/set-role! driver conn role)))
      (catch Throwable e
        (log/debug e "Error setting role on connection")
        (throw e)))))
