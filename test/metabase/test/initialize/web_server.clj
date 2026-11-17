(ns metabase.test.initialize.web-server
  (:require
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.server.core :as server]
   [metabase.settings.core :as setting]
   [metabase.test.server.handler :as test.server.handler]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn init! []
  (try
    (server/start-web-server! (test.server.handler/test-handler))
    (log/infof "Started test server on port %d" (server/server-port))
    (catch Throwable e
      (log/fatal e "Web server failed to start")
      (when config/is-test?
        (System/exit -2))))
  (init-status/set-complete!)
  (setting/set! :site-name "Metabase Test"))
