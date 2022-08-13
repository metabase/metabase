(ns metabase.driver.sql-jdbc.connection
  "Logic for creating and managing connection pools for SQL JDBC drivers. Implementations for connection-related driver
  multimethods for SQL JDBC drivers."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [metabase.config :as config]
            [metabase.connection-pool :as connection-pool]
            [metabase.driver :as driver]
            [metabase.models.database :refer [Database]]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]
            [metabase.util.ssh :as ssh]
            [toucan.db :as db])
  (:import com.mchange.v2.c3p0.DataSources
           javax.sql.DataSource))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Interface                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti connection-details->spec
  "Given a Database `details-map`, return an unpooled JDBC connection spec. Driver authors should implement this method,
  but you probably shouldn't be *USE* this method directly! If you want a pooled connection spec (which you almost
  certainly do), use [[db->pooled-connection-spec]] instead."
  {:arglists '([driver details-map])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Creating Connection Pools                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti data-warehouse-connection-pool-properties
  "c3p0 connection pool properties for connected data warehouse DBs. See
  https://www.mchange.com/projects/c3p0/#configuration_properties for descriptions of properties.

  The c3p0 dox linked above do a good job of explaining the purpose of these properties and why you might set them.
  Generally, I have tried to choose configuration options for the data warehouse connection pools that minimize memory
  usage and maximize reliability, even when it comes with some added performance overhead. These pools are used for
  powering Cards and the sync process, which are less sensitive to overhead than something like the application DB.

  Drivers that need to override the default properties below can provide custom implementations of this method."
  {:arglists '([driver database])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod data-warehouse-connection-pool-properties :default
  [driver database]
  { ;; only fetch one new connection at a time, rather than batching fetches (default = 3 at a time). This is done in
   ;; interest of minimizing memory consumption
   "acquireIncrement"             1
   ;; [From dox] Seconds a Connection can remain pooled but unused before being discarded.
   "maxIdleTime"                  (* 3 60 60) ; 3 hours
   "minPoolSize"                  1
   "initialPoolSize"              1
   "maxPoolSize"                  (or (config/config-int :mb-jdbc-data-warehouse-max-connection-pool-size)
                                      15)
   ;; [From dox] If true, an operation will be performed at every connection checkout to verify that the connection is
   ;; valid. [...] ;; Testing Connections in checkout is the simplest and most reliable form of Connection testing,
   ;; but for better performance, consider verifying connections periodically using `idleConnectionTestPeriod`. [...]
   ;; If clients usually make complex queries and/or perform multiple operations, adding the extra cost of one fast
   ;; test per checkout will not much affect performance.
   ;;
   ;; As noted in the C3P0 dox, this does add some overhead, but since all of our drivers are JDBC 4 drivers, they can
   ;; call `Connection.isValid()`, which is reasonably efficient. In my profiling enabling this adds ~100µs for
   ;; Postgres databases on the same machince and ~70ms for remote databases on AWS east testing against a local
   ;; server on the West Coast.
   ;;
   ;; This suggests the additional cost of this test is more or less based entirely to the network latency of the
   ;; request. IRL the Metabase server and data warehouse are likely to be located in closer geographical proximity to
   ;; one another than my trans-contintental tests. Thus in the majority of cases the overhead should be next to
   ;; nothing, and in the worst case close to imperceptible.
   "testConnectionOnCheckout"     true
   ;; [From dox] Number of seconds that Connections in excess of minPoolSize should be permitted to remain idle in the
   ;; pool before being culled. Intended for applications that wish to aggressively minimize the number of open
   ;; Connections, shrinking the pool back towards minPoolSize if, following a spike, the load level diminishes and
   ;; Connections acquired are no longer needed. If maxIdleTime is set, maxIdleTimeExcessConnections should be smaller
   ;; if the parameter is to have any effect.
   ;;
   ;; Kill idle connections above the minPoolSize after 5 minutes.
   "maxIdleTimeExcessConnections" (* 5 60)
   ;; Set the data source name so that the c3p0 JMX bean has a useful identifier, which incorporates the DB ID, driver,
   ;; and name; to find a "name" in the details, just look for the first key that is set and could make sense, rather
   ;; than introducing a new driver level multimethod just for this
   "dataSourceName"               (format "db-%d-%s-%s" (u/the-id database) (name driver) (->> database
                                                                                               :details
                                                                                               ((some-fn :db
                                                                                                         :dbname
                                                                                                         :sid
                                                                                                         :catalog))))})

(defn- connection-pool-spec
  "Like [[connection-pool/connection-pool-spec]] but also handles situations when the unpooled spec is a `:datasource`."
  [{:keys [^DataSource datasource], :as spec} pool-properties]
  (if datasource
    {:datasource (DataSources/pooledDataSource datasource (connection-pool/map->properties pool-properties))}
    (connection-pool/connection-pool-spec spec pool-properties)))

(defn ^:private default-ssh-tunnel-target-port  [driver]
  (when-let [port-info (some
                        #(when (= "port" (:name %)) %)
                        (driver/connection-properties driver))]
    (or (:default port-info)
        (:placeholder port-info))))

(defn- create-pool!
  "Create a new C3P0 `ComboPooledDataSource` for connecting to the given `database`."
  [{:keys [id details], driver :engine, :as database}]
  {:pre [(map? database)]}
  (log/debug (u/format-color 'cyan (trs "Creating new connection pool for {0} database {1} ..." driver id)))
  (let [details-with-tunnel (driver/incorporate-ssh-tunnel-details  ;; If the tunnel is disabled this returned unchanged
                             driver
                             (update details :port #(or % (default-ssh-tunnel-target-port driver))))
        spec                (connection-details->spec driver details-with-tunnel)
        properties          (data-warehouse-connection-pool-properties driver database)]
    (merge
      (connection-pool-spec spec properties)
      ;; also capture entries related to ssh tunneling for later use
      (select-keys spec [:tunnel-enabled :tunnel-session :tunnel-tracker :tunnel-entrance-port :tunnel-entrance-host]))))

(defn- destroy-pool! [database-id pool-spec]
  (log/debug (u/format-color 'red (trs "Closing old connection pool for database {0} ..." database-id)))
  (connection-pool/destroy-connection-pool! pool-spec)
  (ssh/close-tunnel! pool-spec))

(defonce ^:private ^{:doc "A map of our currently open connection pools, keyed by Database `:id`."}
  database-id->connection-pool
  (atom {}))

(defonce ^:private ^{:doc "A map of DB details hash values, keyed by Database `:id`."}
  database-id->jdbc-spec-hash
  (atom {}))

(defn- jdbc-spec-hash
  "Computes a hash value for the JDBC connection spec based on `database`'s `:details` map, for the purpose of
  determining if details changed and therefore the existing connection pool needs to be invalidated."
  [{driver :engine, :keys [details], :as database}]
  {:pre [(or nil? (instance? (type Database) database))]}
  (when (some? database)
    (hash (connection-details->spec driver details))))

(defn- set-pool!
  "Atomically update the current connection pool for Database `database` with `database-id`. Use this function instead
  of modifying database-id->connection-pool` directly because it properly closes down old pools in a thread-safe way,
  ensuring no more than one pool is ever open for a single database. Also modifies the [[database-id->jdbc-spec-hash]]
  map with the hash value of the given DB's details map."
  [database-id pool-spec-or-nil database]
  {:pre [(integer? database-id)]}
  (let [[old-id->pool] (if pool-spec-or-nil
                         (swap-vals! database-id->connection-pool assoc database-id pool-spec-or-nil)
                         (swap-vals! database-id->connection-pool dissoc database-id))]
    ;; if we replaced a different pool with the new pool that is different from the old one, destroy the old pool
    (when-let [old-pool-spec (get old-id->pool database-id)]
      (when-not (identical? old-pool-spec pool-spec-or-nil)
        (destroy-pool! database-id old-pool-spec))))
  ;; update the db details hash cache with the new hash value
  (swap! database-id->jdbc-spec-hash assoc database-id (jdbc-spec-hash database))
  nil)

(defn invalidate-pool-for-db!
  "Invalidates the connection pool for the given database by closing it and removing it from the cache."
  [database]
  (set-pool! (u/the-id database) nil nil))

(defn notify-database-updated
  "Default implementation of [[driver/notify-database-updated]] for JDBC SQL drivers. We are being informed that a
  `database` has been updated, so lets shut down the connection pool (if it exists) under the assumption that the
  connection details have changed."
  [database]
  (invalidate-pool-for-db! database))

(defn- log-ssh-tunnel-reconnect-msg! [db-id]
  (log/warn (u/format-color 'red (trs "ssh tunnel for database {0} looks closed; marking pool invalid to reopen it"
                                      db-id)))
  nil)

(defn- log-jdbc-spec-hash-change-msg! [db-id]
  (log/warn (u/format-color 'yellow (trs "Hash of database {0} details changed; marking pool invalid to reopen it"
                                          db-id)))
  nil)

(defn db->pooled-connection-spec
  "Return a JDBC connection spec that includes a cp30 `ComboPooledDataSource`. These connection pools are cached so we
  don't create multiple ones for the same DB."
  [db-or-id-or-spec]
  (cond
    ;; db-or-id-or-spec is a Database instance or an integer ID
    (u/id db-or-id-or-spec)
    (let [database-id (u/the-id db-or-id-or-spec)
          ;; we need the Database instance no matter what (in order to compare details hash with cached value)
          db          (or (and (instance? (type Database) db-or-id-or-spec) db-or-id-or-spec) ; passed in
                          (db/select-one [Database :id :engine :details] :id database-id)     ; look up by ID
                          (throw (ex-info (tru "Database {0} does not exist." database-id)
                                   {:status-code 404
                                    :type        qp.error-type/invalid-query
                                    :database-id database-id})))
          get-fn      (fn [db-id log-invalidation?]
                        (when-let [details (get @database-id->connection-pool db-id)]
                          (cond
                            ;; details hash changed from what is cached; invalid
                            (let [curr-hash (get @database-id->jdbc-spec-hash db-id)
                                  new-hash  (jdbc-spec-hash db)]
                              (when (and (some? curr-hash) (not= curr-hash new-hash))
                                ;; the hash didn't match, but it's possible that a stale instance of `DatabaseInstance`
                                ;; was passed in (ex: from a long-running sync operation); fetch the latest one from
                                ;; our app DB, and see if it STILL doesn't match
                                (not= curr-hash (-> (db/select-one [Database :id :engine :details] :id database-id)
                                                    jdbc-spec-hash))))
                            (if log-invalidation?
                              (log-jdbc-spec-hash-change-msg! db-id)
                              nil)

                            (nil? (:tunnel-session details)) ; no tunnel in use; valid
                            details

                            (ssh/ssh-tunnel-open? details) ; tunnel in use, and open; valid
                            details

                            :else ; tunnel in use, and not open; invalid
                            (if log-invalidation?
                              (log-ssh-tunnel-reconnect-msg! db-id)
                              nil))))]
      (or
       ;; we have an existing pool for this database, so use it
       (get-fn database-id true)
       ;; Even tho `set-pool!` will properly shut down old pools if two threads call this method at the same time, we
       ;; don't want to end up with a bunch of simultaneous threads creating pools only to have them destroyed the
       ;; very next instant. This will cause their queries to fail. Thus we should do the usual locking here and make
       ;; sure only one thread will be creating a pool at a given instant.
       (locking database-id->connection-pool
         (or
          ;; check if another thread created the pool while we were waiting to acquire the lock
          (get-fn database-id false)
          ;; create a new pool and add it to our cache, then return it
          (u/prog1 (create-pool! db)
            (set-pool! database-id <> db))))))

    ;; already a `clojure.java.jdbc` spec map
    (map? db-or-id-or-spec)
    db-or-id-or-spec

    ;; invalid. Throw Exception
    :else
    (throw (ex-info (tru "Not a valid Database/Database ID/JDBC spec")
                    ;; don't log the actual spec lest we accidentally expose credentials
                    {:input (class db-or-id-or-spec)}))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn details->connection-spec-for-testing-connection
  "Return an appropriate JDBC connection spec to test whether a set of connection details is valid (i.e., implementing
  `can-connect?`)."
  [driver details]
  (let [details-with-tunnel (driver/incorporate-ssh-tunnel-details
                             driver
                             (update details :port #(or % (default-ssh-tunnel-target-port driver))))]
    (connection-details->spec driver details-with-tunnel)))

(defn can-connect-with-spec?
  "Can we connect to a JDBC database with `clojure.java.jdbc` `jdbc-spec` and run a simple query?"
  [jdbc-spec]
  (let [[first-row] (jdbc/query jdbc-spec ["SELECT 1"])
        [result]    (vals first-row)]
    (= 1 result)))

(defn can-connect?
  "Default implementation of `driver/can-connect?` for SQL JDBC drivers. Checks whether we can perform a simple `SELECT
  1` query."
  [driver details]
  (can-connect-with-spec? (details->connection-spec-for-testing-connection driver details)))
