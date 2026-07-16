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
   [metabase.mq.quartz-affinity :as quartz-affinity]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.concurrency :as q.concurrency]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.task.bootstrap :as task.bootstrap]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.util Date)
   (org.quartz JobDetail JobExecutionContext JobExecutionException Scheduler SimpleScheduleBuilder)))

(set! *warn-on-reflection* true)

(def backend-id
  "This backend's identifier, registered with `metabase.mq.init`; its `name` labels metrics."
  :queue.backend/quartz)

;; Install the queue node-affinity DriverDelegate when Quartz's JDBC properties are set. Registered at
;; load time, and here rather than in `metabase.mq.init`, because it is a property of *this* backend —
;; init has no business knowing that one backend swaps out a Quartz internal. (`mq` depends on `task`,
;; not the reverse, so `task.bootstrap` calls back into this rather than referencing `mq`.)
;; install-delegate! falls back to the plain per-DB delegate if the affinity subclass can't be loaded.
(task.bootstrap/register-jdbc-property-setter! quartz-affinity/install-delegate!)

(def ^:private job-group
  "Quartz group every queue job/trigger lives in, so they're easy to isolate from the rest of the
  scheduler's jobs."
  "metabase.mq.queue")

;; Job-data keys. All values are stored as strings so the data map round-trips through the JDBC
;; JobStore regardless of the `org.quartz.jobStore.useProperties` setting.
(def ^:private data-queue    "queue")
(def ^:private data-payload  "payload")
(def ^:private data-attempt  "attempt")

(defn retry-delay-ms
  "Backoff (ms) before redelivering a failed batch on its 1-based `attempt`-th retry: 1s, 2s, 4s …
  capped at 60s so a permanently-flaky listener doesn't push redelivery arbitrarily far out.
  Redefable in tests that want immediate retries."
  [attempt]
  (min 60000 (* 1000 (long (Math/pow 2 (dec attempt))))))

(def ^:private ^Long refire-backoff-ms
  "Brief pause before asking Quartz to refire this job in place after a failed hand-off.
  Refiring with no delay would hot-loop the worker thread while the DB is down"
  10000)

(defn- backoff-before-refire!
  []
  (try
    (Thread/sleep refire-backoff-ms)
    (catch InterruptedException _
      (.interrupt (Thread/currentThread)))))

(defn- queue-job-key [queue]
  (jobs/key (name queue) job-group))

(defn- ignore-misfire-schedule
  "One-shot simple schedule with `MISFIRE_INSTRUCTION_IGNORE_MISFIRE_POLICY`. Queue triggers use this
  so a trigger no node with a listener has picked up yet stays `WAITING` and always-acquirable (rather than
  being re-dated or dropped by Quartz's misfire recovery) until a capable node acquires it — or the
  age reaper ([[metabase.mq.task.queue-reaper]]) removes it. It also keeps such triggers out of the
  misfire-scan queries entirely."
  ^SimpleScheduleBuilder []
  (.withMisfireHandlingInstructionIgnoreMisfires (SimpleScheduleBuilder/simpleSchedule)))

(defn- schedule-message-trigger!
  "Adds a one-shot trigger to `queue`'s durable job (which must already exist) that fires at `start-at`,
  carrying `payload` and the retry `attempt` counter in the trigger's data map."
  [^Scheduler scheduler queue payload attempt ^Date start-at]
  (.scheduleJob scheduler
                (triggers/build
                 (triggers/with-identity (triggers/key (str (random-uuid)) job-group))
                 (triggers/for-job (queue-job-key queue))
                 (triggers/start-at start-at)
                 (triggers/with-schedule (ignore-misfire-schedule))
                 (triggers/using-job-data {data-payload payload
                                           data-attempt (str attempt)}))))

(defn- requeue-no-listener!
  "Handles a fired batch for a queue with no listener running on *this* node — with node-affinity, the
  rare race where the listener was torn down between acquisition and execution.

  We must *re-schedule* not refire: a refire re-runs on THIS node and bypasses acquisition, so it would
  loop here until node shutdown and never reach a capable node.

  The re-queued trigger keeps the batch's original `start-at` instead of taking `now`. The age reaper
  ([[metabase.mq.task.queue-reaper]]) gives up on a never-acquired queue trigger by its `start_time`,
  and a bounce writes a *fresh* trigger — so stamping `now` would reset the message's reaper clock on
  every bounce, and a message nobody can handle could never age out. That is exactly the message the
  reaper exists to drop, and nothing else bounds this path: a bounce carries no backoff and spends no
  retry budget. An already-due `start-at` is also what we want on the way out: the batch should reach
  a capable node as soon as one asks for work."
  [^Scheduler scheduler queue payload attempt ^Date start-at]
  (analytics/inc! :metabase-mq/batches-retried {:channel (name queue) :reason "no-listener"})
  (log/debugf "Queue %s has no listener on this node; re-queuing for a node that does." queue)
  (schedule-message-trigger! scheduler queue payload attempt start-at))

;;; ------------------------------------ Waking the acquire loop ------------------------------------

(task/defjob ^{:doc "Never fires. Exists only to give [[wake-scheduler!]] a durable job key to call
                     `resumeJob` on."}
  QueueSlotNudgeJob
  [_ctx])

(def ^:private nudge-job-key (jobs/key "queue-slot-nudge" job-group))

(defonce ^:private nudge-job-ensured? (atom false))

(defn- ensure-nudge-job!
  "Idempotently creates the durable, trigger-less job that [[wake-scheduler!]] pokes."
  [^Scheduler scheduler]
  (when-not @nudge-job-ensured?
    (.addJob scheduler
             (jobs/build
              (jobs/of-type QueueSlotNudgeJob)
              (jobs/with-identity nudge-job-key)
              (jobs/store-durably))
             true)
    (reset! nudge-job-ensured? true)))

(defn- wake-scheduler!
  "Tells Quartz's trigger-acquisition loop to look again, right now.

  This is *required* for `:max-concurrent-batches` to work, not an optimization. Once the acquisition
  filter excludes a queue we're at capacity on, the scheduler thread finds nothing to acquire and
  parks on its `sigLock` for up to `idleWaitTime` (30s by default) — and nothing wakes it when one of
  our batches finishes and frees a slot, because Quartz only signals on completion for
  `@DisallowConcurrentExecution` jobs. Without this poke a capped queue would drain N batches, sleep
  30s, drain N more.

  `resumeJob` is the cheapest *public* API that signals that loop: `QuartzScheduler.resumeJob` ends in
  `notifySchedulerThread(0L)`, which is exactly the signal the acquire loop is waiting on. We aim it at
  a job with no triggers, so the resume itself has nothing to resume and the whole call is a zero-row
  no-op — we are calling it purely for that side effect on the scheduler thread."
  [^Scheduler scheduler queue]
  (when (q.registry/max-concurrent-batches queue)
    (try
      (ensure-nudge-job! scheduler)
      (.resumeJob scheduler nudge-job-key)
      (catch Throwable t
        (log/debugf t "Could not wake the Quartz acquire loop after freeing a slot on %s" queue)))))

(defn- deliver-batch!
  "Shared job body. Reads the merged job+trigger data and dispatches on the delivery result:

    - no listener for the queue is running on *this* node - have to reschedule.
    - the listener threw - reschedule a fresh trigger (attempt+1, backoff), or drop once
      `queue-max-retries` is reached.
    - delivered (or an undecodable payload that was dropped) — nothing more to do.

  The body only returns normally (letting Quartz complete the one-shot trigger) once the message has
  been delivered or its retry/requeue is *durably committed*. If instead our own hand-off fails —
  the reschedule can't be written because the scheduler's DB is momentarily unavailable — we throw a
  `JobExecutionException` with `refireImmediately`, so Quartz re-runs this exact job now rather than treating
  the one-shot as done and dropping the batch. The goal is to leave no window where Quartz considers the job finished
  but the message hasn't been handed off. A refire re-runs with the same job data, so `attempt` is
  unchanged — a refire doesn't burn the retry budget.

  Rescheduling uses `(.getScheduler ctx)` rather than the dynamic `(task/scheduler)`, which isn't bound
  on Quartz's worker threads; in a cluster the retry lands in the shared JDBC store so any node can
  pick it up."
  [^JobExecutionContext ctx]
  (let [data      (.getMergedJobDataMap ctx)
        queue     (keyword "queue" (.getString data data-queue))
        payload   (.getString data data-payload)
        attempt   (Integer/parseInt (or (.getString data data-attempt) "0"))
        scheduler (.getScheduler ctx)]
    (try
      (q.concurrency/with-slot queue
        (let [result (mq.impl/deliver! queue payload)]
          (cond
            (= mq.impl/no-listener result)
            ;; read the trigger lazily — only this path needs it
            (requeue-no-listener! scheduler queue payload attempt
                                  (.getStartTime (.getTrigger ctx)))

            (instance? Throwable result)
            (let [next-attempt (inc attempt)]
              (q.impl/handle-batch-failure-policy!
               queue payload attempt result
               #(schedule-message-trigger! scheduler queue payload next-attempt
                                           (Date. (long (+ (System/currentTimeMillis) (retry-delay-ms next-attempt)))))
               (constantly nil))))))
      ;; `with-slot` has returned, so the slot is already released — and a freed slot is invisible to
      ;; Quartz's acquire loop, which may be parked for up to `idleWaitTime` with this queue filtered
      ;; out. Tell it to look again. (Waking *before* the release would be pointless: the loop would
      ;; re-check, still see us at capacity, and park again.)
      (wake-scheduler! scheduler queue)
      ;; Delivered, or the retry/requeue is durably committed. Return nil so Quartz completes the
      ;; one-shot trigger.
      nil
      (catch Throwable t
        ;; We couldn't hand the message off (couldn't schedule the retry, etc.). Don't let Quartz drop
        ;; the fired one-shot — have it re-run this job instead. `with-slot` has already released the
        ;; slot on its way out, so the refire won't find the queue at capacity because of us.
        (backoff-before-refire!)
        (throw (doto (JobExecutionException. t) (.setRefireImmediately true)))))))

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

;;; ------------------------------------ Node affinity (acquisition) ------------------------------------

(defn capable-queue-names
  "The queue names this node is willing to acquire triggers for *right now* — the set the affinity
  delegate splices into Quartz's acquire query.

  Quartz's shape of the backend-agnostic [[q.concurrency/takeable-queues]]: strings, because that's what
  a Quartz job is named. A queue drops out for having no listener here or for being at its
  `:max-concurrent-batches`, which mean the same thing to the acquisition filter — don't take this work,
  leave it in the shared store for a node that can run it.

  Called on every acquire, so a listener registering and a slot freeing up both take effect at once."
  []
  (into #{} (map name) (q.concurrency/takeable-queues)))

(defrecord QuartzQueueBackend []
  q.backend/QueueBackend
  (backend-id [_this] backend-id)

  (publish! [_this queue payload]
    ;; A nil scheduler (e.g. MB_DISABLE_SCHEDULER, or during shutdown) must be a hard failure, not a
    ;; silent no-op: the transactional outbox relies on a thrown exception to keep its row for the
    ;; recovery sweep, and the publish buffer relies on it to retry / loudly drop. Returning nil
    ;; here would silently lose the message.
    (if-let [scheduler (task/scheduler)]
      (try
        (ensure-queue-job! scheduler queue (q.registry/exclusive? queue))
        (schedule-message-trigger! scheduler queue payload 0 (Date.))
        (catch Throwable t
          (throw (q.backend/backend-unavailable-ex
                  (format "Failed to publish to queue %s: the Quartz scheduler/store is unavailable." queue)
                  {:queue queue :backend backend-id} t))))
      (throw (q.backend/backend-unavailable-ex
              (format "Cannot publish to queue %s: the Quartz task scheduler is not running (is MB_DISABLE_SCHEDULER set?)."
                      queue)
              {:queue queue :backend backend-id}))))

  ;; There is no poll loop to start. What this backend *does* need at startup is its node-affinity
  ;; filter: tell the delegate which queues we'll acquire triggers for. That is a Quartz-specific
  ;; acquisition strategy, so it's wired here rather than in `metabase.mq.init` — the init ns shouldn't
  ;; have to know that one particular backend gates its own intake.
  (start! [_this]
    (quartz-affinity/set-capability-fn! capable-queue-names))

  (shutdown! [_this])

  ;; Push backend — Quartz drives everything below, so these poll-driver hooks are never invoked
  ;; (the poll loop is never started) and exist only to satisfy the protocol.
  (fetch! [_this _queue->free-slots] nil)
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
