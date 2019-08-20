(ns dev
  (:require [metabase db handler plugins server]))

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
