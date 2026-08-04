(ns metabase-enterprise.dependencies.task.entity-check-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [environ.core :as env]
   [metabase-enterprise.dependencies.task.entity-check :as dependencies.entity-check]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.test :as mt])
  (:import
   (org.quartz JobDetail)))

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

(deftest ^:sequential post-run-reschedule-licence-states-test
  (testing "The entity check job is a periodic checker with no terminal state, so it always queues another run. That
           is right while licensed, but check-entities! is gated on :dependencies, so without the feature the job
           rescheduled itself every 30-90 minutes forever to do nothing at all.

           Scheduling resolves the licence with canonically-has-feature?, not has-feature?, so it can distinguish
           'definitively unlicensed' from 'could not tell'. has-feature? collapses both to false, and since nothing
           re-fires when a failed token check later succeeds, reading a blip as unlicensed would end the chain for
           good. Only a definitive false stops it."
    (let [scheduled (atom [])
          scheduled-by (fn [licence]
                         (reset! scheduled [])
                         (with-redefs [premium-features/canonically-has-feature? (constantly licence)]
                           (#'dependencies.entity-check/reschedule-after-run! nil))
                         (count @scheduled))]
      (with-redefs [task/schedule-task! (fn [& args] (swap! scheduled conj args) nil)]
        (testing "licensed: keeps itself scheduled"
          (is (= 1 (scheduled-by true))))
        (testing "indeterminate: keeps the chain alive rather than ending it on a transient failure"
          (is (= 1 (scheduled-by nil))))
        (testing "definitively unlicensed: stops"
          (is (zero? (scheduled-by false))))))))

(def ^:private entity-check-job-name "metabase.dependencies.task.entity-check.job")

(defn- scheduled-job-names
  "Job names from captured [[task/schedule-task!]] calls. Needed because several jobs listen for the same events, so a
  bare call count cannot tell us which job got scheduled."
  [calls]
  (into #{} (map (fn [args] (.getName (.getKey ^JobDetail (nth args 1))))) calls))

(deftest ^:sequential token-event-restarts-the-job-test
  (testing "Setting a premium token must restart the entity check job. The backfill job derives
           :event/set-premium-embedding-token for this; entity check had no event wiring at all, so its only restarts
           came from content-change handlers. Enabling the feature on an idle instance left the periodic checker dead
           until the next process restart."
    (let [scheduled (atom [])]
      (with-redefs [task/schedule-task! (fn [& args] (swap! scheduled conj args) nil)]
        (mt/with-premium-features #{:dependencies}
          (events/publish-event! :event/set-premium-embedding-token {})
          (is (contains? (scheduled-job-names @scheduled) entity-check-job-name)))))))
