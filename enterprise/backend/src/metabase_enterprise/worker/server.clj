(ns metabase-enterprise.worker.server
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [compojure.core :as compojure]
   [compojure.route :as route]
   [metabase-enterprise.transforms.core :as transforms]
   [metabase-enterprise.worker.tracking :as tracking]
   [metabase.api.util.handlers :as handlers]
   [metabase.server.core :as server]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
   [ring.adapter.jetty :as ring-jetty]
   [ring.middleware.keyword-params :refer [wrap-keyword-params]]
   [ring.util.response :as response])
  (:import (java.util.concurrent Executors ExecutorService Semaphore)
           (org.eclipse.jetty.util.thread QueuedThreadPool)))

(set! *warn-on-reflection* true)

;; allow no more than 1000 running workers at a time
(defonce ^:private ^Semaphore semaphore (Semaphore. 1000 true))

(defonce ^:private ^ExecutorService executor (Executors/newVirtualThreadPerTaskExecutor))

(defn- handle-transform-put
  [{:keys [params body]}]
  (log/trace "Handling transform POST request")
  (if (.tryAcquire semaphore)
    (let [{:keys [run-id]} params
          {:keys [mb-source] :as body} (assoc body :run-id run-id)]
      ;; TODO (eric): Add validation for body
      (when (tracking/track-start! run-id mb-source)
        (.submit executor
                 ^Runnable #(try
                              (transforms/execute-transform! body)
                              (tracking/track-finish! run-id)
                              (catch Throwable t
                                (log/error t "Error executing transform")
                                (tracking/track-error! run-id (.getMessage t)))
                              (finally
                                (.release semaphore)))))
      (-> (response/response (tracking/get-status run-id mb-source))
          (response/content-type "application/json")))

    (-> (response/response "Too many requests")
        (response/status 429))))

(defn- handle-status-get
  [run-id]
  (log/info "Handling status GET request")
  (if-let [resp (tracking/get-status (Integer/parseInt run-id) "mb-1")]
    (response/response resp)
    (-> (response/response "Not found")
        (response/status 404))))

(def ^:private routes
  (handlers/routes
   (compojure/GET "/health-check" [] "healthy")
   (compojure/PUT "/transform/:run-id" request (handle-transform-put request))
   (compojure/GET "/status/:run-id" [run-id] (handle-status-get run-id))
   (route/not-found "Page not found")))

(def ^:private handler
  (reduce (fn [handler middleware-fn]
            (middleware-fn handler))
          routes
          [server/wrap-json-body
           server/wrap-streamed-json-response
           wrap-keyword-params]))

(defonce ^:private instance (atom nil))

(defn stop! []
  (when @instance
    (log/info "Stopping worker server")
    (.stop ^QueuedThreadPool @instance)
    (reset! instance nil)))

(defn start!
  ([] (start! {}))
  ([opts]
   (stop!)
   (log/info "Starting worker server")
   (let [thread-pool (doto (new QueuedThreadPool)
                       (.setVirtualThreadsExecutor (Executors/newVirtualThreadPerTaskExecutor)))]
     (reset! instance (ring-jetty/run-jetty #'handler
                                            {:port 3030
                                             :thread-pool thread-pool
                                             :join? (not (:dev opts))})))))

(comment

  (start! {:dev true})
  (stop!))
