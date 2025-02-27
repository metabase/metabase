(ns metabase.db.custom-migrations.pulse-to-notification-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.custom-migrations.pulse-to-notification :as pulse-to-notification]
   [metabase.models.notification :as models.notification]
   [metabase.task :as task]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- sort-handlers
  [notiification]
  (update notiification :handler #(sort-by :channel_type %)))

(defn migrate-alert!
  [scheduler pulse-id]
  (->> (#'pulse-to-notification/alert->notification! scheduler (t2/select-one :pulse pulse-id))
       (map :id)
       (map (partial t2/select-one :model/Notification))
       (map models.notification/hydrate-notification)
       (map sort-handlers)))

(def schedule-daily-6-am
  {:schedule_type "daily"
   :schedule_hour 6})

(def timestamp-now
  {:created_at :%now
   :updated_at :%now})

(def cron-daily-6-am
  "0 0 6 * * ? *")

(defn- add-timestamp
  [x]
  (if (sequential? x)
    (map #(merge timestamp-now %) x)
    (merge timestamp-now x)))

(defn- create-pulse!
  [pulse pulse-cards pcs+recipients]
  (let [pulse-id (t2/insert-returning-pk! :pulse (add-timestamp pulse))]
    (t2/insert! :pulse_card (map #(assoc % :pulse_id pulse-id) pulse-cards))
    (doseq [pcr pcs+recipients]
      (let [pc-id (t2/insert-returning-pk! :pulse_channel (-> pcr (assoc :pulse_id pulse-id) (dissoc :recipients) add-timestamp))]
        (when (seq (:recipients pcr))
          (t2/insert! :pulse_channel_recipient (map #(assoc % :pulse_channel_id pc-id) (:recipients pcr))))))
    pulse-id))

(defn create-alert!
  [alert-prop card-id pcs+recipients]
  (create-pulse! (merge {:alert_condition "rows"
                         :skip_if_empty   true
                         :name            (mt/random-name)
                         :parameters      "{}"
                         :creator_id      (mt/user->id :crowberto)}
                        alert-prop)
                 [{:card_id  card-id
                   :position 0}]
                 (map #(merge schedule-daily-6-am {:details "{}"} %) pcs+recipients)))

(deftest migrate-alert-test
  (testing "basic alert migration"
    (mt/with-model-cleanup [:model/Pulse :model/Notification]
      (mt/with-temp [:model/Card {card-id :id} {}]
        (mt/with-temp-scheduler!
          (testing "has one subscription, one email handler with one recipient"
            (let [alert-id (create-alert! {} card-id [{:channel_type "email"
                                                       :recipients  [{:user_id (mt/user->id :rasta)}]}])
                  alert    (t2/select-one :model/Pulse alert-id)
                  notification (first (migrate-alert! (#'task/scheduler) alert-id))]
              (is (=? {:payload_type :notification/card
                       :active       true
                       :creator_id   (mt/user->id :crowberto)
                       :subscriptions [{:type          :notification-subscription/cron
                                        :cron_schedule cron-daily-6-am}]
                       :handlers      [{:channel_type :channel/email
                                        :recipients   [{:type :notification-recipient/user
                                                        :user_id (mt/user->id :rasta)}]}]
                       :created_at   (:created_at alert)
                       :updated_at   (:updated_at alert)}
                      notification)))))))))

(deftest migrate-alert-http-test
  (testing "migrate alert with http channel"
    (mt/with-model-cleanup [:model/Pulse :model/Notification]
      (mt/with-temp-scheduler!
        (mt/with-temp [:model/Card {card-id :id} {}
                       :model/Channel {channel-id :id} {}]
          (let [alert-id (create-alert! {} card-id [{:channel_type "http"
                                                     :channel_id   channel-id}])
                notification (first (migrate-alert! (#'task/scheduler) alert-id))]
            (is (=? {:payload_type :notification/card
                     :payload      {:card_id        card-id
                                    :send_once      false
                                    :send_condition :has_result}
                     :active       true
                     :creator_id   (mt/user->id :crowberto)
                     :subscriptions [{:type          :notification-subscription/cron
                                      :cron_schedule cron-daily-6-am}]
                     :handlers      [{:channel_type :channel/http
                                      :channel_id   channel-id}]}
                    notification))))))))

(deftest migrate-alert-multiple-channels-test
  (testing "migrate alert with multiple channels 1 slack, 1 email with 1 external recipient and one user, 1 disabled email, one http"
    (mt/with-model-cleanup [:model/Pulse :model/Notification]
      (mt/with-temp-scheduler!
        (mt/with-temp [:model/Card {card-id :id} {}
                       :model/Channel {channel-id :id} {:type "channel/http"}]
          (let [alert-id (create-alert! {} card-id [{:channel_type "email"
                                                     :enabled      true
                                                     :details      (json/encode {:emails ["ngoc@metabase.com"]})
                                                     :recipients   [{:user_id (mt/user->id :rasta)}]}
                                                    {:channel_type "slack"
                                                     :enabled      true
                                                     :details      (json/encode {:channel "#test-channel"})}
                                                    {:channel_type "http"
                                                     :enabled      true
                                                     :channel_id   channel-id}
                                                    {:channel_type "email"
                                                     :enabled      false
                                                     :recipients   [{:user_id (mt/user->id :crowberto)}]}])
                notification (first (migrate-alert! (#'task/scheduler) alert-id))]
            (testing "are correctly migrated, the disabled channel is not migrated"
              (is (=? {:payload_type :notification/card
                       :active       true
                       :creator_id   (mt/user->id :crowberto)
                       :subscriptions [{:type          :notification-subscription/cron
                                        :cron_schedule cron-daily-6-am}]
                       :handlers      [{:channel_type :channel/email
                                        :recipients   [{:type    :notification-recipient/user
                                                        :user_id (mt/user->id :rasta)}
                                                       {:type    :notification-recipient/raw-value
                                                        :details {:value "ngoc@metabase.com"}}]}
                                       {:channel_type :channel/slack
                                        :recipients   [{:type    :notification-recipient/raw-value
                                                        :details {:value "#test-channel"}}]}
                                       {:channel_type :channel/http
                                        :channel_id   channel-id}]}
                      notification)))))))))

(deftest migrate-alert-send-condition-test
  (testing "migrate alert with different send conditions"
    (mt/with-model-cleanup [:model/Pulse :model/Notification]
      (mt/with-temp [:model/Card {card-id :id} {}]
        (mt/with-temp-scheduler!
          (doseq [{:keys [expected alert-props]} [{:expected    {:send_condition :has_result
                                                                 :send_once      false}
                                                   :alert-props {:alert_condition "rows"
                                                                 :alert_above_goal nil
                                                                 :alert_first_only false}}
                                                  {:expected    {:send_condition :goal_above
                                                                 :send_once       false}
                                                   :alert-props {:alert_condition "goal"
                                                                 :alert_above_goal true
                                                                 :alert_first_only false}}
                                                  {:expected    {:send_condition :goal_below
                                                                 :send_once       true}
                                                   :alert-props {:alert_condition "goal"
                                                                 :alert_above_goal false
                                                                 :alert_first_only true}}]]
            (testing (format "testing %s condition" alert-props)
              (let [alert-id (create-alert! alert-props card-id [{:channel_type "email"
                                                                  :recipients  [{:user_id (mt/user->id :rasta)}]}])
                    notification (first (migrate-alert! (#'task/scheduler) alert-id))]
                (is (=? {:payload_type :notification/card
                         :payload      (merge {:card_id card-id} expected)
                         :active       true
                         :creator_id   (mt/user->id :crowberto)}
                        notification))))))))))

(defn- bit->boolean
  "Coerce a bit returned by some MySQL/MariaDB versions in some situations to Boolean."
  [v]
  (if (number? v)
    (not (zero? v))
    v))

(defn test-alert-view!
  [{:keys [alert pcs expected-views]}]
  (mt/with-model-cleanup [:model/Pulse :model/Notification]
    (mt/with-temp-scheduler!
      (mt/with-temp [:model/Card {card-id :id} {}]
        (let [alert-id (create-alert! alert card-id pcs)
              notification-id (:id (first (migrate-alert! (#'task/scheduler) alert-id)))
              entity-id       (format "notification_%s" notification-id)
              card-entity-id  (format "card_%s" card-id)]
          (is (=? (map #(assoc %
                               :card_qualified_id card-entity-id
                               :card_id card-id
                               :entity_id notification-id)
                       expected-views)
                  (map #(-> %
                            (update :archived bit->boolean)
                            (update :recipients (fn [recipients]
                                                  (some-> recipients
                                                          (str/split #",")
                                                          set))))
                       (t2/query {:select [:*]
                                  :from [:v_alerts]
                                  :where [:= :entity_qualified_id entity-id]
                                  :order-by [:recipient_type]})))))))))

(deftest v_alerts-test
  (testing "testing the new v_alerts view created by v53.2024-12-12T08:06:00 migration"
    (testing "basic with mutliple channels"
      (test-alert-view!
       {:alert          {:alert_condition "rows"
                         :alert_above_goal nil
                         :alert_first_only false}
        :pcs            [{:channel_type "email"
                          :schedule_type "daily"
                          :schedule_hour 6
                          :details (json/encode {:emails ["ngoc@metabase.com"]})
                          :recipients [{:user_id (mt/user->id :rasta)} {:user_id (mt/user->id :crowberto)}]}
                         {:channel_type "slack"
                          :schedule_type "daily"
                          :schedule_hour 6
                          :details (json/encode {:channel "#test-channel"})}]
        :expected-views [{:archived false
                          :schedule_type "daily"
                          :alert_condition "rows"
                          :schedule_hour 6
                          :recipient_external (json/encode {:value "ngoc@metabase.com"})
                          :recipients #{"rasta@metabase.com" "crowberto@metabase.com"}
                          :recipient_type "channel/email"}
                         {:archived false
                          :schedule_type "daily"
                          :alert_condition "rows"
                          :schedule_hour 6
                          :recipient_external (json/encode {:value "#test-channel"})
                          :recipients nil
                          :recipient_type "channel/slack"}]}))

    (testing "schedule types"
      (testing "weekly schedule"
        (test-alert-view!
         {:alert          {:alert_condition "goal"
                           :alert_above_goal true
                           :alert_first_only false}
          :pcs            [{:channel_type "email"
                            :schedule_type "weekly"
                            :schedule_hour 15
                            :schedule_day "wed"
                            :recipients [{:user_id (mt/user->id :rasta)}]}]
          :expected-views [{:archived false
                            :schedule_type "weekly"
                            :alert_condition "goal"
                            :schedule_hour 15
                            :schedule_day "wed"
                            :recipient_external nil
                            :recipients #{"rasta@metabase.com"}
                            :recipient_type "channel/email"}]}))

      (testing "hourly schedule"
        (test-alert-view!
         {:alert          {:alert_condition "rows"}
          :pcs            [{:channel_type "slack"
                            :schedule_type "hourly"
                            :details (json/encode {:channel "#alerts"})}]
          :expected-views [{:archived false
                            :schedule_type "hourly"
                            :alert_condition "rows"
                            :recipient_external (json/encode {:value "#alerts"})
                            :recipients nil
                            :recipient_type "channel/slack"}]}))

      (testing "daily schedule"
        (test-alert-view!
         {:alert          {:alert_condition "rows"}
          :pcs            [{:channel_type "email"
                            :schedule_type "daily"
                            :schedule_hour 23
                            :recipients [{:user_id (mt/user->id :rasta)}]}]
          :expected-views [{:archived false
                            :schedule_type "daily"
                            :alert_condition "rows"
                            :schedule_hour 23
                            :recipient_external nil
                            :recipients #{"rasta@metabase.com"}
                            :recipient_type "channel/email"}]})))))
