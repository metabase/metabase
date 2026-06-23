(ns metabase.mq.queue.quartz
  "Push-based queue backend built on Quartz.

  Each published batch is scheduled as a one-shot Quartz job that fires immediately, with the
  encoded payload carried in the job's data map. Quartz's clustered JDBC JobStore (the `QRTZ_*`
  tables) is the durable, cross-node queue, and Quartz's worker threads *push* delivery — there is
  no poll loop, no storage table of our own, and no lease/heartbeat. The poll-shaped
  `QueueBackend` hooks (`fetch!`, `recover-stale!`, `run-heartbeats!`, ack/nack, depth) are
  therefore no-ops; their responsibilities are owned by Quartz instead:

    - delivery       — the scheduler fires [[QueueMessageJob]] on a worker thread
    - retry          — a failed batch reschedules itself with backoff up to `queue-max-retries`
    - durability     — the JDBC JobStore persists the trigger until it fires successfully
    - crash recovery — `requestRecovery` re-fires a job interrupted by a node crash on another node
                       (at-least-once)

  Like the other backends this delivers at-least-once, so listeners must be idempotent.

  Not (yet) supported: `:exclusive` queues. The poll backends enforce at-most-one-in-flight
  cluster-wide via a row lease; with one independent Quartz job per batch there is no per-queue
  serialization point, so exclusivity/ordering is not honored. No queue currently declares
  `:exclusive`, so this is a known gap rather than a regression."
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.analytics-interface.core :as analytics]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.settings :as mq.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.util Date)
   (org.quartz JobExecutionContext Scheduler)))

(set! *warn-on-reflection* true)

(def backend-id
  "This backend's identifier, registered with `metabase.mq.init`; its `name` labels metrics."
  :queue.backend/quartz)

(def ^:private job-group
  "Quartz group every queue-message job/trigger lives in, so they're easy to isolate from the rest
  of the scheduler's jobs."
  "metabase.mq.queue")

;; Job-data keys. All values are stored as strings so the data map round-trips through the JDBC
;; JobStore regardless of the `org.quartz.jobStore.useProperties` setting.
(def ^:private data-queue   "queue")
(def ^:private data-payload "payload")
(def ^:private data-attempt "attempt")

(defn retry-delay-ms
  "Backoff (ms) before redelivering a failed batch on its 1-based `attempt`-th retry: 1s, 2s, 4s …
  capped at 60s so a permanently-flaky listener doesn't push redelivery arbitrarily far out.
  Redefable in tests that want immediate retries."
  [attempt]
  (min 60000 (* 1000 (long (Math/pow 2 (dec attempt))))))

(declare schedule-message-job!)

(task/defjob ^{:doc "Delivers one published queue batch, rescheduling itself on failure."}
  QueueMessageJob
  [ctx]
  (let [^JobExecutionContext ctx ctx
        data    (qc/from-job-data ctx)
        queue   (keyword "queue" (get data data-queue))
        payload (get data data-payload)
        attempt (Integer/parseInt (str (get data data-attempt "0")))]
    (when-not (mq.impl/deliver-reporting! queue payload)
      (let [next-attempt (inc attempt)
            labels       {:backend (name backend-id) :channel (name queue)}]
        (if (< next-attempt (mq.settings/queue-max-retries))
          (do
            (analytics/inc! :metabase-mq/queue-batch-retries labels)
            ;; Reschedule onto the scheduler that fired this job (NOT the dynamic
            ;; `(task/scheduler)`, which isn't bound on Quartz's worker threads). In a cluster the
            ;; retry lands in the shared JDBC store, so any node can pick it up.
            (schedule-message-job! (.getScheduler ctx) queue payload next-attempt
                                   (Date. (long (+ (System/currentTimeMillis) (retry-delay-ms next-attempt))))))
          (do
            (log/warnf "Queue batch for %s exhausted retries (%d), dropping"
                       queue (mq.settings/queue-max-retries))
            (analytics/inc! :metabase-mq/queue-batch-permanent-failures labels)))))
    ;; Quartz's Job.execute returns void — make the body's tail nil so the deftype method compiles.
    nil))

(defn- schedule-message-job!
  "Schedules a one-shot Quartz job on `scheduler` that delivers `payload` to `queue` at `start-at`,
  carrying the retry `attempt` counter (0 on first delivery). `requestRecovery` is set so a node
  crash mid-delivery re-fires the job on another node. No-ops when `scheduler` is nil."
  [^Scheduler scheduler queue payload attempt ^Date start-at]
  (let [id      (str (random-uuid))
        job     (jobs/build
                 (jobs/of-type QueueMessageJob)
                 (jobs/with-identity (jobs/key id job-group))
                 ;; re-fire on another node if the executing node crashes mid-delivery (at-least-once)
                 (jobs/request-recovery)
                 ;; non-durable (the default): the job is removed once its one-shot trigger fires
                 (jobs/using-job-data {data-queue   (name queue)
                                       data-payload payload
                                       data-attempt (str attempt)}))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key id job-group))
                 (triggers/for-job job)
                 (triggers/start-at start-at))]
    (task/schedule-task! scheduler job trigger)))

(defrecord QuartzQueueBackend []
  q.backend/QueueBackend
  (backend-id [_this] backend-id)

  (publish! [_this queue payload]
    (schedule-message-job! (task/scheduler) queue payload 0 (Date.)))

  ;; Push backend — Quartz drives everything below, so these poll-driver hooks are never invoked
  ;; (the poll loop is never started) and exist only to satisfy the protocol.
  (start! [_this])
  (shutdown! [_this])
  (fetch! [_this _available-queues] nil)
  (queue-depths [_this] nil)
  (batch-successful! [_this _queue-name _batch-id] nil)
  (failure-count [_this _queue-name _batch-id] nil)
  (retry-batch! [_this _queue-name _batch-id] nil)
  (fail-batch! [_this _queue-name _batch-id] nil)
  (recover-stale! [_this _stale-timeout-ms _max-retries] nil)
  (run-heartbeats! [_this] nil))

(defn make-backend
  "Constructs a `QuartzQueueBackend`. Stateless — all queue state lives in Quartz — so the
  production [[backend]] singleton and any test-constructed instances are interchangeable."
  []
  (->QuartzQueueBackend))

(def backend
  "Singleton instance of the Quartz queue backend."
  (make-backend))
