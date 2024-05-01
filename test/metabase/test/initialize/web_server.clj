(ns metabase.test.initialize.web-server
  (:require
   [metabase.config :as config]
   [metabase.core.initialization-status :as init-status]
   [metabase.models.setting :as setting]
   [metabase.server :as server]
   [metabase.server.handler :as handler]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- test-handler
  ([request]
   (try
     (#'handler/app request)
     (catch Throwable e
       (log/errorf "ERROR HANDLING REQUEST! <sync> %s" request)
       (log/error e)
       (throw e))))

  ([request respond raise]
   (letfn [(raise' [e]
             (log/errorf "ERROR HANDLING REQUEST! <async raise> %s" request)
             (log/error e)
             (raise e))]
     (try
       (#'handler/app request respond raise')
       (catch Throwable e
         (log/errorf "ERROR HANDLING REQUEST! <async thrown> %s" request)
         (log/error e)
         (throw e))))))

(defn init! []
  (try
    (server/start-web-server! test-handler)
    (log/infof "Started test server on port %d" (config/config-int :mb-jetty-port))
    (catch Throwable e
      (log/fatal e "Web server failed to start")
      (when config/is-test?
        (System/exit -2))))
  (init-status/set-complete!)
  (setting/set! :site-name "Metabase Test"))
