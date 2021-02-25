(ns metabase.task.send-pulses-test
  (:require [expectations :refer :all]
            [metabase.email :as email]
            [metabase.email-test :as et]
            [metabase.models.card :refer [Card]]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.pulse-card :refer [PulseCard]]
            [metabase.models.pulse-channel :refer [PulseChannel]]
            [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
            [metabase.pulse.test-util :refer [checkins-query-card]]
            [metabase.task.send-pulses :refer :all]
            [metabase.test.data :as data]
            [metabase.test.data.users :as users]
            [toucan.util.test :as tt]))

(tt/expect-with-temp [Card                 [{card-id :id}  (assoc (checkins-query-card {:breakout [[:field (data/id :checkins :date) {:temporal-unit :hour}]]})
                                                             :name "My Question Name")]
                      Pulse                [{pulse-id :id} {:alert_condition  "rows"
                                                            :alert_first_only false}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id      pulse-id
                                                            :schedule_hour nil
                                                            :schedule_type "hourly"
                                                            :channel_type  :email}]
                      PulseChannelRecipient [_             {:user_id          (users/user->id :rasta)
                                                            :pulse_channel_id pc-id}]]
  {:emails     (et/email-to :rasta
                            {:subject "Metabase alert: My Question Name has results",
                             :body    {"My Question Name" true}})
   :exceptions []}
  (et/with-fake-inbox
    (let [exceptions (atom [])
          on-error   (fn [_ exception]
                       (swap! exceptions conj exception))]
      (et/with-expected-messages 1
        (#'metabase.task.send-pulses/send-pulses! 0 "fri" :first :first on-error))
      {:emails     (et/regex-email-bodies #"My Question Name")
       :exceptions @exceptions})))

;; Test that when we attempt to send a pulse that is archived, it just skips the pulse and sends nothing. Previously
;; this failed schema validation (see metabase#8581)
(expect
  {:emails     (et/email-to :rasta
                            {:subject "Test"
                             :body    {"Test Message" true}})
   :exceptions []}

  (tt/with-temp* [Card                 [{card-id :id}    (assoc (checkins-query-card {:breakout [[:field (data/id :checkins :date) {:temporal-unit :hour}]]})
                                                           :name "My Question Name")]
                  Pulse                [{pulse-id :id}   {:name "Test", :archived true}]
                  PulseCard             [_               {:pulse_id pulse-id
                                                          :card_id  card-id
                                                          :position 0}]
                  PulseChannel          [{pc-id :id}     {:pulse_id      pulse-id
                                                          :schedule_hour nil
                                                          :schedule_type "hourly"
                                                          :channel_type  :email}]
                  PulseChannelRecipient [_               {:user_id          (users/user->id :rasta)
                                                          :pulse_channel_id pc-id}]]
    (et/with-fake-inbox
      (let [exceptions (atom [])
            on-error   (fn [_ exception]
                         (swap! exceptions conj exception))]
        (et/with-expected-messages 1
          ;; Send the pulse, though it's not going to send anything. Typically we'd block waiting for the message to
          ;; arrive, but there should be no message
          (#'metabase.task.send-pulses/send-pulses! 0 "fri" :first :first on-error)
          ;; This sends a test message. If we see our test message that means we didn't send a pulse message (which
          ;; is what we want)
          (email/send-message!
            :subject      "Test"
            :recipients   ["rasta@metabase.com"]
            :message-type :html
            :message      "Test Message"))
        {:emails     (et/regex-email-bodies #"Test Message")
         ;; There shouldn't be any failures, just skipping over the archived pulse
         :exceptions @exceptions}))))
