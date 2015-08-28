(ns metabase.driver.generic-sql.interface
  (:import clojure.lang.Keyword))

(defprotocol ISqlDriverDatabaseSpecific
  "Methods a DB-specific concrete SQL driver should implement.
   They should also have the following properties:

   *  `column->base-type`
   *  `sql-string-length-fn`"

  (connection-details->connection-spec [this connection-details])
  (database->connection-details        [this database])

  (unix-timestamp->date [this ^Keyword seconds-or-milliseconds field-or-value]
    "Return a korma form appropriate for converting a Unix timestamp integer field or value to an proper SQL `Timestamp`.
     SECONDS-OR-MILLISECONDS refers to the resolution of the int in question and with be either `:seconds` or `:milliseconds`.")

  (timezone->set-timezone-sql [this timezone]
    "Return a string that represents the SQL statement that should be used to set the timezone
     for the current transaction.")


  )
