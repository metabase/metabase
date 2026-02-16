(ns metabase.driver.connection
  "Centralized access to database connection details.

   Direct access to `(:details database)` is an anti-pattern. It couples callers to
   the raw data layout, which means any change to how details are resolved — connection
   routing, write credentials, workspace isolation, security boundaries — requires
   finding and updating every call site. This namespace provides the indirection that
   makes those changes possible.

   Primary API: [[effective-details]], [[with-write-connection]], [[default-details]]."
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util.malli.registry :as mr]))

(mr/def ::connection-type
  [:enum :default :write-data])

(def ^:dynamic *connection-type*
  "Which connection details [[effective-details]] should resolve.

   - `:default` — primary `:details`
   - `:write-data` — `:write-data-details` merged over `:details` (if configured)

   Bind via [[with-write-connection]], not directly."
  :default)

(defmacro with-write-connection
  "Establishes a write-connection context for body.

   [[effective-details]] calls within this scope resolve to take `:write-data-details`
   into account (if configured) instead of only primary `:details`."
  [& body]
  `(binding [*connection-type* :write-data]
     ~@body))

(defn effective-details
  "Returns the connection details map appropriate for the current context.

   Accepts a database (Toucan2 instance or lib/metadata). Returns nil for nil input.

   By default, returns the primary `:details`. Within a [[with-write-connection]] scope,
   takes `:write-data-details` into account (if configured). Within a
   [[metabase.driver/with-swapped-connection-details]] scope, applies workspace isolation
   overrides on top."
  [database]
  (when-let [database (some-> database driver.u/ensure-lib-database)]
    (let [write?        (= *connection-type* :write-data)
          write-details (when write? (:write-data-details database))
          base          (if write-details
                          (merge (:details database) write-details)
                          (:details database))]
      ;; Track when write-data-details are genuinely used (not fallback, not workspace-swapped).
      ;; Default resolutions are not tracked here — see :metabase-db-connection/write-op for
      ;; pool-level connection acquisition metrics.
      (when (and write-details (not (driver/has-connection-swap? (:id database))))
        (try (prometheus/inc! :metabase-db-connection/type-resolved {:connection-type "write-data"})
             (catch Exception _ nil)))
      (driver/maybe-swap-details (:id database) base))))

(defn details-for-exact-type
  "Returns the details map for exactly the given connection-type, with no fallback or merging.

   Unlike [[effective-details]], `:write-data` returns only `:write-data-details` (possibly nil),
   not a merge with `:details`. Use when you need to inspect or update a specific details map
   without resorting to raw key access."
  [database connection-type]
  (let [database (driver.u/ensure-lib-database database)]
    (case connection-type
      :default    (:details database)
      :write-data (:write-data-details database)
      nil)))

(defn write-connection?
  "True if currently executing within a [[with-write-connection]] scope."
  []
  (= *connection-type* :write-data))

(defn track-connection-acquisition!
  "Increments a Prometheus counter tracking connection acquisitions by connection type.

   Call at the point where a driver actually obtains a connection (e.g., pool checkout).
   Non-JDBC drivers that manage their own connections should call this explicitly."
  []
  (let [conn-type (if (write-connection?) "write-data" "default")]
    (try (prometheus/inc! :metabase-db-connection/write-op {:connection-type conn-type})
         (catch Exception _ nil))))

(defn default-details
  "Returns primary `:details`, ignoring [[*connection-type*]].

   For operations that must always use the base configuration regardless of context —
   configuration migrations, admin-initiated writes, credential caching. For normal
   driver operations, prefer [[effective-details]]."
  [database]
  (:details database))
