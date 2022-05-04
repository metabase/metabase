(ns metabase-enterprise.advanced-permissions.models.permissions.block-permissions
  (:require [metabase.api.common :as api]
            [metabase.models.permissions :as perms]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.util.i18n :refer [tru]]))

(defn- current-user-has-block-permissions-for-database?
  [database-or-id]
  (contains? @api/*current-user-permissions-set* (perms/database-block-perms-path database-or-id)))

(defn check-block-permissions
  "Assert that block permissions are not in effect for Database for a query that's only allowed to run because of
  Collection perms; throw an Exception if they are. Otherwise returns a keyword explaining why the check
  succeeded (this is mostly for test/debug purposes). The query is still allowed to run if the current User has
  appropriate data permissions from another Group. See the namespace documentation for [[metabase.models.collection]]
  for more details.

  Note that this feature is Metabase© Enterprise Edition™ only and only enabled if we have a valid Enterprise Edition™
  token. [[metabase.query-processor.middleware.permissions/check-block-permissions]] invokes this function if it
  exists."
  [{database-id :database}]
  (cond
    (not (premium-features/enable-advanced-permissions?))
    ::advanced-permissions-not-enabled

    (not (current-user-has-block-permissions-for-database? database-id))
    ::no-block-permissions-for-db

    :else
    ;; TODO -- come up with a better error message.
    (throw (ex-info (tru "Blocked: you are not allowed to run queries against Database {0}." database-id)
                    {:type               qp.error-type/missing-required-permissions
                     :actual-permissions @api/*current-user-permissions-set*
                     :permissions-error? true}))))
