(ns metabase-enterprise.dependencies.task.entity-check-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [environ.core :as env]
   [metabase-enterprise.dependencies.task.entity-check :as dependencies.entity-check]
   [metabase.task.core :as task]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:sequential batch-size-zero-blocks-all-scheduling-test
  (testing "GHY-4251: a non-positive entity check batch size is the supported off-switch, so no path may schedule the
           job. The event-driven trigger used to ignore the setting and wake the job every ~1 second to do nothing;
           because entity changes fire it, this is the dominant source of that cadence on a busy instance."
    (let [scheduled (atom [])
          ;; Reset per case so each assertion stands on its own rather than tripping over an earlier leak.
          scheduled-by (fn [thunk]
                         (reset! scheduled [])
                         (thunk)
                         (count @scheduled))]
      (with-redefs [task/schedule-task! (fn [& args] (swap! scheduled conj args) nil)]
        (testing "the 1-second event-driven trigger does not schedule when disabled"
          (with-redefs [env/env (assoc env/env :mb-dependency-entity-check-batch-size "0")]
            (is (zero? (scheduled-by dependencies.entity-check/trigger-entity-check-job!)))))
        (testing "nor does task/init!"
          (with-redefs [env/env (assoc env/env :mb-dependency-entity-check-batch-size "0")]
            (is (zero? (scheduled-by #(task/init! ::dependencies.entity-check/DependencyEntityCheck))))))
        (testing "but a positive batch size still schedules normally"
          (with-redefs [env/env (assoc env/env :mb-dependency-entity-check-batch-size "5")]
            (is (= 1 (scheduled-by dependencies.entity-check/trigger-entity-check-job!)))))))))

(deftest ^:sequential post-run-reschedule-requires-the-feature-test
  (testing "The entity check job is a periodic checker with no terminal state, so it always queues another run. That
           is right while licensed, but check-entities! is gated on :dependencies, so without the feature the job
           rescheduled itself every 30-90 minutes forever to do nothing at all."
    (let [scheduled (atom [])
          scheduled-by (fn [thunk]
                         (reset! scheduled [])
                         (thunk)
                         (count @scheduled))]
      (with-redefs [task/schedule-task! (fn [& args] (swap! scheduled conj args) nil)]
        (testing "with the feature, the job keeps itself scheduled"
          (mt/with-premium-features #{:dependencies}
            (is (= 1 (scheduled-by #(#'dependencies.entity-check/reschedule-after-run! nil))))))
        (testing "without it, there is nothing it could do on the next run, so it stops"
          (mt/with-premium-features #{}
            (is (zero? (scheduled-by #(#'dependencies.entity-check/reschedule-after-run! nil))))))))))
