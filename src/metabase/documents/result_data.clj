(ns metabase.documents.result-data
  "Shared constants and gates for the cached `stored_result` blob.

  The blob is computed once, by its creator, with their effective permissions baked in.
  Replaying it for any other viewer must respect *that viewer's* data permissions, sandboxing,
  and impersonation — otherwise we would leak data the QP would have filtered out if the viewer
  had executed the query themselves."
  (:require
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.i18n :refer [tru]]))

(def allowed-chart-sorts
  "Sort attribute values a static `cardEmbed` is allowed to request. Shared by the prompt-builder,
  the doc validators, and the read-time renderer (see [[metabase.documents.api.stored-result]])
  so the LLM, the doc validator, and the renderer agree."
  #{"value_asc" "value_desc" "label_asc" "label_desc"})

(defn- cached-result-blocked-reason
  "If the current user must NOT be served the cached blob for `stored-result`, return a keyword
  describing why. Returns nil when the cached blob is safe to stream.

  Reasons (in priority order):
    `:sandboxed`     — current user has an enforced sandbox on the snapshot's database.
    `:impersonated`  — current user has connection impersonation on the snapshot's database.
    `:no-data-perms` — current user lacks the data perms required to run the underlying query."
  [stored-result]
  (let [db-id (:database_id stored-result)]
    (cond
      (and db-id (perms/sandboxed-user-for-db? db-id))         :sandboxed
      (and db-id (perms/impersonation-enforced-for-db? db-id)) :impersonated
      (and (:dataset_query stored-result)
           (not (query-perms/can-run-query? (:dataset_query stored-result))))
      :no-data-perms)))

(defn assert-can-view-cached-result!
  "Throw a 403 if the current user must not see the cached blob for `stored-result`."
  [stored-result]
  (when-let [reason (cached-result-blocked-reason stored-result)]
    (throw (ex-info (case reason
                      :sandboxed     (tru "Cannot show cached results: your account is sandboxed for the underlying data.")
                      :impersonated  (tru "Cannot show cached results: connection impersonation is enforced for the underlying data.")
                      :no-data-perms (tru "You do not have permissions to view the data underlying this cached result."))
                    {:status-code      403
                     :reason           reason
                     :stored-result-id (:id stored-result)}))))
