(ns metabase.models.pulse-channel-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.pulse-channel :as pulse-channel :refer [PulseChannel]]
   [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
   [metabase.models.serialization :as serdes]
   [metabase.models.user :refer [User]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

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
             (pulse-channel/day-of-week? x))))))

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
             (pulse-channel/hour-of-day? x))))))

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
             (pulse-channel/schedule-type? x))))))

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
             (pulse-channel/schedule-frame? x))))))

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
               (apply pulse-channel/valid-schedule? args)))))))

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
             (pulse-channel/channel-type? x))))))

(deftest supports-recipients?-test
  (doseq [[x expected] {nil    false
                        "abc"  false
                        :email true
                        :slack false}]
    (testing x
      (is (= expected
             (pulse-channel/supports-recipients? x))))))

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
  (when-let [new-channel-id (pulse-channel/create-pulse-channel! channel)]
    (-> (t2/select-one PulseChannel :id new-channel-id)
        (t2/hydrate :recipients)
        (update :recipients #(sort-by :email %))
        (dissoc :id :pulse_id :created_at :updated_at)
        (update :entity_id boolean)
        (m/dissoc-in [:details :emails]))))

(defn- update-channel-then-select!
  [{:keys [id] :as channel}]
  (pulse-channel/update-pulse-channel! channel)
  (-> (t2/select-one PulseChannel :id id)
      (t2/hydrate :recipients)
      (dissoc :id :pulse_id :created_at :updated_at)
      (update :entity_id boolean)
      (m/dissoc-in [:details :emails])))

;; create-pulse-channel!
(deftest create-pulse-channel!-test
  (t2.with-temp/with-temp [Pulse {:keys [id]}]
    (mt/with-model-cleanup [Pulse]
      (testing "disabled"
        (is (= {:enabled        false
                :entity_id      true
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
                 :enabled       false
                 :channel_type  :email
                 :schedule_type :daily
                 :schedule_hour 18
                 :recipients    [{:email "foo@bar.com"}
                                 {:id (mt/user->id :rasta)}
                                 {:id (mt/user->id :crowberto)}]}))))
      (testing "email"
        (is (= {:enabled        true
                :entity_id      true
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
                :entity_id      true
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
  (t2.with-temp/with-temp [Pulse {pulse-id :id}]
    (testing "simple starting case where we modify the schedule hour and add a recipient"
      (t2.with-temp/with-temp [PulseChannel {channel-id :id} {:pulse_id pulse-id}]
        (is (= {:enabled        true
                :entity_id      true
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
      (t2.with-temp/with-temp [PulseChannel {channel-id :id} {:pulse_id pulse-id}]
        (is (= {:enabled        true
                :entity_id      true
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
      (t2.with-temp/with-temp [PulseChannel {channel-id :id} {:pulse_id pulse-id}]
        (is (= {:enabled        true
                :entity_id      true
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
      (t2.with-temp/with-temp [PulseChannel {channel-id :id} {:pulse_id pulse-id, :details {:emails ["foo@bar.com"]}}]
        (pulse-channel/update-recipients! channel-id [(mt/user->id :rasta)])
        (is (= {:enabled       true
                :entity_id     true
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
      (t2.with-temp/with-temp [PulseChannel {channel-id :id} {:pulse_id pulse-id}]
        (is (= {:enabled       true
                :entity_id     true
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
              (pulse-channel/update-recipients! channel-id recipients)
              (t2/select-fn-set :user_id PulseChannelRecipient, :pulse_channel_id channel-id))]
      (doseq [[new-recipients expected] {[]                  nil
                                         [:rasta]            [:rasta]
                                         [:crowberto]        [:crowberto]
                                         [:crowberto :rasta] [:crowberto :rasta]
                                         [:rasta :trashbird] [:rasta :trashbird]}]
        (testing new-recipients
          (is (= (not-empty (set (map mt/user->id expected)))
                 (upd-recipients! (map mt/user->id new-recipients)))))))))

(defn- filter-channel-results
  "Filters channel results based on a set of expected values for a given field."
  [results field expected]
  (filter
   (fn [pulse] ((set expected) (field pulse)))
   results))

(deftest retrieve-scheduled-channels-test
  (letfn [(retrieve-channels [hour day]
            (for [channel (pulse-channel/retrieve-scheduled-channels hour day :other :other)]
              (dissoc (into {} channel) :id)))]
    (testing "test a simple scenario with a single Pulse and 2 channels on hourly/daily schedules"
      (mt/with-temp* [Pulse        [{pulse-id :id}]
                      PulseChannel [_ {:pulse_id pulse-id}] ;-> schedule_type = daily, schedule_hour = 15, channel_type = email
                      PulseChannel [_ {:pulse_id pulse-id, :channel_type :slack, :schedule_type :hourly}]
                      PulseChannel [_ {:pulse_id pulse-id, :channel_type :email, :schedule_type :hourly, :enabled false}]]
        (doseq [[[hour day] expected] {[nil nil]  #{{:pulse_id pulse-id, :schedule_type :hourly, :channel_type :slack}}
                                       [12 nil]   #{{:pulse_id pulse-id, :schedule_type :hourly, :channel_type :slack}}
                                       [15 nil]   #{{:pulse_id pulse-id, :schedule_type :hourly, :channel_type :slack}
                                                    {:pulse_id pulse-id, :schedule_type :daily, :channel_type :email}}
                                       [15 "wed"] #{{:pulse_id pulse-id, :schedule_type :hourly, :channel_type :slack}
                                                    {:pulse_id pulse-id, :schedule_type :daily, :channel_type :email}}}]
          (testing (cons 'retrieve-scheduled-channels [hour day])
            (is (= expected
                   (set (-> (retrieve-channels hour day)
                            (filter-channel-results :pulse_id #{pulse-id})))))))))

    (testing "more complex scenario with 2 Pulses, including weekly scheduling"
      (mt/with-temp* [Pulse        [{pulse-1-id :id}]
                      Pulse        [{pulse-2-id :id}]
                      PulseChannel [_ {:pulse_id pulse-1-id, :enabled true, :channel_type :email, :schedule_type :daily}]
                      PulseChannel [_ {:pulse_id pulse-1-id, :enabled true, :channel_type :slack, :schedule_type :hourly}]
                      PulseChannel [_ {:pulse_id pulse-2-id, :enabled true, :channel_type :slack, :schedule_type :daily :schedule_hour 10, :schedule_day "wed"}]
                      PulseChannel [_ {:pulse_id pulse-2-id, :enabled true, :channel_type :email, :schedule_type :weekly, :schedule_hour 8, :schedule_day "mon"}]]
        (doseq [[[hour day] expected] {[nil nil] #{{:pulse_id pulse-1-id, :schedule_type :hourly, :channel_type :slack}}
                                       [10 nil]  #{{:pulse_id pulse-2-id, :schedule_type :daily, :channel_type :slack}
                                                   {:pulse_id pulse-1-id, :schedule_type :hourly, :channel_type :slack}}
                                       [15 nil]  #{{:pulse_id pulse-1-id, :schedule_type :hourly, :channel_type :slack}
                                                   {:pulse_id pulse-1-id, :schedule_type :daily, :channel_type :email}}
                                       [8 "mon"] #{{:pulse_id pulse-2-id, :schedule_type :weekly, :channel_type :email}
                                                   {:pulse_id pulse-1-id, :schedule_type :hourly, :channel_type :slack}}}]
          (testing (cons 'retrieve-scheduled-channels [hour day])
            (is (= expected
                   (set (-> (retrieve-channels hour day)
                            (filter-channel-results :pulse_id #{pulse-1-id pulse-2-id})))))))))))

(deftest retrive-monthly-scheduled-pulses-test
  (testing "specific test for various monthly scheduling permutations"
    (letfn [(retrieve-channels [& args]
              (for [channel (apply pulse-channel/retrieve-scheduled-channels args)]
                (dissoc (into {} channel) :id)))]
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
                  :expected #{{:pulse_id pulse-1-id, :schedule_type :monthly, :channel_type :email}
                              {:pulse_id pulse-1-id, :schedule_type :monthly, :channel_type :slack}}}
                 {:message  "this should only capture the first monday of the month"
                  :args     [12 "mon" :other :first]
                  :expected #{{:pulse_id pulse-1-id, :schedule_type :monthly, :channel_type :slack}}},
                 {:message  "this makes sure hour checking is being enforced"
                  :args     [8 "mon" :first :first]
                  :expected #{}}
                 {:message  "middle of the month"
                  :args     [16 "fri" :mid :other]
                  :expected #{{:pulse_id pulse-2-id, :schedule_type :monthly, :channel_type :slack}}}
                 {:message  "last friday of the month (but not the last day of month)"
                  :args     [8 "fri" :other :last]
                  :expected #{{:pulse_id pulse-2-id, :schedule_type :monthly, :channel_type :email}}}]]
          (testing message
            (testing (cons 'retrieve-scheduled-channels args)
              (is (= expected
                     (set (-> (apply retrieve-channels args)
                              (filter-channel-results :pulse_id #{pulse-1-id pulse-2-id}))))))))))))

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
             (:recipients (t2/hydrate channel :recipients)))))))

(deftest validate-email-domains-check-user-ids-match-emails
  (testing `pulse-channel/validate-email-domains
    (testing "should check that User `:id` and `:email`s match for User `:recipients`"
      (let [input {:recipients [{:email "rasta@metabase.com"
                                 :id    (mt/user->id :rasta)}]}]
        (is (= input
               (pulse-channel/validate-email-domains input))))
      (testing "Throw Exception if User does not exist"
        ;; should validate even if `:email` isn't specified
        (doseq [input [{:id Integer/MAX_VALUE}
                       {:email "rasta@example.com"
                        :id    Integer/MAX_VALUE}]]
          (testing (format "\ninput = %s" (u/pprint-to-str input))
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"User [\d,]+ does not exist"
                 (pulse-channel/validate-email-domains {:recipients [input]}))))))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Wrong email address for User [\d,]+"
           (pulse-channel/validate-email-domains {:recipients [{:email "rasta@example.com"
                                                                :id    (mt/user->id :rasta)}]}))))))

(deftest identity-hash-test
  (testing "Pulse channel hashes are composed of the pulse's hash, the channel type, and the details and the collection hash"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (mt/with-temp* [Collection   [coll  {:name "field-db" :location "/" :created_at now}]
                      Pulse        [pulse {:name "my pulse" :collection_id (:id coll) :created_at now}]
                      PulseChannel [chan  {:pulse_id     (:id pulse)
                                           :channel_type :email
                                           :details      {:emails ["cam@test.com"]}
                                           :created_at   now}]]
        (is (= "2f5f0269"
               (serdes/raw-hash [(serdes/identity-hash pulse) :email {:emails ["cam@test.com"]} now])
               (serdes/identity-hash chan)))))))
