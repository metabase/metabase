(ns metabase-enterprise.transforms.server
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [compojure.core :as compojure]
   [compojure.route :as route]
   [metabase-enterprise.transforms.core :as transforms]
   [metabase-enterprise.transforms.tracking :as track]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.json :as json]
   [metabase.util.yaml :as yaml]
   [ring.adapter.jetty :as ring-jetty]
   [ring.util.response :as response])
  (:import (java.util.concurrent ExecutorService Executors Semaphore)
           (org.eclipse.jetty.util.thread QueuedThreadPool)))

(set! *warn-on-reflection* true)

;; allow no more than 1000 running workers at a time
(defonce ^:private ^Semaphore semaphore (Semaphore. 1000 true))
(defonce ^:private ^ExecutorService executor (Executors/newVirtualThreadPerTaskExecutor))

(defn- parse-body
  "Parse request body based on Content-Type header"
  [body content-type]
  (when body
    (let [body-str (slurp body)]
      (cond
        (str/includes? content-type "application/json")
        (json/decode body-str keyword)

        (or (str/includes? content-type "application/yaml")
            (str/includes? content-type "text/yaml"))
        (yaml/parse-string body-str)

        (str/includes? content-type "application/edn")
        (edn/read-string body-str)

        :else
        body-str))))

(defn wrap-body-parser
  "Middleware to parse request body based on Content-Type header"
  [handler]
  (fn [request]
    (if-let [content-type (get-in request [:headers "content-type"])]
      (try
        (let [parsed-body (parse-body (:body request) content-type)
              updated-request (assoc request :parsed-body parsed-body)]
          (handler updated-request))
        (catch Exception e
          (-> (response/response {:error "Failed to parse request body"
                                  :message (.getMessage e)})
              (response/status 400)
              (response/content-type "application/json"))))
      (handler request))))

(defn handle-transform
  "Handle POST /transform requests"
  [request]
  (let [success? (.tryAcquire semaphore)]
    (if success?
      (let [{:keys [work-id mb-source] :as parsed-data} (:parsed-body request)
            run-id (track/track-start! work-id "transform" mb-source)]
        (.submit executor
                 ^Runnable (fn []
                             (try
                               (transforms/execute-low-level! parsed-data)
                               (track/track-finish! run-id)
                               (catch Throwable _t
                                 (track/track-error! run-id))
                               (finally
                                 (.release semaphore)))))
        (-> (response/response {:message "Transform started"
                                :run-id run-id})
            (response/content-type "application/json")))

      (-> (response/response "Too many requests")
          (response/status 429)))))

(defn- handle-transform-get
  [run-id]
  (let [resp (track/get-status run-id "mb-1")]
    (if (seq resp)
      (response/response (zipmap [:status] resp))
      (-> (response/response "Not found")
          (response/status 404)))))

(def ^:private routes
  (handlers/routes
   (compojure/GET "/health-check" [] "healthy")
   (compojure/POST "/transform" request (handle-transform request))
   (compojure/GET "/transform/:run-id" [run-id] (handle-transform-get run-id))
   (route/not-found "Page not found")))

(def ^:private handler
  (-> routes
      wrap-body-parser))

(defonce ^:private instance (atom nil))

(defn- stop! []
  (prn "stopping transforms server")
  (.stop @instance))

(defn- start!
  ([] (start! {}))
  ([opts]
   (when @instance
     (stop!))
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
