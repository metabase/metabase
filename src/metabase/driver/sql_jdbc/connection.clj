(ns metabase.driver.sql-jdbc.connection
  "Logic for creating and managing connection pools for SQL JDBC drivers. Implementations for connection-related driver
  multimethods for SQL JDBC drivers."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [connection-pool :as connection-pool]
             [driver :as driver]
             [util :as u]]
            [metabase.models.database :refer [Database]]
            [metabase.util
             [i18n :refer [trs]]
             [ssh :as ssh]]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Interface                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti connection-details->spec
  "Given a Database `details-map`, return a JDBC connection spec."
  {:arglists '([driver details-map]), :style/indent 1}
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
  {:arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod data-warehouse-connection-pool-properties :default
  [_]
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
   ;; Kill idle connections above the minPoolSize after 15 minutes.
   "maxIdleTimeExcessConnections" (* 15 60)})

(defn- create-pool!
  "Create a new C3P0 `ComboPooledDataSource` for connecting to the given `database`."
  [{:keys [id details], driver :engine, :as database}]
  {:pre [(map? database)]}
  (log/debug (u/format-color 'cyan (trs "Creating new connection pool for {0} database {1} ..." driver id)))
  (let [details-with-tunnel (ssh/include-ssh-tunnel details) ;; If the tunnel is disabled this returned unchanged
        spec                (connection-details->spec driver details-with-tunnel)
        properties          (data-warehouse-connection-pool-properties driver)]
    (connection-pool/connection-pool-spec spec properties)))

(defn- destroy-pool! [database-id pool-spec]
  (log/debug (u/format-color 'red (trs "Closing old connection pool for database {0} ..." database-id)))
  (connection-pool/destroy-connection-pool! pool-spec)
  (ssh/close-tunnel! pool-spec))

(defonce ^:private ^{:doc "A map of our currently open connection pools, keyed by Database `:id`."}
  database-id->connection-pool
  (atom {}))

(defn- set-pool!
  "Atomically update the current connection pool for Database with `database-id`. Use this function instead of modifying
  `database-id->connection-pool` directly because it properly closes down old pools in a thread-safe way, ensuring no
  more than one pool is ever open for a single database."
  [database-id pool-spec-or-nil]
  {:pre [(integer? database-id)]}
  (let [[old-id->pool] (swap-vals! database-id->connection-pool assoc database-id pool-spec-or-nil)]
    ;; if we replaced a different pool with the new pool that is different from the old one, destroy the old pool
    (when-let [old-pool-spec (get old-id->pool database-id)]
      (when-not (identical? old-pool-spec pool-spec-or-nil)
        (destroy-pool! database-id old-pool-spec))))
  nil)

(defn notify-database-updated
  "Default implementation of `driver/notify-database-updated` for JDBC SQL drivers. We are being informed that a
  `database` has been updated, so lets shut down the connection pool (if it exists) under the assumption that the
  connection details have changed."
  [database]
  (set-pool! (u/get-id database) nil))

(defn db->pooled-connection-spec
  "Return a JDBC connection spec that includes a cp30 `ComboPooledDataSource`. These connection pools are cached so we
  don't create multiple ones for the same DB."
  [database-or-id]
  (let [database-id (u/get-id database-or-id)]
    (or
     ;; we have an existing pool for this database, so use it
     (get @database-id->connection-pool database-id)
     ;; Even tho `set-pool!` will properly shut down old pools if two threads call this method at the same time, we
     ;; don't want to end up with a bunch of simultaneous threads creating pools only to have them destroyed the very
     ;; next instant. This will cause their queries to fail. Thus we should do the usual locking here and make sure only
     ;; one thread will be creating a pool at a given instant.
     (locking database-id->connection-pool
       (or
        ;; check if another thread created the pool while we were waiting to acquire the lock
        (get @database-id->connection-pool database-id)
        ;; create a new pool and add it to our cache, then return it
        (let [db (db/select-one [Database :id :engine :details] :id database-id)]
          (u/prog1 (create-pool! db)
            (set-pool! database-id <>))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn details->connection-spec-for-testing-connection
  "Return an appropriate JDBC connection spec to test whether a set of connection details is valid (i.e., implementing
  `can-connect?`)."
  [driver details]
  (let [details-with-tunnel (ssh/include-ssh-tunnel details)]
    (connection-details->spec driver details-with-tunnel)))

(defn can-connect?
  "Default implementation of `driver/can-connect?` for SQL JDBC drivers. Checks whether we can perform a simple `SELECT
  1` query."
  [driver details]
  (let [spec        (details->connection-spec-for-testing-connection driver details)
        [first-row] (jdbc/query spec ["SELECT 1"])
        [result]    (vals first-row)]
    (= 1 result)))
