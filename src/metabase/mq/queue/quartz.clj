(ns metabase.mq.queue.quartz
  "Push-based queue backend built on Quartz.

  Every declared queue gets one durable Quartz job (keyed by the queue name); each published batch
  is a one-shot *trigger* on that job, carrying the encoded payload in the trigger's data map.
  Quartz's clustered JDBC JobStore (the `QRTZ_*` tables) is the durable, cross-node queue and
  Quartz's worker threads *push* delivery — there is no poll loop, no storage table of our own, and
  no lease/heartbeat. The poll-shaped `QueueBackend` hooks (`fetch!`, `recover-stale!`,
  `run-heartbeats!`, ack/nack, depth) are therefore no-ops; their responsibilities are owned by
  Quartz instead:

    - delivery       — the scheduler fires the queue's job on a worker thread, once per trigger
    - retry          — a failed batch reschedules itself (a fresh trigger) with backoff up to
                       `queue-max-retries`
    - durability     — the JDBC JobStore persists the trigger until it fires successfully
    - crash recovery — `requestRecovery` re-fires a job interrupted by a node crash on another node
                       (at-least-once)

  Like the other backends this delivers at-least-once, so listeners must be idempotent.

  Exclusive queues: a queue declared `{:exclusive true}` uses a job class annotated
  `@DisallowConcurrentExecution`, which Quartz honors cluster-wide — at most one batch for that
  queue executes at a time across the whole cluster (one thread on one node). Because all of a
  queue's messages are triggers on a *single* per-queue job, the annotation (which keys on job
  identity) serializes them. Non-exclusive queues use a plain job class and run concurrently up to
  the Quartz thread pool. This is mutual exclusion, not ordering — Quartz does not fire blocked
  triggers in submission order."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.analytics-interface.core :as analytics]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.settings :as mq.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.util Date)
   (org.quartz JobDetail JobExecutionContext Scheduler)))

(set! *warn-on-reflection* true)

(def backend-id
  "This backend's identifier, registered with `metabase.mq.init`; its `name` labels metrics."
  :queue.backend/quartz)

(def ^:private job-group
  "Quartz group every queue job/trigger lives in, so they're easy to isolate from the rest of the
  scheduler's jobs."
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

(defn- queue-job-key [queue]
  (jobs/key (name queue) job-group))

(defn- schedule-message-trigger!
  "Adds a one-shot trigger to `queue`'s durable job (which must already exist) that fires at
  `start-at`, carrying `payload` and the retry `attempt` counter in the trigger's data map."
  [^Scheduler scheduler queue payload attempt ^Date start-at]
  (.scheduleJob scheduler
                (triggers/build
                 (triggers/with-identity (triggers/key (str (random-uuid)) job-group))
                 (triggers/for-job (queue-job-key queue))
                 (triggers/start-at start-at)
                 (triggers/using-job-data {data-payload payload
                                           data-attempt (str attempt)}))))

(defn- deliver-batch!
  "Shared job body. Reads the merged job+trigger data, delivers the batch, and on listener failure
  reschedules a fresh trigger (attempt+1, backoff) onto the firing scheduler — or drops it once
  `queue-max-retries` is reached. Rescheduling uses `(.getScheduler ctx)` rather than the dynamic
  `(task/scheduler)`, which isn't bound on Quartz's worker threads; in a cluster the retry lands in
  the shared JDBC store so any node can pick it up."
  [^JobExecutionContext ctx]
  (let [data    (.getMergedJobDataMap ctx)
        queue   (keyword "queue" (.getString data data-queue))
        payload (.getString data data-payload)
        attempt (Integer/parseInt (or (.getString data data-attempt) "0"))]
    (when-not (mq.impl/deliver-reporting! queue payload)
      (let [next-attempt (inc attempt)
            labels       {:backend (name backend-id) :channel (name queue)}]
        (if (< next-attempt (mq.settings/queue-max-retries))
          (do
            (analytics/inc! :metabase-mq/queue-batch-retries labels)
            (schedule-message-trigger! (.getScheduler ctx) queue payload next-attempt
                                       (Date. (long (+ (System/currentTimeMillis) (retry-delay-ms next-attempt))))))
          (do
            (log/warnf "Queue batch for %s exhausted retries (%d), dropping"
                       queue (mq.settings/queue-max-retries))
            (analytics/inc! :metabase-mq/queue-batch-permanent-failures labels)))))
    ;; Quartz's Job.execute returns void — the body's tail must be nil for the deftype to compile.
    nil))

(task/defjob ^{:doc "Delivers a queue batch (non-exclusive queues; runs concurrently)."}
  QueueMessageJob
  [ctx]
  (deliver-batch! ctx))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Delivers a batch for an :exclusive queue — at most one execution per queue cluster-wide."}
  ExclusiveQueueMessageJob
  [ctx]
  (deliver-batch! ctx))

(def ^:private ensured-jobs
  "Per-process cache of queues whose durable Quartz job has been created, keyed by
  `[queue exclusive?]`, so we don't re-issue `addJob` on every publish. Safe as a process-lifetime
  cache: production runs one persistent (JDBC) scheduler whose durable jobs survive restarts, and a
  change to a queue's `:exclusive` flag re-ensures under the new key ([[ensure-queue-job!]] then
  upgrades a concurrent job to exclusive, but never downgrades)."
  (atom #{}))

(defn- exclusive-job?
  "True if `job` is the `@DisallowConcurrentExecution` (exclusive) job class."
  [^JobDetail job]
  (= ExclusiveQueueMessageJob (.getJobClass job)))

(defn- ensure-queue-job!
  "Idempotently creates `queue`'s durable job — a `@DisallowConcurrentExecution` job when
  `exclusive?`, otherwise a plain concurrent one. The job carries no payload (messages are triggers
  on it), so it is durable (persists across the gaps between messages) and requests recovery
  (re-fires interrupted work after a crash).

  When the job already exists, exclusivity is treated as *sticky*: a concurrent job is upgraded to
  exclusive, but an exclusive job is never downgraded to concurrent. This keeps a node that
  disagrees about a queue's `:exclusive` flag (e.g. mid rolling deploy, where nodes run different
  code) from weakening another node's cluster-wide mutual-exclusion guarantee by flipping the
  shared job class back and forth.
  If we ever want to actually change a queue to be non-exclusive, we will need a way to handle that."
  [^Scheduler scheduler queue exclusive?]
  (when-not (contains? @ensured-jobs [queue exclusive?])
    (let [existing (.getJobDetail scheduler (queue-job-key queue))]
      (when (or (nil? existing)
                (and exclusive? (not (exclusive-job? existing))))
        (.addJob scheduler
                 (jobs/build
                  (jobs/of-type (if exclusive? ExclusiveQueueMessageJob QueueMessageJob))
                  (jobs/with-identity (queue-job-key queue))
                  (jobs/store-durably)
                  (jobs/request-recovery)
                  (jobs/using-job-data {data-queue (name queue)}))
                 true)))
    (swap! ensured-jobs conj [queue exclusive?])))

(defrecord QuartzQueueBackend []
  q.backend/QueueBackend
  (backend-id [_this] backend-id)

  (publish! [_this queue payload]
    ;; A nil scheduler (e.g. MB_DISABLE_SCHEDULER, or during shutdown) must be a hard failure, not a
    ;; silent no-op: the transactional outbox relies on a thrown exception to keep its row for the
    ;; recovery sweep, and the publish buffer relies on it to retry / loudly drop. Returning nil
    ;; here would silently lose the message.
    (if-let [scheduler (task/scheduler)]
      (do
        (ensure-queue-job! scheduler queue (q.registry/exclusive? queue))
        (schedule-message-trigger! scheduler queue payload 0 (Date.)))
      (throw (ex-info (format "Cannot publish to queue %s: the Quartz task scheduler is not running (is MB_DISABLE_SCHEDULER set?)."
                              queue)
                      {:queue queue :backend backend-id}))))

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
