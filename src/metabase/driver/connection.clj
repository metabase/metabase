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
   pools with different credentials."
  (:require
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
  "Returns the appropriate connection details based on [[*connection-type*]].

   When `*connection-type*` is `:write-data` and the database has write data details,
   returns `:details` merged with `:write-data-details` (write details take precedence).
   This ensures database-level config (scheduling, timezone, etc.) always flows through
   from `:details`, while connection-specific config overrides.

   Drivers should call this instead of directly accessing `(:details database)`
   to support write connections."
  [database]
  (let [database (driver.u/ensure-lib-database database)]
    (if-not (= *connection-type* :write-data)
      (:details database)
      (if-let [write-details (:write-data-details database)]
        (merge (:details database) write-details)
        (:details database)))))

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

(defn default-details
  "Returns database `details`, ignoring `*connection-type*`.

   Use this for operations that should always use the primary connection details,
   such as configuration migrations or admin operations. For normal driver operations,
   prefer [[effective-details]]."
  [database]
  (:details database))
