(ns metabase.driver.connection
  "Connection type abstraction for drivers.

   This namespace provides a driver-agnostic mechanism for selecting which connection
   details to use when connecting to a database. The primary use case is supporting
   separate read and write connections for features like Transforms.

   ## Usage

   Drivers should call [[effective-details]] instead of directly accessing `:details`:

       ;; Instead of:
       (let [details (:details database)] ...)

       ;; Use:
       (let [details (driver.conn/effective-details database)] ...)

   Code that needs write access (e.g., transforms) wraps execution in [[with-write-connection]]:

       (driver.conn/with-write-connection
         (driver/run-transform! driver transform-details opts))

   ## Design

   The connection type is tracked via a dynamic binding [[*connection-type*]]. When set to
   `:write-data`, [[effective-details]] returns `:write-data-details` if available, otherwise
   falls back to `:details`. This allows the same database ID to use different connection
   pools with different credentials.

   ## Layering

   [[effective-details]] composes two mechanisms:
   1. **Connection type** — selects `:details` or merges `:write-data-details` on top
   2. **Workspace swap** — applies [[metabase.driver/*swapped-connection-details*]] overrides

   The workspace swap is always the outermost layer, ensuring workspace isolation
   overrides any connection-type-specific details."
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util.malli.registry :as mr]))

(mr/def ::connection-type
  [:enum :default :write-data])

(def ^:dynamic *connection-type*
  "The type of connection to use when accessing database details.

   - `:default` — use primary `:details` (for queries, sync, etc.)
   - `:write-data`   — use `:write-data-details` if available, else `:details` (for transforms)

   Bind this using [[with-write-connection]] rather than directly."
  :default)

(defmacro with-write-connection
  "Execute body using write connection details.

   Any driver operations within body that call [[effective-details]] will receive
   `:write-data-details` (if configured) instead of `:details`."
  [& body]
  `(binding [*connection-type* :write-data]
     ~@body))

(defn effective-details
  "Returns the appropriate connection details based on [[*connection-type*]] and any
   active workspace swap ([[metabase.driver/*swapped-connection-details*]]).

   Layering (inner to outer):
   1. Selects base details by connection type:
      - `:default` → `:details`
      - `:write-data` → `:details` merged with `:write-data-details` (write details take precedence)
   2. Applies workspace swap on top (if active for this database ID)

   The workspace swap is outermost because workspace isolation creates a separate security
   boundary (its own user, role, schema) that overrides any connection-type-specific config.

   Drivers should call this instead of directly accessing `(:details database)`.

   Returns `nil` if `database` is `nil`."
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
  "Extracts the appropriate details-map from the database based on the passed-in connection-type,
  **without any fallback**."
  [database connection-type]
  (let [database (driver.u/ensure-lib-database database)]
    (case connection-type
      :default    (:details database)
      :write-data (:write-data-details database)
      nil)))

(defn write-connection?
  "Returns true if currently using write connection type.

   Useful for logging or conditional behavior based on connection type."
  []
  (= *connection-type* :write-data))

(defn track-connection-acquisition!
  "Track a connection acquisition for capacity-planning metrics.

   Increments `:metabase-db-connection/write-op` with the current connection type
   (\"default\" or \"write-data\"). Call this at the point where a driver actually
   acquires a connection — for JDBC drivers that's `do-with-resolved-connection`,
   for non-JDBC drivers it's `connection-spec` or the execute path.

   See `:metabase-db-connection/type-resolved` in [[effective-details]] for
   feature-usage tracking (write-data only, driver-agnostic)."
  []
  (let [conn-type (if (write-connection?) "write-data" "default")]
    (try (prometheus/inc! :metabase-db-connection/write-op {:connection-type conn-type})
         (catch Exception _ nil))))

(defn default-details
  "Returns database `details`, ignoring `*connection-type*`.

   Use this for operations that should always use the primary connection details,
   such as configuration migrations or admin operations. For normal driver operations,
   prefer [[effective-details]]."
  [database]
  (:details database))
