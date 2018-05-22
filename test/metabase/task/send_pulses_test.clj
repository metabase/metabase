(ns metabase.task.send-pulses-test
  (:require [metabase
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
  (et/email-to :rasta
               {:subject "Metabase alert: My Question Name has results",
                :body    {"My Question Name" true}})
  (et/with-fake-inbox
    (data/with-db (data/get-or-create-database! defs/test-data)
      (et/with-expected-messages 1
        (#'metabase.task.send-pulses/send-pulses! 0 "fri" :first :first))
      (et/regex-email-bodies #"My Question Name"))))
