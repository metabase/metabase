(ns metabase.sidecar.watcher
  "Watches a directory tree for file changes and triggers a callback after a
  debounce period. Used in sidecar mode to re-import serdes data when files
  change on disk (e.g. from a `git pull`)."
  (:require
   [clojure.java.io :as io]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (java.nio.file ClosedWatchServiceException FileSystems Path
                  StandardWatchEventKinds WatchEvent$Kind WatchService)))

(set! *warn-on-reflection* true)

(defn- register-recursive!
  "Register all directories under `root` (inclusive) with `watcher` for
  CREATE, MODIFY, and DELETE events."
  [^WatchService watcher ^File root]
  (doseq [^File dir (filter #(.isDirectory ^File %) (file-seq root))]
    (try
      (.register (.toPath dir) watcher
                 (into-array WatchEvent$Kind
                             [StandardWatchEventKinds/ENTRY_CREATE
                              StandardWatchEventKinds/ENTRY_MODIFY
                              StandardWatchEventKinds/ENTRY_DELETE]))
      (catch Exception e
        (log/debugf e "Failed to register watcher for directory: %s" dir)))))

(defn- watcher-thread
  "Blocks on WatchService events, updating `last-change-time` on any file event.
  When a new directory is created, registers it with the watcher too."
  [^WatchService watcher state-atom ^File root-dir]
  (loop []
    (when (:running? @state-atom)
      (let [key (try
                  (.take watcher)
                  (catch ClosedWatchServiceException _
                    nil)
                  (catch Exception e
                    (log/warnf e "Unexpected error in sidecar file watcher")
                    nil))]
        (when key
          (try
            (doseq [event (.pollEvents key)]
              (let [context (.context event)
                    kind    (.kind event)]
                ;; If a new directory was created, register it
                (when (and (= kind StandardWatchEventKinds/ENTRY_CREATE)
                           (instance? Path context))
                  (let [^Path dir-path (.watchable key)
                        child-path (.resolve dir-path ^Path context)
                        child-file (.toFile child-path)]
                    (when (.isDirectory child-file)
                      (register-recursive! watcher child-file))))))
            ;; Mark that a change happened
            (swap! state-atom assoc :last-change-time (System/currentTimeMillis))
            (catch Exception e
              (log/warnf e "Error processing file watcher events")))
          (.reset key)
          (recur))))))

(defn- debounce-thread
  "Polls `state-atom` every 500ms. When `last-change-time` is set and more than
  `debounce-ms` ago, resets it and calls `on-change`."
  [state-atom on-change debounce-ms]
  (loop []
    (when (:running? @state-atom)
      (Thread/sleep 500)
      (let [{:keys [last-change-time]} @state-atom]
        (when (and last-change-time
                   (> (- (System/currentTimeMillis) ^long last-change-time)
                      ^long debounce-ms))
          (swap! state-atom assoc :last-change-time nil)
          (try
            (on-change)
            (catch Exception e
              (log/errorf e "Error in sidecar watcher on-change callback")))))
      (recur))))

(defn start-watcher!
  "Start watching `dir-path` recursively for file changes. Calls `on-change`
  after `debounce-ms` (default 2000) of quiet. Returns a state atom that should
  be passed to [[stop-watcher!]] to clean up."
  ([dir-path on-change]
   (start-watcher! dir-path on-change 2000))
  ([dir-path on-change debounce-ms]
   (let [root-dir (io/file dir-path)
         watcher  (.newWatchService (FileSystems/getDefault))
         state    (atom {:watcher          watcher
                         :running?         true
                         :last-change-time nil})]
     (register-recursive! watcher root-dir)
     (log/infof "Starting sidecar file watcher on %s (debounce %dms)" dir-path debounce-ms)
     ;; Watcher thread — blocks on OS-level file events
     (doto (Thread. ^Runnable #(watcher-thread watcher state root-dir)
                    "sidecar-file-watcher")
       (.setDaemon true)
       (.start))
     ;; Debounce thread — polls for quiet period then triggers callback
     (doto (Thread. ^Runnable #(debounce-thread state on-change debounce-ms)
                    "sidecar-file-watcher-debounce")
       (.setDaemon true)
       (.start))
     state)))

(defn stop-watcher!
  "Stop the file watcher and its debounce thread."
  [state-atom]
  (log/info "Stopping sidecar file watcher")
  (swap! state-atom assoc :running? false)
  (when-let [^WatchService watcher (:watcher @state-atom)]
    (try
      (.close watcher)
      (catch Exception e
        (log/debugf e "Error closing WatchService")))))
