(ns metabase.db.connection-pool-setup
  "Code for creating the connection pool for the application DB and setting it as the default Toucan connection."
  (:require
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.connection-pool :as connection-pool]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
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

(defrecord DbActivityTracker []
  ConnectionCustomizer
  (onAcquire [_ _connection _identity-token]
    (reset! latest-activity (t/offset-date-time)))
  (onCheckIn [_ _connection _identity-token]
    (reset! latest-activity (t/offset-date-time)))
  (onCheckOut [_ _connection _identity-token]
    (reset! latest-activity (t/offset-date-time)))
  (onDestroy [_ _connection _identity-token]))

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

(register-customizer! DbActivityTracker)

(def ^:private application-db-connection-pool-props
  "Options for c3p0 connection pool for the application DB. These are set in code instead of a properties file because
  we use separate options for data warehouse DBs. See
  https://www.mchange.com/projects/c3p0/#configuring_connection_testing for an overview of the options used
  below (jump to the 'Simple advice on Connection testing' section.)"
  (merge
   {"idleConnectionTestPeriod" 60
    "connectionCustomizerClassName" (.getName DbActivityTracker)}
   ;; only merge in `max-pool-size` if it's actually set, this way it doesn't override any things that may have been
   ;; set in `c3p0.properties`
   (when-let [max-pool-size (config/config-int :mb-application-db-max-connection-pool-size)]
     {"maxPoolSize" max-pool-size})))

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
