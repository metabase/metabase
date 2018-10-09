(ns metabase.task.send-pulses-test
  (:require [expectations :refer :all]
            [metabase
             [email :as email]
             [email-test :as et]
             [pulse-test :refer [checkins-query]]]
            [metabase.models
             [card :refer [Card]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]]
            [metabase.task.send-pulses :refer :all]
            [metabase.test.data :as data]
            [metabase.test.data
             [dataset-definitions :as defs]
             [users :as users]]
            [toucan.util.test :as tt]))

(tt/expect-with-temp [Card                 [{card-id :id}  (assoc (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})
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
    (data/with-db (data/get-or-create-database! defs/test-data)
      (let [exceptions (atom [])
            on-error   (fn [_ exception]
                         (swap! exceptions conj exception))]
        (et/with-expected-messages 1
          (#'metabase.task.send-pulses/send-pulses! 0 "fri" :first :first on-error))
        {:emails     (et/regex-email-bodies #"My Question Name")
         :exceptions @exceptions}))))

;; Test that when we attempt to send a pulse that is archived, it just skips the pulse and sends nothing. Previously
;; this failed schema validation (see issue #8581)
(expect
  {:emails     (et/email-to :rasta
                            {:subject "Test"
                             :body    {"Test Message" true}})
   :exceptions []}

  (tt/with-temp* [Card                 [{card-id :id}    (assoc (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})
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
      (data/with-db (data/get-or-create-database! defs/test-data)
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
           :exceptions @exceptions})))))
