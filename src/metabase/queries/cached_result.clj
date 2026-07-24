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
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- viewer-lens-compatible?
  "True when the current user's effective data-access lens (sandbox / impersonation / routing) is
  compatible with the lens the `stored-result` blob was computed under — i.e. the viewer may be
  served the creator's snapshot. See [[metabase.permissions.data-access-token]].

  When both the token and the query are present we compare lenses strictly. Two degenerate cases
  make that comparison impossible: a `nil` `:data_access_token` (a pre-token snapshot, or a write
  that failed to capture one) and token computation throwing (the viewer is missing a
  routing/impersonation attribute the snapshot's database requires, or the query's source-card
  chain can no longer be resolved to its underlying tables). Both fall back to admin-only: a
  superuser is never sandboxed or impersonated and resolves to the router db itself, so serving
  them cannot leak; everyone else is denied.

  A missing `:dataset_query` is not a degenerate case but a caller bug — the schema forbids NULL —
  and [[cached-result-blocked-reason]] throws on it before we get here."
  [stored-result]
  (if (nil? (:data_access_token stored-result))
    (boolean api/*is-superuser?*)
    (try
      (perms/data-access-compatible?
       (:data_access_token stored-result)
       (perms/data-access-token {:database-id (:database_id stored-result)
                                 :table-ids   (query-perms/query->resolved-source-table-ids
                                               (:dataset_query stored-result))}))
      (catch Exception e
        (log/debugf e "Cached result %s: computing the viewer's data-access lens threw; falling back to admin-only"
                    (:id stored-result))
        (boolean api/*is-superuser?*)))))

(defn- viewer-can-run-underlying-query?
  "Whether the current user holds the data perms to run the snapshot's own query.

  `can-run-query?` absorbs the ordinary permission-denial `ExceptionInfo`s itself; anything else it
  throws — a stored query malformed enough to trip its `:- :map` schema, a source table that no
  longer exists — must not escape an authorization gate as a 500. It falls back to the same
  admin-only access [[viewer-lens-compatible?]] gives its degenerate cases, sound here for the same
  kind of reason: a superuser holds every data perm unconditionally, so serving them cannot leak."
  [stored-result]
  (try
    (query-perms/can-run-query? (:dataset_query stored-result))
    (catch Exception e
      (log/debugf e "Cached result %s: the data-perms check threw; falling back to admin-only"
                  (:id stored-result))
      (boolean api/*is-superuser?*))))

(defn- cached-result-blocked-reason
  "If the current user must NOT be served the cached blob for `stored-result`, return a keyword
  describing why. Returns nil when the cached blob is safe to stream.

  Throws when `stored-result` has no `:dataset_query` (this should never happen).

  Reasons (in priority order):
    `:no-data-perms`        — current user lacks the data perms required to run the underlying query.
    `:incompatible-context` — current user's sandbox/impersonation/routing lens differs from the
                              lens the snapshot was computed under."
  [stored-result]
  (when (nil? (:dataset_query stored-result))
    (throw (ex-info "stored-result is missing its dataset_query"
                    {:stored-result-id (:id stored-result)})))
  (cond
    (not (viewer-can-run-underlying-query? stored-result))
    :no-data-perms

    (not (viewer-lens-compatible? stored-result))
    :incompatible-context))

(defn viewer-can-view-cached-result?
  "Boolean form of [[assert-can-view-cached-result!]]: true when the current user may be served the
  blob for `stored-result`."
  [stored-result]
  (nil? (cached-result-blocked-reason stored-result)))

(defn assert-can-view-cached-result!
  "Throw a 403 if the current user must not see the cached blob for `stored-result`."
  [stored-result]
  (when-let [reason (cached-result-blocked-reason stored-result)]
    (throw (ex-info (case reason
                      :no-data-perms        (tru "You do not have permissions to view the data underlying this cached result.")
                      :incompatible-context (tru "Cannot show cached results: your data access differs from the user who generated them.")
                      (tru "You do not have permissions to view this cached result."))
                    {:status-code      403
                     :reason           reason
                     :stored-result-id (:id stored-result)}))))
