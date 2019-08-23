(ns dev
  "Put everything needed for REPL development within easy reach"
  (:require [metabase
             [core :as mbc]
             [db :as mdb]
             [handler :as handler]
             [plugins :as pluguns]
             [server :as server]
             [util :as u]]
            [metabase.models.interface :as mi]
            [metabase.api.common :as api-common]))

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

;; The linter will punch you in the face if you require a namespace without using anything from it, so here we pull a
;; fast one on it. We want to require the namespaces so that they're within easy reach during REPL dev, without having
;; to specify beforehand what exactly we want to use.
(def appease-the-linter
  [u/get-id mi/can-read?])
