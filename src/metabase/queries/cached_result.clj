(ns metabase.queries.cached-result
  "Read-side permission gating for the `stored_result` snapshot table. The blob was computed
  once by its creator with their effective permissions baked in, so replaying it for any
  other viewer must respect *that viewer's* data permissions and their sandboxing /
  impersonation / database-routing lens — otherwise we'd leak data the QP would have filtered
  out (or fetched from a different database entirely) if the viewer had executed the query
  themselves. The one exemption: superusers may see every snapshot, by product decision."
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
  served the creator's snapshot. See [[metabase.permissions.data-access-token]]. Only ever reached
  for non-superusers — [[cached-result-blocked-reason]] passes superusers before any lens check.

  When both the token and the query are present we compare lenses strictly. Two degenerate cases
  make that comparison impossible, and both deny (the viewer here is a non-admin):

    - a `nil` `:data_access_token`. The write path never persists a snapshot without a token.
    - token computation throwing (the viewer is missing a routing/impersonation attribute the
      snapshot's database requires, or the query's source-card chain can no longer be resolved to
      its underlying tables). An expected condition for some viewers — such a viewer could not run
      the query themselves either.

  A missing `:dataset_query` is not a degenerate case but a caller bug — the schema forbids NULL —
  and [[cached-result-blocked-reason]] throws on it before we get here."
  [stored-result]
  (if (nil? (:data_access_token stored-result))
    (do
      (log/errorf "Cached result %s has no data_access_token; the write path should never persist one. Denying."
                  (:id stored-result))
      false)
    (try
      (perms/data-access-compatible?
       (:data_access_token stored-result)
       (perms/data-access-token {:database-id (:database_id stored-result)
                                 :table-ids   (query-perms/query->resolved-source-table-ids
                                               (:dataset_query stored-result))}))
      (catch Exception e
        (log/debugf e "Cached result %s: computing the viewer's data-access lens threw; denying"
                    (:id stored-result))
        false))))

(defn- viewer-can-run-underlying-query?
  "Whether the current user holds the data perms to run the snapshot's own query. Only ever reached
  for non-superusers — [[cached-result-blocked-reason]] passes superusers before any check.

  `can-run-query?` absorbs the ordinary permission-denial `ExceptionInfo`s itself; anything else it
  throws — a stored query malformed enough to trip its `:- :map` schema, a source table that no
  longer exists — must not escape an authorization gate as a 500: deny instead."
  [stored-result]
  (try
    (query-perms/can-run-query? (:dataset_query stored-result))
    (catch Exception e
      (log/debugf e "Cached result %s: the data-perms check threw; denying" (:id stored-result))
      false)))

(defn- cached-result-blocked-reason
  "If the current user must NOT be served the cached blob for `stored-result`, return a keyword
  describing why. Returns nil when the cached blob is safe to stream.

  Throws when `stored-result` has no `:dataset_query` (this should never happen).

  Superusers pass unconditionally — \"superusers see every exploration\" is a deliberate product
  exemption from the same-lens rule. They hold every data perm, so the bypass skips nothing
  the data-perms check would catch.

  Reasons (in priority order):
    `:no-data-perms`        — current user lacks the data perms required to run the underlying query.
    `:incompatible-context` — current user's sandbox/impersonation/routing lens differs from the
                              lens the snapshot was computed under."
  [stored-result]
  (when (nil? (:dataset_query stored-result))
    (throw (ex-info "stored-result is missing its dataset_query"
                    {:stored-result-id (:id stored-result)})))
  (cond
    api/*is-superuser?*
    nil

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
