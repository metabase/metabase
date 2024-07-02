(ns watch.watcher
  (:require [clj-reload.core :as reload]
            [clojure.edn :as edn]
            [clojure.string :as str]
            [dev :as dev]
            [metabase.util.log :as log]
            [nextjournal.beholder :as beholder]
            [user :as user])
  (:gen-class))

(set! *warn-on-reflection* true)

(def all-paths-to-watch
  "Returns all paths that contain code. These are the paths we should watch."
  (memoize
   (fn all-paths-to-watch* []
     (->> (str (System/getProperty "user.dir") "/deps.edn")
          slurp
          edn/read-string
          :aliases
          vals
          (keep :extra-paths)
          (mapv #(if (coll? %) % [%]))
          (apply concat)
          (map (comp first #(str/split % #"/")))
          (concat ["dev" "src" "test"])
          distinct
          vec))))

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
  (do
    (log/warn "Watching paths:" (all-paths-to-watch))
    (reload/init {:dirs (all-paths-to-watch)})
    (apply (partial beholder/watch watch-fn) (all-paths-to-watch))))

(defn -main "Watcher main function"
  [& _args]
  (user/dev)
  (dev/start!))

(comment

  (beholder/stop watcher)

  )
