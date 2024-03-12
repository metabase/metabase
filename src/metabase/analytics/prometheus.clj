(ns metabase.analytics.prometheus
  "Namespace for collection metrics with Prometheus. Will set up a registry and a webserver on startup
  if [[prometheus-server-port]] is set to a port number. This can only be set in the environment (by starting with
  `MB_PROMETHEUS_SERVER_PORT` set to a numeric value and not through the web UI due to its sensitivity.

  Api is quite simple: [[setup!]] and [[shutdown!]]. After that you can retrieve metrics from
  http://localhost:<prometheus-server-port>/metrics."
  (:refer-clojure :exclude [inc])
  (:require
   [clojure.java.jmx :as jmx]
   [iapetos.collector :as collector]
   [iapetos.collector.ring :as collector.ring]
   [iapetos.core :as prometheus]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.server :as server]
   [metabase.util.i18n :refer [deferred-trs trs]]
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

(defsetting prometheus-server-port
  (deferred-trs (str "Port to serve prometheus metrics from. If set, prometheus collectors are registered"
                     " and served from `localhost:<port>/metrics`."))
  :type       :integer
  :visibility :internal
  ;; settable only through environmental variable
  :setter     :none
  :getter     (fn reading-prometheus-port-setting []
                (let [parse (fn [raw-value]
                              (if-let [parsed (parse-long raw-value)]
                                parsed
                                (log/warn (trs "MB_PROMETHEUS_SERVER_PORT value of ''{0}'' is not parseable as an integer."
                                               raw-value))))]
                  (setting/get-raw-value :prometheus-server-port integer? parse))))

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
          web-server (start-web-server! port registry)]
      (->PrometheusSystem registry web-server))
    (catch Exception e
      (throw (ex-info (trs "Failed to initialize Prometheus on port {0}" port)
                      {:port port}
                      e)))))

;;; Collectors

(defn c3p0-stats
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
                        :description (deferred-trs "C3P0 Max pool size")}
   :minPoolSize        {:label       "c3p0_min_pool_size"
                        :description (deferred-trs "C3P0 Minimum pool size")}
   :numConnections     {:label       "c3p0_num_connections"
                        :description (deferred-trs "C3P0 Number of connections")}
   :numIdleConnections {:label       "c3p0_num_idle_connections"
                        :description (deferred-trs "C3P0 Number of idle connections")}
   :numBusyConnections {:label       "c3p0_num_busy_connections"
                        :description (deferred-trs "C3P0 Number of busy connections")}

   :numThreadsAwaitingCheckoutDefaultUser
                       {:label       "c3p0_num_threads_awaiting_checkout_default_user"
                        :description (deferred-trs "C3P0 Number of threads awaiting checkout")}})

(defn- stats->prometheus
  "Create an ArrayList of GaugeMetricFamily objects containing measurements from the c3p0 stats. Stats are grouped by
  the property and the database information is attached as a label to multiple measurements of `:numConnections`."
  [stats]
  (let [arr (ArrayList. (count stats))]
    (doseq [[raw-label measurements] stats]
      (if-let [{gauge-label :label desc :description} (label-translation raw-label)]
        (let [gauge (GaugeMetricFamily.
                     ^String gauge-label
                     ^String (str desc) ;; site-localized becomes string
                     (List/of "database"))]
          (doseq [m measurements]
            (.addMetric gauge (List/of (:label m)) (:value m)))
          (.add arr gauge))
        (log/warn (trs "Unrecognized measurement {0} in prometheus stats"
                       raw-label))))
    arr))

(defn- conn-pool-bean-diag-info [acc ^ObjectName jmx-bean]
  (let [bean-id   (.getCanonicalName jmx-bean)
        props     [:numConnections :numIdleConnections :numBusyConnections
                   :minPoolSize :maxPoolSize :numThreadsAwaitingCheckoutDefaultUser]]
    (assoc acc (jmx/read bean-id :dataSourceName) (jmx/read bean-id props))))

(defn connection-pool-info
  "Builds a map of info about the current c3p0 connection pools managed by this Metabase instance."
  []
  (reduce conn-pool-bean-diag-info {} (jmx/mbean-names "com.mchange.v2.c3p0:type=PooledDataSource,*")))

(def c3p0-collector
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

(defn- setup-metrics!
  "Instrument the application. Conditionally done when some setting is set. If [[prometheus-server-port]] is not set it
  will throw."
  [registry-name]
  (log/info (trs "Starting prometheus metrics collector"))
  (let [registry (prometheus/collector-registry registry-name)]
    (apply prometheus/register registry
           (concat (jvm-collectors)
                   (jetty-collectors)
                   [@c3p0-collector]
                   ; Iapetos will use "default" if we do not provide a namespace, so explicitly set `metabase-email`:
                   [(prometheus/counter :metabase-email/messages
                                        {:description (trs "Number of emails sent.")})
                    (prometheus/counter :metabase-email/message-errors
                                        {:description (trs "Number of errors when sending emails.")})]))))

(defn- start-web-server!
  "Start the prometheus web-server. If [[prometheus-server-port]] is not set it will throw."
  [port registry]
  (log/info (trs "Starting prometheus metrics web-server on port {0}" (str port)))
  (when-not port
    (throw (ex-info (trs "Attempting to set up prometheus metrics web-server with no web-server port provided")
                    {})))
  (ring-jetty/run-jetty (-> (constantly {:status 200})
                            (collector.ring/wrap-metrics registry {:path "/metrics"}))
                        {:join?       false
                         :port        port
                         :max-threads 8}))

;;; API: call [[setup!]] once, call [[shutdown!]] on shutdown

(defn setup!
  "Start the prometheus metric collector and web-server."
  []
  (let [port (prometheus-server-port)]
    (when-not port
      (throw (ex-info (trs "Attempting to set up prometheus metrics with no web-server port provided")
                      {})))
    (when-not system
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
             (log/info (trs "Prometheus web-server shut down"))
             (catch Exception e
               (log/warn e (trs "Error stopping prometheus web-server"))))))))

(defn inc
  "Call iapetos.core/inc on the metric in the global registry,
   if it has already been initialized and the metric is registered."
  [metric]
  (some-> system .-registry metric prometheus/inc))

(comment
  (require 'iapetos.export)
  (spit "metrics" (iapetos.export/text-format (.registry system))))
