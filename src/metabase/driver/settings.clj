(ns metabase.driver.settings
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
  ;; for TESTS use a timeout time of 3 seconds. This is because we have some tests that check whether
  ;; [[driver/can-connect?]] is failing when it should, and we don't want them waiting 10 seconds to fail.
  ;;
  ;; Don't set the timeout too low -- I've had Circle fail when the timeout was 1000ms on *one* occasion.
  :default    (if config/is-test?
                3000
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
