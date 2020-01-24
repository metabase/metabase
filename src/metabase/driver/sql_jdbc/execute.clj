(ns metabase.driver.sql-jdbc.execute
  "Code related to actually running a SQL query against a JDBC database (including setting the session timezone when
  appropriate), and for properly encoding/decoding types going in and out of the database."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor
             [error-type :as qp.error-type]
             [interface :as qp.i]
             [store :as qp.store]
             [timezone :as qp.timezone]
             [util :as qputil]]
            [metabase.util.i18n :refer [tru]])
  (:import [java.sql JDBCType PreparedStatement ResultSet ResultSetMetaData SQLException Types]
           [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Interface (Multimethods)                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti set-timezone-sql
  "Return a format string containing a SQL statement to be used to set the timezone for the current transaction.
  The `%s` will be replaced with a string literal for a timezone, e.g. `US/Pacific.` (Timezone ID will come already
  wrapped in single quotes.)

    \"SET @@session.time_zone = %s;\""
  {:arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod set-timezone-sql :sql-jdbc [_] nil)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Parsing Results                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TIMEZONE FIXME — update docstring
;; TIMEZONE FIXME — remove the `calendar` param
(defmulti read-column
  "Read a single value from a single column in a single row from the JDBC ResultSet of a Metabase query. Normal
  implementations call an appropriate method on `ResultSet` to retrieve this value, such as `(.getObject rs
  i)`. (`i` is the index of the column whose value you should retrieve.)

  This method provides the opportunity to customize behavior for the way a driver returns or formats results of
  certain types -- this method dispatches on both driver and column type. For example, the MySQL/MariaDB driver
  provides a custom implementation for `Types/TIME` to work around questionable Timezone support.

  If set, the report timezone active at the time the query was ran will be passed as a Calendar; otherwise this value
  will be `nil` -- be sure to check before doing anything crazy with it."
  {:arglists '([driver calendar rs rsmeta i])}
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

(defn read-columns
  "Read columns from a JDBC `ResultSet` for the current row. This function uses `read-column` to read each individual
  value; `read-column` dispatches on `driver` and the JDBC type of each column — override this as needed.

  You can pass this method to `clojure.java.jdbc/query` and related functions as the `:read-columns` option:

    (jdbc/query spec sql {:read-columns (partial :read-columns driver)})"
  [driver rs ^ResultSetMetaData rsmeta indexes]
  (mapv
   (fn [^Integer i]
     ;; JDBCType/valueOf won't work for custom driver-specific enums
     (let [jdbc-type      (.getColumnType rsmeta i)
           jdbc-type-name (or (u/ignore-exceptions
                                (.getName (JDBCType/valueOf jdbc-type)))
                              jdbc-type)]
       (try
         (let [result (read-column driver nil rs rsmeta i)]
           (log/tracef "(read-column %s nil rs rsmeta %d) \"%s\" [JDBC Type: %s; DB type: %s] -> ^%s %s"
                       driver i
                       (.getColumnName rsmeta i) jdbc-type-name (.getColumnTypeName rsmeta i)
                       (.getName (class result)) (pr-str result))
           result)
         (catch Throwable e
           (log/errorf e "Error reading %s column %d %s %s"
                       driver i (.getColumnName rsmeta i) jdbc-type-name)
           nil))))
   indexes))


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

(defn set-parameters
  "Set a sequence of `prepared-statement` `params`. This method calls `set-parameter` for each param; `set-parameter`
  dispatches on `driver` and the class of the param — override this as needed.

  You can pass this method to `clojure.java.jdbc/query` and related functions as the `:set-parameters` option:

    (jdbc/query spec sql {:set-parameters (partial set-parameters driver)})"
  [driver prepared-statement params]
  (doseq [[i param] (map-indexed vector params)]
    (log/tracef "Query parameter %d came in as ^%s %s" (inc i) (.getName (class param)) (pr-str param))
    (set-parameter driver prepared-statement (inc i) param)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Running Queries                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - this is pretty similar to what `jdbc/with-db-connection` does, but not exactly the same. See if we can
;; switch to using that instead?
(defn- do-with-ensured-connection [db f]
  (if-let [conn (jdbc/db-find-connection db)]
    (f conn)
    (with-open [conn (jdbc/get-connection db)]
      (f conn))))

(defmacro ^:private with-ensured-connection
  "In many of the clojure.java.jdbc functions, it checks to see if there's already a connection open before opening a
  new one. This macro checks to see if one is open, or will open a new one. Will bind the connection to `conn-sym`."
  {:style/indent 1}
  [[conn-binding db] & body]
  `(do-with-ensured-connection ~db (fn [~conn-binding] ~@body)))

(defn- cancelable-run-query
  "Runs JDBC query, canceling it if an InterruptedException is caught (e.g. if there query is canceled before
  finishing)."
  [db sql params opts]
  (with-ensured-connection [conn db]
    ;; This is normally done for us by java.jdbc as a result of our `jdbc/query` call
    (with-open [^PreparedStatement stmt (jdbc/prepare-statement conn sql opts)]
      ;; specifiy that we'd like this statement to close once its dependent result sets are closed
      ;; (Not all drivers support this so ignore Exceptions if they don't)
      (u/ignore-exceptions
        (.closeOnCompletion stmt))
      (try
        (jdbc/query conn (into [stmt] params) opts)
        (catch InterruptedException e
          (try
            (log/warn (tru "Client closed connection, canceling query"))
            ;; This is what does the real work of canceling the query. We aren't checking the result of
            ;; `query-future` but this will cause an exception to be thrown, saying the query has been cancelled.
            (.cancel stmt)
            (finally
              (throw e))))))))

(defn- run-query
  "Run the query itself."
  [driver {sql :query, :keys [params remark max-rows]} connection]
  (let [sql              (str "-- " remark "\n" sql)
        [columns & rows] (cancelable-run-query
                          connection sql params
                          {:identifiers    identity
                           :as-arrays?     true
                           :read-columns   (partial read-columns driver)
                           :set-parameters (partial set-parameters driver)
                           :max-rows       max-rows})]
    {:rows    (or rows [])
     :columns (map u/qualified-name columns)}))


;;; -------------------------- Running queries: exception handling & disabling auto-commit ---------------------------

(defn- exception->nice-error-message ^String [^SQLException e]
  ;; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
  ;; the user already knows the SQL, and error code is meaningless
  ;; so just return the part of the exception that is relevant
  (some->> (.getMessage e)
           (re-find #"^(.*);")
           second))

(defn do-with-try-catch
  "Tries to run the function `f`, catching and printing exception chains if SQLException is thrown,
  and rethrowing the exception as an Exception with a nicely formatted error message."
  {:style/indent 0}
  [f]
  (try
    (f)
    (catch SQLException e
      (log/error (jdbc/print-sql-exception-chain e))
      (throw
       (if-let [nice-error-message (exception->nice-error-message e)]
         (Exception. nice-error-message e)
         e)))))

(defn- do-with-auto-commit-disabled
  "Disable auto-commit for this transaction, and make the transaction `rollback-only`, which means when the
  transaction finishes `.rollback` will be called instead of `.commit`. Furthermore, execute F in a try-finally block;
  in the `finally`, manually call `.rollback` just to be extra-double-sure JDBC any changes made by the transaction
  aren't committed."
  {:style/indent 1}
  [conn f]
  (jdbc/db-set-rollback-only! conn)
  (.setAutoCommit (jdbc/get-connection conn) false)
  ;; TODO - it would be nice if we could also `.setReadOnly` on the transaction as well, but that breaks setting the
  ;; timezone. Is there some way we can have our cake and eat it too?
  (try
    (f)
    (finally (.rollback (jdbc/get-connection conn)))))

(defn- do-in-transaction [connection f]
  (jdbc/with-db-transaction [transaction-connection connection]
    (do-with-auto-commit-disabled transaction-connection (partial f transaction-connection))))


;;; ---------------------------------------------- Running w/ Timezone -----------------------------------------------

(defn- set-timezone!
  "Set the timezone for the current connection."
  [driver timezone connection]
  (when-not (re-matches #"[A-Za-z\/_]+" timezone)
    (throw (ex-info (tru "Invalid timezone ''{0}''" timezone)
             {:type qp.error-type/qp})))
  (let [timezone      timezone
        format-string (set-timezone-sql driver)]
    (when-not (seq format-string)
      (throw (ex-info (str (tru "Cannot set timezone: invalid or missing SQL format string for driver {0}." driver)
                           " "
                           (tru "Did you implement set-timezone-sql?"))
               {:type qp.error-type/driver})))
    (let [sql (format format-string (str \' timezone \'))]
      (log/debug (u/format-color 'green (tru "Setting timezone with statement: {0}" sql)))
      (jdbc/db-do-prepared connection [sql]))))

(defn- run-query-without-timezone [driver _ connection query]
  (do-in-transaction connection (partial run-query driver query)))

(defn- run-query-with-timezone [driver ^String report-timezone connection query]
  (let [result (do-in-transaction
                connection
                (fn [transaction-connection]
                  (let [set-timezone? (try
                                        (set-timezone! driver report-timezone transaction-connection)
                                        true
                                        (catch SQLException e
                                          (log/error (tru "Failed to set timezone ''{0}''" report-timezone)
                                                     "\n"
                                                     (with-out-str (jdbc/print-sql-exception-chain e))))
                                        (catch Throwable e
                                          (log/error e (tru "Failed to set timezone ''{0}''" report-timezone))))]
                    (if-not set-timezone?
                      ::set-timezone-failed
                      (run-query driver query transaction-connection)))))]
    (if (= result ::set-timezone-failed)
      (run-query-without-timezone driver report-timezone connection query)
      result)))


;;; ------------------------------------------------- execute-query --------------------------------------------------

(defn execute-query
  "Process and run a native (raw SQL) `query`."
  [driver {query :native, :as outer-query}]
  (let [report-timezone (qp.timezone/report-timezone-id-if-supported)
        query           (assoc query
                               :remark   (qputil/query->remark outer-query)
                               :max-rows (or (mbql.u/query->max-rows-limit outer-query) qp.i/absolute-max-results))]
    (do-with-try-catch
      (fn []
        (let [db-connection (sql-jdbc.conn/db->pooled-connection-spec (qp.store/database))
              run-query*    (if (seq report-timezone)
                              run-query-with-timezone
                              run-query-without-timezone)]
          (run-query* driver report-timezone db-connection query))))))
