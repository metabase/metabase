(ns metabase.driver.sql-jdbc.reducible-execute
  (:require [clojure.core.async :as a]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.util.reducible :as qp.util.reducible])
  (:import [java.sql Connection JDBCType PreparedStatement ResultSet ResultSetMetaData Types]
           javax.sql.DataSource))

(defmulti connection
  {:arglists '(^java.sql.Connection [driver ^javax.sql.DataSource datasource])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod connection :sql-jdbc
  [_ ^DataSource datasource]
  (let [conn (.getConnection datasource)]
    (try
      (doto conn
        (.setAutoCommit false)
        (.setReadOnly true)
        (u/ignore-exceptions
          (.setTransactionIsolation Connection/TRANSACTION_READ_UNCOMMITTED)))
      (catch Throwable e
        (.close conn)
        (throw e)))))

(defn set-parameters! [driver stmt params]
  (dorun
   (map-indexed
    (fn [i param]
      #_(println "Set param" (inc i) "->" (pr-str param)) ; NOCOMMIT
      (sql-jdbc.execute/set-parameter driver stmt (inc i) param))
    params)))

(defmulti ^PreparedStatement prepared-statement
  {:arglists '(^java.sql.PreparedStatement [driver ^java.sql.Connection connection ^String sql params chans])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod prepared-statement :sql-jdbc
  [driver ^Connection conn ^String sql params {:keys [canceled-chan]}]
  (let [stmt (.prepareStatement conn sql
                                ResultSet/TYPE_FORWARD_ONLY
                                ResultSet/CONCUR_READ_ONLY
                                ResultSet/CLOSE_CURSORS_AT_COMMIT)]
    (try
      (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
      (set-parameters! driver stmt params)
      ;; if canceled-chan gets a message, cancel the PreparedStatement
      (a/go
        (when (a/<! canceled-chan)
          #_(locking println (println "Query canceled, calling PreparedStatement.cancel()")) ; NOCOMMIT
          (u/ignore-exceptions
            (.cancel stmt))))
      stmt
      (catch Throwable e
        (.close stmt)
        (throw e)))))

(defmulti execute-query!
  {:arglists '(^java.sql.ResultSet [driver ^java.sql.PreparedStatement stmt])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod execute-query! :sql-jdbc
  [_ ^PreparedStatement stmt]
  (.executeQuery stmt))

(defmulti read-column-fn
  "Should return a zero-arg function that will fetch the value of the column from the current row."
  {:arglists '([driver rs rsmeta i])}
  (fn [driver _ ^ResultSetMetaData rsmeta ^long col-idx]
    [(driver/dispatch-on-initialized-driver driver) (.getColumnType rsmeta col-idx)])
  :hierarchy #'driver/hierarchy)

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

(defn- log-readers [driver ^ResultSetMetaData rsmeta fns]
  ;; NOCOMMIT
  #_(doseq [^Integer i (range 1 (inc (.getColumnCount rsmeta)))]
    (printf "Reading %s column %d (JDBC type: %s, DB type: %s) with %s\n"
            driver
            i
            (or (u/ignore-exceptions
                  (.getName (JDBCType/valueOf (.getColumnType rsmeta i))))
                (.getColumnType rsmeta i))
            (.getColumnTypeName rsmeta i)
            (let [f (nth fns (dec i))]
              (or (:name (meta f))
                  f)))))

(defn- read-row-fn [driver rs ^ResultSetMetaData rsmeta]
  (let [fns (for [col-idx (range 1 (inc (.getColumnCount rsmeta)))]
              (read-column-fn driver rs rsmeta (long col-idx)))]
    (log-readers driver rsmeta fns)
    (apply juxt fns)))

(defmulti column-metadata
  {:arglists '([driver ^java.sql.ResultSetMetaData rsmeta])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod column-metadata :sql-jdbc
  [driver ^ResultSetMetaData rsmeta]
  (mapv
   (fn [^Integer i]
     {:name      (or (.getColumnLabel rsmeta i)
                     (.getColumnName rsmeta i))
      :jdbc_type (u/ignore-exceptions
                   (.getName (JDBCType/valueOf (.getColumnType rsmeta i))))
      :db_type   (.getColumnTypeName rsmeta i)
      :base_type (sql-jdbc.sync/database-type->base-type driver (keyword (.getColumnTypeName rsmeta i)))})
   (range 1 (inc (.getColumnCount rsmeta)))))

(defn- datasource []
  (:datasource (sql-jdbc.conn/db->pooled-connection-spec (qp.store/database))))

(defn execute-reducible-query
  "Default impl of `execute-reducible-query` for sql-jdbc drivers."
  [driver {{sql :query, params :params} :native} chans results-fn]
  (with-open [conn (connection driver (datasource))
              stmt (prepared-statement driver conn sql params chans)
              rs   (execute-query! driver stmt)]
    (let [rsmeta           (.getMetaData rs)
          results-metadata {:cols (column-metadata driver rsmeta)}
          read-row         (read-row-fn driver rs rsmeta)
          row-fn           (fn []
                             (when (.next rs)
                               (read-row)))]
      (results-fn
       results-metadata
       (qp.util.reducible/reducible-rows row-fn chans)))))
