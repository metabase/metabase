(ns metabase.api.pulse-channel-recipient-test
  (:require [expectations :refer :all]
            [metabase.http-client :as http]
            [metabase.middleware.util :as middleware.u]
            [metabase.models
             [pulse :refer [Pulse]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]]
            [metabase.test.data.users :refer :all]
            [toucan.util.test :as tt]))

(expect (:body middleware.u/response-unauthentic)
        (http/client :delete 401 "pulse-channel-recipient/13"))


;; Users can delete their own pulse channel recipient
(expect
  nil
  (tt/with-temp* [Pulse                 [{pulse-id :id}   {:name "Lodi Dodi" :creator_id (user->id :crowberto)}]
                  PulseChannel          [{channel-id :id} {:pulse_id      pulse-id
                                                           :channel_type  "email"
                                                           :schedule_type "daily" 
                                                           :details       {:other  "stuff"
                                                                           :emails ["foo@bar.com"]}}]
                  PulseChannelRecipient [pcr              {:pulse_channel_id channel-id :user_id (user->id :rasta)}]]
    ((user->client :rasta) :delete 204 (str "pulse-channel-recipient/" (:id pcr)))))

;; Users can't delete someone else's pulse channel recipient
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Pulse                 [{pulse-id :id}   {:name "Lodi Dodi" :creator_id (user->id :crowberto)}]
                  PulseChannel          [{channel-id :id} {:pulse_id      pulse-id
                                                           :channel_type  "email"
                                                           :schedule_type "daily" 
                                                           :details       {:other  "stuff"
                                                                           :emails ["foo@bar.com"]}}]
                  PulseChannelRecipient [pcr              {:pulse_channel_id channel-id :user_id (user->id :rasta)}]]
    ((user->client :lucky) :delete 403 (str "pulse-channel-recipient/" (:id pcr)))))
