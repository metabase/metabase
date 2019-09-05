(ns metabase.models.pulse-channel-recipient-test
  (:require [expectations :refer :all]
            [metabase.api.common :as api]
            [metabase.models
             [interface :as mi]
             [pulse :refer [Pulse]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]]
            [metabase.test.data.users :refer :all]
            [toucan.util.test :as tt]))

;; A user can read and write their own PCR
(expect
  (tt/with-temp* [Pulse                 [{pulse-id :id}   {:name "Lodi Dodi" :creator_id (user->id :crowberto)}]
                  PulseChannel          [{channel-id :id} {:pulse_id      pulse-id
                                                           :channel_type  "email"
                                                           :schedule_type "daily"
                                                           :details       {:other  "stuff"
                                                                           :emails ["foo@bar.com"]}}]
                  PulseChannelRecipient [pcr              {:pulse_channel_id channel-id :user_id (user->id :rasta)}]]
    (binding [api/*current-user-permissions-set* (atom #{(str "/member/" (user->id :rasta) "/")})]
      (and (mi/can-read? pcr)
           (mi/can-write? pcr)))))

;; A user can't read and write someone else's PCR
(expect
  (tt/with-temp* [Pulse                 [{pulse-id :id}   {:name "Lodi Dodi" :creator_id (user->id :crowberto)}]
                  PulseChannel          [{channel-id :id} {:pulse_id      pulse-id
                                                           :channel_type  "email"
                                                           :schedule_type "daily"
                                                           :details       {:other  "stuff"
                                                                           :emails ["foo@bar.com"]}}]
                  PulseChannelRecipient [pcr              {:pulse_channel_id channel-id :user_id (user->id :rasta)}]]
    (binding [api/*current-user-permissions-set* (atom #{(str "/member/" (user->id :crowberto) "/")})]
      (not (and (mi/can-read? pcr)
                (mi/can-write? pcr))))))
