(ns metabase.test.initialize.web-server
  (:require [clojure.tools.logging :as log]
            [metabase.config :as config]
            [metabase.core.initialization-status :as init-status]
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
  (setting/set! :site-name "Metabase Test"))
