(ns metabase.driver.sql-jdbc.execute.old-impl
  "Old implementation of `metabase.driver.sql-jdbc.execute` for non-reducible results (i.e., for implementing
  `driver/execute-query` rather than `driver/execute-reducible-query`).

  All methods and functions in this namespace should be considered deprecated with the exception of `set-parameter`,
  which will be moved to `metabase.driver.sql-jdbc.execute` when this namespace is removed."
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.driver :as driver])
  (:import [java.sql JDBCType PreparedStatement ResultSet ResultSetMetaData Types]
           [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Interface (Multimethods)                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Parsing Results                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 Setting Params                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - would a more general method to convert a parameter to the desired class (and maybe JDBC type) be more
;; useful? Then we can actually do things like log what transformations are taking place
(defmulti set-parameter
  "Set the `PreparedStatement` parameter at index `i` to `object`. Dispatches on driver and class of `object`. By
  default, this calls `.setObject`, but drivers can override this method to convert the object to a different class or
  set it with a different intended JDBC type as needed."
  {:arglists '([driver prepared-statement i object])}
  (fn [driver _ _ object]
    [(driver/dispatch-on-initialized-driver driver) (class object)])
  :hierarchy #'driver/hierarchy)

(defn- set-object
  ([^PreparedStatement prepared-statement, ^Integer index, object]
   (log/tracef "(set-object prepared-statement %d ^%s %s)" index (.getName (class object)) (pr-str object))
   (.setObject prepared-statement index object))

  ([^PreparedStatement prepared-statement, ^Integer index, object, ^Integer target-sql-type]
   (log/tracef "(set-object prepared-statement %d ^%s %s java.sql.Types/%s)" index (.getName (class object))
               (pr-str object) (.getName (JDBCType/valueOf target-sql-type)))
   (.setObject prepared-statement index object target-sql-type)))

(defmethod set-parameter :default
  [_ prepared-statement i object]
  (set-object prepared-statement i object))

(defmethod set-parameter [::driver/driver LocalDate]
  [_ prepared-statement i t]
  (set-object prepared-statement i t Types/DATE))

(defmethod set-parameter [::driver/driver LocalTime]
  [_ prepared-statement i t]
  (set-object prepared-statement i t Types/TIME))

(defmethod set-parameter [::driver/driver LocalDateTime]
  [_ prepared-statement i t]
  (set-object prepared-statement i t Types/TIMESTAMP))

(defmethod set-parameter [::driver/driver OffsetTime]
  [_ prepared-statement i t]
  (set-object prepared-statement i t Types/TIME_WITH_TIMEZONE))

(defmethod set-parameter [::driver/driver OffsetDateTime]
  [_ prepared-statement i t]
  (set-object prepared-statement i t Types/TIMESTAMP_WITH_TIMEZONE))

(defmethod set-parameter [::driver/driver ZonedDateTime]
  [_ prepared-statement i t]
  (set-object prepared-statement i t Types/TIMESTAMP_WITH_TIMEZONE))

;; TODO - remove this
(defmethod set-parameter [::driver/driver Instant]
  [driver prepared-statement i t]
  (set-parameter driver prepared-statement i (t/offset-date-time t (t/zone-offset 0))))

;; TODO - this might not be needed for all drivers. It is at least needed for H2 and Postgres. Not sure which, if any
;; JDBC drivers support `ZonedDateTime`.
(defmethod set-parameter [::driver/driver ZonedDateTime]
  [driver prepared-statement i t]
  (set-parameter driver prepared-statement i (t/offset-date-time t)))

;; just mark everything as deprecated so people don't try to use it
(doseq [[symb varr] (ns-interns *ns*)
        :when (and (not (:deprecated (meta varr)))
                   (not= symb 'set-parameter))]
  (alter-meta! varr assoc :deprecated "0.35.0"))
