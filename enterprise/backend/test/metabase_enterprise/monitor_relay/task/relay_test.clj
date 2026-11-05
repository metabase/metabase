(ns metabase-enterprise.monitor-relay.task.relay-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.monitor-relay.cycle :as relay.cycle]
   [metabase-enterprise.monitor-relay.db :as relay.db]
   [metabase-enterprise.monitor-relay.settings :as relay.settings]
   [metabase-enterprise.monitor-relay.task.relay :as relay.task]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.util :as tu])
  (:import
   (java.util Date)
   (metabase_enterprise.monitor_relay.task.relay MonitorRelay)
   (org.quartz Job JobExecutionContext JobKey SimpleTrigger)))

(set! *warn-on-reflection* true)

(def ^:private ok-target {:status :ok, :base "http://monitor:8080", :token "tok"})

(defn- run-job! []
  (.execute ^Job (MonitorRelay.) nil))

(defn- relay-triggers []
  (vec (.getTriggersOfJob (task/scheduler) @#'relay.task/job-key)))

(defn- job? []
  (task/job-exists? @#'relay.task/job-key))

(deftest registration-test
  (tu/do-with-unstarted-temp-scheduler!
   (fn []
     (mt/with-dynamic-fn-redefs [relay.db/engine       (constantly :postgres)
                                 relay.settings/target (constantly ok-target)]
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

(deftest schedule-test
  (tu/do-with-unstarted-temp-scheduler!
   (fn []
     (mt/with-dynamic-fn-redefs [relay.db/engine (constantly :postgres)]
       (doseq [target [{:status :unset} {:status :malformed}]]
         (testing (str "the job runs only while the relay has a URL: a " (name (:status target)) " URL deletes it")
           (mt/with-dynamic-fn-redefs [relay.settings/target (constantly ok-target)]
             (relay.task/schedule!)
             (is (job?)))
           (mt/with-dynamic-fn-redefs [relay.settings/target (constantly target)]
             (relay.task/schedule!)
             (is (not (job?))))))))))

(deftest setter-schedules-test
  (testing "saving a URL schedules the job at once, and clearing it deletes the job"
    (mt/with-premium-features #{:monitor-relay}
      (mt/with-temp-env-var-value! [mb-metabase-monitor-url nil]
        (mt/with-temporary-setting-values [metabase-monitor-url nil]
          (tu/do-with-unstarted-temp-scheduler!
           (fn []
             (mt/with-dynamic-fn-redefs [relay.db/engine (constantly :postgres)]
               (relay.settings/metabase-monitor-url! "http://monitor:8080/ingest/tok")
               (is (tu/poll-until 5000 (job?)))
               (relay.settings/metabase-monitor-url! nil)
               (is (tu/poll-until 5000 (not (job?))))))))))))

(deftest feature-test
  (testing "without the monitor-relay feature the relay has no URL, so a node that starts deletes the job"
    (mt/with-temp-env-var-value! [mb-metabase-monitor-url "http://monitor:8080/ingest/tok"]
      (tu/do-with-unstarted-temp-scheduler!
       (fn []
         (mt/with-dynamic-fn-redefs [relay.db/engine (constantly :postgres)]
           (mt/with-premium-features #{:monitor-relay}
             (task/init! ::relay.task/MonitorRelay)
             (is (job?)))
           (mt/with-premium-features #{}
             (task/init! ::relay.task/MonitorRelay)
             (is (not (job?))))))))))

(deftest scheduled-run-test
  (testing "once registered, the job runs a cycle on this node"
    (reset! @#'relay.cycle/node {})
    (mt/with-temp-scheduler!
      (mt/with-dynamic-fn-redefs [relay.db/engine       (constantly :postgres)
                                  relay.settings/target (constantly ok-target)]
        (task/init! ::relay.task/MonitorRelay))
      (is (some? (tu/poll-until 5000 (:last-run-at @@#'relay.cycle/node)))))))

(deftest h2-test
  (testing "on an H2 app DB there is no job, and the relay logs one line when it has a URL"
    (tu/do-with-unstarted-temp-scheduler!
     (fn []
       (mt/with-dynamic-fn-redefs [relay.db/engine (constantly :h2)]
         (doseq [[status logged] [[:ok 1] [:malformed 1] [:unset 0]]]
           (mt/with-dynamic-fn-redefs [relay.settings/target (constantly {:status status})]
             (mt/with-log-messages-for-level [messages [metabase-enterprise.monitor-relay.task.relay :info]]
               (task/init! ::relay.task/MonitorRelay)
               (is (= logged (count (filter #(re-find #"does nothing on an H2" (:message %)) (messages)))))
               (is (not (job?)))))))))))

(deftest job-test
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
      (testing "a firing whose next firing is due already does nothing: a long run made it late, and the next one runs"
        (.execute ^Job (MonitorRelay.) (firing -1000))
        (is (= 1 @cycles))))))
