(ns metabase.mq.publish-buffer
  "Publish buffering: batches rapid-fire publishes into time-windowed groups
   and flushes them on a background scheduled thread."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.mq.queue.registry :as q.registry]
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

(def ^:dynamic *publish-buffer-retry-base-ms*
  "Base delay for the exponential backoff between failed flush attempts: the first retry waits this
   long, and each subsequent retry doubles (capped at `*publish-buffer-retry-max-ms*`)."
  100)

(def ^:dynamic *publish-buffer-retry-max-ms*
  "Upper bound on the exponential flush-retry backoff, so a permanently-failing backend doesn't push
   the next retry arbitrarily far out."
  30000)

(defn- flush-retry-backoff-ms
  [retries]
  (min *publish-buffer-retry-max-ms*
       (long (* *publish-buffer-retry-base-ms* (Math/pow 2 (dec retries))))))

(def ^:dynamic *publish-buffer*
  "Global buffer for buffering publishes.
   channel → {:messages [...] :deadline-ms long :created-ms long :retries int}"
  (atom {}))

(defn- max-batch-size [channel]
  (q.registry/max-batch-messages channel))

(defn buffered-publish!
  "Routes messages through *publish-buffer* or publishes immediately based on `*publish-buffer-ms*`.

   The sync path (when `*publish-buffer-ms*` is 0) splits `messages` into chunks of
   `:max-batch-messages` before handing them to the transport.

   The buffered path appends to the buffer and, if buffering pushes the channel's queued
   count to or past `:max-batch-messages`, trips the channel's deadline so the next tick
   of the background flush executor drains it. The actual flush stays on the executor
   thread — publisher threads never block on backend writes."
  [channel messages]
  (let [max-size (max-batch-size channel)]
    (if (zero? *publish-buffer-ms*)
      (doseq [chunk (partition-all max-size messages)]
        (transport/publish! channel (vec chunk)))
      (let [[_ new] (swap-vals! *publish-buffer*
                                (fn [buf]
                                  (let [now (System/currentTimeMillis)]
                                    (update buf channel
                                            (fn [entry]
                                              (-> (or entry {:messages [] :deadline-ms 0 :created-ms now})
                                                  (update :messages into messages)
                                                  (assoc :deadline-ms (+ now *publish-buffer-ms*))))))))]
        (when (>= (count (get-in new [channel :messages])) max-size)
          ;; Buffer reached the per-channel max-batch limit. Trip its deadline so the next
          ;; background flush tick drains it. Other channels' deadlines are left untouched.
          ;; The publisher does not flush synchronously — that would block on a backend write.
          (swap! *publish-buffer*
                 (fn [buf] (cond-> buf (contains? buf channel) (assoc-in [channel :deadline-ms] 1)))))))))

(defn flush-publish-buffer!
  "Drains publish buffer entries past their deadline.
   When `force?` is true (used by the graceful-shutdown path), every entry is drained
   regardless of its deadline so no buffered messages are dropped on shutdown."
  ([] (flush-publish-buffer! false))
  ([force?]
   (doseq [[channel entry] @*publish-buffer*]
     (analytics/set-gauge! :metabase-mq/publish-buffer-depth
                           {:channel (name channel)}
                           (count (:messages entry))))
   (doseq [channel (keys @*publish-buffer*)]
     (let [drained (atom nil)]
       (swap! *publish-buffer*
              (fn [buf]
                (if-let [{:keys [deadline-ms created-ms retries] :as entry} (get buf channel)]
                  (let [now       (System/currentTimeMillis)
                        retrying? (pos? (or retries 0))]
                    (if (or force?
                            (and (pos? deadline-ms) (>= now deadline-ms))
                            (and (not retrying?)
                                 (pos? *publish-buffer-max-ms*) (>= now (+ created-ms *publish-buffer-max-ms*))))
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
                    (let [backoff  (flush-retry-backoff-ms retries)
                          deadline (+ (System/currentTimeMillis) backoff)]
                      (log/errorf e "Error flushing publish buffer for %s, retrying in %dms (attempt %d)"
                                  channel backoff retries)
                      ;; Put messages back into the buffer for a later flush cycle.
                      (swap! *publish-buffer*
                             (fn [buf]
                               (update buf channel
                                       (fn [existing]
                                         (if existing
                                           (-> existing
                                               ;; Prepend the failed batch so retried (older) messages
                                               ;; are published before messages that arrived during the
                                               ;; flush — preserves publish order across retries.
                                               (update :messages #(into (vec messages) %))
                                               (assoc :deadline-ms deadline)
                                               (update :retries (fnil max 0) retries))
                                           (assoc entry
                                                  :deadline-ms deadline
                                                  :retries retries))))))))))))))))

(defonce ^:private publish-buffer-executor (atom nil))

(defn start-publish-buffer-flush!
  "Starts a daemon thread that flushes the publish buffer every 100ms. Idempotent.
  Returns `true` if THIS call created the executor, `false` if one was already running."
  []
  (let [exec (Executors/newSingleThreadScheduledExecutor
              (reify ThreadFactory
                (newThread [_ r]
                  (doto (Thread. r "mq-publish-buffer-flush")
                    (.setDaemon true)))))]
    (if (compare-and-set! publish-buffer-executor nil exec)
      (do (.scheduleAtFixedRate exec ^Runnable flush-publish-buffer! 100 100 TimeUnit/MILLISECONDS)
          true)
      (do (.shutdown exec) false))))

(defn stop-publish-buffer-flush!
  "Stops the publish buffer flush thread and force-drains all remaining entries
   (graceful shutdown — buffered messages are flushed regardless of deadline)."
  []
  (when-let [^ScheduledExecutorService exec
             (first (reset-vals! publish-buffer-executor nil))]
    (.shutdownNow exec))
  (flush-publish-buffer! true))
