(ns metabase.jekyll-mode.file-watcher
  (:require
   [java-time.api :as t]
   [metabase.jekyll-mode.files :as files]
   [metabase.jekyll-mode.load :as load]
   [metabase.jekyll-mode.writeback :as writeback]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [nextjournal.beholder :as beholder])
  (:import
   [java.nio.file Files LinkOption]
   (java.util.concurrent ArrayBlockingQueue Executors LinkedBlockingDeque ScheduledExecutorService TimeUnit)))

(defonce ^:private watcher (atom nil))

(defn stop!
  "Stops the running file watcher, if any.

  This is safe to call even if the watcher is not running."
  []
  (when-let [w @watcher]
    (beholder/stop w)
    (reset! watcher nil)))

(defonce ^:private events (atom []))
(defonce ^:private write-queue (ArrayBlockingQueue. 200))

(defn- writer-thread-fn
  [cb]
  (loop [last-ping nil
         ping-time (.poll write-queue)]
    (let [now (t/instant)]
      (cond
        ping-time
        (recur ping-time (.poll write-queue))

        (and last-ping
             (> (t/time-between last-ping now :millis) 1000))
        (do
          (try
            (cb)
            (catch Exception e
              (log/error e "Error in write process")))
          (recur nil (.take write-queue)))

        :else
        (do
          (Thread/sleep 5)
          (recur last-ping (.poll write-queue)))))))

(defn- start-writer-thread
  [cb]
  (Thread/startVirtualThread
   (fn []
     (#'writer-thread-fn cb))))

(def writer-thread (delay (start-writer-thread
                           (fn [] (println "TEST")))))

(defn- on-file-event [ev]
  (let [dir? (Files/isDirectory (:path ev) (u/varargs LinkOption))]
    (log/infof "File watcher event: %s (dir? %s)" (pr-str ev) (str dir?))
    (swap! events conj ev)
    (when-not dir?
      (case (:type ev)
        :create (log/warn "Heads up: we don't support create yet")
        :modify (try
                  ;; FIXME: Infer the paths from the file.
                  (binding [writeback/*suppress-file-updates* true]
                    (load/load-instance-from-file! (str (:path ev))))
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

  (toucan2.core/update! :model/Card 23 {:name "Another name 12"})
  (toucan2.core/select-one-fn :name :model/Card :id 23)
  (start!))
