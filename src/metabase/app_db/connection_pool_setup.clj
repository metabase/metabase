(ns metabase.app-db.connection-pool-setup
  "Code for creating the connection pool for the application DB and setting it as the default Toucan connection."
  (:require
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.connection-pool :as connection-pool]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [potemkin :as p])
  (:import
   (com.mchange.v2.c3p0 ConnectionCustomizer PoolBackedDataSource)))

(set! *warn-on-reflection* true)

(def ^:private latest-activity (atom nil))

(def ^:private ^java.time.Duration recent-window-duration (t/seconds 15))

(defn- recent-activity?*
  [activity duration]
  (when activity
    (t/after? activity (t/minus (t/offset-date-time) duration))))

(defn recent-activity?
  "Returns true if there has been recent activity. Define recent activity as an application db connection checked in,
  checked out, or acquired within [[recent-window-duration]]. Check-in means a query succeeded and the db connection
  is no longer needed."
  []
  (recent-activity?* @latest-activity recent-window-duration))

(defn- postgres-connection? [^java.sql.Connection connection]
  (.isWrapperFor connection org.postgresql.jdbc.PgConnection))

;;; I spun these out into separate functions so we can picc up changes to them in the REPL -- Cam

(defn- on-acquire [_connection]
  (reset! latest-activity (t/offset-date-time)))

(defn- on-check-in [^java.sql.Connection connection]
  (reset! latest-activity (t/offset-date-time))
  ;; for Postgres connections, clean up all resources used in the current session. Otherwise we'll just retain a bunch
  ;; of crap and it can eat up as much as 300MB per connection. See
  ;; https://www.postgresql.org/docs/current/sql-discard.html for more info about what this does and
  ;; https://metaboat.slack.com/archives/C05MPF0TM3L/p1748538414384029?thread_ts=1748507464.051999&cid=C05MPF0TM3L for
  ;; rationale behind why we're doing it -- Cam
  (when (postgres-connection? connection)
    (with-open [stmt (.createStatement connection)]
      (.execute stmt "DISCARD ALL;"))))

(defn- on-check-out [_connection]
  (reset! latest-activity (t/offset-date-time)))

(defn- on-destroy [_connection]
  ;; no-op
  )

(p/deftype+ MetabaseConnectionCustomizer []
  ConnectionCustomizer
  (onAcquire [_this connection _identity-token]
    (on-acquire connection))
  (onCheckIn [_this connection _identity-token]
    (on-check-in connection))
  (onCheckOut [_this connection _identity-token]
    (on-check-out connection))
  (onDestroy [_this connection _identity-token]
    (on-destroy connection)))

(defn- register-customizer!
  "c3p0 allows for hooking into lifecycles with its interface
  ConnectionCustomizer. https://www.mchange.com/projects/c3p0/apidocs/com/mchange/v2/c3p0/ConnectionCustomizer.html. But
  Clojure defined code is in memory in a dynamic class loader not available to c3p0's use of Class/forName. Luckily it
  looks up the instances in a cache which I pre-seed with out impl here. Issue for better access here:
  https://github.com/swaldman/c3p0/issues/166"
  [^Class klass]
  (let [field (doto (.getDeclaredField com.mchange.v2.c3p0.C3P0Registry "classNamesToConnectionCustomizers")
                (.setAccessible true))]
    (.put ^java.util.HashMap (.get field com.mchange.v2.c3p0.C3P0Registry)
          (.getName klass) (.newInstance klass))))

(register-customizer! MetabaseConnectionCustomizer)

(def ^:private application-db-connection-pool-props
  "Options for c3p0 connection pool for the application DB. These are set in code instead of the `c3p0.properties` file
  because we use separate options for data warehouse DBs, and setting them in the properties file would affect both.
  See https://www.mchange.com/projects/c3p0/#configuring_connection_testing for an overview of the options used
  below (jump to the 'Simple advice on Connection testing' section.)"
  {;;
   ;; If this is a number greater than 0, c3p0 will test all idle, pooled but unchecked-out connections, every this
   ;; number of seconds
   ;;
   ;; https://www.mchange.com/projects/c3p0/#idleConnectionTestPeriod
   ;;
   "idleConnectionTestPeriod"
   60
   ;;
   ;; The fully qualified class-name of an implementation of the ConnectionCustomizer interface, which users can
   ;; implement to set up Connections when they are acquired from the database, or on check-out, and potentially to
   ;; clean things up on check-in and Connection destruction. If standard Connection properties (holdability, readOnly,
   ;; or transactionIsolation) are set in the ConnectionCustomizer's onAcquire() method, these will override the
   ;; Connection default values.
   ;;
   ;; https://www.mchange.com/projects/c3p0/#connectionCustomizerClassName
   ;;
   "connectionCustomizerClassName"
   (.getName MetabaseConnectionCustomizer)
   ;;
   ;; Number of seconds that Connections in excess of minPoolSize should be permitted to remain idle in the pool before
   ;; being culled. Intended for applications that wish to aggressively minimize the number of open Connections,
   ;; shrinking the pool back towards minPoolSize if, following a spike, the load level diminishes and Connections
   ;; acquired are no longer needed. If maxIdleTime is set, maxIdleTimeExcessConnections should be smaller if the
   ;; parameter is to have any effect. Zero means no enforcement, excess Connections are not idled out
   ;;
   ;; https://www.mchange.com/projects/c3p0/#maxIdleTimeExcessConnections
   ;;
   ;; We are setting this because keeping connections open forever eats up a lot of memory -- see
   ;; https://metaboat.slack.com/archives/C05MPF0TM3L/p1748538357522569?thread_ts=1748507464.051999&cid=C05MPF0TM3L
   ;;
   "maxIdleTimeExcessConnections"
   (* 10 60) ; 10 minutes
   ;;
   ;; Seconds, effectively a time to live. A Connection older than maxConnectionAge will be destroyed and purged from
   ;; the pool. This differs from maxIdleTime in that it refers to absolute age. Even a Connection which has not been
   ;; much idle will be purged from the pool if it exceeds maxConnectionAge. Zero means no maximum absolute age is
   ;; enforced.
   ;;
   ;; https://www.mchange.com/projects/c3p0/#maxConnectionAge
   ;;
   "maxConnectionAge"
   (* 60 60) ; one hour
   ;;
   ;; Maximum number of Connections a pool will maintain at any given time.
   ;;
   ;; https://www.mchange.com/projects/c3p0/#maxPoolSize
   ;;
   "maxPoolSize"
   (or (config/config-int :mb-application-db-max-connection-pool-size)
       ;; 15 is the c3p0 default but it's always nice to be explicit in case that changes
       15)

   "unreturnedConnectionTimeout"
   (or (config/config-int :mb-application-db-unreturned-connection-timeout)
       ;; we set an unreturnedConnectionTimeout for data warehouses, via
       ;; `(driver.settings/jdbc-data-warehouse-unreturned-connection-timeout-seconds)`, which defaults to the same
       ;; 5 minute value as the query timeout. But for the application DB this is not nearly so safe, as we don't
       ;; have a fixed maximum possible time a query could take, and e.g. `copy-to-h2` can easily take more than this.
       ;;
       ;; Let's default to 1 hour. Note that as discussed at
       ;; https://www.mchange.com/projects/c3p0/#unreturnedConnectionTimeout
       ;; this is a *backstop*; as it says there, "it's better to be neurotic about closing your Connections in
       ;; the first place."
       3600)})

(mu/defn connection-pool-data-source :- (ms/InstanceOfClass PoolBackedDataSource)
  "Create a connection pool [[javax.sql.DataSource]] from an unpooled [[javax.sql.DataSource]] `data-source`. If
  `data-source` is already pooled, this will return `data-source` as-is."
  ^PoolBackedDataSource [db-type :- :keyword
                         ^PoolBackedDataSource data-source :- (ms/InstanceOfClass javax.sql.DataSource)]
  (if (instance? PoolBackedDataSource data-source)
    data-source
    (let [ds-name    (format "metabase-%s-app-db" (name db-type))
          pool-props (assoc application-db-connection-pool-props "dataSourceName" ds-name)]
      (com.mchange.v2.c3p0.DataSources/pooledDataSource
       data-source
       (connection-pool/map->properties pool-props)))))
