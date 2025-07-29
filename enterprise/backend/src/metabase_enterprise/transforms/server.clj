(ns metabase-enterprise.transforms.server
  (:require
   [compojure.core :as compojure]
   [compojure.route :as route]
   [ring.adapter.jetty :as ring-jetty])
  (:import (java.util.concurrent Executors)
           (org.eclipse.jetty.util.thread QueuedThreadPool)))

(compojure/defroutes handler
  (compojure/GET "/health-check" [] "healthy")
  (compojure/GET "/start-transform" [] "starting transform")
  (route/not-found "Page not found"))

(defonce instance (atom nil))

(defn stop! []
  (prn "stopping transforms server")
  (.stop @instance))

(defn start!
  ([] (start! {}))
  ([opts]
   (when @instance
     (stop!))
   (prn "starting transforms server")
   (let [thread-pool (doto (new QueuedThreadPool)
                       (.setVirtualThreadsExecutor (Executors/newVirtualThreadPerTaskExecutor)))]
     (reset! instance (ring-jetty/run-jetty handler
                                            {:port 3000
                                             :thread-pool thread-pool
                                             :join? (not (:dev opts))})))))
