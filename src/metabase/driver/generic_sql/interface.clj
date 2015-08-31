(ns metabase.driver.generic-sql.interface
  (:import clojure.lang.Keyword))

(defprotocol ISqlDriverDatabaseSpecific
  "Methods a DB-specific concrete SQL driver should implement.
   They should also have the following properties:

   *  `column->base-type`
   *  `sql-string-length-fn`"

  (connection-details->connection-spec [this connection-details])
  (database->connection-details        [this database])

  (unix-timestamp->timestamp [this ^Keyword seconds-or-milliseconds field-or-value]
    "Return a korma form appropriate for converting a Unix timestamp integer field or value to an proper SQL `Timestamp`.
     SECONDS-OR-MILLISECONDS refers to the resolution of the int in question and with be either `:seconds` or `:milliseconds`.")

  (timezone->set-timezone-sql [this timezone]
    "Return a string that represents the SQL statement that should be used to set the timezone
     for the current transaction.")

  (date [this ^Keyword unit field-or-value]
    "Return a korma form for truncating a date or timestamp field or value to a given resolution, or extracting a date component.")

  (date-interval [this ^Keyword unit ^Integer amount]
    "Return a korma form for a date relative to NOW(), e.g. on that would produce SQL like `(NOW() + INTERVAL '1 month')`."))
