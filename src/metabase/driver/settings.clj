(ns metabase.driver.settings
  #_{:clj-kondo/ignore [:metabase/modules]}
  (:require
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(defsetting ssh-heartbeat-interval-sec
  (deferred-tru "Controls how often the heartbeats are sent when an SSH tunnel is established (in seconds).")
  :visibility :public
  :type       :integer
  :default    180
  :audit      :getter)

(defn- -report-timezone-on-change [old-value new-value]
  (when-not (= old-value new-value)
    (events/publish-event! :event/report-timezone-updated {:old-timezone old-value, :new-timezone new-value})))

(defsetting report-timezone
  (deferred-tru "Connection timezone to use when executing queries. Defaults to system timezone.")
  :encryption :no
  :visibility :settings-manager
  :export?    true
  :audit      :getter
  :on-change  #'-report-timezone-on-change)

(defn- short-timezone-name [timezone-id]
  (let [^java.time.ZoneId zone (if (seq timezone-id)
                                 (t/zone-id timezone-id)
                                 (t/zone-id))]
    (.getDisplayName
     zone
     java.time.format.TextStyle/SHORT
     (java.util.Locale/getDefault))))

(defn- -report-timezone-short []
  (short-timezone-name (report-timezone)))

(defsetting report-timezone-short
  "Current report timezone abbreviation"
  :visibility :public
  :export?    true
  :setter     :none
  :getter     #'-report-timezone-short
  :doc        false)

(defn- long-timezone-name [timezone-id]
  (if (seq timezone-id)
    timezone-id
    (str (t/zone-id))))

(defn- -report-timezone-long []
  (long-timezone-name (report-timezone)))

(defsetting report-timezone-long
  "Current report timezone string"
  :visibility :public
  :export?    true
  :setter     :none
  :getter     #'-report-timezone-long
  :doc        false)

;; This is normally set via the env var `MB_DB_CONNECTION_TIMEOUT_MS`
(defsetting db-connection-timeout-ms
  "Consider [[metabase.driver/can-connect?]] / [[can-connect-with-details?]] to have failed if they were not able to
  successfully connect after this many milliseconds. By default, this is 10 seconds."
  :visibility :internal
  :export?    false
  :type       :integer
  ;; for TESTS use a timeout time of 5 seconds. This is because we have some tests that check whether
  ;; [[driver/can-connect?]] is failing when it should, and we don't want them waiting 10 seconds to fail.
  ;;
  ;; Don't set the timeout too low -- I've had Circle fail when the timeout was 1000ms on *one* occasion.
  :default    (if config/is-test?
                5000
                10000)
  :doc "Timeout in milliseconds for connecting to databases, both Metabase application database and data connections.
  In case you're connecting via an SSH tunnel and run into a timeout, you might consider increasing this value as the
  connections via tunnels have more overhead than connections without.")

;; This is normally set via the env var `MB_DB_QUERY_TIMEOUT_MINUTES`
(defsetting db-query-timeout-minutes
  "By default, this is 20 minutes."
  :visibility :internal
  :export?    false
  :type       :integer
  ;; I don't know if these numbers make sense, but my thinking is we want to enable (somewhat) long-running queries on
  ;; prod but for test and dev purposes we want to fail faster because it usually means I broke something in the QP
  ;; code
  :default    (if config/is-prod?
                20
                3)
  :doc "Timeout in minutes for databases query execution, both Metabase application database and data connections.
  If you have long-running queries, you might consider increasing this value.
  Adjusting the timeout does not impact Metabase’s frontend.
  Please be aware that other services (like Nginx) may still drop long-running queries.")

;; This is normally set via the env var `MB_JDBC_NETWORK_TIMEOUT_MS`
(defsetting jdbc-network-timeout-ms
  "By default, this is 30 minutes."
  :visibility :internal
  :export?    false
  :type       :integer
  :default    (max (if config/is-prod? 1800000 600000) (* 1000 60 (+ (db-query-timeout-minutes) 5)))
  :doc "Timeout in milliseconds to wait for database operations to complete. This is used to free up threads that
        are stuck waiting for a database response in a socket read. See the documentation for more details:
        https://docs.oracle.com/javase/8/docs/api/java/sql/Connection.html#setNetworkTimeout-java.util.concurrent.Executor-int-")

(defsetting jdbc-data-warehouse-max-connection-pool-size
  "Maximum size of the c3p0 connection pool."
  :visibility :internal
  :type       :integer
  :default    15
  :audit      :getter
  :doc "Change this to a higher value if you notice that regular usage consumes all or close to all connections.

  When all connections are in use then Metabase will be slower to return results for queries, since it would have to
  wait for an available connection before processing the next query in the queue.

  For setting the maximum,
  see [MB_APPLICATION_DB_MAX_CONNECTION_POOL_SIZE](#mb_application_db_max_connection_pool_size).")

(def ^:dynamic ^Long *query-timeout-ms*
  "Maximum amount of time query is allowed to run, in ms."
  (u/minutes->ms (db-query-timeout-minutes)))

(def ^:dynamic ^Long *network-timeout-ms*
  "Maximum amount of time to wait for a response from the database, in ms."
  (jdbc-network-timeout-ms))

(def ^:dynamic *allow-testing-h2-connections*
  "Whether to allow testing new H2 connections. Normally this is disabled, which effectively means you cannot create new
  H2 databases from the API, but this flag is here to disable that behavior for syncing existing databases, or when
  needed for tests."
  ;; you can disable this flag with the env var below, please do not use it under any circumstances, it is only here so
  ;; existing e2e tests will run without us having to update a million tests. We should get rid of this and rework those
  ;; e2e tests to use SQLite ASAP.
  (or (config/config-bool :mb-dangerous-unsafe-enable-testing-h2-connections-do-not-enable)
      false))

(defn- -jdbc-data-warehouse-unreturned-connection-timeout-seconds []
  (or (setting/get-value-of-type :integer :jdbc-data-warehouse-unreturned-connection-timeout-seconds)
      (long (/ *query-timeout-ms* 1000))))

(defsetting jdbc-data-warehouse-unreturned-connection-timeout-seconds
  "Kill connections if they are unreturned after this amount of time. Currently, this is the mechanism that
  terminates JDBC driver queries that run too long. This should be the same as the query timeout in
  [[metabase.query-processor.context/query-timeout-ms]] and should not be overridden without a very good reason."
  :visibility :internal
  :type       :integer
  :getter     #'-jdbc-data-warehouse-unreturned-connection-timeout-seconds
  :setter     :none)

(defsetting jdbc-data-warehouse-debug-unreturned-connection-stack-traces
  "Tell c3p0 to log a stack trace for any connections killed due to exceeding the timeout specified in
  [[jdbc-data-warehouse-unreturned-connection-timeout-seconds]].

  Note: You also need to update the com.mchange log level to INFO or higher in the log4j configs in order to see the
  stack traces in the logs."
  :visibility :internal
  :type       :boolean
  :default    false
  :export?    false
  :setter     :none
  ;; This setting is documented in other-env-vars.md.
  :doc        false)

(defsetting sql-jdbc-fetch-size
  "Fetch size for result sets. We want to ensure that the jdbc ResultSet objects are not realizing the entire results
  in memory."
  :default    500
  :type       :integer
  :visibility :internal)

(defsetting nested-field-columns-value-length-limit
  (deferred-tru (str "Maximum length of a JSON string before skipping it during sync for JSON unfolding. If this is set "
                     "too high it could lead to slow syncs or out of memory errors."))
  :visibility :internal
  :export?    true
  :type       :integer
  :default    50000)

(defsetting engines
  "Available database engines"
  :visibility :public
  :setter     :none
  :getter     (fn []
                ((requiring-resolve 'metabase.driver.util/available-drivers-info)))
  :doc        false)

(defsetting sync-leaf-fields-limit
  (deferred-tru
   (str "Maximum number of leaf fields synced per collection of document database. Currently relevant for Mongo."
        " Not to be confused with total number of synced fields. For every chosen leaf field, all intermediate fields"
        " from root to leaf are synced as well."))
  :visibility :internal
  :export? true
  :type :integer
  :default 1000)
