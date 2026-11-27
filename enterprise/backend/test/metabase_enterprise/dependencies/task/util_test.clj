(ns metabase-enterprise.dependencies.task.util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.util Date)
   (java.util.concurrent.locks ReentrantLock)
   (org.quartz Scheduler TriggerKey)))

(set! *warn-on-reflection* true)

(defn- seconds-until-next-run ^long []
  (let [fire-time (.getNextFireTime (.getTrigger ^Scheduler (task/scheduler)
                                                 (TriggerKey. "metabase.dependencies.task.result-metadata.trigger")))]
    (quot (- (.getTime ^Date fire-time) (System/currentTimeMillis)) 1000)))

(deftest schedule-run-keeps-earlier-run-test
  (testing "scheduling a later run keeps a run already pending earlier, and an earlier run replaces a later one"
    (mt/with-temp-scheduler!
      (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 3600)
      (is (< 3000 (seconds-until-next-run)))
      (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 60)
      (is (< (seconds-until-next-run) 61))
      (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 3600)
      (is (< (seconds-until-next-run) 61)))))

(deftest schedule-run-leaves-earlier-run-alone-test
  (testing "scheduling a later run while an earlier one is pending does not replace the pending trigger"
    (mt/with-temp-scheduler!
      (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 60)
      (let [scheduled (atom 0)]
        (mt/with-dynamic-fn-redefs [task/schedule-task! (fn [& _] (swap! scheduled inc))]
          (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 60)
          (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 3600))
        (is (zero? @scheduled))))))

(deftest schedule-run-moves-past-due-run-test
  (testing "scheduling a run moves a run pending in the past, which Quartz may not fire for minutes, to a second from now"
    (mt/with-temp-scheduler!
      (mt/with-dynamic-fn-redefs [task.util/next-fire-time (constantly (Date. (- (.getTime (Date.)) (* 20 60 1000))))]
        (task.util/schedule-run! (task/scheduler) @#'task.result-metadata/job 3600))
      (is (<= 0 (seconds-until-next-run) 1)))))

(defn- test-job
  "A job with `job-key` and `batch-size` whose batch is `run-batch!`."
  [job-key batch-size run-batch!]
  (assoc @#'task.result-metadata/job
         :job-key    job-key
         :batch-size (constantly batch-size)
         :run-batch! run-batch!))

(def ^:private ^:dynamic *runner*
  "Which of a test's runners the current thread is."
  nil)

(defn- run-batch!
  "Run a batch of `job` the way a `kind` of runner does."
  [kind job]
  (case kind
    :in-place  (task.util/run-batch-in-place! job)
    :scheduled (task.util/run-and-reschedule! nil job)))

(defn- runner-waiting?
  "Wait until a runner is queued on the lock of `job`. The timeout only keeps a broken lock from hanging the test."
  [job]
  (let [^ReentrantLock lock (#'task.util/batch-lock job)]
    (true? (u/poll {:thunk #(.hasQueuedThreads lock), :done? true?, :timeout-ms 10000, :interval-ms 5}))))

(deftest run-batch-in-place-test
  (testing "a batch run in place says whether it took anything"
    (is (= :worked (task.util/run-batch-in-place! (test-job "test.worked" 1 (constantly 1)))))
    (is (= :idle (task.util/run-batch-in-place! (test-job "test.idle" 1 (constantly nil))))))
  (testing "a batch size that isn't positive disables the job"
    (is (= :disabled (task.util/run-batch-in-place! (test-job "test.disabled" 0 #(throw (ex-info "ran" {})))))))
  (testing "a batch does not hold up a batch of another job"
    (let [inner (promise)]
      (task.util/run-batch-in-place!
       (test-job "test.outer" 1 (fn []
                                  (deliver inner (deref (future (task.util/run-batch-in-place!
                                                                 (test-job "test.inner" 1 (constantly nil))))
                                                        10000 :blocked))
                                  nil)))
      (is (= :idle @inner)))))

(deftest batches-of-one-job-do-not-overlap-test
  (doseq [[first-kind second-kind] [[:in-place :scheduled] [:scheduled :in-place] [:in-place :in-place]]]
    (testing (str "a batch run " (name second-kind) " waits for a batch of the same job running " (name first-kind))
      (let [events     (atom [])
            entered    (promise)
            release    (promise)
            job        (test-job "test.overlap" 1 (fn []
                                                    (swap! events conj [*runner* :start])
                                                    (when (= :first *runner*)
                                                      (deliver entered true)
                                                      (deref release 10000 nil))
                                                    (swap! events conj [*runner* :end])
                                                    nil))
            first-run  (binding [*runner* :first] (future (run-batch! first-kind job)))
            _          (is (true? (deref entered 10000 false)))
            second-run (binding [*runner* :second] (future (run-batch! second-kind job)))]
        (is (runner-waiting? job))
        (is (= [[:first :start]] @events))
        (deliver release true)
        (is (not= ::timed-out (deref first-run 10000 ::timed-out)))
        (is (not= ::timed-out (deref second-run 10000 ::timed-out)))
        (is (= [[:first :start] [:first :end] [:second :start] [:second :end]] @events))))))

(deftest waiting-run-gets-a-turn-between-batches-test
  (testing "a runner taking batch after batch lets a waiting run in right after the batch it waited for"
    (let [events    (atom [])
          entered   (promise)
          release   (promise)
          job       (test-job "test.fair" 1 (fn []
                                              (when (= 1 (count (swap! events conj *runner*)))
                                                (deliver entered true)
                                                (deref release 10000 nil))
                                              nil))
          drain     (binding [*runner* :drain] (future (dotimes [_ 3] (run-batch! :in-place job))))
          _         (is (true? (deref entered 10000 false)))
          scheduled (binding [*runner* :scheduled] (future (run-batch! :scheduled job)))]
      (is (runner-waiting? job))
      (deliver release true)
      (is (not= ::timed-out (deref drain 10000 ::timed-out)))
      (is (not= ::timed-out (deref scheduled 10000 ::timed-out)))
      (is (= [:drain :scheduled :drain :drain] @events)))))

(def ^:private ^:dynamic *bound* nil)

(deftest compute-in-parallel-order-test
  (testing "returns each call's value in order, calling them on several threads in the caller's bindings"
    (mt/with-temp-env-var-value! [mb-dependency-job-threads 4]
      (let [threads (atom #{})]
        (is (= [[:a 0] [:a 1] [:a 2] [:a 3]]
               (binding [*bound* :a]
                 (task.util/compute-in-parallel (fn [x]
                                                  (swap! threads conj (Thread/currentThread))
                                                  (Thread/sleep (long (* 40 (- 4 x))))
                                                  [*bound* x])
                                                (fn [_ e] (throw e))
                                                (range 4)))))
        (is (< 1 (count @threads))))))
  (testing "calls each one on the caller's thread inside a transaction"
    (mt/with-temp-env-var-value! [mb-dependency-job-threads 4]
      (let [threads (atom #{})]
        (t2/with-transaction [_]
          (task.util/compute-in-parallel (fn [x] (swap! threads conj (Thread/currentThread)) x)
                                         (fn [_ e] (throw e))
                                         (range 4)))
        (is (= #{(Thread/currentThread)} @threads))))))

(deftest compute-in-parallel-rethrows-earliest-test
  (testing "hands on-failure! the earliest element's Error first, even when a later one threw first"
    (mt/with-temp-env-var-value! [mb-dependency-job-threads 4]
      (let [started (promise)]
        (is (thrown-with-msg? AssertionError #"first"
                              (task.util/compute-in-parallel (fn [x]
                                                               (case x
                                                                 1 (do (deliver started true)
                                                                       (Thread/sleep 100)
                                                                       (throw (AssertionError. "first")))
                                                                 2 (do (deref started 10000 nil)
                                                                       (throw (AssertionError. "second")))
                                                                 x))
                                                             (fn [_ e] (throw e))
                                                             [0 1 2])))))))

(deftest compute-in-parallel-waits-for-running-calls-test
  (testing "throws only once a call that ignores the interrupt has finished"
    (mt/with-temp-env-var-value! [mb-dependency-job-threads 2]
      (let [started   (promise)
            finished? (atom false)]
        (is (thrown? AssertionError
                     (task.util/compute-in-parallel (fn [x]
                                                      (if (= x :slow)
                                                        (let [until (+ (System/currentTimeMillis) 300)]
                                                          (deliver started true)
                                                          (while (< (System/currentTimeMillis) until))
                                                          (reset! finished? true))
                                                        (do (deref started 10000 nil)
                                                            (throw (AssertionError. "boom")))))
                                                    (fn [_ e] (throw e))
                                                    [:fail :slow])))
        (is @finished?)))))

(deftest compute-in-parallel-test
  (testing "returns the non-nil values in order, then hands each failure to on-failure! on the caller's thread, in order"
    (let [failures (atom [])]
      (is (= [0 4]
             (task.util/compute-in-parallel (fn [x]
                                              (case x
                                                (1 3) (throw (ex-info "failed" {:x x}))
                                                2     nil
                                                x))
                                            (fn [x e]
                                              (swap! failures conj [x (:x (ex-data e)) (Thread/currentThread)]))
                                            (range 5))))
      (is (= [[1 1 (Thread/currentThread)] [3 3 (Thread/currentThread)]] @failures)))))

(deftest compute-in-parallel-stops-at-rethrown-error-test
  (doseq [threads [1 4]]
    (testing (str "an Error that on-failure! rethrows stops the batch before the elements queued behind the running ones, at "
                  threads " threads")
      (mt/with-temp-env-var-value! [mb-dependency-job-threads threads]
        (let [computed (atom 0)]
          (is (thrown? StackOverflowError
                       (task.util/compute-in-parallel (fn [x]
                                                        (swap! computed inc)
                                                        (if (= x 1)
                                                          (throw (StackOverflowError.))
                                                          (Thread/sleep 50))
                                                        x)
                                                      (fn [_ e]
                                                        (when-not (instance? Exception e)
                                                          (throw e)))
                                                      (range 20))))
          (is (<= @computed (inc threads))))))))

(deftest compute-in-parallel-stops-while-app-db-unreachable-test
  (doseq [threads [1 4]]
    (testing (str "a call that throws while the app DB is unreachable stops the batch before the elements queued behind "
                  "the running ones, checking reachability once, at " threads " threads")
      (mt/with-temp-env-var-value! [mb-dependency-job-threads threads]
        (let [computed (atom 0)
              failures (atom [])
              checks   (atom 0)]
          (mt/with-dynamic-fn-redefs [dependencies.db/app-db-reachable? (fn []
                                                                          (swap! checks inc)
                                                                          false)]
            (is (thrown-with-msg? Exception #"outage"
                                  (task.util/compute-in-parallel (fn [x]
                                                                   (swap! computed inc)
                                                                   (if (= x 1)
                                                                     (throw (Exception. "outage"))
                                                                     (Thread/sleep 50))
                                                                   x)
                                                                 ;; like the jobs' handlers, which rethrow during an outage
                                                                 (fn [x e]
                                                                   (swap! failures conj x)
                                                                   (throw e))
                                                                 (range 20)))))
          (is (<= @computed (inc threads)))
          (is (= [1] @failures))
          (is (= 1 @checks)))))))

(deftest dependency-job-threads-at-least-one-test
  (testing "a dependency-job-threads setting that isn't positive means one thread"
    (doseq [threads ["0" "-1"]]
      (mt/with-temp-env-var-value! [mb-dependency-job-threads threads]
        (is (= 1 (deps.settings/dependency-job-threads)))))))

(deftest dependency-job-threads-default-test
  (testing "unset, dependency-job-threads is the smallest of 4, the CPU cores and a quarter of the app DB pool, at least 1"
    (doseq [[cores pool-size expected] [[8 15 3] [8 16 4] [8 40 4] [2 40 2] [1 40 1] [8 3 1] [8 0 1]]]
      (is (= expected (#'deps.settings/default-job-threads cores pool-size))
          (str cores " cores, a pool of " pool-size)))
    (mt/with-dynamic-fn-redefs [deps.settings/app-db-max-pool-size (constantly 8)]
      (is (= (min 2 (.availableProcessors (Runtime/getRuntime))) (deps.settings/dependency-job-threads))))
    (testing "and reads the pool size from the app DB's pool"
      (is (pos-int? (#'deps.settings/app-db-max-pool-size))))
    (testing "and a value that is set overrides it"
      (mt/with-temp-env-var-value! [mb-dependency-job-threads 7]
        (is (= 7 (deps.settings/dependency-job-threads)))))))
