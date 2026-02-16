(ns metabase.analytics.prometheus
  "Namespace for collection metrics with Prometheus. Will set up a registry and a webserver on startup
  if [[prometheus-server-port]] is set to a port number. This can only be set in the environment (by starting with
  `MB_PROMETHEUS_SERVER_PORT` set to a numeric value and not through the web UI due to its sensitivity.

  Api is quite simple: [[setup!]] and [[shutdown!]]. After that you can retrieve metrics from
  http://localhost:<prometheus-server-port>/metrics."
  (:refer-clojure :exclude [set!])
  (:require
   [clojure.java.jmx :as jmx]
   [iapetos.collector :as collector]
   [iapetos.collector.ring :as collector.ring]
   [iapetos.core :as prometheus]
   [iapetos.registry.collectors :as collectors]
   [jvm-alloc-rate-meter.core :as alloc-rate-meter]
   [jvm-hiccup-meter.core :as hiccup-meter]
   [metabase.analytics.settings :refer [prometheus-server-port]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [potemkin :as p]
   [potemkin.types :as p.types]
   [ring.adapter.jetty :as ring-jetty])
  (:import
   (io.prometheus.client Collector GaugeMetricFamily SimpleCollector)
   (io.prometheus.client.hotspot
    GarbageCollectorExports
    MemoryPoolsExports
    StandardExports
    ThreadExports)
   (java.util ArrayList List)
   (javax.management ObjectName)
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

;;; Infra:
;; defsetting enables and [[system]] holds the system (webserver and registry)

(p.types/defprotocol+ PrometheusActions
  (stop-web-server [this]))

(p/defrecord+ PrometheusSystem [registry web-server]
  ;; prometheus just runs in the background collecting metrics and serving them from
  ;; localhost:<prometheus-server-port>/metrics. Nothing we need to do but shutdown.
  PrometheusActions
  (stop-web-server [_this]
    (when-let [^Server web-server web-server]
      (.stop web-server))))

(defonce ^:private ^{:doc "Prometheus System for prometheus metrics"} ^PrometheusSystem system nil)

(declare setup-metrics! start-web-server!)

(defn- make-prometheus-system
  "Takes a port (zero for a random port in test) and a registry name and returns a [[PrometheusSystem]] with a registry
  serving metrics from that port."
  [port registry-name]
  (try
    (let [registry   (setup-metrics! registry-name)
          web-server (when port (start-web-server! port registry))]
      (->PrometheusSystem registry web-server))
    (catch Exception e
      (throw (ex-info (trs "Failed to initialize Prometheus on port {0}" port)
                      {:port port}
                      e)))))

;;; Collectors

(defn- c3p0-stats
  "Takes `raw-stats` from [[connection-pool-info]] and groups by each property type rather than each database.
  {\"metabase-postgres-app-db\" {:numConnections 15,
                                 :numIdleConnections 15,
                                 :numBusyConnections 0,
                                 :minPoolSize 1,
                                 :maxPoolSize 15},
   \"db-2-postgres-clean\" {:numConnections 2,
                            :numIdleConnections 2,
                            :numBusyConnections 0,
                            :minPoolSize 1,
                            :maxPoolSize 15}}
  Becomes {:numConnections [{:name :numConnections,
                             :value 15.0, ;; values are all doubles
                             :timestamp 1662563931039,
                             :label \"metabase-postgres-app-db\"}
                            {:name :numConnections,
                             :value 2.0,
                             :timestamp 1662563931039,
                             :label \"db-2-postgres-clean\"}]
          ...}"
  [raw-stats]
  (let [now    (.toEpochMilli (java.time.Instant/now))
        sample (fn sample [[db-label k v]]
                 {:name      k
                  :value     (double v)
                  :timestamp now
                  :label     db-label})]
    (->> raw-stats
         (mapcat (fn [[db-label values]]
                   (map (fn [[k v]] [db-label k v]) values)))
         (map sample)
         (group-by :name))))

(def ^:private label-translation
  {:maxPoolSize        {:label       "c3p0_max_pool_size"
                        :description "C3P0 Max pool size"}
   :minPoolSize        {:label       "c3p0_min_pool_size"
                        :description "C3P0 Minimum pool size"}
   :numConnections     {:label       "c3p0_num_connections"
                        :description "C3P0 Number of connections"}
   :numIdleConnections {:label       "c3p0_num_idle_connections"
                        :description "C3P0 Number of idle connections"}
   :numBusyConnections {:label       "c3p0_num_busy_connections"
                        :description "C3P0 Number of busy connections"}

   :numThreadsAwaitingCheckoutDefaultUser
   {:label       "c3p0_num_threads_awaiting_checkout_default_user"
    :description "C3P0 Number of threads awaiting checkout"}})

(defn- stats->prometheus
  "Create an ArrayList of GaugeMetricFamily objects containing measurements from the c3p0 stats. Stats are grouped by
  the property and the database information is attached as a label to multiple measurements of `:numConnections`."
  [stats]
  (let [arr (ArrayList. (count stats))]
    (doseq [[raw-label measurements] stats]
      (if-let [{gauge-label :label desc :description} (label-translation raw-label)]
        (let [gauge (GaugeMetricFamily.
                     ^String gauge-label
                     ^String desc
                     (List/of "database"))]
          (doseq [m measurements]
            (.addMetric gauge (List/of (:label m)) (:value m)))
          (.add arr gauge))
        (log/warnf "Unrecognized measurement %s in prometheus stats" raw-label)))
    arr))

(defn- conn-pool-bean-diag-info [acc ^ObjectName jmx-bean]
  ;; We should not be using specific driver implementations
  (let [pool-var (requiring-resolve 'metabase.driver.sql-jdbc.connection/pool-cache-key->connection-pool)]
    ;; Using this `locking` is non-obvious but absolutely required to avoid the deadlock inside c3p0 implementation. The
    ;; act of JMX attribute reading first locks a DynamicPooledDataSourceManagerMBean object, and then a
    ;; PoolBackedDataSource object. Conversely, the act of creating a pool (with
    ;; com.mchange.v2.c3p0.DataSources/pooledDataSource) first locks PoolBackedDataSource and then
    ;; DynamicPooledDataSourceManagerMBean. We have to lock a common monitor (which `pool-cache-key->connection-pool` is)
    ;; to prevent the deadlock. Hopefully.
    ;; Issue against c3p0: https://github.com/swaldman/c3p0/issues/95
    (locking @pool-var
      (let [bean-id   (.getCanonicalName jmx-bean)
            props     [:numConnections :numIdleConnections :numBusyConnections
                       :minPoolSize :maxPoolSize :numThreadsAwaitingCheckoutDefaultUser]]
        (assoc acc (jmx/read bean-id :dataSourceName) (jmx/read bean-id props))))))

(defn connection-pool-info
  "Builds a map of info about the current c3p0 connection pools managed by this Metabase instance."
  []
  (reduce conn-pool-bean-diag-info {} (jmx/mbean-names "com.mchange.v2.c3p0:type=PooledDataSource,*")))

(def ^:private c3p0-collector
  "c3p0 collector delay"
  (letfn [(collect-metrics []
            (-> (connection-pool-info)
                c3p0-stats
                stats->prometheus))]
    (delay
      (collector/named
       {:name "c3p0-stats"
        :namespace "metabase_database"}
       (proxy [Collector] []
         (collect
           ([] (collect-metrics))
           ([_sampleNameFilter] (collect-metrics))))))))

(defn- jvm-collectors
  "JVM collectors. Essentially duplicating [[iapetos.collector.jvm]] namespace so we can set our own namespaces rather
  than \"iapetos_internal\""
  []
  [(collector/named {:namespace "metabase_application"
                     :name      "jvm_gc"}
                    (GarbageCollectorExports.))
   (collector/named {:namespace "metabase_application"
                     :name      "jvm_standard"}
                    (StandardExports.))
   (collector/named {:namespace "metabase_application"
                     :name      "jvm_memory_pools"}
                    (MemoryPoolsExports.))
   (collector/named {:namespace "metabase_application"
                     :name      "jvm_threads"}
                    (ThreadExports.))
   (prometheus/histogram :metabase_application/jvm_hiccups
                         {:description "Duration in milliseconds of system-induced pauses."})
   (prometheus/gauge :metabase_application/jvm_allocation_rate
                     {:description "Heap allocation rate in bytes/sec."})])

(defn- jetty-collectors
  []
  [(prometheus/counter :jetty/requests-total
                       {:description "Number of requests"})
   (prometheus/gauge :jetty/requests-active
                     {:description "Number of requests currently active"})
   (prometheus/gauge :jetty/requests-max
                     {:description "Maximum number of requests that have been active at once"})
   (prometheus/gauge :jetty/request-time-max-seconds
                     {:description "Maximum time spent executing a request"})
   (prometheus/counter :jetty/request-time-seconds-total
                       {:description "Total time spent executing requests"})
   (prometheus/counter :jetty/dispatched-total
                       {:description "Number of requests handled"})
   (prometheus/gauge :jetty/dispatched-active
                     {:description "Number of active requests being handled"})
   (prometheus/gauge :jetty/dispatched-active-max
                     {:description "Maximum number of active requests handled"})
   (prometheus/gauge :jetty/dispatched-time-max
                     {:description "Maximum time spent dispatching a request"})
   (prometheus/counter :jetty/dispatched-time-seconds-total
                       {:description "Total time spent handling requests"})
   (prometheus/counter :jetty/async-requests-total
                       {:description "Total number of async requests"})
   (prometheus/gauge :jetty/async-requests-waiting
                     {:description "Currently waiting async requests"})
   (prometheus/gauge :jetty/async-requests-waiting-max
                     {:description "Maximum number of waiting async requests"})
   (prometheus/counter :jetty/async-dispatches-total
                       {:description "Number of requests that have been asynchronously dispatched"})
   (prometheus/counter :jetty/expires-total
                       {:description "Number of async requests that have expired"})
   (prometheus/counter :jetty/responses-total
                       {:description "Total response grouped by status code"
                        :labels [:code]})
   (prometheus/counter :jetty/responses-bytes-total
                       {:description "Total number of bytes across all responses"})])

(defn- product-collectors
  []
  ;; Iapetos will use "default" if we do not provide a namespace, so explicitly set, e.g. `metabase-email`:
  [(prometheus/gauge :metabase-info/build
                     {:description "An info metric used to attach build info like version, which is high cardinality."
                      :labels [:tag :hash :date :version :major-version]})
   (prometheus/gauge :metabase-startup/jvm-to-complete-millis
                     {:description "Duration in milliseconds from JVM start to Metabase initialization complete."})
   (prometheus/gauge :metabase-startup/init-duration-millis
                     {:description "Duration in milliseconds of the init!* function execution."})
   (prometheus/counter :metabase-csv-upload/failed
                       {:description "Number of failures when uploading CSV."})
   (prometheus/counter :metabase-email/messages
                       {:description "Number of emails sent."})
   (prometheus/counter :metabase-email/message-errors
                       {:description "Number of errors when sending emails."})
   (prometheus/counter :metabase-geocoding/requests
                       {:description "Number of successful IP geocoding requests via GeoJS."})
   (prometheus/counter :metabase-geocoding/errors
                       {:description "Number of errors when geocoding IP addresses via GeoJS."})
   (prometheus/counter :metabase-scim/response-ok
                       {:description "Number of successful responses from SCIM endpoints"})
   (prometheus/counter :metabase-scim/response-error
                       {:description "Number of error responses from SCIM endpoints"})
   (prometheus/counter :metabase-query-processor/metrics-adjust
                       {:description "Number of queries with metrics processed by the metrics adjust middleware."})
   (prometheus/counter :metabase-query-processor/metrics-adjust-errors
                       {:description "Number of errors when processing metrics in the metrics adjust middleware."})
   (prometheus/gauge   :metabase-query-processor/computed-weak-map-queries
                       {:description "Number of queries cached in lib.computed/weak-map."})
   (prometheus/gauge   :metabase-card/unique-cards-failed-conversion
                       {:description "Number of distinct cards which have :dataset_query {}, meaning MBQL 4 to 5 conversion failed."})
   (prometheus/counter :metabase-card/conversions-requiring-cleaning
                       {:description "Number of times this instance converted a card's MBQL 4 to 5 and `clean` made a real change"})
   (prometheus/gauge :metabase-database/status
                     {:description "Does a given database using driver pass a health check."
                      :labels [:driver :healthy :reason :connection-type]})
   (prometheus/counter :metabase-query-processor/query
                       {:description "Did a query run by a specific driver succeed or fail"
                        :labels [:driver :status]})

   (prometheus/histogram :metabase-remote-sync/export-duration-ms
                         {:description "Duration in milliseconds that remote-sync exports took."
      ;; 1ms -> 10minutes
                          :buckets [1 500 1000 5000 10000 30000 60000 120000 300000 600000]})
   (prometheus/counter :metabase-remote-sync/exports
                       {:description "Number of remote-sync export calls"})
   (prometheus/counter :metabase-remote-sync/exports-failed
                       {:description "Number of failed remote-sync export calls"})
   (prometheus/histogram :metabase-remote-sync/import-duration-ms
                         {:description "Duration in milliseconds that remote-sync imports took."
      ;; 1ms -> 10minutes
                          :buckets [1 500 1000 5000 10000 30000 60000 120000 300000 600000]})
   (prometheus/counter :metabase-remote-sync/imports
                       {:description "Number of remote-sync import calls"})
   (prometheus/counter :metabase-remote-sync/imports-failed
                       {:description "Number of failed remote-sync import calls"})
   (prometheus/counter :metabase-remote-sync/git-operations
                       {:description "Number of git operations"
                        :labels [:operation :remote]})
   (prometheus/counter :metabase-remote-sync/git-operations-failed
                       {:description "Number of failed git operations"
                        :labels [:operation :remote]})

   (prometheus/counter :metabase-search/index-reindexes
                       {:description "Number of reindexed search entries"
                        :labels      [:model]})
   (prometheus/counter :metabase-search/index-updates
                       {:description "Number of updated search entries"
                        :labels      [:model]})
   (prometheus/counter :metabase-search/index-error
                       {:description "Number of errors encountered when indexing for search"})
   (prometheus/counter :metabase-search/index-update-ms
                       {:description "Total number of ms updating the index"})
   (prometheus/histogram :metabase-search/index-update-duration-ms
                         {:description "Duration in milliseconds that index update jobs took."
      ;; 1ms -> 10minutes
                          :buckets [1 500 1000 5000 10000 30000 60000 120000 300000 600000]})
   (prometheus/counter :metabase-search/index-reindex-ms
                       {:description "Total number of ms reindexing the index"})
   (prometheus/histogram :metabase-search/index-reindex-duration-ms
                         {:description "Duration in milliseconds that index reindex jobs took."
      ;; 1ms -> 10minutes
                          :buckets [1 500 1000 5000 10000 30000 60000 120000 300000 600000]})
   (prometheus/gauge :metabase-search/appdb-index-size
                     {:description "Number of rows in the active appdb index table."})
   (prometheus/gauge :metabase-search/semantic-index-size
                     {:description "Number of rows in the active semantic index table."})
   (prometheus/gauge :metabase-search/semantic-dlq-size
                     {:description "Number of rows in the active semantic index dead-letter-queue table."})
   (prometheus/gauge :metabase-search/semantic-gate-size
                     {:description "Number of rows in the semantic gate table"})
   (prometheus/gauge :metabase-search/queue-size
                     {:description "Number of updates on the search indexing queue."})
   (prometheus/counter :metabase-search/response-ok
                       {:description "Number of successful search requests."})
   (prometheus/counter :metabase-search/response-error
                       {:description "Number of errors when responding to search requests."})
   (prometheus/gauge :metabase-search/engine-default
                     {:description "Whether a given engine is being used as the default. User can override via cookie."
                      :labels [:engine]})
   (prometheus/gauge :metabase-search/engine-active
                     {:description "Whether a given engine is active. This does NOT mean that it is the default."
                      :labels [:engine]})
   (prometheus/counter :metabase-search/semantic-embedding-tokens
                       {:description (str "Number of tokens consumed by the given embedding model and provider. "
                                          "Not all providers track token use.")
                        :labels [:model :provider]})
   (prometheus/counter :metabase-search/semantic-permission-filter-ms
                       {:description "Total number of ms spent filtering readable docs"})
   (prometheus/counter :metabase-search/semantic-collection-filter-ms
                       {:description "Total number of ms spent filtering search results by collection"})
   (prometheus/counter :metabase-search/semantic-collection-id-filter-ms
                       {:description "Total number of ms spent filtering search results by collection id"})
   (prometheus/counter :metabase-search/semantic-search-ms
                       {:description "Total number of ms spent performing a semantic search"
                        :labels [:embedding-model]})
   (prometheus/counter :metabase-search/semantic-embedding-ms
                       {:description "Total number of ms spent calculating the embedding of the search string"
                        :labels [:embedding-model]})
   (prometheus/counter :metabase-search/semantic-db-query-ms
                       {:description "Total number of ms spent querying the search index"
                        :labels [:embedding-model]})
   (prometheus/counter :metabase-search/semantic-appdb-scores-ms
                       {:description "Total number of ms spent adding appdb-based scores"})
   (prometheus/counter :metabase-search/semantic-fallback-triggered
                       {:description "Number of times semantic search triggered fallback to appdb search due to insufficient results"
                        :labels [:fallback-engine]})
   (prometheus/counter :metabase-search/semantic-error-fallback
                       {:description "Number of times semantic search failed with an error and fell back to another engine"
                        :labels [:fallback-engine]})
   (prometheus/histogram :metabase-search/semantic-results-before-fallback
                         {:description "Distribution of result counts from semantic search when fallback is triggered"
                          :buckets [0 1 5 10 20 50 100]})
   (prometheus/histogram :metabase-search/semantic-fallback-results-usage
                         {:description "Distribution of count of fallback results used to supplement semantic search"
                          :buckets [0 1 5 10 20 50 100]})
   (prometheus/histogram :metabase-search/semantic-gate-write-ms
                         {:description "Distribution of semantic search gate write latency"
                          :buckets [1 10 50 100 500 1000 2000 5000 10000 20000]})
   (prometheus/histogram :metabase-search/semantic-gate-timeout-ms
                         {:description "Distribution of caught semantic search gate timeout durations"
                          :buckets     [4000 5000 6000 7000 8000 9000 10000 15000 30000 60000]})
   (prometheus/counter :metabase-search/semantic-gate-write-documents
                       {:description "Total number of gate documents issued to the semantic search gate table"})
   (prometheus/counter :metabase-search/semantic-gate-write-modified
                       {:description "Total number of records modified in the gate table"})
   (prometheus/counter :metabase-search/semantic-indexer-loop-ms
                       {:description "Total number of ms spent in the semantic search indexer loop"})
   (prometheus/counter :metabase-search/semantic-indexer-sleep-ms
                       {:description "Total number of ms the semantic indexer loop had control but was asleep"})
   (prometheus/histogram :metabase-search/semantic-indexer-poll-to-poll-interval-ms
                         {:description "Distribution of time elapsed between semantic search indexer polls (pg clock)"
                          :buckets [10 100 1000 5000 10000 20000 60000 300000 600000]})
   (prometheus/counter :metabase-search/semantic-indexer-read-gate-poll-ms
                       {:description "Total number of ms the semantic search indexer spent polling the gate"})
   (prometheus/counter :metabase-search/semantic-indexer-read-documents-ms
                       {:description "Total number of ms the semantic search indexer spent looking up candidate document details"})
   (prometheus/counter :metabase-search/semantic-indexer-write-indexing-ms
                       {:description "Total number of ms the semantic search indexer spent actually indexing (includes embedding/hnsw indexing), NOTE 'normal' mode only"})
   (prometheus/counter :metabase-search/semantic-indexer-write-metadata-ms
                       {:description "Total number of ms the semantic indexer spent updating metadata (includes watermark/stall updates)"})
   (prometheus/gauge   :metabase-search/semantic-indexer-stalled
                       {:description "Whether or not the semantic search indexer is stalled - 0 = normal, 1 = stall"})
   (prometheus/counter :metabase-search/semantic-indexer-dlq-loop-ms
                       {:description "Total number of ms the semantic indexer spent in dead letter queue processing"})
   (prometheus/counter :metabase-search/semantic-indexer-dlq-successes
                       {:description "Number of successful semantic search DLQ retries"})
   (prometheus/counter :metabase-search/semantic-indexer-dlq-failures
                       {:description "Number of failed semantic search DLQ retries"})

;; notification metrics
   (prometheus/counter :metabase-notification/send-ok
                       {:description "Number of successful notification sends."
                        :labels [:payload-type]})
   (prometheus/counter :metabase-notification/send-error
                       {:description "Number of errors when sending notifications."
                        :labels [:payload-type]})
   (prometheus/counter :metabase-notification/temp-storage
                       {:description "Number and type of temporary storage uses"
                        ;; memory, disk, above-threshold, truncated, not-limited
                        :labels [:storage]})
   (prometheus/histogram :metabase-notification/wait-duration-ms
                         {:description "Duration in milliseconds that notifications wait in the processing queue before being picked up for delivery."
                          :labels [:payload-type]
                          ;; 1ms -> 10minutes
                          :buckets [1 500 1000 5000 10000 30000 60000 120000 300000 600000]})
   (prometheus/histogram :metabase-notification/send-duration-ms
                         {:description "Duration in milliseconds spent actively sending/delivering the notification after being picked up from the queue."
                          :labels [:payload-type]
                          ;; 1ms -> 10minutes
                          :buckets [1 500 1000 5000 10000 30000 60000 120000 300000 600000]})
   (prometheus/histogram :metabase-notification/total-duration-ms
                         {:description "Total duration in milliseconds from when notification was queued until delivery completion (sum of wait and send durations)."
                          :labels [:payload-type]
                          ;; 1ms -> 10minutes
                          :buckets [1 500 1000 5000 10000 30000 60000 120000 300000 600000]})
   (prometheus/counter :metabase-notification/channel-send-ok
                       {:description "Number of successful channel sends."
                        :labels [:payload-type :channel-type]})
   (prometheus/counter :metabase-notification/channel-send-error
                       {:description "Number of errors when sending channel notifications."
                        :labels [:payload-type :channel-type]})
   (prometheus/gauge :metabase-notification/concurrent-tasks
                     {:description "Number of concurrent notification sends."})
   (prometheus/counter :metabase-gsheets/connection-creation-began
                       {:description "How many times the instance has initiated a Google Sheets connection creation."})
   (prometheus/counter :metabase-gsheets/connection-creation-error
                       {:description "How many failures there were when creating a Google Sheets connection."
                        :labels [:reason]})
   (prometheus/counter :metabase-sdk/response
                       {:description "Number of SDK embedding responses by status code."
                        :labels [:status]})
   (prometheus/counter :metabase-embedding-iframe/response
                       {:description "Number of iframe embedding responses by status code."
                        :labels [:status]})
   (prometheus/counter :metabase-gsheets/connection-deleted
                       {:description "How many times the instance has deleted their Google Sheets connection."})
   (prometheus/counter :metabase-gsheets/connection-manually-synced
                       {:description "How many times the instance has manually sync'ed their Google Sheets connection."})

   ;; transform metrics
   (prometheus/counter :metabase-transforms/job-runs-total
                       {:description "Total number of transform job runs started."
                        :labels [:run-method]})
   (prometheus/counter :metabase-transforms/job-runs-completed
                       {:description "Number of transform job runs that completed successfully."
                        :labels [:run-method]})
   (prometheus/counter :metabase-transforms/job-runs-failed
                       {:description "Number of transform job runs that failed."
                        :labels [:run-method]})
   (prometheus/histogram :metabase-transforms/job-run-duration-ms
                         {:description "Duration in milliseconds of transform job runs."
                          :labels [:run-method]
                          ;; 100ms -> 6 hours
                          :buckets [100 500 1000 5000 10000 30000 60000 300000 1800000 7200000 14400000 21600000]})
   (prometheus/counter :metabase-transforms/stage-started
                       {:description "Number of transform stages started."
                        :labels [:stage-type :stage-label]})
   (prometheus/counter :metabase-transforms/stage-completed
                       {:description "Number of transform stages completed successfully."
                        :labels [:stage-type :stage-label]})
   (prometheus/counter :metabase-transforms/stage-failed
                       {:description "Number of transform stages that failed."
                        :labels [:stage-type :stage-label]})
   (prometheus/histogram :metabase-transforms/stage-duration-ms
                         {:description "Duration in milliseconds of individual transform stages."
                          :labels [:stage-type :stage-label]
                          ;; 10ms -> 10 minutes
                          :buckets [10 100 500 1000 5000 10000 30000 60000 300000 600000]})
   (prometheus/histogram :metabase-transforms/data-transfer-bytes
                         {:description "Size in bytes of data transferred during transform stages."
                          :labels [:stage-label]
                          ;; 1KB -> 10GB
                          :buckets [1000 10000 100000 1000000 10000000 100000000 1000000000 10000000000]})
   (prometheus/histogram :metabase-transforms/data-transfer-rows
                         {:description "Number of rows transferred during transform stages."
                          :labels [:stage-label]
                          ;; 10 -> 10M rows
                          :buckets [10 100 1000 10000 100000 1000000 10000000]})
   ;; Python-transform specific metrics
   (prometheus/histogram :metabase-transforms/python-api-call-duration-ms
                         {:description "Duration of Python runner API calls."
                          :labels []
                          ;; 100ms -> 6 hours
                          :buckets [100 500 1000 5000 10000 30000 60000 300000 1800000 7200000 14400000 21600000]})
   (prometheus/counter :metabase-transforms/python-api-calls-total
                       {:description "Total number of Python runner API calls."
                        :labels [:status]})
   (prometheus/counter :metabase-token-check/attempt
                       {:description "Total number of token checks. Includes a status label."
                        :labels [:status]})
   ;; Write-connection telemetry (PRO-86)
   (prometheus/counter :metabase-db-connection/write-op
                       {:description "JDBC connection pool acquisitions by connection type (default or write-data). Tracks pool pressure ratio for capacity planning."
                        :labels [:connection-type]})
   (prometheus/counter :metabase-db-connection/type-resolved
                       {:description "Write-data details resolved by effective-details (driver-agnostic). Only incremented when write-data-details are genuinely used, not on fallback or workspace swap."
                        :labels [:connection-type]})
   ;; SQL parsing metrics
   (prometheus/counter :metabase-sql-parsing/context-timeouts
                       {:description "Number of Python/GraalVM SQL parsing execution timeouts."})
   (prometheus/counter :metabase-sql-parsing/context-acquisitions
                       {:description "Number of Python contexts acquired from the pool."})
   (prometheus/counter :metabase-sql-parsing/context-creations
                       {:description "Number of new Python contexts created."})
   (prometheus/counter :metabase-sql-parsing/context-disposals-expired
                       {:description "Number of Python contexts disposed due to TTL expiry."})
   ;; SQL tools operation metrics
   (prometheus/counter :metabase-sql-tools/operations-total
                       {:description "Total number of sql-tools operations started."
                        :labels [:parser :operation]})
   (prometheus/counter :metabase-sql-tools/operations-completed
                       {:description "Number of sql-tools operations completed successfully."
                        :labels [:parser :operation]})
   (prometheus/counter :metabase-sql-tools/operations-failed
                       {:description "Number of sql-tools operations that threw an exception."
                        :labels [:parser :operation]})
   (prometheus/histogram :metabase-sql-tools/operation-duration-ms
                         {:description "Duration in milliseconds of sql-tools operations."
                          :labels [:parser :operation]
                          :buckets [1 5 10 25 50 100 250 500 1000 2500 5000 10000 30000]})])

(defn- quartz-collectors
  []
  [(prometheus/counter :metabase-tasks/quartz-tasks-executed
                       {:description "How many tasks this metabase instance has executed by job-name and status"
                        :labels [:status :job-name]})
   (prometheus/gauge :metabase-tasks/quartz-tasks-states
                     {:description "How many tasks are in a given state in the entire quartz cluster"
                      :labels [:state]})])

(defmulti known-labels
  "Implement this for a given metric to initialize it for the given set of label values."
  {:arglists '([metric]), :added "0.52.0"}
  identity)

(defmulti initial-value
  "Implement this for a given metric to have non-zero initial values for the given set of label values."
  {:arglists '([metric labels]), :added "0.52.0"}
  (fn [metric _labels]
    metric))

(defmethod initial-value :default [_ _] 0)

(defn- initial-labelled-metric-values []
  (for [metric (keys (methods known-labels))
        labels (known-labels metric)]
    {:metric metric
     :labels labels
     :value  (initial-value metric labels)}))

(defn- qualified-vals
  [m]
  (update-vals m (fn [v] (cond
                           (map? v) (qualified-vals v)
                           (keyword? v) (u/qualified-name v)
                           :else v))))

(def ^:private jvm-hiccup-thread (atom nil))
(def ^:private jvm-alloc-rate-thread (atom nil))

(defn- setup-metrics!
  "Instrument the application. Conditionally done when some setting is set. If [[prometheus-server-port]] is not set it
  will throw."
  [registry-name]
  (log/info "Starting prometheus metrics collector")
  (let [registry (prometheus/collector-registry registry-name)
        registry (apply prometheus/register
                        (collector.ring/initialize registry)
                        (concat (jvm-collectors)
                                (jetty-collectors)
                                [@c3p0-collector]
                                (product-collectors)
                                (quartz-collectors)))]
    (doseq [{:keys [metric labels value]} (initial-labelled-metric-values)]
      (prometheus/inc registry metric (qualified-vals labels) value))
    (when @jvm-hiccup-thread (@jvm-hiccup-thread))
    (reset! jvm-hiccup-thread
            (hiccup-meter/start-hiccup-meter
             #(some-> (:registry system) (prometheus/observe :metabase_application/jvm_hiccups (/ % 1e6)))))
    (when @jvm-alloc-rate-thread (@jvm-alloc-rate-thread))
    (reset! jvm-alloc-rate-thread
            (alloc-rate-meter/start-alloc-rate-meter
             #(some-> (:registry system) (prometheus/observe :metabase_application/jvm_allocation_rate %))))
    registry))

(defn- start-web-server!
  "Start the prometheus web-server. If [[prometheus-server-port]] is not set it will throw."
  [port registry]
  (log/infof "Starting prometheus metrics web-server on port %s" (str port))
  (when-not port
    (throw (ex-info (trs "Attempting to set up prometheus metrics web-server with no web-server port provided")
                    {})))
  (ring-jetty/run-jetty (-> (constantly {:status 200})
                            (collector.ring/wrap-metrics registry {:path "/metrics"}))
                        {:join?       false
                         :port        port
                         :max-threads 8}))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;; Public API: call [[setup!]] once, call [[shutdown!]] on shutdown

(defn setup!
  "Start the prometheus metric collector and web-server."
  []
  (when-not system
    (let [port (prometheus-server-port)]
      (when-not port
        (log/info "Running prometheus metrics without a webserver"))
      (locking #'system
        (when-not system
          (let [sys (make-prometheus-system port "metabase-registry")]
            (alter-var-root #'system (constantly sys))))))))

(defn shutdown!
  "Stop the prometheus metrics web-server if it is running."
  []
  (when system
    (locking #'system
      (when system
        (when @jvm-hiccup-thread (@jvm-hiccup-thread))
        (when @jvm-alloc-rate-thread (@jvm-alloc-rate-thread))
        (try (stop-web-server system)
             (prometheus/clear (.-registry system))
             (alter-var-root #'system (constantly nil))
             (log/info "Prometheus web-server shut down")
             (catch Exception e
               (log/warn e "Error stopping prometheus web-server")))))))

(defn observe!
  "Call iapetos.core/observe on the metric in the global registry.
   Inits registry if it's not been initialized yet.

  Should be used with histograms and summaries."
  ([metric] (observe! metric nil 1))
  ([metric labels-or-amount]
   (if (number? labels-or-amount)
     (observe! metric nil labels-or-amount)
     (observe! metric labels-or-amount 1)))
  ([metric labels amount]
   (when-not system
     (setup!))
   (prometheus/observe (:registry system) metric (qualified-vals labels) amount)))

(defn inc!
  "Call iapetos.core/inc on the metric in the global registry.
   Inits registry if it's not been initialized yet."
  ([metric] (inc! metric nil 1))
  ([metric labels-or-amount]
   (if (number? labels-or-amount)
     (inc! metric nil labels-or-amount)
     (inc! metric labels-or-amount 1)))
  ([metric labels amount]
   (when-not system
     (setup!))
   (prometheus/inc (:registry system) metric (qualified-vals labels) amount)))

(defn inc-if-initialized!
  "Call iapetos.core/inc on the metric in the global registry.
   Inits registry if it's not been initialized yet."
  ([metric] (when system (inc! metric nil 1)))
  ([metric labels-or-amount]
   (when system
     (if (number? labels-or-amount)
       (inc! metric nil labels-or-amount)
       (inc! metric labels-or-amount 1))))
  ([metric labels amount]
   (when system
     (prometheus/inc (:registry system) metric (qualified-vals labels) amount))))

(defn dec!
  "Call iapetos.core/dec on the metric in the global registry.
   Inits registry if it's not been initialized yet.

  Should be used for gauge metrics."
  ([metric] (dec! metric nil 1))
  ([metric labels-or-amount]
   (if (number? labels-or-amount)
     (dec! metric nil labels-or-amount)
     (dec! metric labels-or-amount 1)))
  ([metric labels amount]
   (when-not system
     (setup!))
   (prometheus/dec (:registry system) metric (qualified-vals labels) amount)))

(defn set!
  "Call iapetos.core/set on the metric in the global registry.
   Inits registry if it's not been initialized yet."
  ([metric amount]
   (assert (not (seq? amount)) "Cannot only provide labels")
   ;; Escape var to avoid confusing it with the special form of the same name.
   (#'set! metric nil amount))
  ([metric labels amount]
   (when-not system
     (setup!))
   (prometheus/set (:registry system) metric (qualified-vals labels) amount)))

(defn clear!
  "Call Collector.clear() on given metric."
  [metric]
  (when-not system
    (setup!))
  (.clear ^SimpleCollector (:raw (collectors/lookup (.-collectors ^iapetos.registry.IapetosRegistry (:registry system)) metric nil))))

(comment
  ;; want to see what's in the registry?
  (require 'iapetos.export)
  (spit "metrics" (iapetos.export/text-format (:registry system)))

  ;; See all metrics that match a given prefix:
  ; (filter #(.startsWith % "metabase_search_") (clojure.string/split-lines (iapetos.export/text-format (:registry system))))

  ;; need to restart the server to see the metrics? use:
  (shutdown!)

  ;; get the value of a metric:
  (prometheus/value (:registry system) :metabase-gsheets/connection-creation-began)

  ;; w/ a label:
  (prometheus/value (:registry system) :metabase-gsheets/connection-creation-error [[:reason "timeout"]]))
