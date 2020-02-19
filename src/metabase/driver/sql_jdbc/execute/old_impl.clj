(ns metabase.driver.sql-jdbc.execute.old-impl
  "Old implementation of `metabase.driver.sql-jdbc.execute` for non-reducible results (i.e., for implementing
  `driver/execute-query` rather than `driver/execute-reducible-query`).

  All methods and functions in this namespace should be considered deprecated with the exception of `set-parameter`,
  which will be moved to `metabase.driver.sql-jdbc.execute` when this namespace is removed."
  (:require [metabase.driver :as driver])
  (:import [java.sql ResultSet ResultSetMetaData Types]
           [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime]))

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

(defmulti read-column
  "Read a single value from a single column in the current row from the JDBC ResultSet of a Metabase query. Normal
  implementations call an appropriate method on `ResultSet` to retrieve this value, such as `(.getObject rs
  i)`. (`i` is the index of the column whose value you should retrieve.)

  This method provides the opportunity to customize behavior for the way a driver returns or formats results of
  certain types -- this method dispatches on both driver and column type. For example, the MySQL/MariaDB driver
  provides a custom implementation for `Types/TIME` to work around questionable Timezone support.

  The second arg to this method is no longer used and should be ignored.

  This method is deprecated in favor of `read-column-thunk`, and will be removed in a future release."
  {:deprecated "0.35.0", :arglists '([driver _ rs rsmeta i])}
  (fn [driver _ _ ^ResultSetMetaData rsmeta ^Integer i]
    [(driver/dispatch-on-initialized-driver driver) (.getColumnType rsmeta i)])
  :hierarchy #'driver/hierarchy)

(defmethod read-column :default
  [_ col-type ^ResultSet rs _ ^Integer i]
  (.getObject rs i))

(defn- get-object-of-class [^ResultSet rs, ^Integer index, ^Class klass]
  (.getObject rs index klass))

(defmethod read-column [::driver/driver Types/TIMESTAMP]
  [_ _ rs _ i]
  (get-object-of-class rs i LocalDateTime))

(defmethod read-column [::driver/driver Types/TIMESTAMP_WITH_TIMEZONE]
  [_ _ rs _ i]
  (get-object-of-class rs i OffsetDateTime))

(defmethod read-column [::driver/driver Types/DATE]
  [_ _ rs _ i]
  (get-object-of-class rs i LocalDate))

(defmethod read-column [::driver/driver Types/TIME]
  [_ _ rs _ i]
  (get-object-of-class rs i LocalTime))

(defmethod read-column [::driver/driver Types/TIME_WITH_TIMEZONE]
  [_ _ rs _ i]
  (get-object-of-class rs i OffsetTime))
