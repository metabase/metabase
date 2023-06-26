(ns metabase-enterprise.advanced-permissions.driver.impersonation
  (:require
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.models.permissions-group-membership
    :refer [PermissionsGroupMembership]]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(defn- connection-impersonation-role
  "Fetches the database role that should be used for the current user, if connection impersonation is in effect.
  Returns `nil` if connection impersonation should not be used for the current user. Throws an exception if multiple
  conflicting connection impersonation policies are found."
  [database]
  (when-not api/*is-superuser?*
    (let [group-ids           (t2/select-fn-set :group_id PermissionsGroupMembership :user_id api/*current-user-id*)
          conn-impersonations (when (seq group-ids)
                                (t2/select :model/ConnectionImpersonation
                                           :group_id [:in group-ids]
                                           :db_id (u/the-id database)))
          role-attributes     (set (map :attribute conn-impersonations))]
      (when (> (count role-attributes) 1)
        (throw (ex-info (tru "Multiple conflicting connection impersonation policies found for current user")
                        {:user-id api/*current-user-id*
                         :conn-impersonations conn-impersonations})))
      (when (not-empty role-attributes)
        (let [conn-impersonation (first conn-impersonations)
              role-attribute     (:attribute conn-impersonation)
              user-attributes    (:login_attributes @api/*current-user*)]
          (get user-attributes role-attribute))))))

(defenterprise set-role-if-supported!
  "Executes a `USE ROLE` or similar statement on the given connection, if connection impersonation is enabled for the
  given driver. For these drivers, the role is set to either the default role, or to a specific role configured for
  the current user, depending on the connection impersonation settings. This is a no-op for databases that do not
  support connection impersonation, or for non-EE instances."
  :feature :advanced-permissions
  [driver ^Connection conn database]
  (when (driver/database-supports? driver :connection-impersonation database)
    (try
      (let [default-role       (driver.sql/default-database-role driver database)
            impersonation-role (connection-impersonation-role database)]
        (driver/set-role! driver conn (or impersonation-role default-role)))
      (catch Throwable e
        (log/debug e (tru "Error setting role on connection"))
        (throw e)))))
