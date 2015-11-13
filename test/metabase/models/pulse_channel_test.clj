(ns metabase.models.pulse-channel-test
  (:require [clojure.tools.macro :refer [symbol-macrolet]]
            [expectations :refer :all]
            [metabase.db :as db]
            (metabase.models [hydrate :refer :all]
                             [pulse :refer :all]
                             [pulse-channel :refer :all]
                             [pulse-channel-recipient :refer :all])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]))

(defn user-details
  [username]
  (-> (fetch-user username)
      (dissoc :date_joined :last_login :is_superuser)))

;; retrieve-scheduled-channels

;; create-pulse-channel


;; update-pulse-channel
(expect
  ;; simple starting case where we modify the schedule hour and add a recipient
  [{:channel_type  :email
    :schedule_type schedule-type-daily
    :schedule_hour 18
    :schedule_day  nil
    :recipients    [{:email "foo@bar.com"}]
    :details       {}}
   ;; weekly schedule should have a day in it, show that we can get full users
   {:channel_type  :email
    :schedule_type schedule-type-weekly
    :schedule_hour 8
    :schedule_day  "mon"
    :recipients    [{:email "foo@bar.com"} (user-details :rasta)]
    :details       {}}
   ;; hourly schedules don't require day/hour settings (should be nil), fully change recipients
   {:channel_type  :email
    :schedule_type schedule-type-hourly
    :schedule_hour nil
    :schedule_day  nil
    :recipients    [(user-details :crowberto)]
    :details       {}}
   ;; custom details for channels that need it
   {:channel_type  :email
    :schedule_type schedule-type-daily
    :schedule_hour 12
    :schedule_day  nil
    :recipients    [{:email "foo@bar.com"} {:email "blah@bar.com"}]
    :details       {:channel "#metabaserocks"}}]
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       (tu/random-name)}]
    (tu/with-temp PulseChannel [{channel-id :id :as channel} {:pulse_id      id
                                                              :channel_type  :email
                                                              :details       {}
                                                              :schedule_type schedule-type-daily
                                                              :schedule_hour 15}]
      (let [upd-channel (fn [chan]
                             (update-pulse-channel chan)
                             (-> (db/sel :one PulseChannel :id channel-id)
                                 (hydrate :recipients)
                                 (dissoc :id :pulse_id :created_at :updated_at)))]
        [(upd-channel {:id            channel-id
                       :channel_type  :email
                       :schedule_type schedule-type-daily
                       :schedule_hour 18
                       :recipients    [{:email "foo@bar.com"}]})
         (upd-channel {:id            channel-id
                       :channel_type  :email
                       :schedule_type schedule-type-weekly
                       :schedule_hour 8
                       :schedule_day  "mon"
                       :recipients    [{:email "foo@bar.com"} {:id (user->id :rasta)}]})
         (upd-channel {:id            channel-id
                       :channel_type  :email
                       :schedule_type schedule-type-hourly
                       :schedule_hour 12
                       :schedule_day  "tue"
                       :recipients    [{:id (user->id :crowberto)}]})
         (upd-channel {:id            channel-id
                       :channel_type  :email
                       :schedule_type schedule-type-daily
                       :schedule_hour 12
                       :schedule_day  "tue"
                       :recipients    [{:email "foo@bar.com"} {:email "blah@bar.com"}]
                       :details       {:channel "#metabaserocks"}})]))))


;; update-recipients!
(expect
  [[]
   [(user->id :rasta)]
   [(user->id :crowberto)]
   [(user->id :crowberto) (user->id :rasta)]
   [(user->id :rasta) (user->id :trashbird)]]
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       (tu/random-name)}]
    (tu/with-temp PulseChannel [{channel-id :id} {:pulse_id      id
                                                  :channel_type  :email
                                                  :details       {}
                                                  :schedule_type "daily"}]
      (let [upd-recipients (fn [recipients]
                             (update-recipients! channel-id recipients)
                             (->> (db/sel :many PulseChannelRecipient :pulse_channel_id channel-id)
                                  (mapv :user_id)))]
        [(upd-recipients [])
         (upd-recipients [(user->id :rasta)])
         (upd-recipients [(user->id :crowberto)])
         (upd-recipients [(user->id :crowberto) (user->id :rasta)])
         (upd-recipients [(user->id :rasta) (user->id :trashbird)])]))))
