(ns metabase-enterprise.worker.server
  (:require
   [clojure.core.async :as a]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [compojure.core :as compojure]
   [compojure.route :as route]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.transforms.core :as transforms]
   [metabase-enterprise.worker.canceling :as canceling]
   [metabase-enterprise.worker.tracking :as tracking]
   [metabase.api.util.handlers :as handlers]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.lib.schema.common :as schema.common]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.server.core :as server]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml]
   [ring.adapter.jetty :as ring-jetty]
   [ring.middleware.keyword-params :refer [wrap-keyword-params]]
   [ring.middleware.params :refer [wrap-params]]
   [ring.util.response :as response])
  (:import (java.util.concurrent
            Executors
            ExecutorService
            Future
            ScheduledExecutorService
            Semaphore
            TimeUnit)
           (org.eclipse.jetty.util.thread QueuedThreadPool)))

(set! *warn-on-reflection* true)

;; allow no more than 1000 running workers at a time
(defonce ^:private ^Semaphore semaphore (Semaphore. 1000 true))

(mr/def ::transform-api-request
  [:map
   [:driver [:keyword {:decode/normalize schema.common/normalize-keyword}]]
   [:transform-details :metabase-enterprise.transforms.execute/transform-details]
   [:opts :metabase-enterprise.transforms.execute/transform-opts]
   [:mb-source :string]])

(defn- handle-transform-put
  [{:keys [params body]}]
  (log/info "Handling transform PUT request for run" (pr-str (:run-id params)))
  (if (.tryAcquire semaphore)
    (let [{:keys [run-id]} params
          {:keys [driver transform-details opts mb-source]} (mc/coerce
                                                             ::transform-api-request
                                                             body
                                                             (mtx/transformer {:name :normalize}))]
      (when (tracking/track-start! run-id mb-source)
        (u.jvm/in-virtual-thread*
         (try
           (canceling/chan-start-timeout-vthread-worker-instance! run-id (transforms/transform-timeout))
           (binding [qp.pipeline/*canceled-chan* (a/promise-chan)]
             (canceling/chan-start-run! run-id qp.pipeline/*canceled-chan*)
             (driver/run-transform! driver
                                    transform-details
                                    opts))
           (tracking/track-finish! run-id)
           (catch Throwable t
             (log/error t "Error executing transform")
             (tracking/track-error! run-id (.getMessage t)))
           (finally
             (canceling/chan-end-run! run-id)
             (.release semaphore)))))
      (-> (response/response (tracking/get-status run-id mb-source))
          (response/content-type "application/json")))

    (-> (response/response "Too many requests")
        (response/status 429))))

(defn- handle-status-get
  [run-id mb-source]
  (log/info "Handling status GET request for run" (pr-str run-id))
  (if-let [resp (tracking/get-status run-id mb-source)]
    (response/response resp)
    (-> (response/response "Not found")
        (response/status 404))))

(defn- handle-cancel-post
  [run-id mb-source]
  (log/info "Handling cancel POST request for run" (pr-str run-id))
  (if (tracking/mark-cancel-started-run! run-id mb-source)
    (-> (response/response "Canceling")
        (response/status 202))
    (-> (response/response "Not found")
        (response/status 404))))

(def ^:private routes
  (compojure/routes
   (compojure/GET "/api/health" [] "healthy")
   (compojure/PUT "/transform/:run-id" request (handle-transform-put request))
   (compojure/GET "/status/:run-id" [run-id mb-source] (handle-status-get run-id mb-source))
   (compojure/POST "/cancel/:run-id" [run-id mb-source] (handle-cancel-post run-id mb-source))
   (route/not-found "Page not found")))

(def ^:private handler
  (reduce (fn [handler middleware-fn]
            (middleware-fn handler))
          routes
          [server/wrap-json-body
           server/wrap-streamed-json-response
           wrap-keyword-params
           wrap-params]))

(defn ^:private port []
  (if-let [port (config/config-str :mb-worker-jetty-port)]
    (Integer/parseInt port)
    3030))

(defonce ^:private instance (atom nil))
(defonce ^:private cancel-runs (atom nil))

(defn stop! []
  (when @instance
    (log/info "Stopping worker server")
    (.stop ^QueuedThreadPool @instance)
    (reset! instance nil))
  (when @cancel-runs
    (.cancel ^Future @cancel-runs true)
    (reset! cancel-runs nil))
  nil)

(defn start!
  ([] (start! {}))
  ([opts]
   (stop!)
   (let [thread-pool (doto (new QueuedThreadPool)
                       (.setVirtualThreadsExecutor (Executors/newVirtualThreadPerTaskExecutor)))
         jetty-port (port)]
     (log/info "Starting worker server on port" jetty-port)
     (reset! instance (ring-jetty/run-jetty #'handler
                                            {:port jetty-port
                                             :thread-pool thread-pool
                                             :join? (not (:dev opts))})))
   (reset! cancel-runs (canceling/schedule-cancel-runs!))
   nil))

(comment

  (start! {:dev true})
  (stop!))
