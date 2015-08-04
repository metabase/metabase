(ns metabase.driver.generic-sql.interface)

(defprotocol ISqlDriverDatabaseSpecific
  "Methods a DB-specific concrete SQL driver should implement.
   They should also have the following properties:

   *  `column->base-type`
   *  `sql-string-length-fn`"
  (connection-details->connection-spec [this connection-details])
  (database->connection-details        [this database])
  (cast-timestamp-to-date              [this table-name field-name seconds-or-milliseconds]
    "Return the raw SQL that should be used to cast a Unix-timestamped column with string
     TABLE-NAME and string FIELD-NAME to a SQL `DATE`. SECONDS-OR-MILLISECONDS will be either
     `:seconds` or `:milliseconds`.")
  (timezone->set-timezone-sql          [this timezone]
    "Return a string that represents the SQL statement that should be used to set the timezone
     for the current transaction."))

(defprotocol ISqlDriverQuoteName
  "Optionally protocol to override how the Generic SQL driver quotes the names of databases, tables, and fields."
  (quote-name [this ^String nm]
    "Quote a name appropriately for this database."))

;; Default implementation quotes using "
(extend-protocol ISqlDriverQuoteName
  Object
  (quote-name [_ nm]
    (str \" nm \")))
