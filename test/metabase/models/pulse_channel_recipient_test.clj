(ns metabase.models.pulse-channel-recipient-test
  (:require [expectations :refer :all]
            [metabase.models.user :refer [User]]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.pulse-channel :refer [PulseChannel]]
            [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
            [metabase.models.interface :as mi]
            [metabase.api.common :as api]
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
