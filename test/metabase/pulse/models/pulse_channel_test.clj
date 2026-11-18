(ns metabase.pulse.models.pulse-channel-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.pulse.models.pulse-channel :as pulse-channel]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.pulse.task.send-pulses :as task.send-pulses]
   [metabase.pulse.task.send-pulses-trigger :as task.send-pulses-trigger]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest schedule-fits-type?-test
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
      (testing (cons 'schedule-fits-type? args)
        (is (= expected
               (pulse.schema/schedule-fits-type? (zipmap [:schedule_type :schedule_hour :schedule_day :schedule_frame] args))))))))

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
      (dissoc :date_joined :last_login :is_superuser :is_qbnewb :locale :tenant_id :is_data_analyst)
      mt/derecordize))

;; create a channel then select its details
(defn- create-channel-then-select!
  [channel]
  (when-let [new-channel-id (pulse-channel/create-pulse-channel! channel)]
    (-> (t2/select-one :model/PulseChannel :id new-channel-id)
        (t2/hydrate :recipients)
        (update :recipients #(sort-by :email %))
        (dissoc :id :pulse_id :created_at :updated_at)
        (update :entity_id boolean)
        (m/dissoc-in [:details :emails]))))

(defn- update-channel-then-select!
  [{:keys [id] :as channel}]
  (pulse-channel/update-pulse-channel! channel)
  (-> (t2/select-one :model/PulseChannel :id id)
      (t2/hydrate :recipients)
      (dissoc :id :pulse_id :created_at :updated_at)
      (update :entity_id boolean)
      (m/dissoc-in [:details :emails])))

(def default-pulse-channel
  {:enabled        true
   :entity_id      true
   :channel_type   :email
   :schedule_type  :daily
   :schedule_hour  18
   :schedule_day   nil
   :schedule_frame nil
   :recipients     []
   :channel_id     nil})

;; create-pulse-channel!
(deftest create-pulse-channel!-test
  (mt/with-premium-features #{}
    (mt/with-temp [:model/Pulse {:keys [id]}]
      (mt/with-model-cleanup [:model/Pulse]
        (testing "disabled"
          (is (= (merge default-pulse-channel
                        {:enabled false
                         :recipients [(user-details :crowberto)
                                      {:email "foo@bar.com"}
                                      (user-details :rasta)]})
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
          (is (= (merge default-pulse-channel
                        {:recipients [(user-details :crowberto)
                                      {:email "foo@bar.com"}
                                      (user-details :rasta)]})
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
          (is (= (merge default-pulse-channel
                        {:channel_type :slack
                         :schedule_type :hourly :schedule_hour nil
                         :details {:channel "#general"}})
                 (create-channel-then-select!
                  {:pulse_id      id
                   :enabled       true
                   :channel_type  :slack
                   :schedule_type :hourly
                   :details       {:channel "#general"}
                   :recipients    []}))))))))

(deftest update-pulse-channel!-test
  (mt/with-premium-features #{}
    (mt/with-temp [:model/Pulse {pulse-id :id}]
      (testing "simple starting case where we modify the schedule hour and add a recipient"
        (mt/with-temp [:model/PulseChannel {channel-id :id} {:pulse_id pulse-id}]
          (is (= (merge default-pulse-channel
                        {:recipients [{:email "foo@bar.com"}]})
                 (update-channel-then-select!
                  {:id            channel-id
                   :enabled       true
                   :channel_type  :email
                   :schedule_type :daily
                   :schedule_hour 18
                   :recipients    [{:email "foo@bar.com"}]})))))
      (testing "monthly schedules require a schedule_frame and can optionally omit they schedule_day"
        (mt/with-temp [:model/PulseChannel {channel-id :id} {:pulse_id pulse-id}]
          (is (= (merge default-pulse-channel
                        {:recipients     [{:email "foo@bar.com"} (user-details :rasta)]
                         :channel_type   :email
                         :schedule_type  :monthly
                         :schedule_frame :mid
                         :schedule_hour  8})
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
        (mt/with-temp [:model/PulseChannel {channel-id :id} {:pulse_id pulse-id}]
          (is (= (merge default-pulse-channel
                        {:recipients    [{:email "foo@bar.com"} (user-details :rasta)]
                         :channel_type  :email
                         :schedule_type :weekly
                         :schedule_hour 8
                         :schedule_day  "mon"})
                 (update-channel-then-select!
                  {:id            channel-id
                   :enabled       true
                   :channel_type  :email
                   :schedule_type :weekly
                   :schedule_hour 8
                   :schedule_day  "mon"
                   :recipients    [{:email "foo@bar.com"} {:id (mt/user->id :rasta)}]})))))
      (testing "hourly schedules don't require day/hour settings (should be nil), fully change recipients"
        (mt/with-temp [:model/PulseChannel {channel-id :id} {:pulse_id pulse-id, :details {:emails ["foo@bar.com"]}}]
          (pulse-channel/update-recipients! channel-id [(mt/user->id :rasta)])
          (is (= (merge default-pulse-channel
                        {:recipients    [(user-details :crowberto)]
                         :channel_type  :email
                         :schedule_type :hourly
                         :schedule_hour nil
                         :schedule_day  nil})
                 (update-channel-then-select!
                  {:id            channel-id
                   :enabled       true
                   :channel_type  :email
                   :schedule_type :hourly
                   :schedule_hour 12
                   :schedule_day  "tue"
                   :recipients    [{:id (mt/user->id :crowberto)}]})))))
      (testing "custom details for channels that need it"
        (mt/with-temp [:model/PulseChannel {channel-id :id} {:pulse_id pulse-id}]
          (is (= (merge default-pulse-channel
                        {:recipients    [{:email "foo@bar.com"} {:email "blah@bar.com"}]
                         :details       {:channel "#metabaserocks"}
                         :channel_type  :email
                         :schedule_type :daily
                         :schedule_hour 12
                         :schedule_day  nil})
                 (update-channel-then-select!
                  {:id            channel-id
                   :enabled       true
                   :channel_type  :email
                   :schedule_type :daily
                   :schedule_hour 12
                   :schedule_day  "tue"
                   :recipients    [{:email "foo@bar.com"} {:email "blah@bar.com"}]
                   :details       {:channel "#metabaserocks"}}))))))))

(deftest update-recipients!-test
  (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                 :model/PulseChannel {channel-id :id} {:pulse_id pulse-id}]
    (letfn [(upd-recipients! [recipients]
              (pulse-channel/update-recipients! channel-id recipients)
              (t2/select-fn-set :user_id :model/PulseChannelRecipient, :pulse_channel_id channel-id))]
      (doseq [[new-recipients expected] {[]                  nil
                                         [:rasta]            [:rasta]
                                         [:crowberto]        [:crowberto]
                                         [:crowberto :rasta] [:crowberto :rasta]
                                         [:rasta :trashbird] [:rasta :trashbird]}]
        (testing new-recipients
          (is (= (not-empty (set (map mt/user->id expected)))
                 (upd-recipients! (map mt/user->id new-recipients)))))))))

(deftest inactive-users-test
  (testing "Inactive users shouldn't get Pulses"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Pulse                  {pulse-id :id} {}
                     :model/PulseChannel           {channel-id :id :as channel} {:pulse_id pulse-id
                                                                                 :details  {:emails ["cam@test.com"]}}
                     :model/User                  {inactive-user-id :id} {:is_active false}
                     :model/PulseChannelRecipient _ {:pulse_channel_id channel-id :user_id inactive-user-id}
                     :model/PulseChannelRecipient _ {:pulse_channel_id channel-id :user_id (mt/user->id :rasta)}
                     :model/PulseChannelRecipient _ {:pulse_channel_id channel-id :user_id (mt/user->id :lucky)}]
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
               (:recipients (t2/hydrate channel :recipients))))))))

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

(defn pulse->trigger-info
  [pulse-id schedule-map pc-ids]
  {:key      (.getName ^org.quartz.TriggerKey (#'task.send-pulses-trigger/send-pulse-trigger-key pulse-id schedule-map))
   :schedule (u.cron/schedule-map->cron-string schedule-map)
   :priority 6
   :data     {"pulse-id"    pulse-id
              "channel-ids" (set pc-ids)}})

(def daily-at-6pm
  {:schedule_type  "daily"
   :schedule_hour  18
   :schedule_day   nil
   :schedule_frame nil})

(def daily-at-7pm
  {:schedule_type  "daily"
   :schedule_hour  19
   :schedule_day   nil
   :schedule_frame nil})

(defn send-pulse-triggers
  [pulse-id & {:keys [additional-keys]}]
  (->> (task/job-info task.send-pulses-trigger/send-pulse-job-key)
       :triggers
       (map #(select-keys % (concat [:key :schedule :data :priority] additional-keys)))
       (filter #(or (nil? pulse-id) (= pulse-id (get-in % [:data "pulse-id"]))))
       set))

(defmacro with-send-pulse-setup!
  [& body]
  `(mt/with-temp-scheduler!
     (task/init! ::task.send-pulses/SendPulses)
     ~@body))

(deftest e2e-single-pc-trigger-test
  (with-send-pulse-setup!
    (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                   :model/PulseChannel {pc-id :id}    (merge {:pulse_id       pulse-id
                                                              :channel_type   :email}
                                                             daily-at-6pm)]
      (testing "Creating a PulseChannel will creates a trigger"
        (is (= #{(pulse->trigger-info pulse-id daily-at-6pm [pc-id])}
               (send-pulse-triggers pulse-id))))
      (testing "updating the schedule of a trigger will remove it from the existing trigger and create a new one"
        (t2/update! :model/PulseChannel :id pc-id daily-at-7pm)
        (is (=? #{(pulse->trigger-info pulse-id daily-at-7pm [pc-id])}
                (send-pulse-triggers pulse-id))))
      (testing "disable PC will delete its trigger"
        (t2/update! :model/PulseChannel :id pc-id {:enabled false})
        (is (empty? (send-pulse-triggers pulse-id))))
      (testing "reenable PC will add its trigger"
        (t2/update! :model/PulseChannel :id pc-id {:enabled true})
        (is (=? #{(pulse->trigger-info pulse-id daily-at-7pm [pc-id])}
                (send-pulse-triggers pulse-id))))
      (testing "remove the trigger if PC is deleted"
        (t2/delete! :model/PulseChannel :id pc-id)
        (is (empty? (send-pulse-triggers pulse-id)))))))

(deftest e2e-multiple-pcs-test
  (with-send-pulse-setup!
    (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                   :model/PulseChannel {pc-id-1 :id}  (merge {:pulse_id       pulse-id
                                                              :channel_type   :email}
                                                             daily-at-6pm)]
      (testing "pc 1 will have its own channel to start with"
        (is (=? #{(pulse->trigger-info pulse-id daily-at-6pm [pc-id-1])}
                (send-pulse-triggers pulse-id))))
      (testing "add a new pc with the same time will update the existing trigger"
        (mt/with-temp [:model/PulseChannel {pc-id-2 :id} (merge {:pulse_id     pulse-id
                                                                 :channel_type :slack}
                                                                daily-at-6pm)]
          (is (=? #{(pulse->trigger-info pulse-id daily-at-6pm [pc-id-1 pc-id-2])}
                  (send-pulse-triggers pulse-id)))
          (t2/delete! :model/PulseChannel :id pc-id-2)
          (testing "deleting channel-2 should remove the id, but keep the existing trigger"
            (is (=? #{(pulse->trigger-info pulse-id daily-at-6pm [pc-id-1])}
                    (send-pulse-triggers pulse-id))))))
      (testing "add a new pc then change its schedule"
        (mt/with-temp [:model/PulseChannel {pc-id-2 :id} (merge {:pulse_id     pulse-id
                                                                 :channel_type :slack}
                                                                daily-at-6pm)]
          (is (=? #{(pulse->trigger-info pulse-id daily-at-6pm [pc-id-1 pc-id-2])}
                  (send-pulse-triggers pulse-id)))
          (testing "change schedule of a trigger will remove it from the existing trigger and create a new one"
            (t2/update! :model/PulseChannel :id pc-id-2 daily-at-7pm)
            (is (=? #{(pulse->trigger-info pulse-id daily-at-6pm [pc-id-1])
                      (pulse->trigger-info pulse-id daily-at-7pm [pc-id-2])}
                    (send-pulse-triggers pulse-id))))
          (testing "change it back to the original schedule will remove the trigger and update channel-ids of the existing one"
            (t2/update! :model/PulseChannel :id pc-id-2 daily-at-6pm)
            (is (=? #{(pulse->trigger-info pulse-id daily-at-6pm [pc-id-1 pc-id-2])}
                    (send-pulse-triggers pulse-id)))))))))

(defn- status-code
  "The `:status-code` of the exception `thunk` throws, or nil when it throws none."
  [thunk]
  (try
    (thunk)
    nil
    (catch clojure.lang.ExceptionInfo e
      (:status-code (ex-data e)))))

(defn- channel-row
  "A PulseChannel row with every schedule column, nil unless `overrides` sets it."
  [overrides]
  (merge {:channel_type :email :schedule_type :daily :schedule_hour 8 :schedule_day nil :schedule_frame nil} overrides))

(deftest ^:parallel channel-schema-test
  (doseq [[testing-name overrides] {"channel type that does not exist"       {:channel_type :sms}
                                    "schedule type that does not exist"      {:schedule_type :yearly}
                                    "hour past end of day"                   {:schedule_type :daily, :schedule_hour 24}
                                    "details with key no channel has"        {:details {:bogus true}}
                                    "details with emails that is not a list" {:details {:emails "a@example.com"}}}]
    (testing testing-name
      (is (not (mr/validate ::pulse.schema/pulse-channel.update (channel-row overrides)))))))

(defn normalize-status
  "The status code of the exception normalizing `row` with `schema` throws, or nil."
  [schema row]
  (try
    (lib/normalize schema row {:throw? true})
    nil
    (catch clojure.lang.ExceptionInfo e
      (:status-code (ex-data e)))))

(deftest ^:parallel channel-schedule-rule-test
  (doseq [[testing-name overrides] {"daily schedule without hour"    {:schedule_type :daily, :schedule_hour nil}
                                    "weekly schedule without day"    {:schedule_type :weekly, :schedule_hour 8}
                                    "monthly schedule without frame" {:schedule_type :monthly, :schedule_hour 8}
                                    "mid-month schedule with day"    {:schedule_type :monthly, :schedule_hour 8
                                                                      :schedule_frame :mid, :schedule_day "mon"}}]
    (testing testing-name
      (is (= 400 (normalize-status ::pulse.schema/pulse-channel.update (channel-row overrides))))))
  (testing "schedules that are valid"
    (doseq [overrides [{:schedule_type :hourly, :schedule_hour nil}
                       {:schedule_type :daily, :schedule_hour 0}
                       {:schedule_type :weekly, :schedule_hour 8, :schedule_day "mon"}
                       {:schedule_type :monthly, :schedule_hour 8, :schedule_frame :mid}
                       {:schedule_type :monthly, :schedule_hour 8, :schedule_frame :last, :schedule_day "fri"}
                       {:channel_type "slack", :schedule_type "hourly", :details {:channel "#general"}}]]
      (testing (pr-str overrides)
        (is (nil? (normalize-status ::pulse.schema/pulse-channel.update (channel-row overrides)))))))
  (testing "body without every schedule column leaves combination to hook"
    (is (nil? (normalize-status ::pulse.schema/pulse-channel.update {:schedule_type :weekly})))))

(deftest update-rules-test
  (mt/with-temp [:model/Pulse        {pulse-id :id}   {}
                 :model/PulseChannel {channel-id :id} {:pulse_id pulse-id}]
    (doseq [[testing-name changes] {"schedule type that does not exist" {:schedule_type :yearly}
                                    "hour past end of day"              {:schedule_hour 24}
                                    "schedule type that needs day"      {:schedule_type :weekly}
                                    "monthly schedule without frame"    {:schedule_type :monthly}}]
      (testing testing-name
        (is (= 400 (status-code #(t2/update! :model/PulseChannel :id channel-id changes))))
        (is (=? {:channel_type :email, :schedule_type :daily, :schedule_hour 15}
                (t2/select-one :model/PulseChannel :id channel-id)))))
    (testing "changes that leave a valid channel"
      (is (= 1 (t2/update! :model/PulseChannel :id channel-id {:schedule_type :weekly, :schedule_day "mon"})))
      (is (= 1 (t2/update! :model/PulseChannel :id channel-id {:schedule_hour 7})))
      (is (= 1 (t2/update! :model/PulseChannel :id channel-id {:details {:emails ["a@example.com"]}})))
      (is (=? {:schedule_type :weekly, :schedule_day "mon", :schedule_hour 7}
              (t2/select-one :model/PulseChannel :id channel-id))))))

(deftest invalid-update-leaves-triggers-alone-test
  (with-send-pulse-setup!
    (mt/with-temp [:model/Pulse        {pulse-id :id}  {}
                   :model/PulseChannel _               (merge {:pulse_id pulse-id :channel_type :email} daily-at-6pm)
                   :model/PulseChannel {weekly-id :id} {:pulse_id pulse-id, :channel_type :slack
                                                        :schedule_type :weekly, :schedule_hour 8, :schedule_day "mon"}]
      (let [triggers (send-pulse-triggers pulse-id)]
        (testing "an UPDATE that makes the weekly channel invalid"
          (is (= 400 (status-code #(t2/update! :model/PulseChannel :id weekly-id
                                               {:schedule_type :monthly, :schedule_frame :mid}))))
          (testing "moves no trigger"
            (is (= triggers (send-pulse-triggers pulse-id)))))))))
