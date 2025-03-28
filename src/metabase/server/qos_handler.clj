(ns metabase.server.qos-handler
  (:require
   [metabase.util.log :as log])
  (:import
   (org.eclipse.jetty.server Request Handler)
   (org.eclipse.jetty.server.handler QoSHandler)))

(set! *warn-on-reflection* true)

(defn qos-handler
  "Prioritize healthcheck requests in the accept queue ahead of other requests"
  ^Handler [max-requests ^Handler next-handler]
  (let [handler (proxy [QoSHandler] []
                  (^int getPriority [^Request request]
                    (let [req-path (Request/getPathInContext request)]
                      (if (= req-path "/api/health")
                        1
                        0))))]
    (log/infof "Starting QoS Handler with max-requests %s" max-requests)
    (doto handler
      (.setMaxRequestCount max-requests)
      (.setHandler next-handler))))
