(ns ^:mb/once metabase.task.send-pulses-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.pulse-channel :refer [PulseChannel]]
   [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
   [metabase.models.pulse-channel-test :as pulse-channel-test]
   [metabase.pulse]
   [metabase.task :as task]
   [metabase.task.send-pulses :as task.send-pulses]
   [metabase.test :as mt]
   [metabase.test.util :as mt.util]
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
          (#'task.send-pulses/send-pulse!* daily-at-1am pulse #{pc pc-disabled pc-no-recipient})
          (testing "only send to enabled channels that has recipients"
            (is (= #{pc} @sent-channel-ids)))

          (testing "channels that has no recipients are deleted"
            (is (false? (t2/exists? :model/PulseChannel pc-no-recipient)))))))))

(deftest send-pulse!*-update-trigger-priority-test
  (testing "send-pulse!* should update the priority of the trigger based on the duration of the pulse"
    (pulse-channel-test/with-send-pulse-setup!
     (with-redefs [task.send-pulses/ms-duration->priority (constantly 7)
                   metabase.pulse/send-pulse!             (constantly nil)]
       (mt/with-temp
         [:model/Pulse        {pulse :id} {}
          :model/PulseChannel {pc :id}    (merge
                                           {:pulse_id     pulse
                                            :channel_type :slack
                                            :details      {:channel "#random"}}
                                           daily-at-1am)]
         (testing "priority is 6 to start with"
           (is (= 6 (-> (pulse-channel-test/send-pulse-triggers pulse) first :priority))))
         (#'task.send-pulses/send-pulse!* daily-at-1am pulse #{pc})
         (testing "send pulse should update its priority"
           ;; 5 is the default priority of a trigger, we need it to be higher than that because
           ;; pulse is time sensitive compared to other tasks like sync
           (is (= 7 (-> (pulse-channel-test/send-pulse-triggers pulse) first :priority)))))))))

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
          (with-redefs [;; run the job every 2 seconds
                        u.cron/schedule-map->cron-string (constantly "0/2 * * 1/1 * ? *")
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
              (testing "sanity check that we have the correct number triggers and no channel has been sent yet"
                (is (= pc-count (->> pulse-ids (map pulse-channel-test/send-pulse-triggers) (apply set/union) count)))
                (is (= #{} @sent-channel-ids)))
              ;; job run every 2 seconds, so wait a bit so the job can run
              (Thread/sleep 3000)
              (testing "make sure that all channels will be sent even though number of jobs exceed the thread pool"
                (is (= (set pc-ids) @sent-channel-ids))))))))))
