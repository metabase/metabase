(ns metabase.mq.queue.quartz-test
  "Tests for the push-based Quartz queue backend. Quartz fires jobs on its own worker threads, so —
  unlike the poll backends exercised via `with-test-mq` — these tests register the listener on the
  root `*listeners*` (the production registration path; Quartz threads don't inherit the test
  thread's dynamic bindings) and drive the backend directly under an in-memory scheduler."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.payload :as payload]
   [metabase.mq.quartz-affinity :as quartz-affinity]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.concurrency :as q.concurrency]
   [metabase.mq.queue.quartz :as q.quartz]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.settings :as mq.settings]
   [metabase.task.core :as task]
   [metabase.task.impl :as task.impl]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures])
  (:import
   (java.time Instant)
   (java.util Date Properties)
   (java.util.concurrent CountDownLatch CyclicBarrier TimeUnit)
   (org.quartz JobDataMap JobDetail JobExecutionContext JobExecutionException JobKey Scheduler Trigger TriggerBuilder)
   (org.quartz.impl StdSchedulerFactory)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- do-with-multithread-scheduler!
  "Runs `thunk` with a fresh in-memory (RAMJobStore) Quartz scheduler bound as the current scheduler,
  using `thread-count` worker threads. `mt/with-temp-scheduler!` only gives one thread, which can't
  demonstrate cross-thread mutual exclusion; this gives enough threads for batches to actually run
  concurrently when allowed."
  [thread-count thunk]
  (let [props     (doto (Properties.)
                    (.setProperty "org.quartz.scheduler.instanceName" (str "mq-quartz-test-" (random-uuid)))
                    (.setProperty "org.quartz.scheduler.skipUpdateCheck" "true")
                    (.setProperty "org.quartz.threadPool.class" "org.quartz.simpl.SimpleThreadPool")
                    (.setProperty "org.quartz.threadPool.threadCount" (str thread-count))
                    (.setProperty "org.quartz.jobStore.class" "org.quartz.simpl.RAMJobStore"))
        scheduler (.getScheduler (StdSchedulerFactory. props))]
    (binding [task.impl/*quartz-scheduler* (atom scheduler)]
      (.start scheduler)
      (try (thunk) (finally (.shutdown scheduler true))))))

(defn- wait-for!
  "Polls `pred` until it returns truthy or `timeout-ms` elapses; returns the final value."
  ([pred] (wait-for! pred 5000))
  ([pred timeout-ms]
   (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
     (loop []
       (or (pred)
           (when (< (System/currentTimeMillis) deadline)
             (Thread/sleep 10)
             (recur)))))))

(defn- do-with-queue!
  "Registers `queue` (with a listener) on the root registry/listeners for the duration of `thunk`,
  cleaning both up afterwards. Mirrors how production wires a queue + listener globally."
  [queue listener thunk]
  (q.registry/register-queue! queue {:transactional :try})
  (listener/batch-listen! queue listener)
  (try
    (thunk)
    (finally
      (listener/unlisten! queue)
      (swap! q.registry/*queues* dissoc queue))))

(defn- publish! [queue & msgs]
  (q.backend/publish! q.quartz/backend queue (payload/encode (vec msgs))))

(defn- job-triggers [^Scheduler scheduler queue]
  (.getTriggersOfJob scheduler (#'q.quartz/queue-job-key queue)))

(deftest quartz-delivers-published-message-test
  (testing "a published batch is delivered to the registered listener"
    (mt/with-temp-scheduler!
      (let [received (atom [])
            queue    (keyword "queue" (str "quartz-deliver-" (random-uuid)))]
        (do-with-queue!
         queue
         (fn [msgs] (swap! received into msgs))
         (fn []
           (publish! queue "a" "b" "c")
           (wait-for! #(= 3 (count @received)))
           (is (= #{"a" "b" "c"} (set @received))
               "every published message reaches the listener")))))))

(deftest quartz-retries-failed-batch-test
  (testing "a batch whose listener throws is redelivered until it succeeds"
    ;; uses the real (1s) first-retry backoff — fast enough for a single retry — rather than
    ;; redefining retry-delay-ms, which the Quartz worker thread wouldn't see.
    (mt/with-temp-scheduler!
      (let [attempts (atom 0)
            queue    (keyword "queue" (str "quartz-retry-" (random-uuid)))]
        (do-with-queue!
         queue
         (fn [_msgs]
           ;; fail the first attempt, succeed on the retry
           (when (= 1 (swap! attempts inc))
             (throw (ex-info "boom" {}))))
         (fn []
           (publish! queue "retry-me")
           (is (wait-for! #(>= @attempts 2) 8000)
               "listener is invoked again after the first failure")
           (is (= 2 @attempts)
               "delivery stops once the retry succeeds")))))))

(deftest quartz-drops-after-max-retries-test
  (testing "a batch that keeps failing is dropped after queue-max-retries attempts"
    ;; cap retries at 2 so the batch drops after a single real-backoff retry instead of climbing the
    ;; exponential backoff to the default 5.
    (mt/with-temporary-setting-values [queue-max-retries 2]
      (mt/with-temp-scheduler!
        (let [attempts      (atom 0)
              extra-attempt (promise) ; delivered only if an (erroneous) attempt past the max fires
              queue         (keyword "queue" (str "quartz-drop-" (random-uuid)))]
          (do-with-queue!
           queue
           (fn [_msgs]
             (when (> (swap! attempts inc) (mq.settings/queue-max-retries))
               (deliver extra-attempt :extra))
             (throw (ex-info "always boom" {})))
           (fn []
             (publish! queue "doomed")
             (is (wait-for! #(= (mq.settings/queue-max-retries) @attempts) 8000)
                 "the batch is attempted exactly queue-max-retries times")
             ;; An erroneous extra retry would fire after the ~2s second-level backoff. Wait on the
             ;; promise (returns early if a bad attempt fires) and assert it never resolves.
             (is (= ::none (deref extra-attempt 2500 ::none))
                 "no further attempts after the batch is dropped"))))))))

(deftest quartz-no-listener-returns-marker-test
  (testing "deliver! returns the no-listener marker (not nil/success) when no listener is running, so the caller defers rather than dropping"
    (mt/with-temp-scheduler!
      (let [queue (keyword "queue" (str "quartz-nolistener-" (random-uuid)))]
        (is (= mq.impl/no-listener (mq.impl/deliver! queue (payload/encode ["orphan"]))))))))

(deftest quartz-undecodable-payload-is-dropped-test
  (testing "an undecodable payload is dropped (no throw, no retry) and metered, never reaching the listener"
    (mt/with-prometheus-system! [_ system]
      (let [called (atom false)
            queue  (keyword "queue" (str "quartz-baddecode-" (random-uuid)))]
        (do-with-queue!
         queue
         (fn [_msgs] (reset! called true))
         (fn []
           (is (= mq.impl/undecodable (mq.impl/deliver! queue "not-json{{{"))
               "deliver! drops an undecodable payload (returns the undecodable marker) rather than throwing past the retry/drop logic")
           (is (false? @called)
               "the listener is never invoked for an undecodable payload")
           (is (pos? (mt/metric-value system :metabase-mq/batches-dropped
                                      {:channel (name queue) :reason "undecodable"}))
               "the drop is surfaced as batches-dropped{reason=undecodable}")))))))

(deftest quartz-undecodable-payload-dropped-without-listener-test
  (testing "an undecodable payload is dropped as `undecodable` even when no listener is running on this node — it is NOT treated as no-listener (which would needlessly refire a poison payload that can never decode)"
    (mt/with-prometheus-system! [_ system]
      (let [queue (keyword "queue" (str "quartz-baddecode-nolistener-" (random-uuid)))]
        ;; no listener registered here — decoding happens first, so a poison payload is dropped as
        ;; undecodable rather than deferred as no-listener
        (is (= mq.impl/undecodable (mq.impl/deliver! queue "not-json{{{"))
            "an undecodable payload returns the undecodable marker (dropped), not the no-listener marker")
        (is (pos? (mt/metric-value system :metabase-mq/batches-dropped
                                   {:channel (name queue) :reason "undecodable"}))
            "the drop is metered as undecodable, not deferred/mislabeled as no-listener")))))

(deftest quartz-handler-failure-returns-cause-test
  (testing "deliver! returns the handler's own exception so the caller can retry/drop with the cause"
    (mt/with-temp-scheduler!
      (let [queue (keyword "queue" (str "quartz-cause-" (random-uuid)))]
        (do-with-queue!
         queue
         (fn [_msgs] (throw (ex-info "kaboom" {:detail 42})))
         (fn []
           (let [result (mq.impl/deliver! queue (payload/encode ["x"]))]
             (is (instance? Throwable result) "a failed delivery returns the throwable, not a boolean")
             ;; the listener's exception is returned directly (no wrapping) for diagnostics
             (is (= "kaboom" (ex-message result))
                 "the handler's exception is returned as-is"))))))))

(deftest deliver-batch-refires-immediately-when-handoff-fails-test
  (testing "if deliver-batch! can't durably hand off (its reschedule throws), it throws JobExecutionException with refireImmediately so Quartz re-runs the job rather than dropping the message"
    (let [queue   (keyword "queue" (str "quartz-refire-" (random-uuid)))
          payload (payload/encode ["x"])
          ctx     (reify JobExecutionContext
                    (getMergedJobDataMap [_]
                      (doto (JobDataMap.)
                        (.put "queue" (name queue))
                        (.put "payload" payload)
                        (.put "attempt" "0")))
                    (getScheduler [_] nil))]
      (q.registry/register-queue! queue {:transactional :try})
      (listener/batch-listen! queue (fn [_msgs] (throw (ex-info "handler boom" {}))))
      (try
        ;; simulate the scheduler being momentarily unavailable so the retry can't be written
        (with-redefs-fn {#'q.quartz/schedule-message-trigger! (fn [& _] (throw (ex-info "scheduler down" {})))}
          (fn []
            (let [ex (try (#'q.quartz/deliver-batch! ctx) nil
                          (catch JobExecutionException e e))]
              (is (instance? JobExecutionException ex)
                  "a failed hand-off throws a JobExecutionException")
              (is (true? (.refireImmediately ^JobExecutionException ex))
                  "with refireImmediately set, so Quartz re-runs the job immediately"))))
        (finally
          (listener/unlisten! queue)
          (swap! q.registry/*queues* dissoc queue))))))

(deftest deliver-batch-backs-off-before-refire-test
  (testing "before refiring a failed hand-off, deliver-batch! pauses briefly so it retries at ~1/interval rather than hot-looping the worker thread"
    (let [queue     (keyword "queue" (str "quartz-refire-backoff-" (random-uuid)))
          payload   (payload/encode ["x"])
          backed-off (atom 0)
          ctx       (reify JobExecutionContext
                      (getMergedJobDataMap [_]
                        (doto (JobDataMap.)
                          (.put "queue" (name queue))
                          (.put "payload" payload)
                          (.put "attempt" "0")))
                      (getScheduler [_] nil))]
      (q.registry/register-queue! queue {:transactional :try})
      (listener/batch-listen! queue (fn [_msgs] (throw (ex-info "handler boom" {}))))
      (try
        (with-redefs-fn {#'q.quartz/schedule-message-trigger! (fn [& _] (throw (ex-info "scheduler down" {})))
                         #'q.quartz/backoff-before-refire!     (fn [] (swap! backed-off inc))}
          (fn []
            (let [ex (try (#'q.quartz/deliver-batch! ctx) nil
                          (catch JobExecutionException e e))]
              (is (instance? JobExecutionException ex)
                  "a failed hand-off still throws a JobExecutionException")
              (is (true? (.refireImmediately ^JobExecutionException ex))
                  "with refireImmediately set")
              (is (= 1 @backed-off)
                  "the backoff pause runs exactly once before the refire is thrown"))))
        (finally
          (listener/unlisten! queue)
          (swap! q.registry/*queues* dissoc queue))))))

(defn- run-concurrency-probe!
  "Publishes two batches to `queue` whose listener parks on a `CyclicBarrier` of 2. If both batches
  run at once they trip the barrier (`met` -> true); if they're serialized the awaits time out and
  the barrier is never met. Returns whether concurrency was observed. Uses 5 scheduler threads so
  serialization, when seen, is enforced by the backend rather than a thread shortage."
  [queue exclusive?]
  (do-with-multithread-scheduler!
   5
   (fn []
     (let [met     (atom false)
           barrier (CyclicBarrier. 2)
           done    (CountDownLatch. 2)]
       (q.registry/register-queue! queue (cond-> {:transactional :try}
                                           exclusive? (assoc :exclusive true)))
       (listener/batch-listen! queue
                               (fn [_msgs]
                                 (try
                                   (.await barrier 2 TimeUnit/SECONDS)
                                   (reset! met true)
                                   (catch Exception _)
                                   (finally (.countDown done)))))
       (try
         (q.backend/publish! q.quartz/backend queue (payload/encode ["m1"]))
         (q.backend/publish! q.quartz/backend queue (payload/encode ["m2"]))
         (.await done 8 TimeUnit/SECONDS)
         @met
         (finally
           (listener/unlisten! queue)
           (swap! q.registry/*queues* dissoc queue)))))))

(deftest quartz-exclusive-queue-serializes-cluster-wide-test
  (testing ":exclusive queue never runs two batches at once (DisallowConcurrentExecution)"
    (is (false? (run-concurrency-probe! (keyword "queue" (str "quartz-excl-" (random-uuid))) true))
        "the two batches were serialized — concurrency was never observed")))

(deftest quartz-non-exclusive-queue-allows-concurrency-test
  (testing "a non-exclusive queue can run batches concurrently (proves the probe can observe overlap)"
    (is (true? (run-concurrency-probe! (keyword "queue" (str "quartz-conc-" (random-uuid))) false))
        "the two batches ran at the same time")))

(deftest quartz-publish-without-scheduler-throws-test
  (testing "publishing with no running scheduler throws instead of silently dropping the message"
    ;; A nil scheduler (e.g. MB_DISABLE_SCHEDULER) must NOT be a silent no-op: the transactional
    ;; outbox relies on a thrown failure to keep the row for the recovery sweep, and the publish
    ;; buffer relies on it to retry/loudly drop rather than silently lose the message.
    (binding [task.impl/*quartz-scheduler* (atom nil)]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"scheduler is not running"
           (publish! (keyword "queue" (str "quartz-nosched-" (random-uuid))) "x"))))))

(deftest quartz-publish-with-disabled-scheduler-throws-test
  (testing "publishing while the scheduler is disabled throws instead of writing a trigger that never fires"
    ;; With MB_DISABLE_SCHEDULER the scheduler is still *initialized* (standby, so its Quartz job
    ;; store accepts writes) but never started. Without a guard the trigger would be durably written
    ;; and silently never delivered; throwing keeps outbox rows for the recovery sweep and lets the
    ;; publish buffer retry/loudly drop, same as the nil-scheduler case above.
    (mt/with-temp-scheduler!
      (with-redefs [task/scheduler-disabled? (constantly true)]
        (let [queue (keyword "queue" (str "quartz-disabled-" (random-uuid)))]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo #"scheduler is not running"
               (publish! queue "x")))
          (is (empty? (job-triggers (task/scheduler) queue))
              "nothing was written to the job store"))))))

(deftest quartz-requeue-no-listener-reschedules-not-refires-test
  (testing "no listener on this node re-schedules the message back into the store (so it goes back through acquisition and node-affinity routes it to a node that has the listener), rather than refiring it here — a refire would loop on this node forever"
    (mt/with-temp-scheduler!
      (let [^Scheduler scheduler (task.impl/scheduler)
            queue                (keyword "queue" (str "quartz-nolistener-requeue-" (random-uuid)))]
        (#'q.quartz/ensure-queue-job! scheduler queue false)
        (try
          (#'q.quartz/requeue-no-listener! scheduler queue (payload/encode ["x"]) 0 (Date.))
          (let [triggers (job-triggers scheduler queue)]
            (is (= 1 (count triggers))
                "a single re-queue trigger is placed back into the store (re-acquired via affinity, not fired here)")
            (is (instance? Trigger (first triggers))))
          (finally (.deleteJob scheduler (#'q.quartz/queue-job-key queue))))))))

(deftest quartz-requeue-no-listener-preserves-the-messages-age-test
  (testing "a no-listener requeue keeps the message's original start time rather than stamping it `now`.

            The age reaper ([[metabase.mq.task.queue-reaper]]) gives up on a never-acquired queue
            trigger by its `start_time`. But a bounced message is re-queued as a *fresh* trigger, so
            stamping `now` resets its own reaper clock on every bounce — a message that keeps landing
            on nodes with no listener could never age out, which is exactly the message the reaper
            exists to drop. Nothing else bounds this path: `requeue-no-listener!` carries no backoff
            and spends no retry budget. It is most reachable during a rolling deploy, when nodes are
            tearing their listeners down, and in the startup window before node-affinity is installed
            (its capability fn defaults to `:all`, i.e. no filtering)."
    (mt/with-temp-scheduler!
      (let [^Scheduler scheduler (task.impl/scheduler)
            queue    (keyword "queue" (str "quartz-nolistener-age-" (random-uuid)))
            payload  (payload/encode ["x"])
            ;; a message that has already been waiting hours for a node that can handle it
            start-at (Date/from (.minusSeconds (Instant/now) (* 6 60 60)))
            ctx      (reify JobExecutionContext
                       (getMergedJobDataMap [_]
                         (doto (JobDataMap.)
                           (.put "queue" (name queue))
                           (.put "payload" payload)
                           (.put "attempt" "0")))
                       (getScheduler [_] scheduler)
                       (getTrigger [_] (-> (TriggerBuilder/newTrigger) (.startAt start-at) (.build))))]
        ;; deliberately no listener for `queue` on this node — that is the path under test
        (q.registry/register-queue! queue {:transactional :try})
        (#'q.quartz/ensure-queue-job! scheduler queue false)
        (try
          (#'q.quartz/deliver-batch! ctx)
          (let [triggers (job-triggers scheduler queue)]
            (is (= 1 (count triggers))
                "the message is re-queued for a node that does have the listener")
            (is (= start-at (.getStartTime ^Trigger (first triggers)))
                "and keeps its original start time, so the reaper's clock keeps running"))
          (finally
            (.deleteJob scheduler (#'q.quartz/queue-job-key queue))
            (swap! q.registry/*queues* dissoc queue)))))))

(deftest quartz-exclusive-job-not-downgraded-test
  (testing "a node that disagrees about :exclusive can't downgrade an existing exclusive job"
    ;; Simulates three nodes (the per-process `ensured-jobs` cache is reset between them) publishing
    ;; to the same queue with different views of `:exclusive`. Exclusivity must be sticky: once any
    ;; node makes the queue's job exclusive, a node that thinks it's concurrent must not weaken it.
    (do-with-multithread-scheduler!
     1
     (fn []
       (let [^Scheduler scheduler (task.impl/scheduler)
             queue        (keyword "queue" (str "quartz-nodowngrade-" (random-uuid)))
             jk           (#'q.quartz/queue-job-key queue)
             reset-cache! #(reset! @#'q.quartz/ensured-jobs #{})
             job-class    (fn [] (when-let [^JobDetail jd (.getJobDetail scheduler jk)]
                                   (.getSimpleName (.getJobClass jd))))]
         (try
           ;; node A: concurrent — creates a plain job
           (reset-cache!)
           (#'q.quartz/ensure-queue-job! scheduler queue false)
           (is (= "QueueMessageJob" (job-class)))
           ;; node B: exclusive — upgrades to the DisallowConcurrentExecution class
           (reset-cache!)
           (#'q.quartz/ensure-queue-job! scheduler queue true)
           (is (= "ExclusiveQueueMessageJob" (job-class)))
           ;; node C: concurrent again — must NOT downgrade
           (reset-cache!)
           (#'q.quartz/ensure-queue-job! scheduler queue false)
           (is (= "ExclusiveQueueMessageJob" (job-class))
               "exclusive is sticky; a disagreeing node cannot downgrade it back to concurrent")
           (finally (.deleteJob scheduler jk))))))))

(deftest quartz-on-error-fires-on-exhaustion-test
  (testing "the :on-error terminal-failure hook fires on the push backend too, with the dropped batch"
    ;; Backend parity with `metabase.mq.queue.on-error-test` (poll backend): both route their
    ;; delivery failures through the shared `q.impl/handle-batch-failure-policy!`, so the hook must
    ;; behave identically here.
    (mt/with-temporary-setting-values [queue-max-retries 2]
      (mt/with-temp-scheduler!
        (let [dropped (atom [])
              queue   (keyword "queue" (str "quartz-on-error-" (random-uuid)))
              boom    (ex-info "always boom" {})]
          (q.registry/register-queue! queue {:transactional :try
                                             :on-error      (fn [info] (swap! dropped conj info))})
          (listener/batch-listen! queue (fn [_msgs] (throw boom)))
          (try
            (publish! queue {:id 7})
            (is (wait-for! #(seq @dropped) 8000)
                ":on-error fires once the batch exhausts its retries")
            (is (= 1 (count @dropped)))
            (let [info (first @dropped)]
              (is (= queue (:channel info)))
              (is (= [{:id 7}] (:messages info))
                  "the handler receives the decoded messages of the dropped batch")
              (is (= 2 (:attempts info))))
            (finally
              (listener/unlisten! queue)
              (swap! q.registry/*queues* dissoc queue))))))))

;;; ------------------------------- :max-concurrent-batches -------------------------------

;;; Where the cap is actually enforced on Quartz is *trigger acquisition* — a node at capacity stops
;;; acquiring the queue's triggers, so they stay WAITING for a node with room. That is exercised
;;; against the real app-DB acquire query in `metabase.mq.quartz-affinity-test` (the delegate is a JDBC
;;; DriverDelegate, so the tests here — which run on RAMJobStore — cannot see it at all).
;;;
;;; What is left to pin here is what `deliver-batch!` does with a batch that reaches it anyway.

(defn- job-ctx
  "A minimal `JobExecutionContext` for driving `deliver-batch!` directly, carrying `queue`'s payload
  and a real scheduler (so a re-queue actually writes a trigger we can count)."
  ^JobExecutionContext [^Scheduler scheduler queue payload]
  (reify JobExecutionContext
    (getMergedJobDataMap [_]
      (doto (JobDataMap.)
        (.put "queue" (name queue))
        (.put "payload" payload)
        (.put "attempt" "0")))
    (getScheduler [_] scheduler)))

(deftest over-capacity-batch-is-still-delivered-test
  (testing "a batch that reaches deliver-batch! while the node is already at its cap is delivered
            anyway, not handed back"
    ;; The cap is a throttle on what a node *takes* (trigger acquisition), and that check necessarily
    ;; races the job body: Quartz decides what to acquire on its scheduler thread, before this runs on
    ;; a worker thread. Bouncing the odd batch that slips through would cost a whole re-queue path —
    ;; backoff, metric, and a hot-loop to avoid if the acquisition filter ever stops working — to shave
    ;; an overshoot that is small, bounded and drains itself. So we run it and let the count go over.
    (mt/with-temp-scheduler!
      (let [queue     (keyword "queue" (str "quartz-overcap-" (random-uuid)))
            scheduler (task/scheduler)
            ran       (atom 0)]
        (q.registry/register-queue! queue {:transactional :try :max-concurrent-batches 1})
        (listener/batch-listen! queue (fn [_msgs] (swap! ran inc)))
        (try
          ;; Create the durable job without publishing — a live trigger would be fired by this
          ;; (running) scheduler on its own thread, adding a delivery we didn't ask for.
          (#'q.quartz/ensure-queue-job! scheduler queue false)
          (let [before (count (job-triggers scheduler queue))]
            ;; Hold the queue's only slot, so the fired job runs while we are already at the cap —
            ;; exactly the acquire/execute race the acquisition filter cannot close.
            (q.concurrency/with-slot queue
              (is (true? (q.concurrency/at-capacity? queue)) "we are at the cap before it fires")
              (is (nil? (#'q.quartz/deliver-batch!
                         (job-ctx scheduler queue (payload/encode [{:id 1}]))))
                  "returns normally, so Quartz completes the one-shot")
              (is (= 1 @ran)
                  "the listener ran: the batch was delivered over the cap rather than bounced")
              (is (= before (count (job-triggers scheduler queue)))
                  "and no trigger was written back to the store — there is no bounce path any more"))
            (is (zero? (q.concurrency/in-flight queue))
                "the over-cap slot was released again, so the node drains back under its limit"))
          (finally
            (listener/unlisten! queue)
            (swap! q.registry/*queues* dissoc queue)))))))

(deftest delivery-releases-its-slot-test
  (testing "the slot is released after delivery, on both the success and the failure path — otherwise
            a queue would throttle itself to a standstill after a few batches"
    (mt/with-temp-scheduler!
      (let [scheduler (task/scheduler)]
        (doseq [[label listener] [["success" (fn [_msgs] nil)]
                                  ["failure" (fn [_msgs] (throw (ex-info "boom" {})))]]]
          (testing label
            (let [queue (keyword "queue" (str "quartz-release-" label "-" (random-uuid)))]
              (q.registry/register-queue! queue {:transactional :try :max-concurrent-batches 1})
              (listener/batch-listen! queue listener)
              (try
                ;; Create the durable job *without* publishing: the failure path reschedules a retry
                ;; onto it, and it must exist for that. Publishing would also enqueue a live trigger,
                ;; which this (running) scheduler would fire on its own thread — a second, concurrent
                ;; delivery holding a slot of its own, which is exactly what we're trying to measure.
                (#'q.quartz/ensure-queue-job! scheduler queue false)
                (#'q.quartz/deliver-batch! (job-ctx scheduler queue (payload/encode [{:id 1}])))
                (is (zero? (q.concurrency/in-flight queue))
                    "the slot is returned, not leaked")
                (finally
                  (listener/unlisten! queue)
                  (swap! q.registry/*queues* dissoc queue))))))))))

(deftest capability-fn-excludes-at-capacity-queues-test
  (testing "a queue this node is at capacity on is reported as one it cannot currently handle, so the
            affinity delegate leaves its triggers WAITING for a node that can"
    (let [capped   (keyword "queue" (str "quartz-capable-capped-" (random-uuid)))
          uncapped (keyword "queue" (str "quartz-capable-uncapped-" (random-uuid)))]
      (q.registry/register-queue! capped {:transactional :try :max-concurrent-batches 1})
      (q.registry/register-queue! uncapped {:transactional :try})
      (listener/batch-listen! capped (fn [_] nil))
      (listener/batch-listen! uncapped (fn [_] nil))
      (try
        (testing "with a free slot, both queues are acquirable"
          (let [capable (q.quartz/capable-queue-names)]
            (is (contains? capable (name capped)))
            (is (contains? capable (name uncapped)))))
        (q.concurrency/with-slot capped
          (testing "once the cap is reached, the capped queue drops out of the acquire query"
            (let [capable (q.quartz/capable-queue-names)]
              (is (not (contains? capable (name capped)))
                  "at capacity — this node must not acquire more of its triggers")
              (is (contains? capable (name uncapped))
                  "an uncapped queue is unaffected: it stays unbounded, as it was before caps existed")))
          (testing "and the predicate spliced into Quartz's acquire SQL really does exclude it"
            (let [sql (quartz-affinity/rewrite-acquisition-sql
                       "SELECT * FROM QRTZ_TRIGGERS WHERE x = 1 ORDER BY next_fire_time"
                       (q.quartz/capable-queue-names))]
              (is (not (str/includes? sql (name capped))))
              (is (str/includes? sql (name uncapped))))))
        (testing "releasing the slot makes it acquirable again"
          (is (contains? (q.quartz/capable-queue-names) (name capped))))
        (finally
          (listener/unlisten! capped)
          (listener/unlisten! uncapped)
          (swap! q.registry/*queues* dissoc capped)
          (swap! q.registry/*queues* dissoc uncapped))))))

(deftest wake-scheduler-pokes-the-acquire-loop-for-capped-queues-only-test
  ;; The nudge is load-bearing, not an optimization: once the acquisition filter excludes a queue this
  ;; node is at capacity on, Quartz's acquire loop finds nothing and parks on its sigLock for up to
  ;; idleWaitTime (30s) — and a plain (non-@DisallowConcurrentExecution) job completing does NOT signal
  ;; it. Without this poke a capped queue would drain N batches, sleep 30s, drain N more.
  ;;
  ;; `resumeJob` is the public API we ride to get that signal: QuartzScheduler.resumeJob ends in
  ;; notifySchedulerThread(0L). We aim it at a durable job with no triggers, so the resume itself is a
  ;; no-op and only the signal survives. This pins our half of that contract.
  (mt/with-temp-scheduler!
    (let [scheduler (task/scheduler)
          capped    (keyword "queue" (str "quartz-wake-capped-" (random-uuid)))
          uncapped  (keyword "queue" (str "quartz-wake-uncapped-" (random-uuid)))
          ^JobKey nudge-key @#'q.quartz/nudge-job-key]
      (reset! @#'q.quartz/nudge-job-ensured? false)
      (q.registry/register-queue! capped {:transactional :try :max-concurrent-batches 1})
      (q.registry/register-queue! uncapped {:transactional :try})
      (try
        (testing "an uncapped queue is never filtered out, so there is no stall to break and no poke"
          (#'q.quartz/wake-scheduler! scheduler uncapped)
          (is (false? (.checkExists scheduler nudge-key))
              "no nudge job created — an uncapped queue doesn't pay the cost of the wake-up"))
        (testing "a capped queue pokes the acquire loop, via a durable job that carries no triggers"
          (#'q.quartz/wake-scheduler! scheduler capped)
          (is (true? (.checkExists scheduler nudge-key))
              "the nudge job exists")
          (is (empty? (.getTriggersOfJob scheduler nudge-key))
              "and has no triggers — it never fires; we call resumeJob purely for the signal"))
        (testing "poking is idempotent and safe to call on every completed batch"
          (dotimes [_ 3] (#'q.quartz/wake-scheduler! scheduler capped))
          (is (true? (.checkExists scheduler nudge-key))))
        (finally
          (swap! q.registry/*queues* dissoc capped)
          (swap! q.registry/*queues* dissoc uncapped))))))

(deftest delivery-wakes-the-acquire-loop-after-freeing-a-slot-test
  (testing "finishing a batch on a capped queue tells the acquire loop to look again — that is what
            turns a freed slot into the next batch actually being picked up"
    (mt/with-temp-scheduler!
      (let [scheduler (task/scheduler)
            queue     (keyword "queue" (str "quartz-wake-on-release-" (random-uuid)))
            woke      (atom [])]
        (q.registry/register-queue! queue {:transactional :try :max-concurrent-batches 1})
        (listener/batch-listen! queue (fn [_msgs] nil))
        (try
          (publish! queue {:seed 1})
          (with-redefs-fn {#'q.quartz/wake-scheduler! (fn [_sched q] (swap! woke conj q))}
            (fn []
              (#'q.quartz/deliver-batch! (job-ctx scheduler queue (payload/encode [{:id 1}])))))
          (is (= [queue] @woke)
              "the acquire loop is woken exactly once, after the slot is released")
          (is (zero? (q.concurrency/in-flight queue))
              "and the slot really was free by then")
          (finally
            (listener/unlisten! queue)
            (swap! q.registry/*queues* dissoc queue)))))))
