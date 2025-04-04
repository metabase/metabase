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
   [metabase.analytics.settings :refer [prometheus-server-port]]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.server.core :as server]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [potemkin :as p]
   [potemkin.types :as p.types]
   [ring.adapter.jetty :as ring-jetty])
  (:import
   (io.prometheus.client Collector GaugeMetricFamily)
   (io.prometheus.client.hotspot GarbageCollectorExports MemoryPoolsExports StandardExports ThreadExports)
   (io.prometheus.client.jetty JettyStatisticsCollector)
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
  ;; Using this `locking` is non-obvious but absolutely required to avoid the deadlock inside c3p0 implementation. The
  ;; act of JMX attribute reading first locks a DynamicPooledDataSourceManagerMBean object, and then a
  ;; PoolBackedDataSource object. Conversely, the act of creating a pool (with
  ;; com.mchange.v2.c3p0.DataSources/pooledDataSource) first locks PoolBackedDataSource and then
  ;; DynamicPooledDataSourceManagerMBean. We have to lock a common monitor (which `database-id->connection-pool` is)
  ;; to prevent the deadlock. Hopefully.
  ;; Issue against c3p0: https://github.com/swaldman/c3p0/issues/95
  (locking @#'sql-jdbc.conn/database-id->connection-pool
    (let [bean-id   (.getCanonicalName jmx-bean)
          props     [:numConnections :numIdleConnections :numBusyConnections
                     :minPoolSize :maxPoolSize :numThreadsAwaitingCheckoutDefaultUser]]
      (assoc acc (jmx/read bean-id :dataSourceName) (jmx/read bean-id props)))))

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
                    (ThreadExports.))])

(defn- jetty-collectors
  []
  ;; when in dev you might not have a server setup
  (when (server/instance)
    [(collector/named {:namespace "metabase_webserver"
                       :name      "jetty_stats"}
                      (JettyStatisticsCollector. (.getHandler (server/instance))))]))

(defn- product-collectors
  []
  ;; Iapetos will use "default" if we do not provide a namespace, so explicitly set, e.g. `metabase-email`:
  [(prometheus/gauge :metabase-info/build
                     {:description "An info metric used to attach build info like version, which is high cardinality."
                      :labels [:tag :hash :date :version :major-version]})
   (prometheus/counter :metabase-csv-upload/failed
                       {:description "Number of failures when uploading CSV."})
   (prometheus/counter :metabase-email/messages
                       {:description "Number of emails sent."})
   (prometheus/counter :metabase-email/message-errors
                       {:description "Number of errors when sending emails."})
   (prometheus/counter :metabase-sdk/response-ok
                       {:description "Number of successful SDK requests."})
   (prometheus/counter :metabase-sdk/response-error
                       {:description "Number of errors when responding to SDK requests."})
   (prometheus/counter :metabase-embedding-iframe/response-ok
                       {:description "Number of successful iframe embedding requests."})
   (prometheus/counter :metabase-embedding-iframe/response-error
                       {:description "Number of errors when responding to iframe embedding requests."})
   (prometheus/counter :metabase-scim/response-ok
                       {:description "Number of successful responses from SCIM endpoints"})
   (prometheus/counter :metabase-scim/response-error
                       {:description "Number of error responses from SCIM endpoints"})
   (prometheus/counter :metabase-query-processor/metrics-adjust
                       {:description "Number of queries with metrics processed by the metrics adjust middleware."})
   (prometheus/counter :metabase-query-processor/metrics-adjust-errors
                       {:description "Number of errors when processing metrics in the metrics adjust middleware."})
   (prometheus/counter :metabase-search/index
                       {:description "Number of entries indexed for search"
                        :labels      [:model]})
   (prometheus/counter :metabase-database/healthy
                       {:description "Does a given database using driver pass a health check."
                        :labels [:driver]})
   (prometheus/counter :metabase-database/unhealthy
                       {:description "Does a given database using driver fail a health check."
                        :labels [:driver]})
   (prometheus/counter :metabase-search/index-error
                       {:description "Number of errors encountered when indexing for search"})
   (prometheus/counter :metabase-search/index-ms
                       {:description "Total number of ms indexing took"})
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
   ;; notification metrics
   (prometheus/counter :metabase-notification/send-ok
                       {:description "Number of successful notification sends."
                        :labels [:payload-type]})
   (prometheus/counter :metabase-notification/send-error
                       {:description "Number of errors when sending notifications."
                        :labels [:payload-type]})
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
   (prometheus/counter :metabase-gsheets/connection-creation-ok
                       {:description "How many times the instance has created a Google Sheets connection."})
   (prometheus/counter :metabase-gsheets/connection-creation-error
                       {:description "How many failures there were when creating a Google Sheets connection."
                        :labels [:reason]})
   (prometheus/counter :metabase-gsheets/connection-deleted
                       {:description "How many times the instance has deleted their Google Sheets connection."})])

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
                                (product-collectors)))]
    (doseq [{:keys [metric labels value]} (initial-labelled-metric-values)]
      (prometheus/inc registry metric (qualified-vals labels) value))
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

(comment
  ;; want to see what's in the registry?
  (require 'iapetos.export)
  (spit "metrics" (iapetos.export/text-format (:registry system)))

  ;; need to restart the server to see the metrics? use:
  (shutdown!)

  ;; get the value of a metric:
  (prometheus/value (:registry system) :metabase-gsheets/connection-creation-began)

  ;; w/ a label:
  (prometheus/value (:registry system) :metabase-gsheets/connection-creation-error [[:reason "timeout"]]))
