(ns metabase.driver.sql-jdbc.reducible-execute
  "TODO -- merge this namespace into `metabase.driver.sql-jdbc.execute` and do away with the old impl entirely."
  (:require [clojure.core.async :as a]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.query-processor
             [store :as qp.store]
             [timezone :as qp.timezone]]
            [metabase.query-processor.util.reducible :as qp.util.reducible]
            [metabase.util.i18n :refer [trs]])
  (:import [java.sql Connection JDBCType PreparedStatement ResultSet ResultSetMetaData Types]
           javax.sql.DataSource))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        SQL JDBC Reducible QP Interface                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti connection-with-timezone
  "Fetch a Connection for a `database` with session time zone set to `timezone-id` (if supported by the driver.) The
  default implementation:

  1. Calls util fn `datasource` to get a c3p0 connection pool DataSource
  2. Calls `.getConnection()` the normal way
  3. Executes `set-timezone-sql` if implemented by the driver.

  `timezone-id` will be `nil` if a `report-timezone` Setting is not currently set; don't change the session time zone
  if this is the case.

  For drivers that support session timezones, the default implementation and `set-timezone-sql` should be considered
  deprecated in favor of implementing `connection-with-timezone` directly. This way you can set the session timezone
  in the most efficient manner, e.g. only setting it if needed (if there's an easy way for you to check this), or by
  setting it as a parameter of the connection itself (the default connection pools are automatically flushed when
  `report-timezone-id` changes).

  Custom implementations should set transaction isolation to the least-locking level supported by the driver, and make
  connections read-only (*after* setting timezone, if needed)."
  {:arglists '(^java.sql.Connection [driver database ^String timezone-id])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti ^PreparedStatement prepared-statement
  "Create a PreparedStatement with `sql` query, and set any `params`. You shouldn't need to override the default
  implementation for this method; if you do, take care to set options to maximize result set read performance (e.g.
  `ResultSet/TYPE_FORWARD_ONLY`); refer to the default implementation."
  {:arglists '(^java.sql.PreparedStatement [driver ^java.sql.Connection connection ^String sql params])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti execute-query!
  {:arglists '(^java.sql.ResultSet [driver ^java.sql.PreparedStatement stmt])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti column-metadata
  {:arglists '([driver ^java.sql.ResultSetMetaData rsmeta])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti read-column-fn
  "Should return a zero-arg function that will fetch the value of the column from the current row."
  {:arglists '([driver rs rsmeta i])}
  (fn [driver _ ^ResultSetMetaData rsmeta ^long col-idx]
    [(driver/dispatch-on-initialized-driver driver) (.getColumnType rsmeta col-idx)])
  :hierarchy #'driver/hierarchy)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Default Impl                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn datasource ^DataSource [database]
  (:datasource (sql-jdbc.conn/db->pooled-connection-spec database)))

(defn ^:deprecated set-time-zone-if-supported!
  "Execute `set-timezone-sql`, if implemented by driver, to set the session time zone. This way of setting the time zone
  should be considered deprecated in favor of implementing `connection-with-time-zone` directly."
  [driver ^Connection conn ^String timezone-id]
  (when timezone-id
    (when-let [format-string (sql-jdbc.execute/set-timezone-sql driver)]
      (try
        (let [sql (format format-string (str \' timezone-id \'))]
          (log/debug (trs "Setting {0} database timezone with statement: {1}" driver (pr-str sql)))
          (.setReadOnly conn false)
          (with-open [stmt (.createStatement conn)]
            (.execute stmt sql)
            (log/tracef "Successfully set timezone for %s database to %s" driver timezone-id)))
        (catch Throwable e
          (log/error e (trs "Failed to set timezone ''{0}'' for {1} database" timezone-id driver)))))))

;; TODO - since we're not running the queries in a transaction, does this make any difference at all?
(defn set-transaction-level!
  "Set the connection transaction isolation level to the least-locking level supported by the DB. See
  https://docs.oracle.com/cd/E19830-01/819-4721/beamv/index.html for an explanation of these levels."
  [driver ^Connection conn]
  (let [dbmeta (.getMetaData conn)]
    (loop [[[level-name ^Integer level] & more] [[:read-uncommitted Connection/TRANSACTION_READ_UNCOMMITTED]
                                                 [:repeatable-read  Connection/TRANSACTION_REPEATABLE_READ]
                                                 [:read-committed   Connection/TRANSACTION_READ_COMMITTED]]]
      (cond
        (.supportsTransactionIsolationLevel dbmeta level)
        (do
          (log/tracef "Set transaction isolation level for %s database to %s" (name driver) level-name)
          (try
            (.setTransactionIsolation conn level)
            (catch Throwable e
              (log/error e (trs "Error setting transaction isolation level for {0} database to {1}" (name driver) level-name)))))

        (seq more)
        (recur more)))))

(defmethod connection-with-timezone  :sql-jdbc
  [driver database ^String timezone-id]
  (let [conn (.getConnection (datasource database))]
    (try
      (set-transaction-level! driver conn)
      (set-time-zone-if-supported! driver conn timezone-id)
      (doto conn
        (.setReadOnly true))
      (catch Throwable e
        (.close conn)
        (throw e)))))

(defn set-parameters!
  "Set parameters for the prepared statement by calling `sql-jdbc.execute/set-parameter` for each parameter."
  [driver stmt params]
  (dorun
   (map-indexed
    (fn [i param]
      (log/tracef "Set param %d -> %s" (inc i) (pr-str param))
      (sql-jdbc.execute/set-parameter driver stmt (inc i) param))
    params)))

(defmethod prepared-statement :sql-jdbc
  [driver ^Connection conn ^String sql params]
  (let [stmt (.prepareStatement conn sql
                                ResultSet/TYPE_FORWARD_ONLY
                                ResultSet/CONCUR_READ_ONLY
                                ResultSet/CLOSE_CURSORS_AT_COMMIT)]
    (try
      (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
      (set-parameters! driver stmt params)
      stmt
      (catch Throwable e
        (.close stmt)
        (throw e)))))

(defn- prepared-statement*
  ^PreparedStatement [driver conn sql params {:keys [canceled-chan]}]
  ;; if canceled-chan gets a message, cancel the PreparedStatement
  (let [^PreparedStatement stmt (prepared-statement driver conn sql params)]
    (a/go
      (when (a/<! canceled-chan)
        (log/debug (trs "Query canceled, calling PreparedStatement.cancel()"))
        (u/ignore-exceptions
          (.cancel stmt))))
    stmt))

(defmethod execute-query! :sql-jdbc
  [_ ^PreparedStatement stmt]
  (.executeQuery stmt))

(defmethod read-column-fn :default
  [_ ^ResultSet rs _ ^long col-idx]
  ^{:name (format "(.getObject rs %d)" col-idx)}
  (fn []
    (.getObject rs col-idx)))

(defn- get-object-of-class-fn [^ResultSet rs, ^long col-idx, ^Class klass]
  ^{:name (format "(.getObject rs %d %s)" col-idx (.getCanonicalName klass))}
  (fn []
    (.getObject rs col-idx klass)))

(defmethod read-column-fn [:sql-jdbc Types/TIMESTAMP]
  [_ rs _ i]
  (get-object-of-class-fn rs i java.time.LocalDateTime))

(defn- column-range [^ResultSetMetaData rsmeta]
  (range 1 (inc (.getColumnCount rsmeta))))

(defn- log-readers [driver ^ResultSetMetaData rsmeta fns]
  (log/trace
   (str/join
    "\n"
    (for [^Integer i (column-range rsmeta)]
      (format "Reading %s column %d %s (JDBC type: %s, DB type: %s) with %s"
              driver
              i
              (pr-str (.getColumnName rsmeta i))
              (or (u/ignore-exceptions
                    (.getName (JDBCType/valueOf (.getColumnType rsmeta i))))
                  (.getColumnType rsmeta i))
              (.getColumnTypeName rsmeta i)
              (let [f (nth fns (dec i))]
                (or (:name (meta f))
                    f)))))))

(defn- read-row-fn [driver rs ^ResultSetMetaData rsmeta]
  (let [fns (for [col-idx (column-range rsmeta)]
              (read-column-fn driver rs rsmeta (long col-idx)))]
    (log-readers driver rsmeta fns)
    (apply juxt fns)))

(defmethod column-metadata :sql-jdbc
  [driver ^ResultSetMetaData rsmeta]
  (mapv
   (fn [^Integer i]
     {:name      (.getColumnName rsmeta i) ; TODO - or .getColumnLabel (?)
      :jdbc_type (u/ignore-exceptions
                   (.getName (JDBCType/valueOf (.getColumnType rsmeta i))))
      :db_type   (.getColumnTypeName rsmeta i)
      :base_type (sql-jdbc.sync/database-type->base-type driver (keyword (.getColumnTypeName rsmeta i)))})
   (column-range rsmeta)))

(defn execute-reducible-query
  "Default impl of `execute-reducible-query` for sql-jdbc drivers."
  [driver {{sql :query, params :params} :native} chans respond]
  (with-open [conn (connection-with-timezone driver (qp.store/database) (qp.timezone/report-timezone-id-if-supported))
              stmt (prepared-statement* driver conn sql params chans)
              rs   (execute-query! driver stmt)]
    (let [rsmeta           (.getMetaData rs)
          results-metadata {:cols (column-metadata driver rsmeta)}
          read-row         (read-row-fn driver rs rsmeta)
          row-fn           (fn []
                             (when (.next rs)
                               (read-row)))]
      (respond
       results-metadata
       (qp.util.reducible/reducible-rows row-fn chans)))))
