(ns metabase.queries.cached-result
  "Read-side permission gating for the `stored_result` snapshot table. The blob was computed
  once by its creator with their effective permissions baked in, so replaying it for any
  other viewer must respect *that viewer's* data permissions, sandboxing, and
  impersonation — otherwise we'd leak data the QP would have filtered out if the viewer
  had executed the query themselves."
  (:require
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- viewer-lens-compatible?
  "True when the current user's effective data-access lens (sandbox / impersonation / routing) is
  compatible with the lens the `stored-result` blob was computed under — i.e. the viewer may be
  served the creator's snapshot. See [[metabase.permissions.data-access-token]].

  A `nil` `:data_access_token` (a pre-token snapshot, or a write that failed to capture one) is
  treated as creator+admin-only; since this is only consulted for non-creators, that collapses to
  admins-only. Token computation throwing — the viewer is missing a routing/impersonation
  attribute the snapshot's database requires — means deny."
  [stored-result]
  (if-let [creator-token (:data_access_token stored-result)]
    (try
      (perms/data-access-compatible?
       creator-token
       (perms/data-access-token {:database-id (:database_id stored-result)
                                 :table-ids   (query-perms/query->source-table-ids
                                               (:dataset_query stored-result))}))
      (catch Throwable _ false))
    (boolean api/*is-superuser?*)))

(defn- cached-result-blocked-reason
  "If the current user must NOT be served the cached blob for `stored-result`, return a keyword
  describing why. Returns nil when the cached blob is safe to stream.

  Reasons (in priority order):
    `:no-data-perms`        — current user lacks the data perms required to run the underlying query.
    `:incompatible-context` — current user's sandbox/impersonation/routing lens differs from the
                              lens the snapshot was computed under."
  [stored-result]
  (cond
    (and (:dataset_query stored-result)
         (not (query-perms/can-run-query? (:dataset_query stored-result))))
    :no-data-perms

    (not (viewer-lens-compatible? stored-result))
    :incompatible-context))

(defn assert-can-view-cached-result!
  "Throw a 403 if the current user must not see the cached blob for `stored-result`."
  [stored-result]
  (when-let [reason (cached-result-blocked-reason stored-result)]
    (throw (ex-info (case reason
                      :no-data-perms        (tru "You do not have permissions to view the data underlying this cached result.")
                      :incompatible-context (tru "Cannot show cached results: your data access differs from the user who generated them."))
                    {:status-code      403
                     :reason           reason
                     :stored-result-id (:id stored-result)}))))
