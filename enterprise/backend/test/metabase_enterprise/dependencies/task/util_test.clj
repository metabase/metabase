(ns metabase-enterprise.dependencies.task.util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.util :as u])
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
