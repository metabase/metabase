(ns watch.watcher
  (:require [clj-reload.core :as reload]
            [dev :as dev]
            [metabase.util.log :as log]
            [nextjournal.beholder :as beholder]
            [user :as user])
  (:gen-class))

(set! *warn-on-reflection* true)

(defn watch-fn
  "Reloads the system when a file changes."
  [{:keys [type path]}]
  (log/warnf "type: %s | path: %s" type path)
  (let [before (System/currentTimeMillis)
        _ (log/warn
           (-> (reload/reload {:throw false
                               :no-reload '#{watch.watcher user dev}})
               (update :unloaded count)
               (update :loaded count)))
        after (System/currentTimeMillis)
        _ (log/warn (str "Reloaded in " (- after before) " ms"))]))

#_:clj-kondo/ignore
(defonce watcher
  (let [_ (log/warn "WATCHER LOADING...")
        _ (reload/init     {:dirs ["dev" "src" "test"]})
        w (beholder/watch watch-fn "dev" "src" "test")]
    (log/warn "WATCHER STARTED...")
    w))

(defn -main "Watcher main function"
  [& _args]
  (user/dev)
  (dev/start!))

(comment
  (beholder/stop watcher)
  )
