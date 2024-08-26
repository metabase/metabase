(ns ^:mb/once metabase.task.send-pulses-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.pulse-channel :refer [PulseChannel]]
   [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
   [metabase.models.pulse-channel-test :as pulse-channel-test]
   [metabase.pulse]
   [metabase.task :as task]
   [metabase.task.send-pulses :as task.send-pulses]
   [metabase.test :as mt]
   [metabase.test.util :as mt.util]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest clear-pulse-channels-test
  (pulse-channel-test/with-send-pulse-setup!
    (testing "Removes empty PulseChannel"
      (mt/with-temp [Pulse        {pulse-id :id} {}
                     PulseChannel _ {:pulse_id pulse-id}]
        (#'task.send-pulses/clear-pulse-channels-no-recipients! pulse-id)
        (is (= 0
               (t2/count PulseChannel)))
        (is (:archived (t2/select-one Pulse :id pulse-id)))))

    (testing "Has PulseChannelRecipient"
      (mt/with-temp [Pulse                 {pulse-id :id} {}
                     PulseChannel          {pc-id :id} {:pulse_id     pulse-id
                                                        :channel_type :email}
                     PulseChannelRecipient _           {:user_id          (mt/user->id :rasta)
                                                        :pulse_channel_id pc-id}]
        (#'task.send-pulses/clear-pulse-channels-no-recipients! pulse-id)
        (is (= 1
               (t2/count PulseChannel)))))

    (testing "Has email"
      (mt/with-temp [Pulse        {pulse-id :id} {}
                     PulseChannel _ {:pulse_id     pulse-id
                                     :channel_type :email
                                     :details      {:emails ["test@metabase.com"]}}]
        (#'task.send-pulses/clear-pulse-channels-no-recipients! pulse-id)
        (is (= 1
               (t2/count PulseChannel)))))

    (testing "Has channel"
      (mt/with-temp [Pulse        {pulse-id :id} {}
                     PulseChannel _ {:pulse_id     pulse-id
                                     :channel_type :slack
                                     :details      {:channel ["#test"]}}]
        (#'task.send-pulses/clear-pulse-channels-no-recipients! pulse-id)
        (is (= 1
               (t2/count PulseChannel)))))))

(def ^:private daily-at-1am
  {:schedule_type  "daily"
   :schedule_hour  1
   :schedule_day   nil
   :schedule_frame nil})

(def ^:private daily-at-6pm
  {:schedule_type  "daily"
   :schedule_hour  18
   :schedule_day   nil
   :schedule_frame nil})

(deftest send-pulse!*-delete-pcs-no-recipients-test
  (testing "send-pulse!* should delete PulseChannels and only send to enabled channels"
    (let [sent-channel-ids (atom #{})]
      (with-redefs [metabase.pulse/send-pulse! (fn [_pulse-id & {:keys [channel-ids]}]
                                                 (swap! sent-channel-ids set/union channel-ids))]
        (mt/with-temp
          [:model/Pulse        {pulse :id}            {}
           :model/PulseChannel {pc :id}               (merge
                                                       {:pulse_id     pulse
                                                        :channel_type :slack
                                                        :details      {:channel "#random"}}
                                                       daily-at-1am)
           :model/PulseChannel {pc-disabled :id}      (merge
                                                       {:enabled      false
                                                        :pulse_id     pulse
                                                        :channel_type :slack
                                                        :details      {:channel "#random"}}
                                                       daily-at-1am)
           :model/PulseChannel {pc-no-recipient :id}  (merge
                                                       {:pulse_id     pulse
                                                        :channel_type :slack
                                                        :details      {}}
                                                       daily-at-1am)]
          (#'task.send-pulses/send-pulse!* pulse #{pc pc-disabled pc-no-recipient})
          (testing "only send to enabled channels that has recipients"
            (is (= #{pc} @sent-channel-ids)))

          (testing "channels that has no recipients are deleted"
            (is (false? (t2/exists? :model/PulseChannel pc-no-recipient)))))))))

(deftest init-send-pulse-triggers!-group-runs-test
  (testing "a SendJob trigger will send pulse to channels that have the same schedueld time"
    (pulse-channel-test/with-send-pulse-setup!
      (mt/with-temp
        [:model/Pulse        {pulse-1 :id} {}
         :model/PulseChannel {pc-1-1 :id}  (merge
                                            {:pulse_id     pulse-1
                                             :channel_type :slack
                                             :details      {:channel "#random"}}
                                            daily-at-1am)
         :model/PulseChannel {pc-1-2 :id}  (merge
                                            {:pulse_id     pulse-1
                                             :channel_type :slack
                                             :details      {:channel "#general"}}
                                            daily-at-1am)
         :model/Pulse        {pulse-2 :id} {}
         :model/PulseChannel {pc-2-1 :id}  (merge
                                            {:pulse_id     pulse-2
                                             :channel_type :slack
                                             :details      {:channel "#random"}}
                                            daily-at-1am)
         :model/PulseChannel {pc-2-2 :id}  (merge
                                            {:pulse_id     pulse-2
                                             :channel_type :slack
                                             :details      {:channel "#general"}}
                                            daily-at-6pm)
         :model/PulseChannel {_pc-2-3 :id} (merge
                                            {:enabled     false
                                             :pulse_id     pulse-2
                                             :channel_type :slack
                                             :details      {:channel "#general"}}
                                            daily-at-6pm)
         :model/Dashboard    {dash-id :id} {}
         :model/Pulse        {pulse-3 :id} {:dashboard_id dash-id}
         :model/PulseChannel {pc-3-1 :id}  (merge
                                            {:enabled      true
                                             :pulse_id     pulse-3
                                             :channel_type :slack
                                             :details      {:channel "#general"}}
                                            daily-at-6pm)
         ;; pulse of archived dashboard shouldn't be scheduled
         :model/Dashboard    {dash-id-2 :id} {:archived true}
         :model/Pulse        {pulse-4 :id}   {:dashboard_id dash-id-2}
         :model/PulseChannel {_pc-4-1 :id}   (merge
                                              {:enabled      true
                                               :pulse_id     pulse-4
                                               :channel_type :slack
                                               :details      {:channel "#general"}}
                                              daily-at-6pm)]
        (let [all-send-pulse-triggers #(set/union
                                        (pulse-channel-test/send-pulse-triggers pulse-1)
                                        (pulse-channel-test/send-pulse-triggers pulse-2)
                                        (pulse-channel-test/send-pulse-triggers pulse-3)
                                        (pulse-channel-test/send-pulse-triggers pulse-4))]
          ;; delete all triggers created by PulseChanne hooks
          (doseq [trigger-info (all-send-pulse-triggers)]
            (task/delete-trigger! (triggers/key (:key trigger-info))))
          (testing "sanity check that there are no triggers"
            (is (empty? (all-send-pulse-triggers))))
          (testing "init-send-pulse-triggers! should create triggers for each pulse-channel"
            (#'task.send-pulses/init-send-pulse-triggers!)
            (is (=? #{(pulse-channel-test/pulse->trigger-info pulse-1 daily-at-1am [pc-1-1 pc-1-2])
                      ;; pc-2-1 has the same schedule as pc-1-1 and pc-1-2 but it's not on the same trigger because it's a
                      ;; different schedule
                      (pulse-channel-test/pulse->trigger-info pulse-2 daily-at-1am [pc-2-1])
                      ;; there is no pc-2--3 because it's disabled
                      (pulse-channel-test/pulse->trigger-info pulse-2 daily-at-6pm [pc-2-2])
                      (pulse-channel-test/pulse->trigger-info pulse-3 daily-at-6pm [pc-3-1])}
                    (all-send-pulse-triggers)))))))))

(deftest send-pulses-exceed-thread-pool-test
  (testing "test that if we have more send-pulse triggers than the number of available threads, all channels will still be sent"
    (pulse-channel-test/with-send-pulse-setup!
      (mt/with-model-cleanup [:model/Pulse]
        (let [sent-channel-ids (atom #{})]
          (with-redefs [;; run the job every second
                        u.cron/schedule-map->cron-string (constantly "* * * 1/1 * ? *")
                        task.send-pulses/send-pulse!     (fn [_pulse-id channel-ids]
                                                           (swap! sent-channel-ids set/union channel-ids))]
            (let [pc-count  (+ 2 mt.util/in-memory-scheduler-thread-count)
                  pulse-ids (t2/insert-returning-pks! :model/Pulse
                                                      (repeat pc-count {:creator_id (mt/user->id :rasta)
                                                                        :name       (mt/random-name)}))
                  pc-ids    (t2/insert-returning-pks! :model/PulseChannel
                                                      (for [pulse-id pulse-ids]
                                                        (merge {:pulse_id       pulse-id
                                                                :channel_type   :slack
                                                                :details        {:channel "#random"}}
                                                               daily-at-6pm)))]
              (testing "sanity check that we have the correct number of triggers and no channel has been sent yet"
                (is (= pc-count (->> pulse-ids (map pulse-channel-test/send-pulse-triggers) (apply set/union) count))))

              (testing "make sure that all channels will be sent even though number of jobs exceed the thread pool"
                (u/poll {:thunk      (fn [] @sent-channel-ids)
                         :done?      #(= pc-count (count %))
                         :timeout-ms 3000})
                (is (= (set pc-ids) @sent-channel-ids))))))))))

(def ^:private daily-at-8am
  {:schedule_type  "daily"
   :schedule_hour  8
   :schedule_day   nil
   :schedule_frame nil})

(defn- send-pusle-triggers-next-fire-time
  [pulse-id]
  (first (map :next-fire-time (pulse-channel-test/send-pulse-triggers pulse-id :additional-keys [:next-fire-time]))))

(defn next-fire-hour
  [expected-hour]
  (let [now       (t/offset-date-time (t/zone-offset 0))
        next-day? (>= (.getHour now) expected-hour)]
    (cond-> (t/offset-date-time (.getYear now)
                                (.. now getMonth getValue)
                                (.getDayOfMonth now)
                                expected-hour
                                0 0 0 (t/zone-offset 0))
      ;; if the current hour is greater than the expected hour, then it should be fired tomorrow
      next-day? (t/plus (t/days 1))
      true      t/java-date)))

(deftest send-pulse-trigger-respect-report-timezone-test
  (pulse-channel-test/with-send-pulse-setup!
    (mt/with-temporary-setting-values [report-timezone "Asia/Ho_Chi_Minh" #_utc+7]
      (mt/with-temp
        [:model/Pulse        {pulse :id} {}
         :model/PulseChannel {_pc :id} (merge
                                        {:pulse_id     pulse
                                         :channel_type :slack
                                         :details      {:channel "#random"}}
                                        daily-at-8am)]
        ;; if its want to be fired at 8 am utc+7, then it should be fired at 1am utc
        (is (= (next-fire-hour 1)
               (send-pusle-triggers-next-fire-time pulse)))))

    (mt/with-temporary-setting-values [report-timezone "UTC"]
      (mt/with-temp
        [:model/Pulse        {pulse :id} {}
         :model/PulseChannel {_pc :id} (merge
                                        {:pulse_id     pulse
                                         :channel_type :slack
                                         :details      {:channel "#random"}}
                                        daily-at-8am)]
        (is (= (next-fire-hour 8)
               (send-pusle-triggers-next-fire-time pulse)))))))

(deftest change-report-timezone-will-update-triggers-timezone-test
  (pulse-channel-test/with-send-pulse-setup!
    (mt/discard-setting-changes [report-timezone]
      (mt/with-temp
        [:model/Pulse        {pulse :id} {}
         :model/PulseChannel {pc :id} (merge
                                       {:pulse_id     pulse
                                        :channel_type :slack
                                        :details      {:channel "#random"}}
                                       daily-at-8am)]
        (testing "Sanity check"
          (is (= #{(assoc (pulse-channel-test/pulse->trigger-info pulse daily-at-8am #{pc})
                          :timezone "UTC"
                          :next-fire-time (next-fire-hour 8))}
                 (pulse-channel-test/send-pulse-triggers pulse :additional-keys [:next-fire-time :timezone]))))
        (driver/report-timezone! "Asia/Ho_Chi_Minh")
        (testing "changing report timezone will change the timezone and fire time of the trigger"
          (is (= #{(assoc (pulse-channel-test/pulse->trigger-info pulse daily-at-8am #{pc})
                          :timezone "Asia/Ho_Chi_Minh"
                          :next-fire-time (next-fire-hour 1))}
                 (pulse-channel-test/send-pulse-triggers pulse :additional-keys [:next-fire-time :timezone]))))))))
