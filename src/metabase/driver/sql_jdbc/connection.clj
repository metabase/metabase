(ns metabase.driver.sql-jdbc.connection
  "Logic for creating and managing connection pools for SQL JDBC drivers. Implementations for connection-related driver
  multimethods for SQL JDBC drivers."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.connection-pool :as connection-pool]
   [metabase.db :as mdb]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models.interface :as mi]
   [metabase.models.setting :as setting]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.ssh :as ssh]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (com.mchange.v2.c3p0 DataSources)
   (javax.sql DataSource)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Interface                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti connection-details->spec
  "Given a Database `details-map`, return an unpooled JDBC connection spec. Driver authors should implement this method,
  but you probably shouldn't be *USE* this method directly! If you want a pooled connection spec (which you almost
  certainly do), use [[db->pooled-connection-spec]] instead.

  DO NOT USE THIS METHOD DIRECTLY UNLESS YOU KNOW WHAT YOU ARE DOING! THIS RETURNS AN UNPOOLED CONNECTION SPEC! IF YOU
  WANT A CONNECTION SPEC FOR RUNNING QUERIES USE [[db->pooled-connection-spec]] INSTEAD WHICH WILL RETURN A *POOLED*
  CONNECTION SPEC."
  {:added "0.32.0" :arglists '([driver details-map])}
  driver/dispatch-on-initialized-driver-safe-keys
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
  {:added "0.33.4" :arglists '([driver database])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti data-source-name
  "Name, from connection details, to use to identify a database in the c3p0 `dataSourceName`. This is used for so the
  DataSource has a useful identifier for debugging purposes.

  The default method uses the first non-nil value of the keys `:db`, `:dbname`, `:sid`, or `:catalog`; implement a new
  method if your driver does not have any of these keys in its details."
  {:changelog-test/ignore true, :arglists '([driver details]), :added "0.45.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod data-source-name :default
  [_driver details]
  ((some-fn :db
            :dbname
            :sid
            :service-name
            :catalog)
   details))

(setting/defsetting jdbc-data-warehouse-max-connection-pool-size
  "Maximum size of the c3p0 connection pool."
  :visibility :internal
  :type       :integer
  :default    15
  :audit      :getter
  :doc "Change this to a higher value if you notice that regular usage consumes all or close to all connections.

When all connections are in use then Metabase will be slower to return results for queries, since it would have to wait for an available connection before processing the next query in the queue.

For setting the maximum, see [MB_APPLICATION_DB_MAX_CONNECTION_POOL_SIZE](#mb_application_db_max_connection_pool_size).")

(setting/defsetting jdbc-data-warehouse-unreturned-connection-timeout-seconds
  "Kill connections if they are unreturned after this amount of time. In theory this should not be needed because the QP
  will kill connections that time out, but in practice it seems that connections disappear into the ether every once
  in a while; rather than exhaust the connection pool, let's be extra safe. This should be the same as the query
  timeout in [[metabase.query-processor.context/query-timeout-ms]] by default."
  :visibility :internal
  :type       :integer
  :getter     (fn []
                (or (setting/get-value-of-type :integer :jdbc-data-warehouse-unreturned-connection-timeout-seconds)
                    (long (/ qp.pipeline/*query-timeout-ms* 1000))))
  :setter     :none)

(defmethod data-warehouse-connection-pool-properties :default
  [driver database]
  { ;; only fetch one new connection at a time, rather than batching fetches (default = 3 at a time). This is done in
   ;; interest of minimizing memory consumption
   "acquireIncrement"             1
   ;; [From dox] Seconds a Connection can remain pooled but unused before being discarded.
   "maxIdleTime"                  (* 3 60 60) ; 3 hours
   "minPoolSize"                  1
   "initialPoolSize"              1
   "maxPoolSize"                  (jdbc-data-warehouse-max-connection-pool-size)
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
   ;; kill connections after this amount of time if they haven't been returned -- this should be the same as the query
   ;; timeout. This theoretically shouldn't happen since the QP should kill things after a certain timeout but it's
   ;; better to be safe than sorry -- it seems like in practice some connections disappear into the ether
   "unreturnedConnectionTimeout"  (jdbc-data-warehouse-unreturned-connection-timeout-seconds)
   ;; Set the data source name so that the c3p0 JMX bean has a useful identifier, which incorporates the DB ID, driver,
   ;; and name from the details
   "dataSourceName"               (format "db-%d-%s-%s"
                                          (u/the-id database)
                                          (name driver)
                                          (data-source-name driver (:details database)))})

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
  (log/debug (u/format-color :cyan "Creating new connection pool for %s database %s ..." driver id))
  (let [details-with-tunnel (driver/incorporate-ssh-tunnel-details  ;; If the tunnel is disabled this returned unchanged
                             driver
                             (update details :port #(or % (default-ssh-tunnel-target-port driver))))
        details-with-auth   (driver.u/fetch-and-incorporate-auth-provider-details
                             driver
                             id
                             details-with-tunnel)
        spec                (connection-details->spec driver details-with-auth)
        properties          (data-warehouse-connection-pool-properties driver database)]
    (merge
     (connection-pool-spec spec properties)
     ;; also capture entries related to ssh tunneling for later use
     (select-keys spec [:tunnel-enabled :tunnel-session :tunnel-tracker :tunnel-entrance-port :tunnel-entrance-host])
     ;; remember when the password expires
     (select-keys details-with-auth [:password-expiry-timestamp]))))

(defn- destroy-pool! [database-id pool-spec]
  (log/debug (u/format-color :red "Closing old connection pool for database %s ..." database-id))
  (connection-pool/destroy-connection-pool! pool-spec)
  (ssh/close-tunnel! pool-spec))

(defonce ^:private ^{:doc "A map of our currently open connection pools, keyed by Database `:id`."}
  database-id->connection-pool
  (atom {}))

(defonce ^:private ^{:doc "A map of DB details hash values, keyed by Database `:id`."}
  database-id->jdbc-spec-hash
  (atom {}))

(mu/defn ^:private jdbc-spec-hash
  "Computes a hash value for the JDBC connection spec based on `database`'s `:details` map, for the purpose of
  determining if details changed and therefore the existing connection pool needs to be invalidated."
  [{driver :engine, :keys [details], :as database} :- [:maybe :map]]
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

(defn- log-ssh-tunnel-reconnect-msg! [db-id]
  (log/warn (u/format-color :red "ssh tunnel for database %s looks closed; marking pool invalid to reopen it" db-id))
  nil)

(defn- log-jdbc-spec-hash-change-msg! [db-id]
  (log/warn (u/format-color :yellow "Hash of database %s details changed; marking pool invalid to reopen it" db-id))
  nil)

(defn- log-password-expiry! [db-id]
  (log/warn (u/format-color :yellow "Password of database %s expired; marking pool invalid to reopen it" db-id))
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
          db          (or (when (mi/instance-of? :model/Database db-or-id-or-spec)
                            (lib.metadata.jvm/instance->metadata db-or-id-or-spec :metadata/database))
                          (when (= (:lib/type db-or-id-or-spec) :metadata/database)
                            db-or-id-or-spec)
                          (qp.store/with-metadata-provider database-id
                            (lib.metadata/database (qp.store/metadata-provider))))
          get-fn      (fn [db-id log-invalidation?]
                        (let [details (get @database-id->connection-pool db-id ::not-found)]
                          (cond
                            ;; for the audit db, we pass the datasource for the app-db. This lets us use fewer db
                            ;; connections with *application-db* and 1 less connection pool. Note: This data-source is
                            ;; not in [[database-id->connection-pool]].
                            (:is-audit db)
                            {:datasource (mdb/data-source)}

                            (= ::not-found details)
                            nil

                            ;; details hash changed from what is cached; invalid
                            (let [curr-hash (get @database-id->jdbc-spec-hash db-id)
                                  new-hash  (jdbc-spec-hash db)]
                              (when (and (some? curr-hash) (not= curr-hash new-hash))
                                ;; the hash didn't match, but it's possible that a stale instance of `DatabaseInstance`
                                ;; was passed in (ex: from a long-running sync operation); fetch the latest one from
                                ;; our app DB, and see if it STILL doesn't match
                                (not= curr-hash (-> (t2/select-one [:model/Database :id :engine :details] :id database-id)
                                                    jdbc-spec-hash))))
                            (when log-invalidation?
                              (log-jdbc-spec-hash-change-msg! db-id))

                            (let [{:keys [password-expiry-timestamp]} details]
                              (and (int? password-expiry-timestamp)
                                   (<= password-expiry-timestamp (System/currentTimeMillis))))
                            (when log-invalidation?
                              (log-password-expiry! db-id))

                            (nil? (:tunnel-session details)) ; no tunnel in use; valid
                            details

                            (ssh/ssh-tunnel-open? details) ; tunnel in use, and open; valid
                            details

                            :else ; tunnel in use, and not open; invalid
                            (when log-invalidation?
                              (log-ssh-tunnel-reconnect-msg! db-id)))))]
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

(defn do-with-connection-spec-for-testing-connection
  "Impl for [[with-connection-spec-for-testing-connection]]."
  [driver details f]
  (let [details (update details :port #(or % (default-ssh-tunnel-target-port driver)))]
    (ssh/with-ssh-tunnel [details-with-tunnel details]
      (let [details-with-auth (driver.u/fetch-and-incorporate-auth-provider-details
                               driver
                               details-with-tunnel)
            spec (connection-details->spec driver details-with-auth)]
        (f spec)))))

(defmacro with-connection-spec-for-testing-connection
  "Execute `body` with an appropriate [[clojure.java.jdbc]] connection spec based on connection `details`. Handles SSH
  tunneling as needed and properly cleans up after itself.

    (with-connection-spec-for-testing-connection [jdbc-spec [:my-driver conn-details]]
      (do-something-with-spec jdbc-spec)"
  {:added "0.45.0", :style/indent 1}
  [[jdbc-spec-binding [driver details]] & body]
  `(do-with-connection-spec-for-testing-connection ~driver ~details (^:once fn* [~jdbc-spec-binding] ~@body)))

(defn can-connect-with-spec?
  "Can we connect to a JDBC database with [[clojure.java.jdbc]] `jdbc-spec` and run a simple query?"
  [jdbc-spec]
  (let [[first-row] (jdbc/query jdbc-spec ["SELECT 1"])
        [result]    (vals first-row)]
    (= result 1)))

(defn can-connect?
  "Default implementation of [[driver/can-connect?]] for SQL JDBC drivers. Checks whether we can perform a simple
  `SELECT 1` query."
  [driver details]
  (with-connection-spec-for-testing-connection [jdbc-spec [driver details]]
    (can-connect-with-spec? jdbc-spec)))
