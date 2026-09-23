(ns metabase.jekyll-mode.file-watcher
  (:require
   [metabase.jekyll-mode.files :as files]
   [metabase.jekyll-mode.writeback.serialize :as serialize]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [nextjournal.beholder :as beholder])
  (:import
   [java.nio.file Files LinkOption]))

(defonce ^:private watcher (atom nil))

(defn stop!
  "Stops the running file watcher, if any.

  This is safe to call even if the watcher is not running."
  []
  (when-let [w @watcher]
    (beholder/stop w)
    (reset! watcher nil)))

(defonce ^:private events (atom []))

(defn- on-file-event [ev]
  (let [dir? (Files/isDirectory (:path ev) (u/varargs LinkOption))]
    (log/infof "File watcher event: %s (dir? %s)" (pr-str ev) (str dir?))
    (swap! events conj ev)
    (when-not dir?
      (case (:type ev)
        :create (log/warn "Heads up: we don't support create yet")
        :modify (try
                  (log/infof "Output: %s"
                             (pr-str (serialize/deserialize (.toFile (:path ev)))))
                  (catch Exception e
                    (log/error e "IT BROKE")))
        :delete (log/warn "Heads up: we don't support delete yet")))))

(defn start!
  "Starts the file watcher. If it's already running, the existing watcher will be stopped first."
  ([] (start! (files/directory-prefix)))
  ([watched-path]
   (stop!)
   (log/infof "Starting beholder file watcher on %s..." watched-path)
   (reset! watcher (beholder/watch
                    (fn [ev] (#'on-file-event ev))
                    watched-path))))

(comment
  (deref watcher)

  (toucan2.core/update! :model/Card 23 {:name "Another name 8"})
  (start!))
