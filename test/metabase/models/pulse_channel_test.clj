(ns metabase.models.pulse-channel-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            (metabase.models [hydrate :refer :all]
                             [pulse :refer :all]
                             [pulse-channel :refer :all]
                             [pulse-channel-recipient :refer :all])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [medley.core :as m]))


;; Test out our predicate functions

;; day-of-week?
(expect false (day-of-week? nil))
(expect false (day-of-week? []))
(expect false (day-of-week? {}))
(expect false (day-of-week? "abc"))
(expect true (day-of-week? "mon"))
(expect false (day-of-week? :mon))

;; hour-of-day?
(expect false (hour-of-day? nil))
(expect false (hour-of-day? 500))
(expect false (hour-of-day? -12))
(expect false (hour-of-day? 8.5))
(expect false (hour-of-day? "abc"))
(expect true (hour-of-day? 11))
(expect true (hour-of-day? 0))
(expect true (hour-of-day? 23))

;; schedule-type?
(expect false (schedule-type? nil))
(expect false (schedule-type? "abc"))
(expect false (schedule-type? 123))
(expect false (schedule-type? "daily"))
(expect true (schedule-type? schedule-type-hourly))
(expect true (schedule-type? schedule-type-daily))
(expect true (schedule-type? schedule-type-weekly))

;; valid-schedule?
(expect false (valid-schedule? nil nil nil))
(expect false (valid-schedule? :foo nil nil))
(expect true (valid-schedule? schedule-type-hourly nil nil))
(expect true (valid-schedule? schedule-type-hourly 12 "abc"))
(expect false (valid-schedule? schedule-type-daily nil nil))
(expect false (valid-schedule? schedule-type-daily 35 nil))
(expect true (valid-schedule? schedule-type-daily 12 nil))
(expect false (valid-schedule? schedule-type-weekly nil nil))
(expect false (valid-schedule? schedule-type-weekly 12 nil))
(expect false (valid-schedule? schedule-type-weekly 12 "blah"))
(expect true (valid-schedule? schedule-type-weekly 12 "wed"))

;; channel-type?
(expect false (channel-type? nil))
(expect false (channel-type? "abc"))
(expect false (channel-type? 123))
(expect false (channel-type? :sms))
(expect false (channel-type? "email"))
(expect true (channel-type? :email))
(expect true (channel-type? :slack))

;; supports-recipients?
(expect false (supports-recipients? nil))
(expect false (supports-recipients? "abc"))
(expect true (supports-recipients? :email))
(expect false (supports-recipients? :slack))


;; helper functions

;; format user details like they would come back for a channel recipient
(defn user-details
  [username]
  (-> (fetch-user username)
      (dissoc :date_joined :last_login :is_superuser)))

;; create a channel then select its details
(defn- create-channel-then-select
  [channel]
  (when-let [new-channel-id (create-pulse-channel channel)]
    (-> (db/sel :one PulseChannel :id new-channel-id)
        (hydrate :recipients)
        (update :recipients #(sort-by :email %))
        (dissoc :id :pulse_id :created_at :updated_at)
        (m/dissoc-in [:details :emails]))))

(defn- update-channel-then-select
  [{:keys [id] :as channel}]
  (update-pulse-channel channel)
  (-> (db/sel :one PulseChannel :id id)
      (hydrate :recipients)
      (dissoc :id :pulse_id :created_at :updated_at)
      (m/dissoc-in [:details :emails])))

;; create-pulse-channel
(expect
  {:channel_type  :email
   :schedule_type schedule-type-daily
   :schedule_hour 18
   :schedule_day  nil
   :recipients    [(user-details :crowberto)
                   {:email "foo@bar.com"}
                   (user-details :rasta)]}
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       (tu/random-name)}]
    (create-channel-then-select {:pulse_id      id
                                 :channel_type  :email
                                 :schedule_type schedule-type-daily
                                 :schedule_hour 18
                                 :recipients    [{:email "foo@bar.com"} {:id (user->id :rasta)} {:id (user->id :crowberto)}]})))

(expect
  {:channel_type  :slack
   :schedule_type schedule-type-hourly
   :schedule_hour nil
   :schedule_day  nil
   :recipients    []
   :details       {:something "random"}}
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       (tu/random-name)}]
    (create-channel-then-select {:pulse_id      id
                                 :channel_type  :slack
                                 :schedule_type schedule-type-hourly
                                 :details       {:something "random"}
                                 :recipients    [{:email "foo@bar.com"} {:id (user->id :rasta)} {:id (user->id :crowberto)}]})))


;; update-pulse-channel
;; simple starting case where we modify the schedule hour and add a recipient
(expect
  {:channel_type  :email
   :schedule_type schedule-type-daily
   :schedule_hour 18
   :schedule_day  nil
   :recipients    [{:email "foo@bar.com"}]}
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       (tu/random-name)}]
    (tu/with-temp PulseChannel [{channel-id :id :as channel} {:pulse_id      id
                                                              :channel_type  :email
                                                              :details       {}
                                                              :schedule_type schedule-type-daily
                                                              :schedule_hour 15}]
      (update-channel-then-select {:id            channel-id
                                   :channel_type  :email
                                   :schedule_type schedule-type-daily
                                   :schedule_hour 18
                                   :recipients    [{:email "foo@bar.com"}]}))))

;; weekly schedule should have a day in it, show that we can get full users
(expect
  {:channel_type  :email
   :schedule_type schedule-type-weekly
   :schedule_hour 8
   :schedule_day  "mon"
   :recipients    [{:email "foo@bar.com"} (user-details :rasta)]}
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       (tu/random-name)}]
    (tu/with-temp PulseChannel [{channel-id :id :as channel} {:pulse_id      id
                                                              :channel_type  :email
                                                              :details       {}
                                                              :schedule_type schedule-type-daily
                                                              :schedule_hour 15}]
      (update-channel-then-select {:id            channel-id
                                   :channel_type  :email
                                   :schedule_type schedule-type-weekly
                                   :schedule_hour 8
                                   :schedule_day  "mon"
                                   :recipients    [{:email "foo@bar.com"} {:id (user->id :rasta)}]}))))

;; hourly schedules don't require day/hour settings (should be nil), fully change recipients
(expect
  {:channel_type  :email
   :schedule_type schedule-type-hourly
   :schedule_hour nil
   :schedule_day  nil
   :recipients    [(user-details :crowberto)]}
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       (tu/random-name)}]
    (tu/with-temp PulseChannel [{channel-id :id :as channel} {:pulse_id      id
                                                              :channel_type  :email
                                                              :details       {:emails ["foo@bar.com"]}
                                                              :schedule_type schedule-type-daily
                                                              :schedule_hour 15}]
      (update-recipients! channel-id [(user->id :rasta)])
      (update-channel-then-select {:id            channel-id
                                   :channel_type  :email
                                   :schedule_type schedule-type-hourly
                                   :schedule_hour 12
                                   :schedule_day  "tue"
                                   :recipients    [{:id (user->id :crowberto)}]}))))

;; custom details for channels that need it
(expect
  {:channel_type  :email
   :schedule_type schedule-type-daily
   :schedule_hour 12
   :schedule_day  nil
   :recipients    [{:email "foo@bar.com"} {:email "blah@bar.com"}]
   :details       {:channel "#metabaserocks"}}
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       (tu/random-name)}]
    (tu/with-temp PulseChannel [{channel-id :id :as channel} {:pulse_id      id
                                                              :channel_type  :email
                                                              :details       {}
                                                              :schedule_type schedule-type-daily
                                                              :schedule_hour 15}]
      (update-channel-then-select {:id            channel-id
                                   :channel_type  :email
                                   :schedule_type schedule-type-daily
                                   :schedule_hour 12
                                   :schedule_day  "tue"
                                   :recipients    [{:email "foo@bar.com"} {:email "blah@bar.com"}]
                                   :details       {:channel "#metabaserocks"}}))))

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
                                                  :schedule_type schedule-type-daily}]
      (let [upd-recipients (fn [recipients]
                             (update-recipients! channel-id recipients)
                             (->> (db/sel :many PulseChannelRecipient :pulse_channel_id channel-id)
                                  (mapv :user_id)))]
        [(upd-recipients [])
         (upd-recipients [(user->id :rasta)])
         (upd-recipients [(user->id :crowberto)])
         (upd-recipients [(user->id :crowberto) (user->id :rasta)])
         (upd-recipients [(user->id :rasta) (user->id :trashbird)])]))))


;; retrieve-scheduled-channels
;; test a simple scenario with a single Pulse and 2 channels on hourly/daily schedules
(expect
  [[{:schedule_type "hourly", :channel_type "slack"}]
   [{:schedule_type "hourly", :channel_type "slack"}]
   [{:schedule_type "daily", :channel_type "email"}
    {:schedule_type "hourly", :channel_type "slack"}]
   [{:schedule_type "daily", :channel_type "email"}
    {:schedule_type "hourly", :channel_type "slack"}]]
  (tu/with-temp Pulse [{:keys [id]} {:creator_id (user->id :rasta)
                                     :name       (tu/random-name)}]
    (tu/with-temp PulseChannel [_ {:pulse_id      id
                                   :channel_type  :email
                                   :details       {}
                                   :schedule_type schedule-type-daily
                                   :schedule_hour 15}]
      (tu/with-temp PulseChannel [_ {:pulse_id      id
                                     :channel_type  :slack
                                     :details       {}
                                     :schedule_type schedule-type-hourly
                                     :schedule_hour nil}]
        (let [retrieve-channels (fn [hour day]
                                  (->> (retrieve-scheduled-channels hour day)
                                       (mapv #(dissoc % :id :pulse_id))))]
          [(retrieve-channels nil nil)
           (retrieve-channels 12 nil)
           (retrieve-channels 15 nil)
           (retrieve-channels 15 "wed")])))))

;; more complex scenario with 2 Pulses, including weekly scheduling
(expect
  [[{:schedule_type "hourly", :channel_type "slack"}]
   [{:schedule_type "hourly", :channel_type "slack"}
    {:schedule_type "daily", :channel_type "slack"}]
   [{:schedule_type "daily", :channel_type "email"}
    {:schedule_type "hourly", :channel_type "slack"}]
   [{:schedule_type "hourly", :channel_type "slack"}
    {:schedule_type "weekly", :channel_type "email"}]]
  (tu/with-temp Pulse [{pulse1 :id} {:creator_id (user->id :rasta)
                                     :name       (tu/random-name)}]
    (tu/with-temp Pulse [{pulse2 :id} {:creator_id (user->id :crowberto)
                                       :name       (tu/random-name)}]
      (tu/with-temp PulseChannel [_ {:pulse_id      pulse1
                                     :channel_type  :email
                                     :details       {}
                                     :schedule_type schedule-type-daily
                                     :schedule_hour 15}]
        (tu/with-temp PulseChannel [_ {:pulse_id      pulse1
                                       :channel_type  :slack
                                       :details       {}
                                       :schedule_type schedule-type-hourly
                                       :schedule_hour nil}]
          (tu/with-temp PulseChannel [_ {:pulse_id      pulse2
                                         :channel_type  :slack
                                         :details       {}
                                         :schedule_type schedule-type-daily
                                         :schedule_hour 10
                                         :schedule_day  "wed"}]
            (tu/with-temp PulseChannel [_ {:pulse_id      pulse2
                                           :channel_type  :email
                                           :details       {}
                                           :schedule_type schedule-type-weekly
                                           :schedule_hour 8
                                           :schedule_day  "mon"}]
              (let [retrieve-channels (fn [hour day]
                                        (->> (retrieve-scheduled-channels hour day)
                                             (mapv #(dissoc % :id :pulse_id))))]
                [(retrieve-channels nil nil)
                 (retrieve-channels 10 nil)
                 (retrieve-channels 15 nil)
                 (retrieve-channels 8 "mon")]))))))))
