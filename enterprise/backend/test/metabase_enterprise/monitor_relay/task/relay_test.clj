(ns metabase-enterprise.monitor-relay.task.relay-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.monitor-relay.config :as relay.config]
   [metabase-enterprise.monitor-relay.cycle :as relay.cycle]
   [metabase-enterprise.monitor-relay.db :as relay.db]
   [metabase-enterprise.monitor-relay.task.relay :as relay.task]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.util :as tu])
  (:import
   (java.util Date)
   (metabase_enterprise.monitor_relay.task.relay MonitorRelay)
   (org.quartz Job JobExecutionContext JobKey SimpleTrigger)))

(set! *warn-on-reflection* true)

(defn- run-job! []
  (.execute ^Job (MonitorRelay.) nil))

(defn- relay-triggers []
  (vec (.getTriggersOfJob (task/scheduler) @#'relay.task/job-key)))

(deftest registration-test
  (tu/do-with-unstarted-temp-scheduler!
   (fn []
     (mt/with-dynamic-fn-redefs [relay.db/engine (constantly :postgres)]
       (task/init! ::relay.task/MonitorRelay)
       (task/init! ::relay.task/MonitorRelay))
     (testing "every node registers the job at startup, and the cluster holds it once, with one trigger"
       (is (= ["metabase-enterprise.monitor-relay.job"]
              (map #(.getName ^JobKey %) (.getJobKeys (task/scheduler) nil))))
       (is (= 1 (count (relay-triggers)))))
     (testing "one run at a time in the cluster"
       (is (=? {:class                            "metabase_enterprise.monitor_relay.task.relay.MonitorRelay"
                :concurrent-execution-disallowed? true
                :durable?                         true}
               (task/job-info @#'relay.task/job-key))))
     (testing "every 10 s, for ever, and Quartz skips a firing over 15 minutes late"
       (let [^SimpleTrigger trigger (first (relay-triggers))]
         (is (= {:interval 10000
                 :repeat   SimpleTrigger/REPEAT_INDEFINITELY
                 :misfire  SimpleTrigger/MISFIRE_INSTRUCTION_RESCHEDULE_NEXT_WITH_REMAINING_COUNT}
                {:interval (.getRepeatInterval trigger)
                 :repeat   (.getRepeatCount trigger)
                 :misfire  (.getMisfireInstruction trigger)})))))))

(deftest scheduled-run-test
  (testing "once registered, the job runs a cycle on this node"
    (reset! @#'relay.cycle/node nil)
    (mt/with-temp-scheduler!
      (mt/with-dynamic-fn-redefs [relay.db/engine (constantly :postgres)]
        (task/init! ::relay.task/MonitorRelay))
      (is (some? (tu/poll-until 5000 (:last-run-at @@#'relay.cycle/node)))))))

(deftest h2-test
  (testing "on an H2 app DB there is no job, and the relay logs one line when it has a URL"
    (tu/do-with-unstarted-temp-scheduler!
     (fn []
       (mt/with-dynamic-fn-redefs [relay.db/engine (constantly :h2)]
         (doseq [[status logged] [[:ok 1] [:malformed 1] [:unset 0]]]
           (mt/with-dynamic-fn-redefs [relay.config/target (constantly {:status status})]
             (mt/with-log-messages-for-level [messages [metabase-enterprise.monitor-relay.task.relay :info]]
               (task/init! ::relay.task/MonitorRelay)
               (is (= logged (count (filter #(re-find #"does nothing on an H2" (:message %)) (messages)))))
               (is (not (task/job-exists? @#'relay.task/job-key)))))))))))

(deftest job-test
  (testing "a run of the job is one relay cycle on this node, from the state its last run left"
    (reset! @#'relay.cycle/node nil)
    (let [runs (atom [])]
      (mt/with-dynamic-fn-redefs [relay.cycle/run-cycle! (fn [state]
                                                           (swap! runs conj state)
                                                           (update state :cycles (fnil inc 0)))]
        (run-job!)
        (run-job!))
      (is (= [nil 1] (map :cycles @runs)))
      (is (string? (:boot-id (first @runs))))
      (is (apply = (map :boot-id @runs)))
      (is (= 2 (:cycles @@#'relay.cycle/node)))))
  (testing "a cycle that throws is logged, and the job returns"
    (mt/with-dynamic-fn-redefs [relay.cycle/cycle! (fn [] (throw (ex-info "boom" {})))]
      (mt/with-log-messages-for-level [messages [metabase-enterprise.monitor-relay.task.relay :error]]
        (run-job!)
        (is (=? [{:level :error, :message #"A Metabase Monitor relay cycle failed.*"}] (messages)))))))

(defn- firing
  "The context of a firing after which the trigger fires next `next-ms` from now."
  ^JobExecutionContext [next-ms]
  (reify JobExecutionContext
    (getNextFireTime [_]
      (Date. (+ (System/currentTimeMillis) (long next-ms))))))

(deftest late-firing-test
  (let [cycles (atom 0)]
    (mt/with-dynamic-fn-redefs [relay.cycle/cycle! #(swap! cycles inc)]
      (testing "a firing runs a cycle"
        (.execute ^Job (MonitorRelay.) (firing 10000))
        (is (= 1 @cycles)))
      (testing "a firing that came due while this node's run went on, with the next firing due too, does nothing"
        (.execute ^Job (MonitorRelay.) (firing -1000))
        (is (= 1 @cycles)))))
  (testing "a late firing runs a cycle when this node ran none for an interval: Quartz had no free thread"
    (is (false? (#'relay.task/missed? (firing -1000) relay.cycle/interval-ms)))
    (is (false? (#'relay.task/missed? (firing -1000) nil)))))
