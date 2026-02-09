(ns metabase.pulse.task.send-pulses-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.notification.test-util :as notification.tu]
   [metabase.pulse.models.pulse-channel-test :as pulse-channel-test]
   [metabase.pulse.send :as pulse.send]
   [metabase.pulse.task.send-pulses :as task.send-pulses]
   [metabase.test :as mt]
   [metabase.test.util :as mt.util]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest clear-pulse-channels-test
  (pulse-channel-test/with-send-pulse-setup!
    (testing "Removes empty PulseChannel"
      (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                     :model/PulseChannel _ {:pulse_id pulse-id}]
        (#'task.send-pulses/clear-pulse-channels-no-recipients! pulse-id)
        (is (= 0
               (t2/count :model/PulseChannel)))
        (is (:archived (t2/select-one :model/Pulse :id pulse-id)))))

    (testing "emails"
      (testing "keep if has PulseChannelRecipient"
        (mt/with-temp [:model/Pulse                 {pulse-id :id} {}
                       :model/PulseChannel          {pc-id :id} {:pulse_id     pulse-id
                                                                 :channel_type :email}
                       :model/PulseChannelRecipient _           {:user_id          (mt/user->id :rasta)
                                                                 :pulse_channel_id pc-id}]
          (#'task.send-pulses/clear-pulse-channels-no-recipients! pulse-id)
          (is (= 1
                 (t2/count :model/PulseChannel)))))

      (testing "keep if has external email"
        (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                       :model/PulseChannel _ {:pulse_id     pulse-id
                                              :channel_type :email
                                              :details      {:emails ["test@metabase.com"]}}]
          (#'task.send-pulses/clear-pulse-channels-no-recipients! pulse-id)
          (is (= 1
                 (t2/count :model/PulseChannel)))))

      (testing "clear if no recipients"
        (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                       :model/PulseChannel _ {:pulse_id     pulse-id
                                              :channel_type :email}]
          (#'task.send-pulses/clear-pulse-channels-no-recipients! pulse-id)
          (is (= 0
                 (t2/count :model/PulseChannel))))))

    (testing "slack"
      (testing "Has channel"
        (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                       :model/PulseChannel _ {:pulse_id     pulse-id
                                              :channel_type :slack
                                              :details      {:channel "#test"}}]
          (#'task.send-pulses/clear-pulse-channels-no-recipients! pulse-id)
          (is (= 1
                 (t2/count :model/PulseChannel)))))

      (testing "No channel"
        (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                       :model/PulseChannel _ {:pulse_id     pulse-id
                                              :channel_type :slack
                                              :details      {:channel nil}}]
          (#'task.send-pulses/clear-pulse-channels-no-recipients! pulse-id)
          (is (= 0
                 (t2/count :model/PulseChannel))))))

    (testing "http"
      (testing "do not clear if has a channel_id"
        (mt/with-temp [:model/Channel {channel-id :id} {:type :channel/metabase-test
                                                        :details {}}
                       :model/Pulse  {pulse-id :id} {}
                       :model/PulseChannel _ {:pulse_id     pulse-id
                                              :channel_id   channel-id
                                              :channel_type "http"}]
          (#'task.send-pulses/clear-pulse-channels-no-recipients! pulse-id)
          (is (= 1
                 (t2/count :model/PulseChannel)))))

      (testing "clear if there is no channel_id"
        (mt/with-temp [:model/Pulse  {pulse-id :id} {}
                       :model/PulseChannel _ {:pulse_id     pulse-id
                                              :channel_type :http}]
          (#'task.send-pulses/clear-pulse-channels-no-recipients! pulse-id)
          (is (= 0
                 (t2/count :model/PulseChannel))))))))

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
      (with-redefs [pulse.send/send-pulse! (fn [_pulse-id & {:keys [channel-ids]}]
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

(deftest send-pulse-skip-alert-test
  (testing "alerts should not be sent even if they have triggers (#63189)"
    (mt/test-helpers-set-global-values!
      (pulse-channel-test/with-send-pulse-setup!
        (mt/with-model-cleanup [:model/Pulse]
          (notification.tu/with-captured-channel-send!
            (let [sent-pulse-ids (atom #{})
                  send-pulse-called (atom 0)
                  original-send-pulse!* @#'task.send-pulses/send-pulse!*]
              (with-redefs [;; run the job every second - must be before creating PulseChannel
                            u.cron/schedule-map->cron-string (constantly "* * * 1/1 * ? *")
                            task.send-pulses/send-pulse!*    (fn [pulse-id channel-ids]
                                                               (swap! send-pulse-called inc)
                                                               (original-send-pulse!* pulse-id channel-ids))
                            pulse.send/send-pulse! (fn [pulse-id & _args]
                                                     (swap! sent-pulse-ids conj pulse-id))]
                (mt/with-temp [:model/Pulse {pulse-id :id} {:creator_id      (mt/user->id :rasta)
                                                            :name            (mt/random-name)
                                                            :alert_condition "rows"}
                               :model/PulseChannel _ (merge {:pulse_id       pulse-id
                                                             :channel_type   :slack
                                                             :enabled        true
                                                             :details        {:channel "#random"}}
                                                            daily-at-6pm)]
                  (testing "trigger exists after creation"
                    (is (= 1 (count (pulse-channel-test/send-pulse-triggers pulse-id)))))

                  (testing "waiting for cron job to fire"
                    (is (u/poll {:thunk      #(pos? @send-pulse-called)
                                 :done?      identity
                                 :timeout-ms 5000})
                        "send-pulse!* was never called - cron job may not be firing"))

                  (testing "alert was not sent (no call to pulse.send/send-pulse!)"
                    (is (empty? @sent-pulse-ids))))))))))))

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

