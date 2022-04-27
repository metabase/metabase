(ns metabase.driver.sql-jdbc.execute.old-impl
  "Deprecated [[metabase.driver.sql-jdbc.execute]] methods."
  (:require [metabase.driver :as driver]))

(defmulti set-timezone-sql
  "Return a format string containing a SQL statement to be used to set the timezone for the current transaction.
  The `%s` will be replaced with a string literal for a timezone, e.g. `US/Pacific.` (Timezone ID will come already
  wrapped in single quotes.)

    \"SET @@session.time_zone = %s;\"

  This method is only called for drivers using the default implementatation of `connection-with-timezone`; it should
  be considered deprecated in favor of implementing `connection-with-timezone` directly."
  {:deprecated "0.35.0", :arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod set-timezone-sql :sql-jdbc [_] nil)
