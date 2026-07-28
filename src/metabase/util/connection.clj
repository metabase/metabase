(ns metabase.util.connection
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection DatabaseMetaData ResultSet ResultSetMetaData Statement)
   (java.util.concurrent ScheduledThreadPoolExecutor ThreadFactory TimeUnit)))

(set! *warn-on-reflection* true)

(defn- consume-rset [^ResultSet rset cb]
  (into {} (iteration
            (fn [_]
              (when (.next rset)
                (cb rset))))))

(defn app-db-column-types
  "Returns a map of all column names to their respective type names for the given `table-name` in the provided
  application-db."
  [app-db table-name']
  (let [table-name (cond-> (name table-name')
                     (= (:db-type app-db) :h2) u/upper-case-en)]
    (t2/with-connection [^Connection conn]
      (let [md (.getMetaData conn)]
        (with-open [cols (.getColumns md nil nil table-name nil)
                    pks  (.getPrimaryKeys md nil nil table-name)
                    fks  (.getImportedKeys md nil nil table-name)]
          (let [pks (consume-rset pks (fn [^ResultSet pks]
                                        [(.getString pks "COLUMN_NAME") true]))
                fks (consume-rset fks (fn [^ResultSet fks]
                                        [(.getString fks "FKCOLUMN_NAME")
                                         (str (.getString fks "PKTABLE_NAME")
                                              "."
                                              (.getString fks "PKCOLUMN_NAME"))]))]
            (consume-rset cols (fn [^ResultSet cols]
                                 (let [col (.getString cols "COLUMN_NAME")]
                                   [col {:type    (.getString cols "TYPE_NAME")
                                         :notnull (= (.getInt cols "NULLABLE")
                                                     ResultSetMetaData/columnNoNulls)
                                         :pk      (get pks col)
                                         :fk      (get fks col)
                                         :default (.getString cols "COLUMN_DEF")}])))))))))

(defn- group-rset [^ResultSet rset cb]
  (u/group-by first some? second (constantly true) conj #{}
              (iteration (fn [_]
                           (when (.next rset)
                             (or (cb rset) []))))))

(defn app-db-cascading-deletes
  "Returns a map of the downstream relations that will have deletes cascade to them, for the given table."
  [app-db table-names]
  (t2/with-connection [^Connection conn]
    (let [md (.getMetaData conn)]
      (reduce (partial merge-with set/union)
              nil
              (for [table-name' table-names]
                (let [table-name (cond-> (name table-name')
                                   (= (:db-type app-db) :h2) u/upper-case-en)]
                  (with-open [fks (.getImportedKeys md nil nil table-name)]
                    (group-rset fks (fn [^ResultSet fks]
                                      (when (= (.getInt fks "DELETE_RULE") DatabaseMetaData/importedKeyCascade)
                                        [(u/lower-case-en (.getString fks "PKTABLE_NAME"))
                                         {:child-table   (name table-name')
                                          :child-column  (u/lower-case-en (.getString fks "FKCOLUMN_NAME"))
                                          :parent-column (u/lower-case-en (.getString fks "PKCOLUMN_NAME"))}]))))))))))

;;; ------------------------------------------ statement timeouts ------------------------------------------

(defn server-rejects-query-timeout?
  "Whether calling `.setQueryTimeout` on `conn` makes the driver send SQL this server cannot parse.

  MariaDB Connector/J implements the timeout by prefixing the statement with `SET STATEMENT max_statement_time=N FOR`,
  and turns that on for any server reporting version 10.1.2 or newer.
  It never consults the MariaDB flag it already read from the handshake, so MySQL — below 10 until the
  calendar-versioned 26.x releases — now clears the check and gets syntax only MariaDB understands.

  The product name is that same flag: the driver reports `MariaDB` or `MySQL` off `isServerMariaDb()`.
  A connection carrying `useMysqlMetadata=true` makes a real MariaDB answer `MySQL`, which costs it the driver's
  timeout and leaves it on the scheduled cancel instead."
  [^Connection conn]
  (boolean
   (try
     (let [md (.getMetaData conn)]
       (and (str/includes? (str (.getDriverName md)) "MariaDB")
            (= "MySQL" (.getDatabaseProductName md))
            (>= (.getDatabaseMajorVersion md) 10)))
     (catch Throwable e
       (log/debug e "Could not read server version; assuming statement timeouts work")
       false))))

(defn set-query-timeout!
  "Bound `stmt` to `timeout-seconds` with `.setQueryTimeout`, unless that would send the server unparseable SQL.
  Returns false when the timeout could not be set, leaving it to the caller to bound the statement another way."
  [^Statement stmt timeout-seconds]
  (if (server-rejects-query-timeout? (.getConnection stmt))
    false
    (do
      (.setQueryTimeout stmt (int timeout-seconds))
      true)))

(defonce ^:private cancel-executor
  ;; one daemon thread for the whole JVM; the scheduled work is a single `Statement.cancel()`.
  ;; `setRemoveOnCancelPolicy` makes cancelled tasks leave the queue immediately instead of at their deadline.
  (delay
    (doto (ScheduledThreadPoolExecutor. 1
                                        (reify ThreadFactory
                                          (newThread [_ r]
                                            (doto (Thread. ^Runnable r "statement-timeout-scheduler")
                                              (.setDaemon true)))))
      (.setRemoveOnCancelPolicy true))))

(defn do-with-query-timeout
  "Run `f` with `stmt` bounded to `timeout-seconds`, whichever way this server supports.

  Where the driver can carry the timeout it does. Where it cannot, a scheduled `Statement.cancel()` takes over, which
  is the same `KILL QUERY` the driver's own client-side timer sends on MySQL below 26 — so every statement type is
  bounded either way, not just the read-only SELECTs a server-side timeout would cover.

  Queries running through the query processor already get this from `metabase.query-processor.setup`; this is for the
  paths that do not."
  [^Statement stmt timeout-seconds f]
  (if (set-query-timeout! stmt timeout-seconds)
    (f)
    (let [task (.schedule ^ScheduledThreadPoolExecutor @cancel-executor
                          ^Runnable (fn []
                                      (try
                                        (when-not (.isClosed stmt)
                                          (.cancel stmt))
                                        (catch Throwable e
                                          (log/debug e "Could not cancel a statement that hit its timeout"))))
                          (long timeout-seconds)
                          TimeUnit/SECONDS)]
      (try
        (f)
        (finally
          (.cancel task false))))))
