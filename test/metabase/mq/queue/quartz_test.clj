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
   (org.quartz JobDetail Scheduler)
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
        (let [attempts (atom 0)
              queue    (keyword "queue" (str "quartz-drop-" (random-uuid)))]
          (do-with-queue!
           queue
           (fn [_msgs] (swap! attempts inc) (throw (ex-info "always boom" {})))
           (fn []
             (publish! queue "doomed")
             (is (wait-for! #(= (mq.settings/queue-max-retries) @attempts) 8000)
                 "the batch is attempted exactly queue-max-retries times")
             ;; an erroneous extra retry would fire after the ~2s second-level backoff — wait past
             ;; that, then confirm it didn't
             (Thread/sleep 2500)
             (is (= (mq.settings/queue-max-retries) @attempts)
                 "no further attempts after the batch is dropped"))))))))

(deftest quartz-no-listener-is-dropped-test
  (testing "a message for a queue with no listener is delivered-and-dropped (no error, no retry loop)"
    (mt/with-temp-scheduler!
      (let [queue (keyword "queue" (str "quartz-nolistener-" (random-uuid)))]
        ;; deliver-reporting! treats a missing listener as success, so nothing is rescheduled.
        (is (true? (mq.impl/deliver-reporting! queue (payload/encode ["orphan"]))))))))

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
