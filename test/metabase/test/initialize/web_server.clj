(ns metabase.test.initialize.web-server
  (:require [clojure.tools.logging :as log]
            [metabase
             [handler :as handler]
             [server :as server]]
            [metabase.core.initialization-status :as init-status]
            [metabase.models.setting :as setting]))

(defn init! []
  (try
    (server/start-web-server! #'handler/app)
    (catch Throwable e
      (log/error e "Web server failed to start")
      (System/exit -2)))
  (init-status/set-complete!)
  (setting/set! :site-name "Metabase Test"))
