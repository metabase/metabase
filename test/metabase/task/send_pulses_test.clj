(ns ^:mb/once metabase.task.send-pulses-test
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.email :as email]
   [metabase.email-test :as et]
   [metabase.models.card :refer [Card]]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.pulse-card :refer [PulseCard]]
   [metabase.models.pulse-channel :refer [PulseChannel]]
   [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
   [metabase.models.pulse-channel-test :as pulse-channel-test]
   [metabase.pulse.test-util :refer [checkins-query-card]]
   [metabase.task :as task]
   [metabase.task.send-pulses :as task.send-pulses]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

#_(deftest send-pulses-test
   (mt/with-temp [Card                 {card-id :id}  (assoc (checkins-query-card {:breakout [[:field (mt/id :checkins :date) {:temporal-unit :day}]]})
                                                             :name "My Question Name")
                  Pulse                {pulse-id :id} {:alert_condition  "rows"
                                                       :alert_first_only false}
                  PulseCard             _             {:pulse_id pulse-id
                                                       :card_id  card-id
                                                       :position 0}
                  PulseChannel          {pc-id :id}   {:pulse_id      pulse-id
                                                       :schedule_hour nil
                                                       :schedule_type "hourly"
                                                       :channel_type  :email}
                  PulseChannelRecipient _             {:user_id          (mt/user->id :rasta)
                                                       :pulse_channel_id pc-id}]
     (et/with-fake-inbox
       (let [exceptions (atom [])
             on-error   (fn [_ exception]
                          (swap! exceptions conj exception))]
         (et/with-expected-messages 1
           (#'send-pulses/send-pulses! 0 "fri" :first :first on-error))
         (testing "emails"
           (is (= (et/email-to :rasta
                               {:subject "Alert: My Question Name has results",
                                :body    {"My Question Name" true}
                                :bcc?    true})
                  (et/regex-email-bodies #"My Question Name"))))
         (testing "exceptions"
           (is (= []
                  @exceptions)))))))

#_(deftest dont-send-archived-pulses-test
    (testing (str "Test that when we attempt to send a pulse that is archived, it just skips the pulse and sends "
                  "nothing. Previously this failed schema validation (see metabase#8581)")
      (mt/with-temp [Card                 {card-id :id}    (assoc (checkins-query-card {:breakout [[:field (mt/id :checkins :date) {:temporal-unit :day}]]})
                                                                  :name "My Question Name")
                     Pulse                {pulse-id :id}   {:name "Test", :archived true}
                     PulseCard             _               {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}
                     PulseChannel          {pc-id :id}     {:pulse_id      pulse-id
                                                            :schedule_hour nil
                                                            :schedule_type "hourly"
                                                            :channel_type  :email}
                     PulseChannelRecipient _               {:user_id          (mt/user->id :rasta)
                                                            :pulse_channel_id pc-id}]
        (et/with-fake-inbox
          (let [exceptions (atom [])
                on-error   (fn [_ exception]
                             (swap! exceptions conj exception))]
            (et/with-expected-messages 1
              ;; Send the pulse, though it's not going to send anything. Typically we'd block waiting for the message to
              ;; arrive, but there should be no message
              (#'send-pulses/send-pulses! 0 "fri" :first :first on-error)
              ;; This sends a test message. If we see our test message that means we didn't send a pulse message (which
              ;; is what we want)
              (email/send-message!
                :subject      "Test"
                :recipients   ["rasta@metabase.com"]
                :message-type :html
                :message      "Test Message"))
            (testing "emails"
              (is (= (et/email-to :rasta
                                  {:subject "Test"
                                   :body    {"Test Message" true}})
                     (et/regex-email-bodies #"Test Message"))))
            (testing "There shouldn't be any failures, just skipping over the archived pulse"
              (is (= []
                     @exceptions))))))))

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

(deftest reprioritize-send-pulses-test)



(def ^:private daily-at-6pm
  {:schedule_type  "daily"
   :schedule_hour  18
   :schedule_day   nil
   :schedule_frame nil})

(deftest init-will-schedule-triggers-test
  ;; Context: prior to this, SendPulses is a single job that runs hourly and send all Pulses that are scheduled for that
  ;; hour sequentially
  ;; Since that's inefficient and we want to be able to send Pulses in parallel, we changed it so that each PulseChannel
  ;; of the same schedule and Pulse will be have its own trigger.
  ;; During this transition we need to delete the old SendPulses job and trigger and recreate a new SendPulse job for
  ;; each PulseChannel.
  ;; So we called `reprioritize-send-pulses` init task/init! to do this.
  ;; Since function is idempotence it's ok to call it multiple times. After this we'll also want to make this function
  ;; prioritize pulses based on its send times so that fast pulses are sent first.
  (mt/with-temp-scheduler
    ;; init so that adding PulseChannel doesn't throw error because the job does not exist
    (task/init! ::task.send-pulses/SendPulses)
    (mt/with-temp [:model/Pulse        pulse   {}
                   :model/PulseChannel channel (merge {:pulse_id       (:id pulse)
                                                       :channel_type   :slack
                                                       :details        {:channel "#random"}}
                                                      daily-at-6pm)]
      (testing "sanity check that we don't have any send pulse job to start with"
        ;; the triggers were created in after-insert hook of PulseChannel, so we need to manually delete them
        (doseq [trigger (:triggers (task/job-info @#'task.send-pulses/send-pulse-job-key))]
          (task/delete-trigger! (triggers/key (:key trigger))))
        (is (empty? (:triggers (task/job-info @#'task.send-pulses/send-pulse-job-key)))))

      ;; init again
      (task/init! ::task.send-pulses/SendPulses)
      (testing "we have a send pulse job for each PulseChannel"
        (is (=? [(pulse-channel-test/pulse->trigger-info (:id pulse) daily-at-6pm [(:id channel)])]
                (:triggers (task/job-info @#'task.send-pulses/send-pulse-job-key))))))))
