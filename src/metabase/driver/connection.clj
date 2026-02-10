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
   `:write`, [[effective-details]] returns `:write-data-details` if available, otherwise
   falls back to `:details`. This allows the same database ID to use different connection
   pools with different credentials.")

(def ^:dynamic *connection-type*
  "The type of connection to use when accessing database details.

   - `:default` — use primary `:details` (for queries, sync, etc.)
   - `:write`   — use `:write-data-details` if available, else `:details` (for transforms)

   Bind this using [[with-write-connection]] rather than directly."
  :default)

(defmacro with-write-connection
  "Execute body using write connection details.

   Any driver operations within body that call [[effective-details]] will receive
   `:write-data-details` (if configured) instead of `:details`."
  [& body]
  `(binding [*connection-type* :write]
     ~@body))

(defn effective-details
  "Returns the appropriate connection details based on [[*connection-type*]].

   When `*connection-type*` is `:write` and the database has write data details,
   returns those. Otherwise returns `:details`.

   Note: Checks for both `:write-data-details` (SnakeHatingMap/API responses) and
   `:write_data_details` (raw toucan2 instances) since database objects
   may use either key style depending on context.

   Drivers should call this instead of directly accessing `(:details database)`
   to support write connections."
  [database]
  (if (= *connection-type* :write)
    ;; TODO: Figure out why database objects sometimes have snake_case keys (raw toucan2) and
    ;; sometimes kebab-case keys (SnakeHatingMap), and fix this properly. Currently we check
    ;; both to avoid SnakeHatingMap throwing on snake_case access.
    (or (:write-data-details database)
        (:write_data_details database)
        (:details database))
    (:details database)))

(defn write-connection?
  "Returns true if currently using write connection type.

   Useful for logging or conditional behavior based on connection type."
  []
  (= *connection-type* :write))
