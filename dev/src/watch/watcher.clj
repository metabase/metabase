(ns ^:clj-reload/no-unload
 ^:clj-reload/no-reload
 watch.watcher
  (:require
   [clj-reload.core :as reload]
   [dev :as dev]
   [metabase.util.log :as log]
   [nextjournal.beholder :as beholder]
   [user :as user])
  (:gen-class))

(set! *warn-on-reflection* true)

(defn watch-fn
  "Reloads the system when a file changes."
  [change]
  (log/warn "Change detected. Reloading system. " (pr-str change) " ...")
  (reload/reload {:throw :false}))

(def ^:private paths
  ["src" "test" "enterprise/backend" "modules"])

(defonce watcher
  (do
    (log/warn "Watching paths:" paths)
    (apply beholder/watch watch-fn paths)))

(defn -main "Watcher main function"
  [& _args]
  (user/dev)
  (dev/start!))

(comment

  (reload/reload)

  (beholder/stop watcher))
