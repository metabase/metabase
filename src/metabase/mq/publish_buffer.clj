(ns metabase.mq.publish-buffer
  "Publish buffering: batches rapid-fire publishes into time-windowed groups
   and flushes them on a background scheduled thread."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.mq.transport :as transport]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Executors ScheduledExecutorService ThreadFactory TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:dynamic *publish-buffer-ms*
  "Time window in ms to buffer rapid-fire publishes. 0 = immediate publish.
   Resets on every new message (sliding window)."
  100)

(def ^:dynamic *publish-buffer-max-ms*
  "Maximum time in ms since the first message before a flush is forced. 0 = no max."
  5000)

(def ^:dynamic *publish-buffer-max-retries*
  "Maximum number of flush attempts before messages are dropped. 0 = unlimited retries."
  10)

(def ^:dynamic *publish-buffer*
  "Global buffer for buffering publishes.
   channel → {:messages [...] :deadline-ms long :created-ms long :retries int}"
  (atom {}))

(defn buffered-publish!
  "Routes messages through *publish-buffer* or publishes immediately based on *publish-buffer-ms*.
   The background flush thread handles actual delivery."
  [channel messages]
  (if (zero? *publish-buffer-ms*)
    (transport/publish! channel messages)
    (swap! *publish-buffer*
           (fn [buf]
             (let [now (System/currentTimeMillis)]
               (update buf channel
                       (fn [entry]
                         (-> (or entry {:messages [] :deadline-ms 0 :created-ms now})
                             (update :messages into messages)
                             (assoc :deadline-ms (+ now *publish-buffer-ms*))))))))))

(defn flush-publish-buffer!
  "Drains publish buffer entries past their deadline."
  []
  (doseq [[channel entry] @*publish-buffer*]
    (analytics/set! :metabase-mq/publish-buffer-depth
                    {:channel (name channel)}
                    (count (:messages entry))))
  (doseq [channel (keys @*publish-buffer*)]
    (let [drained (atom nil)]
      (swap! *publish-buffer*
             (fn [buf]
               (if-let [{:keys [deadline-ms created-ms] :as entry} (get buf channel)]
                 (let [now (System/currentTimeMillis)]
                   (if (or (and (pos? deadline-ms) (>= now deadline-ms))
                           (and (pos? *publish-buffer-max-ms*) (>= now (+ created-ms *publish-buffer-max-ms*))))
                     (do (reset! drained entry) (dissoc buf channel))
                     buf))
                 buf)))
      (when-let [{:keys [messages] :as entry} @drained]
        (try (transport/publish! channel messages)
             (catch Exception e
               (let [retries (inc (:retries entry 0))]
                 (analytics/inc! :metabase-mq/publish-buffer-flush-errors {:channel (name channel)})
                 (if (and (pos? *publish-buffer-max-retries*) (>= retries *publish-buffer-max-retries*))
                   (log/warnf "Dropping %d messages for %s after %d flush failures: %s"
                              (count messages) channel retries (ex-message e))
                   (do
                     (log/error e "Error flushing publish buffer, re-buffering"
                                {:channel channel :retries retries})
                     ;; Put messages back into the buffer for retry on next flush cycle
                     (swap! *publish-buffer*
                            (fn [buf]
                              (update buf channel
                                      (fn [existing]
                                        (if existing
                                          (-> existing
                                              (update :messages into messages)
                                              (update :retries (fnil max 0) retries))
                                          (assoc entry
                                                 :deadline-ms (+ (System/currentTimeMillis) *publish-buffer-ms*)
                                                 :retries retries)))))))))))))))

(defonce ^:private publish-buffer-executor (atom nil))

(defn start-publish-buffer-flush!
  "Starts a daemon thread that flushes the publish buffer every 100ms."
  []
  (let [exec (Executors/newSingleThreadScheduledExecutor
              (reify ThreadFactory
                (newThread [_ r]
                  (doto (Thread. r "mq-publish-buffer-flush")
                    (.setDaemon true)))))]
    (if (compare-and-set! publish-buffer-executor nil exec)
      (.scheduleAtFixedRate exec ^Runnable flush-publish-buffer! 100 100 TimeUnit/MILLISECONDS)
      (.shutdown exec))))

(defn stop-publish-buffer-flush!
  "Stops the publish buffer flush thread and drains remaining entries."
  []
  (when-let [^ScheduledExecutorService exec
             (first (reset-vals! publish-buffer-executor nil))]
    (.shutdownNow exec))
  (flush-publish-buffer!))
