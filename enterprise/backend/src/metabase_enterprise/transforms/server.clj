(ns metabase-enterprise.transforms.server
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [compojure.core :as compojure]
   [compojure.route :as route]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.tracking :as transforms.track]
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

(defn- apply-middleware
  [handler]
  (reduce (fn [handler middleware-fn]
            (middleware-fn handler))
          handler
          [#'server/wrap-json-body
           #'server/wrap-streamed-json-response
           #'wrap-keyword-params]))

(defn handle-transform
  "Handle POST /transform requests"
  [request]
  (prn "handling transform post")
  (let [success? (.tryAcquire semaphore)]
    (if success?
      (let [{:keys [work-id mb-source] :as body} (:body request)
            run-id (transforms.track/track-start! work-id "transform" mb-source)]
        (.submit executor
                 ^Runnable #(try
                              (-> (assoc body :run-id run-id)
                                  transforms.execute/execute-transform!)
                              (transforms.track/track-finish! run-id)
                              (catch Throwable t
                                (log/error t "Error executing transform")
                                (transforms.track/track-error! run-id))
                              (finally
                                (.release semaphore))))
        (-> (response/response {:message "Transform started"
                                :run-id run-id})
            (response/content-type "application/json")))

      (-> (response/response "Too many requests")
          (response/status 429)))))

(defn- handle-transform-get
  [run-id]
  (prn "handling transform get")
  (let [resp (transforms.track/get-status (Integer/parseInt run-id) "mb-1")]
    (if (seq resp)
      (response/response {:status (first resp)})
      (-> (response/response "Not found")
          (response/status 404)))))

(def ^:private routes
  (compojure/routes
   (compojure/GET "/health-check" [] "healthy")
   (compojure/POST "/transform" request (handle-transform request))
   (compojure/GET "/transform/:run-id" [run-id] (handle-transform-get run-id))
   (route/not-found "Page not found")))

(def ^:private handler
  (-> routes
      apply-middleware))

(defonce ^:private instance (atom nil))

(defn- stop! []
  (when @instance
    (prn "stopping transforms server")
    (.stop ^QueuedThreadPool @instance)
    (reset! instance nil)))

(defn- start!
  ([] (start! {}))
  ([opts]
   (stop!)
   (prn "starting transforms server")
   (let [thread-pool (doto (new QueuedThreadPool)
                       (.setVirtualThreadsExecutor (Executors/newVirtualThreadPerTaskExecutor)))]
     (reset! instance (ring-jetty/run-jetty handler
                                            {:port 3030
                                             :thread-pool thread-pool
                                             :join? (not (:dev opts))})))))

(comment

  (start! {:dev true})
  (stop!))
