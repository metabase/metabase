(ns metabase.driver.sql-jdbc.execute.old-impl
  "Old implementations of [[metabase.driver.sql-jdbc.execute]] methods. All methods and functions in this namespace
  should be considered deprecated and will be removed in future releases."
  (:require
   [metabase.driver :as driver]))

(set! *warn-on-reflection* true)

(defmulti connection-with-timezone
  "Deprecated in Metabase 44. Implement [[do-with-connection-with-time-zone]] instead. This method will be removed in or
  after Metabase 47."
  {:added      "0.35.0"
   :deprecated "0.46.0"
   :arglists   '(^java.sql.Connection [driver database ^String timezone-id])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti set-timezone-sql
  "Return a format string containing a SQL statement to be used to set the timezone for the current transaction.
  The `%s` will be replaced with a string literal for a timezone, e.g. `US/Pacific.` (Timezone ID will come already
  wrapped in single quotes.)

    \"SET @@session.time_zone = %s;\"

  This method is only called for drivers using the default implementation
  of [[metabase.driver.sql-jdbc.execute/connection-with-timezone]]; it should be considered deprecated in favor of
  implementing `connection-with-timezone` directly."
  {:deprecated "0.35.0", :arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod set-timezone-sql :sql-jdbc [_] nil)
