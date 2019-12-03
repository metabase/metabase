(ns metabase.test.initialize.web-server
  (:require [metabase
             [config :as config]
             [handler :as handler]
             [server :as server]]
            [metabase.core.initialization-status :as init-status]
            [metabase.models.setting :as setting]))

(defn init! []
  (try
    (server/start-web-server! #'handler/app)
    (printf "Started test server on port %d\n" (config/config-int :mb-jetty-port))
    (catch Throwable e
      (println "Web server failed to start")
      (println e)
      (when config/is-test?
        (System/exit -2))))
  (init-status/set-complete!)
  (setting/set! :site-name "Metabase Test"))
