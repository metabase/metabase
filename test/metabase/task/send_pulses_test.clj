(ns ^:mb/once metabase.task.send-pulses-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.pulse-channel :refer [PulseChannel]]
   [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
   [metabase.models.pulse-channel-test :as pulse-channel-test]
   [metabase.task :as task]
   [metabase.task.send-pulses :as task.send-pulses]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest clear-pulse-channels-test
  (testing "Removes empty PulseChannel"
    (mt/with-temp [Pulse        {pulse-id :id} {}
                   PulseChannel _ {:pulse_id pulse-id}]
      (#'task.send-pulses/clear-pulse-channels!)
      (is (= 0
             (t2/count PulseChannel)))
      (is (:archived (t2/select-one Pulse :id pulse-id)))))

  (testing "Has PulseChannelRecipient"
    (mt/with-temp [Pulse                 {pulse-id :id} {}
                   PulseChannel          {pc-id :id} {:pulse_id     pulse-id
                                                      :channel_type :email}
                   PulseChannelRecipient _           {:user_id          (mt/user->id :rasta)
                                                      :pulse_channel_id pc-id}]
      (#'task.send-pulses/clear-pulse-channels!)
      (is (= 1
             (t2/count PulseChannel)))))

  (testing "Has email"
    (mt/with-temp [Pulse        {pulse-id :id} {}
                   PulseChannel _ {:pulse_id     pulse-id
                                   :channel_type :email
                                   :details      {:emails ["test@metabase.com"]}}]
      (#'task.send-pulses/clear-pulse-channels!)
      (is (= 1
             (t2/count PulseChannel)))))

  (testing "Has channel"
    (mt/with-temp [Pulse        {pulse-id :id} {}
                   PulseChannel _ {:pulse_id     pulse-id
                                   :channel_type :slack
                                   :details      {:channel ["#test"]}}]
      (#'task.send-pulses/clear-pulse-channels!)
      (is (= 1
             (t2/count PulseChannel))))))

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

(deftest reprioritize-send-pulses-group-runs-test
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
                                            daily-at-6pm)]
        (#'task.send-pulses/reprioritize-send-pulses!)
        (is (=? #{(pulse-channel-test/pulse->trigger-info pulse-1 daily-at-1am [pc-1-1 pc-1-2])
                  ;; pc-2-1 has the same schedule as pc-1-1 and pc-1-2 but it's not on the same trigger because it's a
                  ;; different schedule
                  (pulse-channel-test/pulse->trigger-info pulse-2 daily-at-1am [pc-2-1])
                  ;; there is no pc-2--3 because it's disabled
                  (pulse-channel-test/pulse->trigger-info pulse-2 daily-at-6pm [pc-2-2])}
                (pulse-channel-test/send-pulse-triggers)))))))

(deftest reprioritize-send-pulses-delete-pulse-channels-with-no-recipients-test
  (testing "a SendJob trigger will send pulse to channels that have the same schedueld time"
    (pulse-channel-test/with-send-pulse-setup!
      (mt/with-temp
        [:model/Pulse                 {pulse :id}    {}
         :model/PulseChannel          {pc-slack :id} (merge
                                                      {:pulse_id     pulse
                                                       :channel_type :slack
                                                       :details      {:channel "#random"}}
                                                      daily-at-1am)
         :model/PulseChannel          {pc-email :id} (merge
                                                      {:pulse_id     pulse
                                                       :channel_type :email}
                                                      daily-at-1am)
         :model/PulseChannelRecipient {pcr :id}      {:user_id          (mt/user->id :rasta)
                                                      :pulse_channel_id pc-email}]
        (testing "sanity check that it has the triggers to start with"
          (is (= #{(pulse-channel-test/pulse->trigger-info pulse daily-at-1am [pc-slack pc-email])}
                 (pulse-channel-test/send-pulse-triggers))))

        (testing "reprioritize-send-pulses! will delete PulseChannel with no recipients"
          (t2/delete! :model/PulseChannelRecipient pcr)
          (t2/update! :model/PulseChannel pc-slack {:details {}})
          (is (zero? (t2/count :model/PulseChannel pulse)))
          (#'task.send-pulses/reprioritize-send-pulses!)
          (is (= #{}
                  (pulse-channel-test/send-pulse-triggers))))))))

(deftest init-will-schedule-triggers-test
  ;; Context: prior to this, SendPulses is a single job that runs hourly and send all Pulses that are scheduled for that
  ;; hour
  ;; Since that's inefficient and we want to be able to send Pulses in parallel, we changed it so that each PulseChannel
  ;; of the same schedule will be have its own trigger.
  ;; During this transition we need to delete the old SendPulses job and create a new SendPulse job each PulseChannel.
  ;; To do that, we called `reprioritize-send-pulses!` in [[task/init!]] to do this.
  (pulse-channel-test/with-send-pulse-setup!
    (mt/with-temp [:model/Pulse        pulse   {}
                   :model/PulseChannel channel (merge {:pulse_id       (:id pulse)
                                                       :channel_type   :slack
                                                       :details        {:channel "#random"}}
                                                      daily-at-6pm)]
      (testing "sanity check that we don't have any send pulse job to start with"
        ;; the triggers were created in after-insert hook of PulseChannel, so we need to manually delete them
        (doseq [trigger (pulse-channel-test/send-pulse-triggers)]
          (task/delete-trigger! (triggers/key (:key trigger))))
        (is (empty? (pulse-channel-test/send-pulse-triggers))))

      ;; init again
      (task/init! ::task.send-pulses/SendPulses)
      (testing "we have a send pulse job for each PulseChannel"
        (is (= #{(pulse-channel-test/pulse->trigger-info (:id pulse) daily-at-6pm [(:id channel)])}
                (pulse-channel-test/send-pulse-triggers)))))))
