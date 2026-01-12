(ns metabase.test.initialize.web-server
  (:require
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.server.core :as server]
   [metabase.server.test-handler :as server.test-handler]
   [metabase.settings.core :as setting]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn init! []
  (try
    (server/start-web-server! (server.test-handler/test-handler))
    (log/infof "Started test server on port %d" (config/config-int :mb-jetty-port))
    (catch Throwable e
      (log/fatal e "Web server failed to start")
      (when config/is-test?
        (System/exit -2))))
  (init-status/set-complete!)
  (setting/set! :site-name "Metabase Test"))
