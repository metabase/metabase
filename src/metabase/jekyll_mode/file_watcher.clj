(ns metabase.jekyll-mode.file-watcher
  (:require
   [metabase.util.log :as log]
   [nextjournal.beholder :as beholder]))

(defonce ^:private watcher (atom nil))

(defn stop!
  "Stops the running file watcher, if any.

  This is safe to call even if the watcher is not running."
  []
  (when-let [w @watcher]
    (beholder/stop w)
    (reset! watcher nil)))

(defonce ^:private events (atom []))

(defn start!
  "Starts the file watcher. If it's already running, the existing watcher will be stopped first."
  []
  (stop!)
  (log/info "Starting beholder file watcher on local/jekyll/...")
  (reset! watcher (beholder/watch
                   (fn [ev]
                     (log/infof "File watcher event: %s" (pr-str ev))
                     (swap! events conj ev))
                   "local/jekyll")))

(comment
  (deref watcher)
  (start!))
