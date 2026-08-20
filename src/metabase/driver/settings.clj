(ns metabase.driver.settings
  (:require
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(set! *warn-on-reflection* true)

(defsetting warehouse-allowed-networks
  (deferred-tru (str "Controls which networks Metabase may connect to for warehouse connections.\n"
                     "Options:\n"
                     "- external-only (only globally routable public addresses)\n"
                     "- allow-private (external + private networks but NOT loopback or link-local)\n"
                     "- allow-all (no restrictions).\n"
                     "Defaults to external-only on Metabase Cloud and allow-all when self-hosted.\n"
                     "Also covers the SSH tunnel host and the database auth-provider URLs."))
  :type       :keyword
  :visibility :internal
  :export?    false
  ;; No `:default`, because it depends on where we are running. On Cloud a warehouse is always reached across the
  ;; public internet, so an internal address is somebody reaching for our own infrastructure rather than their
  ;; database. Self-hosted, a warehouse on a private network is the ordinary case, and defaulting to anything
  ;; stricter would break working instances on upgrade.
  :getter     (fn []
                (or (setting/get-value-of-type :keyword :warehouse-allowed-networks)
                    (if (premium-features/is-hosted?)
                      :external-only
                      :allow-all)))
  :setter     (fn [new-value]
                (when (some? new-value)
                  (assert (#{:external-only :allow-private :allow-all} (keyword new-value))
                          (tru (str "Invalid warehouse-allowed-networks! Only values of `external-only`, "
                                    "`allow-private`,` and `allow-all` are allowed."))))
                (setting/set-value-of-type! :keyword :warehouse-allowed-networks new-value)))

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
  :doc "Timeout in minutes for the database's query execution, both for the Metabase application database and any data connections.
  If you have long-running queries, you might consider increasing this value. Adjusting the timeout does not impact Metabase’s frontend.

  This setting does not apply to queries executed within transforms; those are governed by MB_TRANSFORM_TIMEOUT instead.

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

(defsetting jdbc-data-warehouse-connection-pool-checkout-timeout-ms
  "Number of milliseconds a query will wait for a free data-warehouse connection before timing out. A value of `0` means
  that queries will wait indefinitely for a connection."
  :visibility :internal
  :export?    false
  :type       :integer
  :default    30000
  :audit      :getter
  :doc "Increase this value if you routinely run more concurrent queries than
  MB_JDBC_DATA_WAREHOUSE_MAX_CONNECTION_POOL_SIZE, and you cannot increase the pool size or make the data-warehouse
  respond faster. This setting bounds only the wait time for a connection, not query execution. Once a query has a
  connection, it runs for up to MB_DB_QUERY_TIMEOUT_MINUTES.")

(defn- -jdbc-data-warehouse-connection-pool-max-pending-checkouts []
  (or (setting/get-value-of-type :integer :jdbc-data-warehouse-connection-pool-max-pending-checkouts)
      (* 2 (jdbc-data-warehouse-max-connection-pool-size))))

(defsetting jdbc-data-warehouse-connection-pool-max-pending-checkouts
  "Maximum number of queries that may be waiting for a free data-warehouse connection at once. Defaults to twice
  [[jdbc-data-warehouse-max-connection-pool-size]], so it tracks the pool size unless set explicitly. A value of `0`
  means that any number of queries may wait. Defaults to twice [MB_JDBC_DATA_WAREHOUSE_MAX_CONNECTION_POOL_SIZE](#MB_JDBC_DATA_WAREHOUSE_MAX_CONNECTION_POOL_SIZE)"
  :visibility :internal
  :export?    false
  :type       :integer
  :getter     #'-jdbc-data-warehouse-connection-pool-max-pending-checkouts
  :audit      :getter
  :doc "Increase this value if you routinely run bursts of more concurrent queries than
  MB_JDBC_DATA_WAREHOUSE_MAX_CONNECTION_POOL_SIZE, and you would rather queue them than fail them. Queries beyond this
  limit fail immediately instead of joining the queue. The limit applies per database, since each database has its own
  connection pool.")

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

(def ^:dynamic *impersonation-allow-write?*
  "Whether write-back operations are permitted while connection impersonation is active. Normally `false`."
  false)

(def ^:dynamic *allow-testing-sqlite-connections*
  "Whether to allow testing new SQLite connections. Normally disabled on hosted Metabase, which effectively prevents
  users from creating new SQLite databases from the API. Internal flows that need to test connections to the bundled
  Sample Database (sync, schema refresh, fingerprinting, etc.) bind this to `true`."
  false)

(defn- -jdbc-data-warehouse-unreturned-connection-timeout-seconds []
  (or (setting/get-value-of-type :integer :jdbc-data-warehouse-unreturned-connection-timeout-seconds)
      (long (/ *query-timeout-ms* 1000))))

(defsetting jdbc-data-warehouse-unreturned-connection-timeout-seconds
  "Kill data-warehouse connections that have been checked out but not returned to the pool after this many seconds.
  Acts as a leak-detector safety net — per-query timeouts are enforced separately via `Statement.setQueryTimeout`.
  Defaults to the current `*query-timeout-ms*` in seconds, which is `MB_DB_QUERY_TIMEOUT_MINUTES` outside transforms
  and `MB_TRANSFORM_TIMEOUT` inside [[metabase.driver.connection/with-transform-connection]] — so the transform pool
  (a separate c3p0 pool keyed on `:transform`) gets a leak-detector tuned to transform-length runtimes without
  weakening the leak-detector on the default pool used by ad-hoc queries."
  :visibility :internal
  :type       :integer
  :getter     #'-jdbc-data-warehouse-unreturned-connection-timeout-seconds
  :setter     :none)

(defsetting jdbc-data-warehouse-debug-unreturned-connection-stack-traces
  "Tell c3p0 to log a stack trace for any connections killed due to exceeding the timeout specified in
  [[jdbc-data-warehouse-unreturned-connection-timeout-seconds]].

  Note: You also need to update the com.mchange log level to INFO or higher in the Log4j configs in order to see the
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

(defsetting sync-max-fields-per-table
  "Maximum number of fields per table to sync as :model/Field rows. If a table's warehouse schema has more fields than
  this, only the first (by name) are synced and the rest are skipped -- keeps document databases with very large or
  dynamic schemas (e.g. MongoDB) from creating an unbounded number of Fields."
  :visibility :internal
  :export?    true
  :type       :integer
  :default    10000)
