(ns metabase.models.pulse-channel-test
  (:require [expectations :refer :all]
            [medley.core :as m]
            [metabase.models
             [pulse :refer :all]
             [pulse-channel :refer :all]
             [pulse-channel-recipient :refer :all]]
            [metabase.test
             [data :refer :all]
             [util :as tu]]
            [metabase.test.data.users :refer :all]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

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
(expect true (schedule-type? :hourly))
(expect true (schedule-type? :daily))
(expect true (schedule-type? :weekly))

;; schedule-frame?
(expect false (schedule-frame? nil))
(expect false (schedule-frame? "abc"))
(expect false (schedule-frame? 123))
(expect false (schedule-frame? "first"))
(expect true (schedule-frame? :first))
(expect true (schedule-frame? :mid))
(expect true (schedule-frame? :last))

;; valid-schedule?
(expect false (valid-schedule? nil nil nil nil))
(expect false (valid-schedule? :foo nil nil nil))
;; hourly
(expect true (valid-schedule? :hourly nil nil nil))
(expect true (valid-schedule? :hourly 12 "abc" nil))
;; daily
(expect false (valid-schedule? :daily nil nil nil))
(expect false (valid-schedule? :daily 35 nil nil))
(expect true (valid-schedule? :daily 12 nil nil))
;; weekly
(expect false (valid-schedule? :weekly nil nil nil))
(expect false (valid-schedule? :weekly 12 nil nil))
(expect false (valid-schedule? :weekly 12 "blah" nil))
(expect true (valid-schedule? :weekly 12 "wed" nil))
;; monthly
(expect false (valid-schedule? :monthly nil nil nil))
(expect false (valid-schedule? :monthly 12 nil nil))
(expect false (valid-schedule? :monthly 12 "wed" nil))
(expect false (valid-schedule? :monthly 12 nil "abc"))
(expect false (valid-schedule? :monthly 12 nil 123))
(expect true (valid-schedule? :monthly 12 nil :mid))
(expect true (valid-schedule? :monthly 12 nil :first))
(expect true (valid-schedule? :monthly 12 nil :last))
(expect true (valid-schedule? :monthly 12 "mon" :first))
(expect true (valid-schedule? :monthly 12 "fri" :last))

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
      (dissoc :date_joined :last_login :is_superuser :is_qbnewb)))

;; create a channel then select its details
(defn- create-channel-then-select!
  [channel]
  (when-let [new-channel-id (create-pulse-channel! channel)]
    (-> (PulseChannel new-channel-id)
        (hydrate :recipients)
        (update :recipients #(sort-by :email %))
        (dissoc :id :pulse_id :created_at :updated_at)
        (m/dissoc-in [:details :emails]))))

(defn- update-channel-then-select!
  [{:keys [id] :as channel}]
  (update-pulse-channel! channel)
  (-> (PulseChannel id)
      (hydrate :recipients)
      (dissoc :id :pulse_id :created_at :updated_at)
      (m/dissoc-in [:details :emails])))

;; create-pulse-channel!
(expect
  {:enabled        true
   :channel_type   :email
   :schedule_type  :daily
   :schedule_hour  18
   :schedule_day   nil
   :schedule_frame nil
   :recipients     [(user-details :crowberto)
                    {:email "foo@bar.com"}
                    (user-details :rasta)]}
  (tt/with-temp Pulse [{:keys [id]}]
    (tu/with-model-cleanup [Pulse]
      (create-channel-then-select! {:pulse_id      id
                                    :enabled       true
                                    :channel_type  :email
                                    :schedule_type :daily
                                    :schedule_hour 18
                                    :recipients    [{:email "foo@bar.com"} {:id (user->id :rasta)} {:id (user->id :crowberto)}]}))))

(expect
  {:enabled       true
   :channel_type  :slack
   :schedule_type :hourly
   :schedule_hour nil
   :schedule_day  nil
   :schedule_frame nil
   :recipients    []
   :details       {:something "random"}}
  (tt/with-temp Pulse [{:keys [id]}]
    (tu/with-model-cleanup [Pulse]
      (create-channel-then-select! {:pulse_id      id
                                    :enabled       true
                                    :channel_type  :slack
                                    :schedule_type :hourly
                                    :details       {:something "random"}
                                    :recipients    [{:email "foo@bar.com"} {:id (user->id :rasta)} {:id (user->id :crowberto)}]}))))


;; update-pulse-channel!
;; simple starting case where we modify the schedule hour and add a recipient
(expect
  {:enabled        true
   :channel_type   :email
   :schedule_type  :daily
   :schedule_hour  18
   :schedule_day   nil
   :schedule_frame nil
   :recipients     [{:email "foo@bar.com"}]}
  (tt/with-temp* [Pulse        [{pulse-id :id}]
                  PulseChannel [{channel-id :id, :as channel} {:pulse_id pulse-id}]]
    (update-channel-then-select! {:id            channel-id
                                  :enabled       true
                                  :channel_type  :email
                                  :schedule_type :daily
                                  :schedule_hour 18
                                  :recipients    [{:email "foo@bar.com"}]})))

;; monthly schedules require a schedule_frame and can optionally omit they schedule_day
(expect
  {:enabled        true
   :channel_type  :email
   :schedule_type :monthly
   :schedule_hour 8
   :schedule_day  nil
   :schedule_frame :mid
   :recipients    [{:email "foo@bar.com"} (user-details :rasta)]}
  (tt/with-temp* [Pulse        [{pulse-id :id}]
                  PulseChannel [{channel-id :id :as channel} {:pulse_id pulse-id}]]
    (update-channel-then-select! {:id             channel-id
                                  :enabled        true
                                  :channel_type   :email
                                  :schedule_type  :monthly
                                  :schedule_hour  8
                                  :schedule_day   nil
                                  :schedule_frame :mid
                                  :recipients     [{:email "foo@bar.com"} {:id (user->id :rasta)}]})))

;; weekly schedule should have a day in it, show that we can get full users
(expect
  {:enabled        true
   :channel_type  :email
   :schedule_type :weekly
   :schedule_hour 8
   :schedule_day  "mon"
   :schedule_frame nil
   :recipients    [{:email "foo@bar.com"} (user-details :rasta)]}
  (tt/with-temp* [Pulse        [{pulse-id :id}]
                  PulseChannel [{channel-id :id} {:pulse_id pulse-id}]]
    (update-channel-then-select! {:id            channel-id
                                  :enabled       true
                                  :channel_type  :email
                                  :schedule_type :weekly
                                  :schedule_hour 8
                                  :schedule_day  "mon"
                                  :recipients    [{:email "foo@bar.com"} {:id (user->id :rasta)}]})))

;; hourly schedules don't require day/hour settings (should be nil), fully change recipients
(expect
  {:enabled       true
   :channel_type  :email
   :schedule_type :hourly
   :schedule_hour nil
   :schedule_day  nil
   :schedule_frame nil
   :recipients    [(user-details :crowberto)]}
  (tt/with-temp* [Pulse        [{pulse-id :id}]
                  PulseChannel [{channel-id :id} {:pulse_id pulse-id, :details {:emails ["foo@bar.com"]}}]]
    (update-recipients! channel-id [(user->id :rasta)])
    (update-channel-then-select! {:id            channel-id
                                  :enabled       true
                                  :channel_type  :email
                                  :schedule_type :hourly
                                  :schedule_hour 12
                                  :schedule_day  "tue"
                                  :recipients    [{:id (user->id :crowberto)}]})))

;; custom details for channels that need it
(expect
  {:enabled       true
   :channel_type  :email
   :schedule_type :daily
   :schedule_hour 12
   :schedule_day  nil
   :schedule_frame nil
   :recipients    [{:email "foo@bar.com"} {:email "blah@bar.com"}]
   :details       {:channel "#metabaserocks"}}
  (tt/with-temp* [Pulse        [{pulse-id :id}]
                  PulseChannel [{channel-id :id} {:pulse_id pulse-id}]]
    (update-channel-then-select! {:id            channel-id
                                  :enabled       true
                                  :channel_type  :email
                                  :schedule_type :daily
                                  :schedule_hour 12
                                  :schedule_day  "tue"
                                  :recipients    [{:email "foo@bar.com"} {:email "blah@bar.com"}]
                                  :details       {:channel "#metabaserocks"}})))

;; update-recipients!
(expect
  [nil
   #{(user->id :rasta)}
   #{(user->id :crowberto)}
   #{(user->id :crowberto) (user->id :rasta)}
   #{(user->id :rasta) (user->id :trashbird)}]
  (tt/with-temp* [Pulse        [{pulse-id :id}]
                  PulseChannel [{channel-id :id} {:pulse_id pulse-id}]]
    (let [upd-recipients! (fn [recipients]
                            (update-recipients! channel-id recipients)
                            (db/select-field :user_id PulseChannelRecipient, :pulse_channel_id channel-id))]
      [(upd-recipients! [])
       (upd-recipients! [(user->id :rasta)])
       (upd-recipients! [(user->id :crowberto)])
       (upd-recipients! [(user->id :crowberto) (user->id :rasta)])
       (upd-recipients! [(user->id :rasta) (user->id :trashbird)])])))


;; retrieve-scheduled-channels
;; test a simple scenario with a single Pulse and 2 channels on hourly/daily schedules
(expect
  [#{{:schedule_type :hourly, :channel_type :slack}}
   #{{:schedule_type :hourly, :channel_type :slack}}
   #{{:schedule_type :daily,  :channel_type :email}
     {:schedule_type :hourly, :channel_type :slack}}
   #{{:schedule_type :daily,  :channel_type :email}
     {:schedule_type :hourly, :channel_type :slack}}]
  (tt/with-temp* [Pulse        [{pulse-id :id}]
                  PulseChannel [_ {:pulse_id pulse-id}] ;-> schedule_type = daily, schedule_hour = 15, channel_type = email
                  PulseChannel [_ {:pulse_id pulse-id, :channel_type :slack, :schedule_type :hourly}]
                  PulseChannel [_ {:pulse_id pulse-id, :channel_type :email, :schedule_type :hourly, :enabled false}]]
    (let [retrieve-channels (fn [hour day]
                              (for [channel (retrieve-scheduled-channels hour day :other :other)]
                                (dissoc (into {} channel) :id :pulse_id)))]
      (map set [(retrieve-channels nil nil)
                (retrieve-channels 12  nil)
                (retrieve-channels 15  nil)
                (retrieve-channels 15  "wed")]))))

;; more complex scenario with 2 Pulses, including weekly scheduling
(expect
  [#{{:schedule_type :hourly, :channel_type :slack}}
   #{{:schedule_type :hourly, :channel_type :slack}
     {:schedule_type :daily,  :channel_type :slack}}
   #{{:schedule_type :daily,  :channel_type :email}
     {:schedule_type :hourly, :channel_type :slack}}
   #{{:schedule_type :hourly, :channel_type :slack}
     {:schedule_type :weekly, :channel_type :email}}]
  (tt/with-temp* [Pulse        [{pulse-1-id :id}]
                  Pulse        [{pulse-2-id :id}]
                  PulseChannel [_ {:pulse_id pulse-1-id, :enabled true, :channel_type :email, :schedule_type :daily}]
                  PulseChannel [_ {:pulse_id pulse-1-id, :enabled true, :channel_type :slack, :schedule_type :hourly}]
                  PulseChannel [_ {:pulse_id pulse-2-id, :enabled true, :channel_type :slack, :schedule_type :daily  :schedule_hour 10, :schedule_day "wed"}]
                  PulseChannel [_ {:pulse_id pulse-2-id, :enabled true, :channel_type :email, :schedule_type :weekly, :schedule_hour 8, :schedule_day "mon"}]]
    (let [retrieve-channels (fn [hour day]
                              (for [channel (retrieve-scheduled-channels hour day :other :other)]
                                (dissoc (into {} channel) :id :pulse_id)))]
      (map set [(retrieve-channels nil nil)
                (retrieve-channels 10  nil)
                (retrieve-channels 15  nil)
                (retrieve-channels 8   "mon")]))))

;; specific test for various monthly scheduling permutations
(expect
  [#{}
   #{{:schedule_type :monthly, :channel_type :email}
     {:schedule_type :monthly, :channel_type :slack}}
   #{{:schedule_type :monthly, :channel_type :slack}}
   #{}
   #{{:schedule_type :monthly, :channel_type :slack}}
   #{{:schedule_type :monthly, :channel_type :email}}]
  (tt/with-temp* [Pulse        [{pulse-1-id :id}]
                  Pulse        [{pulse-2-id :id}]
                  PulseChannel [_ {:pulse_id pulse-1-id, :channel_type :email, :schedule_type :monthly, :schedule_hour 12, :schedule_frame :first}]
                  PulseChannel [_ {:pulse_id pulse-1-id, :channel_type :slack, :schedule_type :monthly, :schedule_hour 12, :schedule_day "mon", :schedule_frame :first}]
                  PulseChannel [_ {:pulse_id pulse-2-id, :channel_type :slack, :schedule_type :monthly, :schedule_hour 16, :schedule_frame :mid}]
                  PulseChannel [_ {:pulse_id pulse-2-id, :channel_type :email, :schedule_type :monthly, :schedule_hour 8,  :schedule_day "fri", :schedule_frame :last}]]
    (let [retrieve-channels (fn [hour weekday monthday monthweek]
                              (for [channel (retrieve-scheduled-channels hour weekday monthday monthweek)]
                                (dissoc (into {} channel) :id :pulse_id)))]
      ;; simple starter which should be empty
      (map set [(retrieve-channels nil nil :other :other)
                ;; this should capture BOTH first absolute day of month + first monday of month schedules
                (retrieve-channels 12 "mon" :first :first)
                ;; this should only capture the first monday of the month
                (retrieve-channels 12 "mon" :other :first)
                ;; this makes sure hour checking is being enforced
                (retrieve-channels 8 "mon" :first :first)
                ;; middle of the month
                (retrieve-channels 16 "fri" :mid :other)
                ;; last friday of the month (but not the last day of month)
                (retrieve-channels 8 "fri" :other :last)]))))
