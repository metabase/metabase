(ns metabase.prometheus
  "Namespace for collection metrics with Prometheus. Will set up a registry and a webserver on startup
  if [[prometheus-server-port]] is set to a port number. This can only be set in the environment and not though the
  web UI due to its sensitivity.

  Api is quite simple: [[setup!]] and [[shutdown!]]. After that you can retrieve metrics from
  http://localhost:<prometheus-server-port>/metrics."
  (:require [clojure.tools.logging :as log]
            [iapetos.collector :as collector]
            [iapetos.collector.ring :as collector.ring]
            [iapetos.core :as prometheus]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.server :as server]
            [metabase.util.i18n :refer [trs]]
            [potemkin :as p]
            [potemkin.types :as p.types]
            [ring.adapter.jetty :as ring-jetty])
  (:import [io.prometheus.client.hotspot
            GarbageCollectorExports
            MemoryPoolsExports
            StandardExports
            ThreadExports]
           io.prometheus.client.jetty.JettyStatisticsCollector
           org.eclipse.jetty.server.Server))

(defsetting prometheus-server-port
  "Port to serve prometheus status from. If set"
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

(defonce ^:private ^{:doc "Prometheus System for prometheus metrics"} system nil)

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
  [(JettyStatisticsCollector. (.getHandler (server/instance)))])

(defn- setup-metrics!
  "Instrument the application. Conditionally done when some setting is set. If [[prometheus-server-port]] is not set it
  will throw."
  [registry-name]
  (log/info (trs "Starting prometheus metrics collector"))
  (let [registry (prometheus/collector-registry registry-name)]
    (apply prometheus/register registry
           (concat (jvm-collectors)
                   (jetty-collectors)))))

(defn- start-web-server!
  "Start the prometheus web-server. If [[prometheus-server-port]] is not set it will throw."
  [port registry]
  (log/info (trs "Starting prometheus metrics web-server on port {0}" port))
  (when-not port
    (throw (ex-info (trs "Attempting to set up prometheus metrics web-server with no web-server port provided")
                    {})))
  (ring-jetty/run-jetty (-> (constantly {:status 200})
                            (collector.ring/wrap-metrics registry {:path "/metrics"}))
                        {:join?       false
                         :port        port
                         :max-threads 8}))

(p.types/defprotocol+ PrometheusActions
  (stop-web-server [this]))

(p/defrecord+ PrometheusSystem [registry web-server]
  PrometheusActions
  (stop-web-server [_this]
    (when-let [^Server web-server web-server]
      (.stop web-server))))

(defn- make-prometheus-system
  "Takes a port (zero for a random port in test) and a registry name and returns a [[PrometheusSystem]] with a registry
  serving metrics from that port."
  [port registry-name]
  (let [registry (setup-metrics! registry-name)
        web-server (start-web-server! port registry)]
    (->PrometheusSystem registry web-server)))

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
     (try (stop-web-server system)
          (alter-var-root #'system (constantly nil))
          (log/info (trs "Prometheus web-server shut down"))
          (catch Exception e
            (log/warn e (trs "Error stopping prometheus web-server")))))))

(comment
  (require 'iapetos.export)
  (spit "metrics" (iapetos.export/text-format registry))
  )
