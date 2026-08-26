(ns metabase.mq.queue.polling
  "Shared poll driver for queue backends. Every poll-based backend (appdb, memory, redis) runs
  the same loop: four maintenance tasks on a fixed cadence, then a `fetch!`/submit pass that
  respins immediately when work was found. The per-backend differences (how a batch is fetched,
  what each maintenance task does) live behind the `QueueBackend` protocol, so the loop
  and its rate-limiting / respin behavior exist in exactly one place."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.polling :as mq.polling]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.concurrency :as q.concurrency]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.settings :as mq.settings]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent ExecutorService Executors)))

(set! *warn-on-reflection* true)

;;; ------------------------------- Worker pool -------------------------------

(def ^:private worker-pool
  "Shared thread pool that runs message delivery off the poll thread, so a slow listener doesn't
  stall polling."
  (atom nil))

(defn start-worker-pool!
  "Starts the shared worker pool for non-blocking message delivery. Idempotent.
  Returns `true` if THIS call created the pool, `false` if one was already running."
  []
  (let [pool (Executors/newCachedThreadPool)]
    (if (compare-and-set! worker-pool nil pool)
      true
      (do (.shutdown ^ExecutorService pool) false))))

(defn shutdown-worker-pool!
  "Shuts down the worker pool, interrupting any deliveries still running, and clears the in-flight
  counts.

  `shutdownNow` interrupts every actively-executing task, so there is nothing to cancel by hand. The
  interrupted deliveries still run their `finally` and release their slots."
  []
  (when-let [^ExecutorService pool @worker-pool]
    (.shutdownNow pool)
    (reset! worker-pool nil))
  (reset! q.concurrency/*in-flight* {}))

(defn- handle-batch-failure!
  "Decides retry vs. permanent failure for a just-failed batch based on its prior failure count, then
  tells the backend to re-enqueue or drop it. No-ops if the backend no longer owns/knows the batch
  (`failure-count` returns nil). `error` is the exception that failed the batch, passed through for
  diagnostic logging; `payload` is the encoded batch, passed through so the shared policy can hand
  the messages to the queue's `:on-error` hook if it drops them."
  [backend channel payload batch-id error]
  (when-let [failures (q.backend/failure-count backend channel batch-id)]
    (q.impl/handle-batch-failure-policy! channel payload failures error
                                         #(q.backend/retry-batch! backend channel batch-id)
                                         #(q.backend/fail-batch! backend channel batch-id))))

(defn- deliver-and-ack!
  "Worker-thread body for one fetched batch: run the shared delivery core, then ack or nack the stored
  batch based on the outcome. A delivered or undecodable batch is acked (removed from the store); a
  failed batch runs the retry/drop policy; a batch whose listener has vanished is left in place for
  the stale-recovery sweep to re-drive later. `batch-id`/`backend` are nil in tests that only exercise
  the busy-slot bookkeeping."
  [channel payload batch-id backend]
  (let [result (mq.impl/deliver! channel payload)]
    (cond
      (= mq.impl/no-listener result) nil
      (instance? Throwable result) (when batch-id (handle-batch-failure! backend channel payload batch-id result))
      :else (when batch-id (q.backend/batch-successful! backend channel batch-id)))))

(defn submit-delivery!
  "Submits one fetched batch to the worker pool for non-blocking delivery."
  [channel payload batch-id backend]
  (q.concurrency/submit-with-slot!
   channel
   @worker-pool
   #(deliver-and-ack! channel payload batch-id backend)
   ;; Runs once the slot is released: a freed slot may mean there's room to fetch more, so re-drive the
   ;; poll loop rather than waiting out its idle interval.
   mq.polling/notify-all!))

(def ^:private stale-check-interval-ms (* 60 1000))
(def ^:private heartbeat-interval-ms (* 2 60 1000))
(def ^:private depth-gauge-interval-ms (* 30 1000))

(def ^:private stale-processing-timeout-ms
  "How long a batch can sit in-flight (delivered but unacked / 'processing') before it's assumed
  to belong to a crashed consumer and is recovered."
  (* 10 60 1000))

(defn- report-depths!
  "Emits a `:metabase-mq/queue-depth` gauge for each `{:channel :status :count}` the backend
  reports. Centralized here so backends only produce depth data, not metrics."
  [backend backend-name]
  (doseq [{:keys [channel status count]} (q.backend/queue-depths backend)]
    (analytics/set-gauge! :metabase-mq/queue-depth {:backend backend-name :channel channel :status status} count)))

(defn- run-recover-stale!
  "Runs the backend's stale-batch recovery and emits the resulting metrics + logs. The backend
  returns a seq of `{:channel :recovered :failed}` (batches re-queued for retry vs. dropped after
  exhausting retries); doing the analytics/logging here keeps them consistent across backends."
  [backend backend-name]
  (when-let [results (seq (q.backend/recover-stale! backend stale-processing-timeout-ms
                                                    (mq.settings/queue-max-retries)))]
    (let [total-recovered (reduce + 0 (keep :recovered results))
          total-failed    (reduce + 0 (keep :failed results))]
      (when (pos? total-recovered)
        (log/warnf "Recovered %d stale batch(es)" total-recovered))
      (when (pos? total-failed)
        (log/warnf "Dropped %d stale batch(es) that exhausted retries" total-failed))
      (doseq [{:keys [channel recovered failed]} results]
        (when (and recovered (pos? recovered))
          (analytics/inc! :metabase-mq/batch-stale-recoveries
                          {:backend backend-name :transport "queue" :channel channel} recovered))
        (when (and failed (pos? failed))
          (analytics/inc! :metabase-mq/batches-dropped
                          {:channel (name channel) :reason "stale-recovery-exhausted"} failed))))))

(defn notify-on-publish!
  "Wakes the poll loop for `poll-context` so it picks up a freshly published message — unless `channel`
  is already at its concurrency cap, in which case the loop re-checks when one of those deliveries
  finishes and frees a slot. Called by the transport right after `publish!` (the caller reads the
  backend's `:poll-context`).

  No-ops when `poll-context` is nil: push backends (e.g. Quartz) have no poll loop to wake — their
  `publish!` already arranges delivery — so they carry no poll context."
  [poll-context channel]
  (when (and poll-context (not (q.concurrency/at-capacity? channel)))
    (mq.polling/notify! (:poll-state poll-context))))

(defn make-poll-context
  "Creates the per-backend poll state: a unique instance `:id`, the polling thread handle, and the
  rate-limit atoms for each maintenance task. The `:id` identifies this instance when claiming
  work (the appdb row owner / the redis consumer name). Backends hold one of these and pass it to
  [[start!]]; `publish!` wakes the loop via `(mq.polling/notify! (:poll-state ctx))`."
  []
  {:id                  (str (random-uuid))
   :poll-state          (mq.polling/make-poll-state)
   :last-stale-check-ms (atom 0)
   :last-heartbeat-ms   (atom 0)
   :last-depth-gauge-ms (atom 0)})

(defn- free-slots-by-queue
  "The poll driver's shape of [[q.concurrency/takeable-queues]]: queue → how many batches this node may
  still take for it. A queue with no declared cap maps to `nil` — unbounded, take what you have.

  Queues at capacity are absent entirely rather than mapped to 0, so [[q.backend/fetch!]] is never even
  asked about them: a node at its limit on a queue simply doesn't take more of its work, leaving it in
  the store for a node that can run it."
  []
  (into {}
        (map (juxt identity q.concurrency/free-slots))
        (q.concurrency/takeable-queues)))

(defn- poll-iteration!
  "One iteration: run each maintenance task if its interval has elapsed, then fetch and submit up to
  each queue's free-slot count. Returns true if any work was found so the polling thread respins
  immediately."
  [backend {:keys [last-stale-check-ms last-heartbeat-ms last-depth-gauge-ms]}]
  (let [backend-name (name (q.backend/backend-id backend))]
    (mq.polling/periodically! last-stale-check-ms stale-check-interval-ms "stale recovery"
                              #(run-recover-stale! backend backend-name))
    (mq.polling/periodically! last-heartbeat-ms heartbeat-interval-ms "heartbeat"
                              #(q.backend/run-heartbeats! backend))
    (mq.polling/periodically! last-depth-gauge-ms depth-gauge-interval-ms "depth gauge"
                              #(report-depths! backend backend-name))
    (let [found? (boolean
                  (when-let [wanted (not-empty (free-slots-by-queue))]
                    (when-let [batches (seq (q.backend/fetch! backend wanted))]
                      (doseq [{:keys [queue payload batch-id]} batches]
                        (submit-delivery! queue payload batch-id backend))
                      true)))]
      (analytics/inc! :metabase-mq/queue-poll-results {:backend backend-name :result (if found? "work" "empty")})
      found?)))

(defn start!
  "Starts the polling thread for `backend`, driving [[poll-iteration!]] every `wait-ms` (and
  immediately whenever it finds work or `publish!` calls `notify!`). Idempotent."
  [backend poll-context label wait-ms]
  (mq.polling/start-polling! (:poll-state poll-context) label wait-ms #(poll-iteration! backend poll-context)))

(defn stop!
  "Stops the polling thread for `poll-context`."
  [poll-context label]
  (mq.polling/stop-polling! (:poll-state poll-context) label))
