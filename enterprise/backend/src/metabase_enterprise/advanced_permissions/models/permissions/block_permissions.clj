(ns metabase-enterprise.advanced-permissions.models.permissions.block-permissions
  (:require
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]))

(defn- throw-block-permissions-exception
  []
  (throw (ex-info (tru "You do not have permissions to run this query.")
                  {:type               qp.error-type/missing-required-permissions
                   :actual-permissions @api/*current-user-permissions-set*
                   :permissions-error? true})))

(defenterprise check-block-permissions
  "Assert that block permissions are not in effect for Database or Tables for a query that's otherwise allowed to run
  because of Collection perms; throw an Exception if they are; otherwise return `true`. The query is still allowed to
  run if the current User has unrestricted data permissions from another Group. See the namespace documentation for
  [[metabase.collections.models.collection]] for more details."
  ;; if a token check fails we don't want to fail open here
  ;;
  ;; run this even when the feature is not enabled - throwing here is better than silently ignoring the configured
  ;; block.
  :feature :none
  [{database-id :database :as query}]
  (let [{:keys [table-ids]} (query-perms/query->source-ids query)
        table-permissions   (map (partial perms/table-permission-for-user api/*current-user-id*
                                          :perms/view-data database-id)
                                 table-ids)]
    ;; Make sure we don't have block permissions for the entire DB or individual tables referenced by the query.
    (or
     (not= :blocked (perms/full-db-permission-for-user api/*current-user-id* :perms/view-data database-id))
     (= #{:unrestricted} (set table-permissions))
     (throw-block-permissions-exception))

    true))
