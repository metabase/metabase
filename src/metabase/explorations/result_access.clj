(ns metabase.explorations.result-access
  "Gates for streaming a worker-cached `exploration_query_result` blob to the current user.

  The blob is computed once, by the exploration's creator, with their effective permissions
  baked in. Replaying it for any other viewer must respect *that viewer's* data permissions,
  sandboxing, and impersonation — otherwise we would leak data the QP would have filtered out
  if the viewer had executed the query themselves."
  (:require
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.i18n :refer [tru]]))

(defn- query-database-id [exploration-query]
  (-> exploration-query :dataset_query :database))

(defn cached-result-blocked-reason
  "If the current user must NOT be served the cached `exploration_query_result` blob for
  `exploration-query`, return a keyword describing why. Returns nil when the cached blob is safe
  to stream.

  Reasons (in priority order):
    `:sandboxed`    — current user has an enforced sandbox on the query's database.
    `:impersonated` — current user has connection impersonation on the query's database.
    `:no-data-perms` — current user lacks the data perms required to run the underlying query."
  [exploration-query]
  (let [db-id (query-database-id exploration-query)]
    (cond
      (perms/sandboxed-user-for-db? db-id)            :sandboxed
      (perms/impersonation-enforced-for-db? db-id)    :impersonated
      (not (query-perms/can-run-query? (:dataset_query exploration-query))) :no-data-perms)))

(defn assert-can-view-cached-result!
  "Throw a 403 if the current user must not see the cached result for `exploration-query`."
  [exploration-query]
  (when-let [reason (cached-result-blocked-reason exploration-query)]
    (throw (ex-info (case reason
                      :sandboxed     (tru "Cannot show cached results for this query: your account is sandboxed for the underlying data.")
                      :impersonated  (tru "Cannot show cached results for this query: connection impersonation is enforced for the underlying data.")
                      :no-data-perms (tru "You do not have permissions to view the data underlying this exploration query."))
                    {:status-code 403
                     :reason      reason
                     :exploration-query-id (:id exploration-query)}))))
