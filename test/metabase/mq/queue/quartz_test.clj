(ns metabase.mq.queue.quartz-test
  "Tests for the push-based Quartz queue backend. Quartz fires jobs on its own worker threads, so —
  unlike the poll backends exercised via `with-test-mq` — these tests register the listener on the
  root `*listeners*` (the production registration path; Quartz threads don't inherit the test
  thread's dynamic bindings) and drive the backend directly under an in-memory scheduler."
  (:require
   [clojure.test :refer :all]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.payload :as payload]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.quartz :as q.quartz]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.settings :as mq.settings]
   [metabase.task.impl :as task.impl]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures])
  (:import
   (java.util Properties)
   (java.util.concurrent CountDownLatch CyclicBarrier TimeUnit)
   (org.quartz JobDataMap JobDetail JobExecutionContext JobExecutionException Scheduler Trigger)
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

(deftest quartz-requeue-no-listener-reschedules-not-refires-test
  (testing "no listener on this node re-schedules the message back into the store (so it goes back through acquisition and node-affinity routes it to a node that has the listener), rather than refiring it here — a refire would loop on this node forever"
    (mt/with-temp-scheduler!
      (let [^Scheduler scheduler (task.impl/scheduler)
            queue                (keyword "queue" (str "quartz-nolistener-requeue-" (random-uuid)))]
        (#'q.quartz/ensure-queue-job! scheduler queue false)
        (try
          (#'q.quartz/requeue-no-listener! scheduler queue (payload/encode ["x"]) 0)
          (let [triggers (job-triggers scheduler queue)]
            (is (= 1 (count triggers))
                "a single re-queue trigger is placed back into the store (re-acquired via affinity, not fired here)")
            (is (instance? Trigger (first triggers))))
          (finally (.deleteJob scheduler (#'q.quartz/queue-job-key queue))))))))

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
