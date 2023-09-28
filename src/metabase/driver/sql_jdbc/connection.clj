(ns metabase.driver.sql-jdbc.connection
  "Logic for creating and managing connection pools for SQL JDBC drivers. Implementations for connection-related driver
  multimethods for SQL JDBC drivers."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.config :as config]
   [metabase.connection-pool :as connection-pool]
   [metabase.db.connection :as mdb.connection]
   [metabase.driver :as driver]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.database :refer [Database]]
   [metabase.models.interface :as mi]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.ssh :as ssh]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (com.mchange.v2.c3p0 DataSources PooledDataSource)
   (javax.sql DataSource)))

(set! *warn-on-reflection* true)

(def ^:private DatabaseWithRequiredKeys
  [:map
   [:id      ::lib.schema.id/database]
   [:engine  :keyword]
   [:details :map]])

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
  {:arglists '([driver details-map])}
  driver/dispatch-on-initialized-driver-safe-keys
  :hierarchy #'driver/hierarchy)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Creating Connection Pools                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti data-warehouse-connection-pool-properties
  "c3p0 connection pool properties for connected data warehouse DBs, as a Clojure map. See
  https://www.mchange.com/projects/c3p0/#configuration_properties for descriptions of properties.

  The c3p0 dox linked above do a good job of explaining the purpose of these properties and why you might set them.
  Generally, I have tried to choose configuration options for the data warehouse connection pools that minimize memory
  usage and maximize reliability, even when it comes with some added performance overhead. These pools are used for
  powering Cards and the sync process, which are less sensitive to overhead than something like the application DB.

  Drivers that need to override the default properties below can provide custom implementations of this method."
  {:arglists '([driver database])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti data-source-name
  "Name, from connection details, to use to identify a database in the c3p0 `dataSourceName`. This is used for so the
  DataSource has a useful identifier for debugging purposes.

  The default method uses the first non-nil value of the keys `:db`, `:dbname`, `:sid`, or `:catalog`; implement a new
  method if your driver does not have any of these keys in its details."
  {:arglists '([driver details]), :added "0.45.0"}
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
   ;; and name from the details
   "dataSourceName"               (format "db-%d-%s-%s"
                                          (u/the-id database)
                                          (name driver)
                                          (data-source-name driver (:details database)))})

(defn- spec->unpooled-data-source
  "Create an unpooled DataSource from a [[clojure.java.jdbc]] spec. The connection pool uses this to acquire new
  Connections."
  ^DataSource [{:keys [datasource], :as spec}]
  (if datasource
    datasource
    (#'connection-pool/unpooled-data-source spec)))

(defn ^:private default-ssh-tunnel-target-port  [driver]
  (when-let [port-info (some
                        #(when (= "port" (:name %)) %)
                        (driver/connection-properties driver))]
    (or (:default port-info)
        (:placeholder port-info))))

;;; When DB details change, we don't want to completely destroy a Connection pool and kill all open Connections,
;;; otherwise it makes it really hard to parallelize tests especially for Snowflake which has to include `WEEK_START` as
;;; a connection property. We just want to:
;;;
;;; 1. kill open Connections when they're checked back in
;;; 2. fetch new Connections with the updated details going forward.
;;; 3. Kill any open SSH tunnel sessions and reset details like `:tunnel-session` and `:tunnel-tracker`
;;;
;;; c3p0 "soft reset" covers number 1.
;;;
;;; For number 2 we need to have some way to swap out the underlying unpooled DataSource that c3p0 uses to fetch new
;;; connections. We'll do this by storing the unpooled DataSource in an atom under the `::unpooled-data-source` key
;;; inside the final pooled spec, so we can swap it out as needed. [[->AtomBackedDataSource]] will handle unwrapping the
;;; atom.
;;;
;;; The final pooled spec will look like
;;;
;;;    (let [atomm (atom unpooled-data-source)]
;;;      {:datasource            <PooledDataSource => AtomBackedDataSource => atomm>
;;;       ::unpooled-data-source atomm
;;;       ;; ... SSH tunnel properties
;;;      })
;;;
;;; For number 2 and 3 to get the new unpooled datasource and new SSH tunnel properties we can just recalculate the SSH
;;; tunnel spec properties by calling [[database->unpooled-data-source-and-ssh-tunnel-spec]].
;;;
;;; See [[create-pool!]] which creates the spec and connection pool the first time around
;;; and [[soft-reset-connection-pool!]] which resets the `::unpooled-data-source` and SSH tunnel properties

(mu/defn ^:private database->unpooled-data-source-and-ssh-tunnel-spec :- [:map
                                                                          [:unpooled-data-source (ms/InstanceOfClass DataSource)]
                                                                          [:ssh-tunnel-spec      [:maybe :map]]]
  ^DataSource [{:keys [details], driver :engine, :as _database} :- DatabaseWithRequiredKeys]
  (let [details-with-tunnel (driver/incorporate-ssh-tunnel-details ;; If the tunnel is disabled this returned unchanged
                             driver
                             (update details :port #(or % (default-ssh-tunnel-target-port driver))))
        spec                (connection-details->spec driver details-with-tunnel)]
    {:unpooled-data-source (spec->unpooled-data-source spec)
     ;; also capture entries related to ssh tunneling for later use
     :ssh-tunnel-spec      (select-keys spec [:tunnel-enabled
                                              :tunnel-session
                                              :tunnel-tracker
                                              :tunnel-entrance-port
                                              :tunnel-entrance-host])}))

(deftype ^:private AtomBackedDataSource [atomm]
  DataSource
  (getConnection [_this]
    (assert (instance? clojure.lang.Atom atomm))
    (let [^DataSource data-source @atomm]
      (assert (instance? DataSource data-source))
      (.getConnection data-source))))

(def ^:private PooledSpecWithUnpooledDataSourceAtom
  [:map
   [::unpooled-data-source (ms/InstanceOfClass clojure.lang.Atom)]
   [:datasource            (ms/InstanceOfClass PooledDataSource)]])

(mu/defn ^:private create-pool! :- PooledSpecWithUnpooledDataSourceAtom
  "Create a new C3P0 `ComboPooledDataSource` for connecting to the given `database`."
  [{driver :engine, :as database} :- DatabaseWithRequiredKeys]
  (log/infof "Creating new connection pool for %s Database %d %s"
             (:engine database)
             (:id database)
             (pr-str (:name database)))
  (let [{:keys [unpooled-data-source ssh-tunnel-spec]} (database->unpooled-data-source-and-ssh-tunnel-spec database)
        _                                              (assert (instance? DataSource unpooled-data-source))
        pool-properties                                (connection-pool/map->properties
                                                        (data-warehouse-connection-pool-properties driver database))
        atomm                                          (atom unpooled-data-source)
        pooled-data-source                             (DataSources/pooledDataSource ^DataSource (->AtomBackedDataSource atomm)
                                                                                     pool-properties)]
    (merge
     {::unpooled-data-source atomm
      :datasource            pooled-data-source}
     ssh-tunnel-spec)))

(defonce ^:private ^{:doc "A map of

    database-id -> {:spec <connection-pool-spec>, :hash <jdbc-spec-hash>}

  for our currently open connection pools.

  * `:spec` is a [[clojure.java.jdbc]] spec map with a `:datasource` (a c3p0 [[PooledDataSource]])

  * `:hash` is a hash of the [[clojure.java.jdbc]] spec used to create the connection pool, derived from the Database
    `:details` by calling [[connection-details->spec]] and [[jdbc-spec-hash]]."}
  database-id->connection-pool-spec-and-hash
  (atom {}))

(mu/defn ^:private jdbc-spec-hash :- :int
  "Computes a hash value for the JDBC connection spec based on `database`'s `:details` map, for the purpose of
  determining if details changed and therefore the existing connection pool needs to be invalidated."
  [{driver :engine, :keys [details], :as database} :- [:maybe DatabaseWithRequiredKeys]]
  (when (some? database)
    (hash (connection-details->spec driver details))))

(mu/defn ^:private pool-spec-for-database :- [:maybe PooledSpecWithUnpooledDataSourceAtom]
  [database :- DatabaseWithRequiredKeys]
  (get-in @database-id->connection-pool-spec-and-hash [(u/the-id database) :spec]))

(mu/defn ^:private pool-spec->pooled-data-source :- [:maybe (ms/InstanceOfClass PooledDataSource)]
  ^PooledDataSource [pool-spec :- [:maybe :map]]
  (when-let [data-source (:datasource pool-spec)]
    (when (instance? PooledDataSource data-source)
      data-source)))

(mu/defn ^:private soft-reset-connection-pool! :- [:maybe PooledSpecWithUnpooledDataSourceAtom]
  "'Soft reset' a Connection pool: discard all open Connections and acquire new ones. Connections currently in use will
  remain valid until they are checked back in, at which point they will be discarded. See
  https://www.mchange.com/projects/c3p0/apidocs/com/mchange/v2/c3p0/PooledDataSource.html#softResetAllUsers--

  Updates the saved `:hash` associated with the Connection pool.

  Returns updated spec."
  [database :- DatabaseWithRequiredKeys]
  (log/infof "Soft resetting connection pool for %s Database %d %s and closing SSH tunnels"
             (:engine database)
             (:id database)
             (pr-str (:name database)))
  ;; See explanation above [[database->unpooled-data-source-and-ssh-tunnel-spec]] for what is going on here
  (when-let [pool-spec (pool-spec-for-database database)]
    (when-let [pooled-data-source (pool-spec->pooled-data-source pool-spec)]
      (.softResetAllUsers pooled-data-source))
    ;; close existing SSH tunnel if one exists
    (ssh/close-tunnel! pool-spec)
    ;; create a new unpooled DataSource from the presumably updated Database details, and create a new SSH tunnel
    (let [{:keys [unpooled-data-source ssh-tunnel-spec]} (database->unpooled-data-source-and-ssh-tunnel-spec database)
          _                                              (assert (instance? DataSource unpooled-data-source))
          ;; update the keys related to the SSH tunnel in the pooled spec
          new-spec                                       (merge (select-keys pool-spec [:datasource ::unpooled-data-source])
                                                                ssh-tunnel-spec)]
      ;; swap out the old unpooled DataSource used to get new Connections with the new one that uses the updated
      ;; details.
      (reset! (::unpooled-data-source pool-spec) unpooled-data-source)
      ;; now update the cached pooled spec and unpooled spec hash.
      (swap! database-id->connection-pool-spec-and-hash
             assoc
             (u/the-id database)
             {:spec new-spec
              :hash (jdbc-spec-hash database)})
      new-spec)))

(mu/defn ^:private destroy-connection-pool! :- :nil
  [database :- DatabaseWithRequiredKeys]
  (log/infof "Destroying connection pool for %s Database %d %s and closing SSH tunnels"
             (:engine database)
             (:id database)
             (pr-str (:name database)))
  (when-let [pool-spec (pool-spec->pooled-data-source database)]
    (when-let [pooled-data-source (pool-spec->pooled-data-source pool-spec)]
      (DataSources/destroy pooled-data-source))
    (ssh/close-tunnel! pool-spec))
  (swap! database-id->connection-pool-spec-and-hash dissoc (u/the-id database))
  nil)

(mu/defn notify-database-updated! :- :nil
  "Default implementation of [[driver/notify-database-updated]] for JDBC SQL drivers. We are being informed that a
  `database` has been updated, so lets soft reset the connection pool (if it exists) under the assumption that the
  connection details have changed."
  [database :- DatabaseWithRequiredKeys]
  (soft-reset-connection-pool! database))

(mu/defn notify-database-deleted! :- :nil
  "Default implementation of [[driver/notify-database-deleted!]] for JDBC-based drivers."
  [database :- DatabaseWithRequiredKeys]
  (destroy-connection-pool! database))

(mu/defn ^:private log-ssh-tunnel-reconnect-msg! :- :nil
  [db-id :- ::lib.schema.id/database]
  (log/warnf "SSH tunnel for Database %d looks closed; soft resetting connection pool" db-id)
  nil)

(mu/defn ^:private log-jdbc-spec-hash-change-msg! :- :nil
  [db-id :- ::lib.schema.id/database]
  (log/warnf "Hash of Database %d details changed; soft resetting connection pool" db-id)
  nil)

(mu/defn ^:private the-db :- DatabaseWithRequiredKeys
  [db-or-id :- [:or
                [:map [:id ::lib.schema.id/database]]
                ::lib.schema.id/database]]
  (or (when (mi/instance-of? Database db-or-id)
        (lib.metadata.jvm/instance->metadata db-or-id :metadata/database))
      (when (= (:lib/type db-or-id) :metadata/database)
        db-or-id)
      (qp.store/with-metadata-provider (u/the-id db-or-id)
        (lib.metadata/database (qp.store/metadata-provider)))))

(def ^:private PooledSpec
  [:maybe
   [:map
    [:datasource (ms/InstanceOfClass DataSource)]
    [::unpooled-data-source {:optional true} (ms/InstanceOfClass clojure.lang.Atom)]]])

(mu/defn ^:private existing-pool-spec :- PooledSpec
  [db {:keys [log-invalidation?]}]
  (let [database-id                            (u/the-id db)
        {existing-spec :spec, curr-hash :hash} (get @database-id->connection-pool-spec-and-hash database-id ::not-found)]
    (cond
      ;; for the audit db, we pass the datasource for the app-db. This lets us use fewer db
      ;; connections with *application-db* and 1 less connection pool. Note: This data-source is
      ;; not in [[database-id->connection-pool-spec]].
      (:is-audit db)
      {:datasource (mdb.connection/data-source)}

      (= existing-spec ::not-found)
      nil

      ;; details hash changed from what is cached; invalid
      (let [new-hash (jdbc-spec-hash db)]
        (when (and (some? curr-hash) (not= curr-hash new-hash))
          ;; the hash didn't match, but it's possible that a stale instance of `DatabaseInstance`
          ;; was passed in (ex: from a long-running sync operation); fetch the latest one from
          ;; our app DB, and see if it STILL doesn't match
          (not= curr-hash (-> (t2/select-one [Database :id :engine :details] :id database-id)
                              jdbc-spec-hash))))
      (do
        (when log-invalidation?
          (log-jdbc-spec-hash-change-msg! database-id))
        (soft-reset-connection-pool! db))

      ;; no tunnel in use; valid
      (nil? (:tunnel-session existing-spec))
      existing-spec

      ;; tunnel in use, and open; valid
      (ssh/ssh-tunnel-open? existing-spec)
      existing-spec

      ;; tunnel in use, and not open; invalid
      :else
      (when log-invalidation?
        (log-ssh-tunnel-reconnect-msg! database-id)
        (soft-reset-connection-pool! db)))))

(mu/defn ^:private get-or-create-connection-pool-for-database! :- PooledSpec
  [db-or-id :- [:or
                [:map [:id ::lib.schema.id/database]]
                ::lib.schema.id/database]]
  (let [database-id (u/the-id db-or-id)
        ;; we need the Database instance no matter what (in order to compare details hash with cached value)
        db          (the-db db-or-id)]
    (or
     ;; we have an existing pool for this database, so use it
     (existing-pool-spec db {:log-invalidation? true})
     ;; Do the usual locking here and make sure only one thread will be creating a pool at a given instant.
     (locking database-id->connection-pool-spec-and-hash
       (or
        ;; check if another thread created the pool while we were waiting to acquire the lock
        (existing-pool-spec db {:log-invalidation? false})
        ;; create a new pool and add it to our cache, then return it
        (u/prog1 (create-pool! db)
          (swap! database-id->connection-pool-spec-and-hash assoc database-id {:spec <>
                                                                               :hash (jdbc-spec-hash db)})))))))

(mu/defn db->pooled-connection-spec :- PooledSpec
  "Return a JDBC connection spec that includes a cp30 `ComboPooledDataSource`. These connection pools are cached so we
  don't create multiple ones for the same DB."
  [db-or-id-or-spec]
  (cond
    ;; db-or-id-or-spec is a Database instance or an integer ID
    (u/id db-or-id-or-spec)
    (get-or-create-connection-pool-for-database! db-or-id-or-spec)

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
      (let [spec (connection-details->spec driver details-with-tunnel)]
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
