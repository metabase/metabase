(ns metabase.test.initialize.web-server
  (:require [clj-http.client :as http]
            [clojure.tools.logging :as log]
            [metabase.config :as config]
            [metabase.core.initialization-status :as init-status]
            [metabase.http-client :as client]
            [metabase.models.setting :as setting]
            [metabase.server :as server]
            [metabase.server.handler :as handler]))

(defn- test-handler
  ([request]
   (try
     (#'handler/app request)
     (catch Throwable e
       (println "ERROR HANDLING REQUEST! <sync>" request)
       (println e)
       (throw e))))

  ([request respond raise]
   (letfn [(raise' [e]
             (println "ERROR HANDLING REQUEST! <async raise>" request)
             (println e)
             (raise e))]
     (try
       (#'handler/app request respond raise')
       (catch Throwable e
         (println "ERROR HANDLING REQUEST! <async thrown>" request)
         (println e)
         (throw e))))))

(defn init! []
  (try
    (server/start-web-server! test-handler)
    (log/infof "Started test server on port %d" (config/config-int :mb-jetty-port))
    (catch Throwable e
      (log/fatalf e "Web server failed to start")
      (when config/is-test?
        (System/exit -2))))
  (init-status/set-complete!)
  ;; don't use client/client since it calls (initialize/initialize-if-needed! :db :web-server) and we are in the
  ;; process of initializing the :web-server
  (http/get (str client/*url-prefix* "testing/save-site-url"))
  (setting/set! :site-name "Metabase Test"))
