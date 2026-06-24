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
  "Accumulation buffer for rapid-fire publishes. Holds only messages that are still gathering into a
   window — never anything mid-retry.
   channel → {:messages [...] :deadline-ms long :created-ms long}"
  (atom {}))

(def ^:dynamic *publish-retry-batches*
  "Frozen batches whose flush failed and that are now retrying on their own backoff, independent of
   the accumulation buffer.

   A vector of {:channel kw :messages [...] :retries int :deadline-ms long}; `:retries` is the number
   of attempts that have already failed."
  (atom []))

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

(defn- handle-flush-failure!
  "Records a failed flush of `messages` on `channel`. `retries` is the number of attempts that have
   now failed (1 on the first failure). Drops the batch (logging) once `*publish-buffer-max-retries*`
   is reached; otherwise freezes it into `*publish-retry-batches*` with an exponential-backoff
   deadline so it retries independently of fresh accumulation."
  [channel messages retries ^Exception e]
  (analytics/inc! :metabase-mq/publish-buffer-flush-errors {:channel (name channel)})
  (if (and (pos? *publish-buffer-max-retries*) (>= retries *publish-buffer-max-retries*))
    (log/warnf "Dropping %d messages for %s after %d flush failures: %s"
               (count messages) channel retries (ex-message e))
    (let [backoff (flush-retry-backoff-ms retries)]
      (log/errorf e "Error flushing publish buffer for %s, retrying in %dms (attempt %d)"
                  channel backoff retries)
      (swap! *publish-retry-batches* conj
             {:channel     channel
              :messages    (vec messages)
              :retries     retries
              :deadline-ms (+ (System/currentTimeMillis) backoff)}))))

(defn- flush-accumulation!
  "Drains accumulation entries past their deadline (or all of them when `force?`) and publishes each.
   An entry is due once its sliding `:deadline-ms` arrives or it has sat for `*publish-buffer-max-ms*`
   since its first message — the latter cap always applies, since retrying batches live elsewhere. A
   failed publish is frozen into `*publish-retry-batches*` rather than re-buffered, so fresh messages
   keep their own window."
  [force?]
  (doseq [channel (keys @*publish-buffer*)]
    (let [drained (atom nil)]
      (swap! *publish-buffer*
             (fn [buf]
               (if-let [{:keys [deadline-ms created-ms] :as entry} (get buf channel)]
                 (let [now (System/currentTimeMillis)]
                   (if (or force?
                           (and (pos? deadline-ms) (>= now deadline-ms))
                           (and (pos? *publish-buffer-max-ms*) (>= now (+ created-ms *publish-buffer-max-ms*))))
                     (do (reset! drained entry) (dissoc buf channel))
                     buf))
                 buf)))
      (when-let [{:keys [messages]} @drained]
        (try (transport/publish! channel messages)
             (catch Exception e
               (handle-flush-failure! channel messages 1 e)))))))

(defn- flush-retry-batches!
  "Re-attempts each frozen retry batch whose backoff deadline has passed (or all of them when
   `force?`). A batch that publishes is dropped from the retry list; one that fails again is
   re-frozen with an incremented attempt count and a longer backoff, or dropped once it exhausts
   `*publish-buffer-max-retries*`."
  [force?]
  (let [now      (System/currentTimeMillis)
        due?     (fn [{:keys [deadline-ms]}] (or force? (>= now deadline-ms)))
        ;; Atomically remove the due batches, leaving the not-yet-due ones in place. Re-attempts that
        ;; fail are conj'd back on by handle-flush-failure!.
        all      (first (swap-vals! *publish-retry-batches* (fn [batches] (vec (remove due? batches)))))]
    (doseq [{:keys [channel messages retries]} (filter due? all)]
      (try (transport/publish! channel messages)
           (catch Exception e
             (handle-flush-failure! channel messages (inc retries) e))))))

(defn flush-publish-buffer!
  "Drains accumulation entries past their deadline and re-attempts any due retry batches.
   When `force?` is true (used by the graceful-shutdown path), every entry and every retry batch is
   drained regardless of deadline so no buffered messages are dropped on shutdown."
  ([] (flush-publish-buffer! false))
  ([force?]
   (doseq [[channel entry] @*publish-buffer*]
     (analytics/set-gauge! :metabase-mq/publish-buffer-depth
                           {:channel (name channel)}
                           (count (:messages entry))))
   ;; Retry batches first so a batch frozen by this tick's accumulation flush waits for the next
   ;; tick (one delivery attempt per batch per flush) rather than being retried in the same call.
   (flush-retry-batches! force?)
   (flush-accumulation! force?)))

(defonce ^:private publish-buffer-executor (atom nil))

(defn- safe-flush!
  "Runs `flush-publish-buffer!` swallowing any throwable. `scheduleAtFixedRate` silently stops
  rescheduling a task that throws an uncaught exception, which would freeze the flusher and stall
  every channel; catching here keeps the periodic task alive across transient flush errors."
  []
  (try
    (flush-publish-buffer!)
    (catch Throwable t
      (log/error t "Unexpected error in publish-buffer flush; flusher continues"))))

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
      (do (.scheduleAtFixedRate exec ^Runnable safe-flush! 100 100 TimeUnit/MILLISECONDS)
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
