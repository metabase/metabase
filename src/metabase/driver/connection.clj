(ns metabase.driver.connection
  "Centralized access to database connection details.

   Direct access to `(:details database)` is an anti-pattern. It couples callers to
   the raw data layout, which means any change to how details are resolved — connection
   routing, write credentials, workspace isolation, security boundaries — requires
   finding and updating every call site. This namespace provides the indirection that
   makes those changes possible.

   Primary API: [[effective-details]], [[with-write-connection]], [[default-details]]."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.driver.connection.workspaces :as driver.w]
   [metabase.driver.util :as driver.u]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf]))

;; Database `:details` is a single encrypted JSON column that stores everything a driver
;; needs to know about a connection. The problem is that "everything a driver needs to know"
;; has grown to become a big blob:
;;
;;   - Credentials: `password`, `secret_key`, `service-account-json`, `private-key`,
;;     `tunnel-private-key`, `access-token`, and friends. These are what you'd expect
;;     to find in an encrypted column.
;;
;;   - Connection identifiers: `host`, `port`, `db`, `user`, `account`, `warehouse`.
;;     These identify where and as whom to connect. Not credentials per se, but together
;;     with the above they form a complete connection string.
;;
;;   - Configuration and preferences: `auto_run_queries`, `let-user-control-scheduling`,
;;     `schedules.metadata_sync`, `refingerprint`, `json-unfolding`, `schema-filters`.
;;     These control Metabase behavior. They do not participate in authentication or
;;     connection establishment in any way.
;;
;; All three categories live in the same encrypted blob, which means `t2/select :model/Database`
;; decrypts AWS secret keys just so the sync scheduler can check whether the user wants to
;; control their own sync timing. Every code path that touches any detail — even purely
;; cosmetic ones — carries the full credential payload through memory.
;;
;; Across 19 drivers it seems there are roughly 80 distinct field names that could live in
;; `:details`, with inconsistent naming conventions (snake_case, kebab-case, etc. together).
;; Some fields are ambiguous: `additional-options`, `kerberos-keytab-path`, etc. The existing
;; `sensitive-fields` function in `driver.util` identifies credential-type fields well, but
;; there's no corresponding classification for "this field doesn't need to be encrypted at all."
;;
;; This namespace centralizes all reads of `:details` (and `:write-data-details`) behind
;; functions that can apply connection-type routing, workspace isolation, and — eventually —
;; a proper separation of credentials from configuration. The immediate goal is to make
;; direct `(:details database)` access a greppable code smell. The longer-term goal is to
;; make it possible to store non-sensitive configuration outside the encrypted column
;; without a codebase-wide refactor. The immediate need for this namespace was to make it
;; possible to access and *use* configuration in a controllable and auditable way as we
;; are going from one master-connection to a database to two + any number of dynamic
;; workspaces connections.
;;
;; Please use/adapt/augment/improve this namespace and avoid all such patterns:
;;  - (:details database)
;;  - (let [{:keys [details]} database])
;;  - (let [{{:keys [user]} :details} database])

(def connection-types
  "All valid values for [[*connection-type*]]."
  [:default :write-data :admin :transform])

(mr/def ::connection-type
  (into [:enum] connection-types))

(def ^:dynamic ^:private *connection-type*
  "Which connection details [[effective-details]] should resolve.

   - `:default` — primary `:details`
   - `:write-data` — `:write-data-details` merged over `:details` (if configured)
   - `:admin` — `:admin-details` merged over `:details` (if configured)
   - `:transform` — same details as `:write-data` (transforms write, so `:write-data-details`
     are taken into account when configured), but resolved through a separate connection pool
     whose c3p0 leak-detector tolerates transform-length runtimes. Set by
     [[with-transform-connection]] from the transform runner.

   Bind via [[with-write-connection]], [[with-admin-connection]], or [[with-transform-connection]],
   not directly."
  :default)

(defn do-with-write-connection
  "Functional core of [[with-write-connection]]. Public so the macro can delegate here instead of
   expanding `binding` at call sites — that keeps `*connection-type*` referenced only within this namespace."
  [thunk]
  (binding [*connection-type* :write-data]
    (thunk)))

(defmacro with-write-connection
  "Establishes a write-connection context for body.

   [[effective-details]] calls within this scope resolve to take `:write-data-details`
   into account (if configured) instead of only primary `:details`."
  [& body]
  `(do-with-write-connection (fn [] ~@body)))

(defn do-with-admin-connection
  "Functional core of [[with-admin-connection]]."
  [thunk]
  (let [prior *connection-type*]
    (when (not= prior :admin)
      (log/infof "Entering :admin connection scope (from %s)" prior))
    (binding [*connection-type* :admin]
      (thunk))))

(defmacro with-admin-connection
  "Establishes an admin-connection context for body.

   [[effective-details]] calls within this scope resolve to take `:admin-details`
   into account (if configured) instead of only primary `:details`. The admin
   connection carries the highest-privilege credentials for a database (DDL,
   ownership, schema management). Code that needs admin access must opt in
   explicitly."
  [& body]
  `(do-with-admin-connection (fn [] ~@body)))

(defn do-with-transform-connection
  "Functional core of [[with-transform-connection]]."
  [thunk]
  (binding [*connection-type* :transform]
    (thunk)))

(defmacro with-transform-connection
  "Establishes a transform-connection context for body.

   Connection details resolve the same as `:write-data` (transforms write, so
   `:write-data-details` are taken into account when configured), but queries are routed
   through a separate connection pool keyed on `:transform` so the pool can carry its own
   c3p0 properties. See [[*connection-type*]] for the rationale."
  [& body]
  `(do-with-transform-connection (fn [] ~@body)))

(def ^:dynamic ^:private *suppress-resolution-telemetry*
  false)

(defmacro without-resolution-telemetry
  "Suppresses [[effective-details]] from incrementing the `:metabase-db-connection/type-resolved`
   Prometheus counter. Use for infrastructure calls (e.g., health checks) that resolve
   write-data-details but should not inflate feature-usage metrics."
  [& body]
  `(binding [*suppress-resolution-telemetry* true]
     ~@body))

(defmacro with-swapped-connection-details
  "Re-export of [[metabase.driver.connection.workspaces/with-swapped-connection-details]]
   on the driver module's public API surface, so consumers outside the module can apply
   per-database connection-detail overrides through `metabase.driver.connection`."
  {:style/indent 2}
  [database-id swap-map & body]
  `(driver.w/do-with-swapped-connection-details ~database-id ~swap-map (fn [] ~@body)))

(defenterprise database-write-data-details
  "Returns the `:write-data-details` for a database, or `nil` if the writable-connection feature is not available.
   OSS implementation always returns `nil`."
  metabase-enterprise.connection-overlays.core
  [_database]
  nil)

(defenterprise database-admin-details
  "Returns the `:admin-details` for a database, or `nil` if the workspaces feature is not available.
   OSS implementation always returns `nil`."
  metabase-enterprise.connection-overlays.core
  [_database]
  nil)

(defn- overlay-details-for-type
  "Returns the connection-type-specific details overlay for `database`, or nil if the
   requested type has no configured overlay (or is `:default`).

   `:transform` resolves the same `:write-data-details` as `:write-data` — transforms write,
   so they get write-data credentials when set. The two still resolve to *different* pool keys
   (see [[connection-pool-type]]) so the pool properties can differ."
  [database connection-type]
  (case connection-type
    :default    nil
    :write-data (database-write-data-details database)
    :transform  (database-write-data-details database)
    :admin      (database-admin-details database)))

(defn- resolve-effective-type
  "Maps a requested `connection-type` plus whether an `overlay` was resolved to the effective
   pool key. `:transform` always keeps its own pool key — it is distinguished by its pool
   properties, not its details — so it never falls back to `:default`. Other non-default types
   fall back to `:default` when no overlay is configured, to avoid a duplicate pool."
  [connection-type overlay]
  (cond
    (= connection-type :transform) :transform
    overlay                        connection-type
    :else                          :default))

(defn effective-details
  "Returns the connection details map appropriate for the current context.

   Accepts a database (Toucan2 instance or lib/metadata). Returns nil for nil input.

   By default, returns the primary `:details`. Within a [[with-write-connection]] or
   [[with-admin-connection]] scope, takes the corresponding `:write-data-details` /
   `:admin-details` into account (if configured). Within a [[with-transform-connection]]
   scope, takes `:write-data-details` into account (if configured) — transforms write, so
   they get write-data credentials when set — but resolves to a *different* pool key
   (`:transform` vs `:write-data`) so the pool properties (e.g. `unreturnedConnectionTimeout`)
   can differ. Within a
   [[driver.w/with-swapped-connection-details]] scope, applies workspace isolation
   overrides on top."
  [database]
  (when-let [database (some-> database driver.u/ensure-lib-database)]
    (let [overlay  (perf/not-empty (overlay-details-for-type database *connection-type*))
          base     (merge (:details database) overlay)
          eff-type (resolve-effective-type *connection-type* overlay)]
      ;; Track when an overlay is genuinely used (not fallback, not workspace-swapped).
      ;; Default resolutions are not tracked here — see :metabase-db-connection/write-op for
      ;; pool-level connection acquisition metrics.
      (when (and overlay
                 (not *suppress-resolution-telemetry*)
                 (not (driver.w/has-connection-swap? (:id database))))
        (try (analytics/inc! :metabase-db-connection/type-resolved
                             {:connection-type (name *connection-type*)})
             (catch Exception _ nil)))
      (-> (driver.w/maybe-swap-details (:id database) base)
          (assoc ::connection-pool-type eff-type)
          (assoc ::database-id (u/id database))))))

(defn details-for-exact-type
  "Returns the details map for exactly the given connection-type, with no fallback or merging.

   Unlike [[effective-details]], `:write-data` and `:admin` return only their respective
   overlay maps (possibly nil), not a merge with `:details`. Use when you need to inspect
   or update a specific details map without resorting to raw key access."
  [database connection-type]
  (let [database (driver.u/ensure-lib-database database)]
    (case connection-type
      :default    (:details database)
      :write-data (database-write-data-details database)
      :transform  (:details database)
      :admin      (database-admin-details database))))

(defn connection-telemetry-info
  "A human-readable description of the current connection context, for logging only. Prose, not a
   token — interpolate it into log messages, never branch on it. If you need a value to act on, use
   [[connection-pool-type]]."
  []
  (str "the " (name *connection-type*) " connection"))

(defn connection-pool-type
  "Returns the effective pool key for the given database. Return value matches malli schema
  [[::connection-type]].

   Returns the requested non-default type only when both *requested* (via the
   corresponding `with-*-connection`) and *configured* (the database has the relevant
   overlay details). Otherwise returns `:default`, avoiding duplicate resource allocation
   (e.g. connection pools) when the requested type would resolve identically to `:default`.

   `:transform` is the exception: it always resolves to `:transform` — the transform pool is
   distinguished by its pool properties, not its details. See [[*connection-type*]]."
  [database]
  (let [database (driver.u/ensure-lib-database database)]
    (resolve-effective-type *connection-type*
                            (perf/not-empty (overlay-details-for-type database *connection-type*)))))

(defn track-connection-acquisition!
  "Increments a Prometheus counter tracking connection acquisitions by connection type
   and logs the connection type + database ID at DEBUG.

   Accepts a map of connection details, expected to be the output of [[effective-details]]

   Call at the point where a driver actually obtains a connection (e.g., pool checkout).
   Non-JDBC drivers that manage their own connections should call this explicitly."
  [connection-details]
  (if-let [conn-type (::connection-pool-type connection-details)]
    (do
      (log/debugf "Acquiring %s connection for db %s" conn-type (::database-id connection-details))
      (try (analytics/inc! :metabase-db-connection/write-op {:connection-type (name conn-type)})
           (catch Exception _ nil)))
    (log/warnf "%s was unable to determine connection type" `track-connection-acquisition!)))

(defn default-details
  "Returns primary `:details`, ignoring [[*connection-type*]].

   For operations that must always use the base configuration regardless of context —
   configuration migrations, admin-initiated writes, credential caching. For normal
   driver operations, prefer [[effective-details]]."
  [database]
  (:details database))
