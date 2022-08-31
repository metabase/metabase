(ns metabase.prometheus
  (:require [clojure.tools.logging :as log]
            [iapetos.collector :as collector]
            [iapetos.collector.ring :as collector.ring]
            [iapetos.core :as prometheus]
            [metabase.models.setting :refer [defsetting]]
            [metabase.util.i18n :refer [trs]]
            [ring.adapter.jetty :as ring-jetty])
  (:import [io.prometheus.client.hotspot
            GarbageCollectorExports
            MemoryPoolsExports
            StandardExports
            ThreadExports]))

(defsetting prometheus-server-port
  "Port to serve prometheus status from. If set"
  :type       :integer
  :visibility :internal
  ;; settable only through environmental variable
  :setter     :none)

(defonce ^{:doc "Registry for prometheus metrics"} registry nil)

(defonce ^{:doc "Web-server for prometheus metrics"} web-server nil)

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

(defn setup-metrics!
  "Instrument the application. Conditionally done when some setting is set. If [[prometheus-server-port]] is not set it
  will throw."
  []
  (log/info (trs "Starting prometheus metrics collector"))
  (when-not (prometheus-server-port)
    (throw (ex-info (trs "Attempting to set up prometheus metrics with no web-server port provided")
                    {})))
  (locking #'registry
    (if-not registry
      (do (alter-var-root #'registry
                          (constantly (let [registry (prometheus/collector-registry
                                                      "metabase-registry")]
                                        (apply prometheus/register registry
                                               (jvm-collectors)))))
          :prometheus.metrics/instantiated)
      :prometheus.metrics/already-instantiated)))

(defn start-web-server!
  "Start the prometheus web-server. If [[prometheus-server-port]] is not set it will throw."
  []
  (log/info (trs "Starting prometheus metrics web-server on port {0}"
                 (prometheus-server-port)))
  (when-not (prometheus-server-port)
    (throw (ex-info (trs "Attempting to set up prometheus metrics web-server with no web-server port provided")
                    {})))
  (locking #'web-server
    (if-not web-server
      (do (alter-var-root #'web-server
                          (constantly (ring-jetty/run-jetty (-> (constantly {:status 200})
                                                                (collector.ring/wrap-metrics registry {:path "/metrics"}))
                                                            {:join?       false
                                                             :port        (prometheus-server-port)
                                                             :max-threads 8})))
          :prometheus.web-server/started)
      :prometheus.web-server/already-started)))

(defn stop-web-server
  "Stop the prometheus metrics web-server if it is running."
  []
  (if web-server
    (try (.stop web-server)
         :prometheus.web-server/started
         (catch Exception e
           (log/warn e (trs "Error stopping prometheus web-server"))
           :prometheus.web-server/error))
    :prometheus.web-server/not-running))

(comment
  (require 'iapetos.export)
  (spit "metrics" (iapetos.export/text-format registry)))
