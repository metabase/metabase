(ns metabase-enterprise.advanced-permissions.models.permissions.block-permissions
  (:require
   [metabase.api.common :as api]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.query.permissions :as query-perms]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]))

(defenterprise check-block-permissions
  "Assert that block permissions are not in effect for Database for a query that's only allowed to run because of
  Collection perms; throw an Exception if they are; otherwise return `true`. The query is still allowed to run if the
  current User has unrestricted data permissions from another Group. See the namespace documentation for
  [[metabase.models.collection]] for more details."
  :feature :advanced-permissions
  [{database-id :database :as query}]
  (or
   (not= :blocked (data-perms/full-db-permission-for-user api/*current-user-id* :perms/view-data database-id))
   (let [table-ids (query-perms/query->source-table-ids query)]
     (= #{:unrestricted}
        (set
         (map (partial data-perms/table-permission-for-user api/*current-user-id* :perms/view-data database-id)
              table-ids))))
   (throw (ex-info (tru "Blocked: you are not allowed to run queries against Database {0}." database-id)
                   {:type               qp.error-type/missing-required-permissions
                    :actual-permissions @api/*current-user-permissions-set*
                    :permissions-error? true}))))
