(ns metabase.models.pulse-channel-test
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.models
             [pulse :as p :refer [Pulse]]
             [pulse-channel :as pc :refer [PulseChannel]]
             [pulse-channel-recipient :as pcr :refer [PulseChannelRecipient]]
             [user :refer [User]]]
            [metabase.test :as mt]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

;; Test out our predicate functions

(deftest day-of-week?-test
  (doseq [[x expected] {nil   false
                        []    false
                        {}    false
                        "abc" false
                        "mon" true
                        :mon  false}]
    (testing x
      (is (= expected
             (pc/day-of-week? x))))))

(deftest hour-of-day?-test
  (doseq [[x expected] {nil   false
                        500   false
                        -12   false
                        8.5   false
                        "abc" false
                        11    true
                        0     true
                        23    true}]
    (testing x
      (is (= expected
             (pc/hour-of-day? x))))))

(deftest schedule-type?-test
  (doseq [[x expected] {nil     false
                        "abc"   false
                        123     false
                        "daily" false
                        :hourly true
                        :daily  true
                        :weekly true}]
    (testing x
      (is (= expected
             (pc/schedule-type? x))))))

(deftest schedule-frame?-test
  (doseq [[x expected] {nil     false
                        "abc"   false
                        123     false
                        "first" false
                        :first  true
                        :mid    true
                        :last   true}]
    (testing x
      (is (= expected
             (pc/schedule-frame? x))))))

(deftest valid-schedule?-test
  (doseq [[group args->expected] {"nil"
                                  {[nil nil nil nil]  false
                                   [:foo nil nil nil] false}

                                  "hourly"
                                  {[:hourly nil nil nil] true
                                   [:hourly 12 "abc" nil] true}

                                  "daily"
                                  {[:daily nil nil nil] false
                                   [:daily 35 nil nil] false
                                   [:daily 12 nil nil] true}

                                  "weekly"
                                  {[:weekly nil nil nil] false
                                   [:weekly 12 nil nil] false
                                   [:weekly 12 "blah" nil] false
                                   [:weekly 12 "wed" nil] true}

                                  "monthly"
                                  {[:monthly nil nil nil]     false
                                   [:monthly 12 nil nil]      false
                                   [:monthly 12 "wed" nil]    false
                                   [:monthly 12 nil "abc"]    false
                                   [:monthly 12 nil 123]      false
                                   [:monthly 12 nil :mid]     true
                                   [:monthly 12 nil :first]   true
                                   [:monthly 12 nil :last]    true
                                   [:monthly 12 "mon" :first] true
                                   [:monthly 12 "fri" :last]  true}}
          [args expected]        args->expected]
    (testing group
      (testing (cons 'valid-schedule? args)
        (is (= expected
               (apply pc/valid-schedule? args)))))))

(deftest channel-type?-test
  (doseq [[x expected] {nil     false
                        "abc"   false
                        123     false
                        :sms    false
                        "email" false
                        :email  true
                        :slack  true}]
    (testing x
      (is (= expected
             (pc/channel-type? x))))))

(deftest supports-recipients?-test
  (doseq [[x expected] {nil    false
                        "abc"  false
                        :email true
                        :slack false}]
    (testing x
      (is (= expected
             (pc/supports-recipients? x))))))

;; helper functions

;; format user details like they would come back for a channel recipient
(defn user-details
  [username]
  (-> (mt/fetch-user username)
      (dissoc :date_joined :last_login :is_superuser :is_qbnewb :locale)
      mt/derecordize))

;; create a channel then select its details
(defn- create-channel-then-select!
  [channel]
  (when-let [new-channel-id (pc/create-pulse-channel! channel)]
    (-> (PulseChannel new-channel-id)
        (hydrate :recipients)
        (update :recipients #(sort-by :email %))
        (dissoc :id :pulse_id :created_at :updated_at)
        (m/dissoc-in [:details :emails])
        mt/derecordize)))

(defn- update-channel-then-select!
  [{:keys [id] :as channel}]
  (pc/update-pulse-channel! channel)
  (-> (PulseChannel id)
      (hydrate :recipients)
      (dissoc :id :pulse_id :created_at :updated_at)
      (m/dissoc-in [:details :emails])
      mt/derecordize))

;; create-pulse-channel!
(deftest create-pulse-channel!-test
  (mt/with-temp Pulse [{:keys [id]}]
    (mt/with-model-cleanup [Pulse]
      (testing "email"
        (is (= {:enabled        true
                :channel_type   :email
                :schedule_type  :daily
                :schedule_hour  18
                :schedule_day   nil
                :schedule_frame nil
                :recipients     [(user-details :crowberto)
                                 {:email "foo@bar.com"}
                                 (user-details :rasta)]}
               (create-channel-then-select!
                {:pulse_id      id
                 :enabled       true
                 :channel_type  :email
                 :schedule_type :daily
                 :schedule_hour 18
                 :recipients    [{:email "foo@bar.com"}
                                 {:id (mt/user->id :rasta)}
                                 {:id (mt/user->id :crowberto)}]}))))

      (testing "slack"
        (is (= {:enabled        true
                :channel_type   :slack
                :schedule_type  :hourly
                :schedule_hour  nil
                :schedule_day   nil
                :schedule_frame nil
                :recipients     []
                :details        {:something "random"}}
               (create-channel-then-select!
                {:pulse_id      id
                 :enabled       true
                 :channel_type  :slack
                 :schedule_type :hourly
                 :details       {:something "random"}
                 :recipients    [{:email "foo@bar.com"}
                                 {:id (mt/user->id :rasta)}
                                 {:id (mt/user->id :crowberto)}]})))))))

(deftest update-pulse-channel!-test
  (mt/with-temp Pulse [{pulse-id :id}]
    (testing "simple starting case where we modify the schedule hour and add a recipient"
      (mt/with-temp PulseChannel [{channel-id :id, :as channel} {:pulse_id pulse-id}]
        (is (= {:enabled        true
                :channel_type   :email
                :schedule_type  :daily
                :schedule_hour  18
                :schedule_day   nil
                :schedule_frame nil
                :recipients     [{:email "foo@bar.com"}]}
               (update-channel-then-select!
                {:id            channel-id
                 :enabled       true
                 :channel_type  :email
                 :schedule_type :daily
                 :schedule_hour 18
                 :recipients    [{:email "foo@bar.com"}]})))))

    (testing "monthly schedules require a schedule_frame and can optionally omit they schedule_day"
      (mt/with-temp PulseChannel [{channel-id :id :as channel} {:pulse_id pulse-id}]
        (is (= {:enabled        true
                :channel_type  :email
                :schedule_type :monthly
                :schedule_hour 8
                :schedule_day  nil
                :schedule_frame :mid
                :recipients    [{:email "foo@bar.com"} (user-details :rasta)]}
               (update-channel-then-select!
                {:id             channel-id
                 :enabled        true
                 :channel_type   :email
                 :schedule_type  :monthly
                 :schedule_hour  8
                 :schedule_day   nil
                 :schedule_frame :mid
                 :recipients     [{:email "foo@bar.com"} {:id (mt/user->id :rasta)}]})))))

    (testing "weekly schedule should have a day in it, show that we can get full users"
      (mt/with-temp PulseChannel [{channel-id :id} {:pulse_id pulse-id}]
        (is (= {:enabled        true
                :channel_type   :email
                :schedule_type  :weekly
                :schedule_hour  8
                :schedule_day   "mon"
                :schedule_frame nil
                :recipients     [{:email "foo@bar.com"} (user-details :rasta)]}
               (update-channel-then-select!
                {:id            channel-id
                 :enabled       true
                 :channel_type  :email
                 :schedule_type :weekly
                 :schedule_hour 8
                 :schedule_day  "mon"
                 :recipients    [{:email "foo@bar.com"} {:id (mt/user->id :rasta)}]})))))

    (testing "hourly schedules don't require day/hour settings (should be nil), fully change recipients"
      (mt/with-temp PulseChannel [{channel-id :id} {:pulse_id pulse-id, :details {:emails ["foo@bar.com"]}}]
        (pc/update-recipients! channel-id [(mt/user->id :rasta)])
        (is (= {:enabled       true
                :channel_type  :email
                :schedule_type :hourly
                :schedule_hour nil
                :schedule_day  nil
                :schedule_frame nil
                :recipients    [(user-details :crowberto)]}
               (update-channel-then-select!
                {:id            channel-id
                 :enabled       true
                 :channel_type  :email
                 :schedule_type :hourly
                 :schedule_hour 12
                 :schedule_day  "tue"
                 :recipients    [{:id (mt/user->id :crowberto)}]})))))

    (testing "custom details for channels that need it"
      (mt/with-temp PulseChannel [{channel-id :id} {:pulse_id pulse-id}]
        (is (= {:enabled       true
                :channel_type  :email
                :schedule_type :daily
                :schedule_hour 12
                :schedule_day  nil
                :schedule_frame nil
                :recipients    [{:email "foo@bar.com"} {:email "blah@bar.com"}]
                :details       {:channel "#metabaserocks"}}
               (update-channel-then-select!
                {:id            channel-id
                 :enabled       true
                 :channel_type  :email
                 :schedule_type :daily
                 :schedule_hour 12
                 :schedule_day  "tue"
                 :recipients    [{:email "foo@bar.com"} {:email "blah@bar.com"}]
                 :details       {:channel "#metabaserocks"}})))))))

(deftest update-recipients!-test
  (mt/with-temp* [Pulse        [{pulse-id :id}]
                  PulseChannel [{channel-id :id} {:pulse_id pulse-id}]]
    (letfn [(upd-recipients! [recipients]
              (pc/update-recipients! channel-id recipients)
              (db/select-field :user_id PulseChannelRecipient, :pulse_channel_id channel-id))]
      (doseq [[new-recipients expected] {[]                  nil
                                         [:rasta]            [:rasta]
                                         [:crowberto]        [:crowberto]
                                         [:crowberto :rasta] [:crowberto :rasta]
                                         [:rasta :trashbird] [:rasta :trashbird]}]
        (testing new-recipients
          (is (= (not-empty (set (map mt/user->id expected)))
                 (upd-recipients! (map mt/user->id new-recipients)))))))))

(deftest retrieve-scheduled-channels-test
  (letfn [(retrieve-channels [hour day]
            (for [channel (pc/retrieve-scheduled-channels hour day :other :other)]
              (dissoc (into {} channel) :id :pulse_id)))]
    (testing "test a simple scenario with a single Pulse and 2 channels on hourly/daily schedules"
      (mt/with-temp* [Pulse        [{pulse-id :id}]
                      PulseChannel [_ {:pulse_id pulse-id}] ;-> schedule_type = daily, schedule_hour = 15, channel_type = email
                      PulseChannel [_ {:pulse_id pulse-id, :channel_type :slack, :schedule_type :hourly}]
                      PulseChannel [_ {:pulse_id pulse-id, :channel_type :email, :schedule_type :hourly, :enabled false}]]
        (doseq [[[hour day] expected] {[nil nil]  #{{:schedule_type :hourly, :channel_type :slack}}
                                       [12 nil]   #{{:schedule_type :hourly, :channel_type :slack}}
                                       [15 nil]   #{{:schedule_type :hourly, :channel_type :slack}
                                                    {:schedule_type :daily, :channel_type :email}}
                                       [15 "wed"] #{{:schedule_type :hourly, :channel_type :slack}
                                                    {:schedule_type :daily, :channel_type :email}}}]
          (testing (cons 'retrieve-scheduled-channels [hour day])
            (is (= expected
                   (set (retrieve-channels hour day))))))))

    (testing "more complex scenario with 2 Pulses, including weekly scheduling"
      (mt/with-temp* [Pulse        [{pulse-1-id :id}]
                      Pulse        [{pulse-2-id :id}]
                      PulseChannel [_ {:pulse_id pulse-1-id, :enabled true, :channel_type :email, :schedule_type :daily}]
                      PulseChannel [_ {:pulse_id pulse-1-id, :enabled true, :channel_type :slack, :schedule_type :hourly}]
                      PulseChannel [_ {:pulse_id pulse-2-id, :enabled true, :channel_type :slack, :schedule_type :daily :schedule_hour 10, :schedule_day "wed"}]
                      PulseChannel [_ {:pulse_id pulse-2-id, :enabled true, :channel_type :email, :schedule_type :weekly, :schedule_hour 8, :schedule_day "mon"}]]
        (doseq [[[hour day] expected] {[nil nil] #{{:schedule_type :hourly, :channel_type :slack}}
                                       [10 nil]  #{{:schedule_type :daily, :channel_type :slack}
                                                   {:schedule_type :hourly, :channel_type :slack}}
                                       [15 nil]  #{{:schedule_type :hourly, :channel_type :slack}
                                                   {:schedule_type :daily, :channel_type :email}}
                                       [8 "mon"] #{{:schedule_type :weekly, :channel_type :email}
                                                   {:schedule_type :hourly, :channel_type :slack}}}]
          (testing (cons 'retrieve-scheduled-channels [hour day])
            (is (= expected
                   (set (retrieve-channels hour day))))))))))

(deftest retrive-monthly-scheduled-pulses-test
  (testing "specific test for various monthly scheduling permutations"
    (letfn [(retrieve-channels [& args]
              (for [channel (apply pc/retrieve-scheduled-channels args)]
                (dissoc (into {} channel) :id :pulse_id)))]
      (mt/with-temp* [Pulse        [{pulse-1-id :id}]
                      Pulse        [{pulse-2-id :id}]
                      PulseChannel [_ {:pulse_id pulse-1-id, :channel_type :email, :schedule_type :monthly, :schedule_hour 12, :schedule_frame :first}]
                      PulseChannel [_ {:pulse_id pulse-1-id, :channel_type :slack, :schedule_type :monthly, :schedule_hour 12, :schedule_day "mon", :schedule_frame :first}]
                      PulseChannel [_ {:pulse_id pulse-2-id, :channel_type :slack, :schedule_type :monthly, :schedule_hour 16, :schedule_frame :mid}]
                      PulseChannel [_ {:pulse_id pulse-2-id, :channel_type :email, :schedule_type :monthly, :schedule_hour 8, :schedule_day "fri", :schedule_frame :last}]]
        (doseq [{:keys [message args expected]}
                [{:message  "simple starter which should be empty"
                  :args     [nil nil :other :other]
                  :expected #{}}
                 {:message  "this should capture BOTH first absolute day of month + first monday of month schedules"
                  :args     [12 "mon" :first :first]
                  :expected #{{:schedule_type :monthly, :channel_type :email}
                              {:schedule_type :monthly, :channel_type :slack}}}
                 {:message  "this should only capture the first monday of the month"
                  :args     [12 "mon" :other :first]
                  :expected #{{:schedule_type :monthly, :channel_type :slack}}},
                 {:message  "this makes sure hour checking is being enforced"
                  :args     [8 "mon" :first :first]
                  :expected #{}}
                 {:message  "middle of the month"
                  :args     [16 "fri" :mid :other]
                  :expected #{{:schedule_type :monthly, :channel_type :slack}}}
                 {:message  "last friday of the month (but not the last day of month)"
                  :args     [8 "fri" :other :last]
                  :expected #{{:schedule_type :monthly, :channel_type :email}}}]]
          (testing message
            (testing (cons 'retrieve-scheduled-channels args)
              (is (= expected
                     (set (apply retrieve-channels args)))))))))))

(deftest inactive-users-test
  (testing "Inactive users shouldn't get Pulses"
    (mt/with-temp* [Pulse                 [{pulse-id :id}]
                    PulseChannel          [{channel-id :id, :as channel} {:pulse_id pulse-id
                                                                          :details  {:emails ["cam@test.com"]}}]
                    User                  [{inactive-user-id :id} {:is_active false}]
                    PulseChannelRecipient [_ {:pulse_channel_id channel-id, :user_id inactive-user-id}]
                    PulseChannelRecipient [_ {:pulse_channel_id channel-id, :user_id (mt/user->id :rasta)}]
                    PulseChannelRecipient [_ {:pulse_channel_id channel-id, :user_id (mt/user->id :lucky)}]]
      (is (= (cons
              {:email "cam@test.com"}
              (sort-by
               :id
               [{:id          (mt/user->id :lucky)
                 :email       "lucky@metabase.com"
                 :first_name  "Lucky"
                 :last_name   "Pigeon"
                 :common_name "Lucky Pigeon"}
                {:id          (mt/user->id :rasta)
                 :email       "rasta@metabase.com"
                 :first_name  "Rasta"
                 :last_name   "Toucan"
                 :common_name "Rasta Toucan"}]))
             (:recipients (hydrate channel :recipients)))))))
