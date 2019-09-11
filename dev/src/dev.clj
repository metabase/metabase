(ns dev
  "Put everything needed for REPL development within easy reach"
  (:require [metabase
             [core :as mbc]
             [db :as mdb]
             [handler :as handler]
             [plugins :as pluguns]
             [server :as server]
             [util :as u]]
            [metabase.api.common :as api-common]
            [metabase.models.interface :as mi]
            [toucan.db :as tdb]))

(defn init!
  []
  (mbc/init!))

(defn start!
  []
  (metabase.server/start-web-server! #'metabase.handler/app)
  (metabase.db/setup-db!)
  (metabase.plugins/load-plugins!)
  (metabase.core.initialization-status/set-complete!))

(defn stop!
  []
  (metabase.server/stop-web-server!))

(defn restart!
  []
  (stop!)
  (start!))

(defn run-tests
  [& ns-names]
  (doseq [ns-name ns-names]
    (require ns-name :reload))
  (expectations/run-tests ns-names))

(defmacro require-model
  "Rather than requiring all models inn the ns declaration, make it easy to require the ones you need for your current session"
  [model-sym]
  `(require [(symbol (str "metabase.models." (quote ~model-sym))) :as (quote ~model-sym)]))

(defmacro with-permissions
  [permissions & body]
  `(binding [api-common/*current-user-permissions-set* (delay ~permissions)]
     ~@body))
