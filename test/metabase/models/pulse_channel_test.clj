(ns metabase.models.pulse-channel-test
  (:require [expectations :refer [expect]]
            [medley.core :as m]
            [metabase.models
             [pulse :as p :refer [Pulse]]
             [pulse-channel :as pc :refer [PulseChannel]]
             [pulse-channel-recipient :as pcr :refer [PulseChannelRecipient]]
             [user :refer [User]]]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

;; Test out our predicate functions

;; pcr/day-of-week?
(expect false (pc/day-of-week? nil))
(expect false (pc/day-of-week? []))
(expect false (pc/day-of-week? {}))
(expect false (pc/day-of-week? "abc"))
(expect true  (pc/day-of-week? "mon"))
(expect false (pc/day-of-week? :mon))

;; hour-of-day?
(expect false (pc/hour-of-day? nil))
(expect false (pc/hour-of-day? 500))
(expect false (pc/hour-of-day? -12))
(expect false (pc/hour-of-day? 8.5))
(expect false (pc/hour-of-day? "abc"))
(expect true  (pc/hour-of-day? 11))
(expect true  (pc/hour-of-day? 0))
(expect true  (pc/hour-of-day? 23))

;; schedule-type?
(expect false (pc/schedule-type? nil))
(expect false (pc/schedule-type? "abc"))
(expect false (pc/schedule-type? 123))
(expect false (pc/schedule-type? "daily"))
(expect true  (pc/schedule-type? :hourly))
(expect true  (pc/schedule-type? :daily))
(expect true  (pc/schedule-type? :weekly))

;; schedule-frame?
(expect false (pc/schedule-frame? nil))
(expect false (pc/schedule-frame? "abc"))
(expect false (pc/schedule-frame? 123))
(expect false (pc/schedule-frame? "first"))
(expect true  (pc/schedule-frame? :first))
(expect true  (pc/schedule-frame? :mid))
(expect true  (pc/schedule-frame? :last))

;; valid-schedule?
(expect false (pc/valid-schedule? nil nil nil nil))
(expect false (pc/valid-schedule? :foo nil nil nil))
;; hourly
(expect true  (pc/valid-schedule? :hourly nil nil nil))
(expect true  (pc/valid-schedule? :hourly 12 "abc" nil))
;; daily
(expect false (pc/valid-schedule? :daily nil nil nil))
(expect false (pc/valid-schedule? :daily 35 nil nil))
(expect true  (pc/valid-schedule? :daily 12 nil nil))
;; weekly
(expect false (pc/valid-schedule? :weekly nil nil nil))
(expect false (pc/valid-schedule? :weekly 12 nil nil))
(expect false (pc/valid-schedule? :weekly 12 "blah" nil))
(expect true  (pc/valid-schedule? :weekly 12 "wed" nil))
;; monthly
(expect false (pc/valid-schedule? :monthly nil nil nil))
(expect false (pc/valid-schedule? :monthly 12 nil nil))
(expect false (pc/valid-schedule? :monthly 12 "wed" nil))
(expect false (pc/valid-schedule? :monthly 12 nil "abc"))
(expect false (pc/valid-schedule? :monthly 12 nil 123))
(expect true  (pc/valid-schedule? :monthly 12 nil :mid))
(expect true  (pc/valid-schedule? :monthly 12 nil :first))
(expect true  (pc/valid-schedule? :monthly 12 nil :last))
(expect true  (pc/valid-schedule? :monthly 12 "mon" :first))
(expect true  (pc/valid-schedule? :monthly 12 "fri" :last))

;; channel-type?
(expect false (pc/channel-type? nil))
(expect false (pc/channel-type? "abc"))
(expect false (pc/channel-type? 123))
(expect false (pc/channel-type? :sms))
(expect false (pc/channel-type? "email"))
(expect true  (pc/channel-type? :email))
(expect true  (pc/channel-type? :slack))

;; supports-recipients?
(expect false (pc/supports-recipients? nil))
(expect false (pc/supports-recipients? "abc"))
(expect true  (pc/supports-recipients? :email))
(expect false (pc/supports-recipients? :slack))


;; helper functions

;; format user details like they would come back for a channel recipient
(defn user-details
  [username]
  (-> (test-users/fetch-user username)
      (dissoc :date_joined :last_login :is_superuser :is_qbnewb)))

;; create a channel then select its details
(defn- create-channel-then-select!
  [channel]
  (when-let [new-channel-id (pc/create-pulse-channel! channel)]
    (-> (PulseChannel new-channel-id)
        (hydrate :recipients)
        (update :recipients #(sort-by :email %))
        (dissoc :id :pulse_id :created_at :updated_at)
        (m/dissoc-in [:details :emails]))))

(defn- update-channel-then-select!
  [{:keys [id] :as channel}]
  (pc/update-pulse-channel! channel)
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
      (create-channel-then-select!
       {:pulse_id      id
        :enabled       true
        :channel_type  :email
        :schedule_type :daily
        :schedule_hour 18
        :recipients    [{:email "foo@bar.com"}
                        {:id (test-users/user->id :rasta)}
                        {:id (test-users/user->id :crowberto)}]}))))

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
      (create-channel-then-select!
       {:pulse_id      id
        :enabled       true
        :channel_type  :slack
        :schedule_type :hourly
        :details       {:something "random"}
        :recipients    [{:email "foo@bar.com"}
                        {:id (test-users/user->id :rasta)}
                        {:id (test-users/user->id :crowberto)}]}))))


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
    (update-channel-then-select!
     {:id            channel-id
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
    (update-channel-then-select!
     {:id             channel-id
      :enabled        true
      :channel_type   :email
      :schedule_type  :monthly
      :schedule_hour  8
      :schedule_day   nil
      :schedule_frame :mid
      :recipients     [{:email "foo@bar.com"} {:id (test-users/user->id :rasta)}]})))

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
    (update-channel-then-select!
     {:id            channel-id
      :enabled       true
      :channel_type  :email
      :schedule_type :weekly
      :schedule_hour 8
      :schedule_day  "mon"
      :recipients    [{:email "foo@bar.com"} {:id (test-users/user->id :rasta)}]})))

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
    (pc/update-recipients! channel-id [(test-users/user->id :rasta)])
    (update-channel-then-select!
     {:id            channel-id
      :enabled       true
      :channel_type  :email
      :schedule_type :hourly
      :schedule_hour 12
      :schedule_day  "tue"
      :recipients    [{:id (test-users/user->id :crowberto)}]})))

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
    (update-channel-then-select!
     {:id            channel-id
      :enabled       true
      :channel_type  :email
      :schedule_type :daily
      :schedule_hour 12
      :schedule_day  "tue"
      :recipients    [{:email "foo@bar.com"} {:email "blah@bar.com"}]
      :details       {:channel "#metabaserocks"}})))

;; pc/update-recipients!
(expect
  [nil
   #{(test-users/user->id :rasta)}
   #{(test-users/user->id :crowberto)}
   #{(test-users/user->id :crowberto) (test-users/user->id :rasta)}
   #{(test-users/user->id :rasta) (test-users/user->id :trashbird)}]
  (tt/with-temp* [Pulse        [{pulse-id :id}]
                  PulseChannel [{channel-id :id} {:pulse_id pulse-id}]]
    (let [upd-recipients! (fn [recipients]
                            (pc/update-recipients! channel-id recipients)
                            (db/select-field :user_id PulseChannelRecipient, :pulse_channel_id channel-id))]
      [(upd-recipients! [])
       (upd-recipients! [(test-users/user->id :rasta)])
       (upd-recipients! [(test-users/user->id :crowberto)])
       (upd-recipients! [(test-users/user->id :crowberto) (test-users/user->id :rasta)])
       (upd-recipients! [(test-users/user->id :rasta) (test-users/user->id :trashbird)])])))


;; pc/retrieve-scheduled-channels
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
                              (for [channel (pc/retrieve-scheduled-channels hour day :other :other)]
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
                              (for [channel (pc/retrieve-scheduled-channels hour day :other :other)]
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
                              (for [channel (pc/retrieve-scheduled-channels hour weekday monthday monthweek)]
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

;; Inactive users shouldn't get Pulses
(expect
  (cons
   {:email "cam@test.com"}
   (sort-by
    :id
    [{:id          (test-users/user->id :lucky)
      :email       "lucky@metabase.com"
      :first_name  "Lucky"
      :last_name   "Pigeon"
      :common_name "Lucky Pigeon"}
     {:id          (test-users/user->id :rasta)
      :email       "rasta@metabase.com"
      :first_name  "Rasta"
      :last_name   "Toucan"
      :common_name "Rasta Toucan"}]))
  (tt/with-temp* [Pulse                 [{pulse-id :id}]
                  PulseChannel          [{channel-id :id, :as channel} {:pulse_id pulse-id
                                                                        :details  {:emails ["cam@test.com"]}}]
                  User                  [{inactive-user-id :id} {:is_active false}]
                  PulseChannelRecipient [_ {:pulse_channel_id channel-id, :user_id inactive-user-id}]
                  PulseChannelRecipient [_ {:pulse_channel_id channel-id, :user_id (test-users/user->id :rasta)}]
                  PulseChannelRecipient [_ {:pulse_channel_id channel-id, :user_id (test-users/user->id :lucky)}]]
    (:recipients (hydrate channel :recipients))))
