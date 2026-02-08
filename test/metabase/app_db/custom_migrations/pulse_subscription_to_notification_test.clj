(ns metabase.app-db.custom-migrations.pulse-subscription-to-notification-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.custom-migrations.pulse-subscription-to-notification :as pulse-subscription-to-notification]
   [metabase.notification.models :as models.notification]
   [metabase.pulse.models.pulse-channel-test :as pulse-channel-test]
   [metabase.pulse.task.send-pulses :as task.send-pulses]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- sort-handlers
  [notification]
  (update notification :handlers #(sort-by :channel_type %)))

(defmacro with-test-setup!
  [& body]
  `(mt/with-model-cleanup [:model/Pulse :model/Notification]
     (mt/with-temp-scheduler!
       (task/init! ::task.send-pulses/SendPulses)
       ~@body)))

(defn migrate-subscription!
  [scheduler pulse-id]
  (->> (#'pulse-subscription-to-notification/subscription->notification! scheduler (t2/select-one :pulse pulse-id))
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
    (t2/insert! :pulse_card (map-indexed #(assoc %2 :pulse_id pulse-id :position %1) pulse-cards))
    (doseq [pcr pcs+recipients]
      (let [pc-id (t2/insert-returning-pk! :model/PulseChannel (-> pcr (assoc :pulse_id pulse-id) (dissoc :recipients) add-timestamp))]
        (when (seq (:recipients pcr))
          (t2/insert! :pulse_channel_recipient (map #(assoc % :pulse_channel_id pc-id) (:recipients pcr))))))
    pulse-id))

(defn create-subscription!
  [subscription-props dashboard-id pulse-cards pcs+recipients]
  (create-pulse! (merge {:dashboard_id  dashboard-id
                         :skip_if_empty false
                         :name          (mt/random-name)
                         :parameters    "[]"
                         :creator_id    (mt/user->id :crowberto)}
                        subscription-props)
                 pulse-cards
                 (map #(merge schedule-daily-6-am {:details "{}"} %) pcs+recipients)))

(deftest migrate-basic-subscription-test
  (testing "basic dashboard subscription migration with email recipients"
    (with-test-setup!
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                     :model/Card      {card-id :id}      {}]
        (let [sub-id       (create-subscription!
                            {} dashboard-id
                            [{:card_id card-id}]
                            [{:channel_type "email"
                              :recipients   [{:user_id (mt/user->id :rasta)}]}])
              pulse        (t2/select-one :model/Pulse sub-id)
              triggers     (pulse-channel-test/send-pulse-triggers sub-id)
              notification (first (migrate-subscription! (task/scheduler) sub-id))]
          (testing "sanity check that there is a trigger for the subscription to begin with"
            (is (= 1 (count triggers)))
            (testing "after the migration it got deleted"
              (is (zero? (count (pulse-channel-test/send-pulse-triggers sub-id))))))
          (is (=? {:payload_type   :notification/dashboard
                   :active         true
                   :creator_id     (mt/user->id :crowberto)
                   :subscriptions  [{:type          :notification-subscription/cron
                                     :cron_schedule cron-daily-6-am}]
                   :handlers       [{:channel_type :channel/email
                                     :recipients   [{:type    :notification-recipient/user
                                                     :user_id (mt/user->id :rasta)}]}]
                   :created_at     (:created_at pulse)
                   :updated_at     (:updated_at pulse)}
                  notification)))))))

(deftest migrate-subscription-payload-fields-test
  (testing "dashboard subscription payload fields are correctly migrated"
    (with-test-setup!
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                     :model/Card      {card-id :id}      {}]
        (let [parameters   (json/encode [{:id "abc" :type "category" :value ["foo"]}])
              sub-id       (create-subscription!
                            {:skip_if_empty true
                             :disable_links true
                             :parameters    parameters}
                            dashboard-id
                            [{:card_id card-id}]
                            [{:channel_type "email"
                              :recipients   [{:user_id (mt/user->id :rasta)}]}])
              notification (first (migrate-subscription! (task/scheduler) sub-id))]
          (is (=? {:payload_type :notification/dashboard
                   :payload      {:dashboard_id                     dashboard-id
                                  :skip_if_empty                    true
                                  :disable_links                    true
                                  :parameters                       [{:id "abc" :type "category" :value ["foo"]}]
                                  :dashboard_subscription_dashcards [{:card_id     card-id
                                                                      :include_csv false
                                                                      :include_xls false
                                                                      :format_rows true
                                                                      :pivot_results false}]}}
                  notification)))))))

(deftest migrate-subscription-dashcards-test
  (testing "pulse_cards with export options are correctly converted to dashboard_subscription_dashcards"
    (with-test-setup!
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                     :model/Card      {card-id-1 :id}    {}
                     :model/Card      {card-id-2 :id}    {}]
        (let [sub-id       (create-subscription!
                            {} dashboard-id
                            [{:card_id      card-id-1
                              :include_csv  true
                              :include_xls  false
                              :format_rows  false
                              :pivot_results true}
                             {:card_id      card-id-2
                              :include_csv  false
                              :include_xls  true
                              :format_rows  true
                              :pivot_results false}]
                            [{:channel_type "email"
                              :recipients   [{:user_id (mt/user->id :rasta)}]}])
              notification (first (migrate-subscription! (task/scheduler) sub-id))]
          (is (=? {:payload {:dashboard_subscription_dashcards
                             [{:card_id       card-id-1
                               :include_csv   true
                               :include_xls   false
                               :format_rows   false
                               :pivot_results true}
                              {:card_id       card-id-2
                               :include_csv   false
                               :include_xls   true
                               :format_rows   true
                               :pivot_results false}]}}
                  notification)))))))

(deftest migrate-subscription-multiple-channels-test
  (testing "migrate subscription with multiple channels: 1 email, 1 slack, 1 http, 1 disabled email"
    (with-test-setup!
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                     :model/Card      {card-id :id}      {}
                     :model/Channel   {channel-id :id}   {:type "channel/http"}]
        (let [sub-id       (create-subscription!
                            {} dashboard-id
                            [{:card_id card-id}]
                            [{:channel_type "email"
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
              notification (first (migrate-subscription! (task/scheduler) sub-id))]
          (testing "are correctly migrated, the disabled channel is not migrated"
            (is (=? {:payload_type   :notification/dashboard
                     :active         true
                     :creator_id     (mt/user->id :crowberto)
                     :subscriptions  [{:type          :notification-subscription/cron
                                       :cron_schedule cron-daily-6-am}]
                     :handlers       [{:channel_type :channel/email
                                       :recipients   [{:type    :notification-recipient/user
                                                       :user_id (mt/user->id :rasta)}
                                                      {:type    :notification-recipient/raw-value
                                                       :details {:value "ngoc@metabase.com"}}]}
                                      {:channel_type :channel/http
                                       :channel_id   channel-id}
                                      {:channel_type :channel/slack
                                       :recipients   [{:type    :notification-recipient/raw-value
                                                       :details {:value "#test-channel"}}]}]}
                    notification))))))))

(deftest migrate-subscription-http-channel-test
  (testing "migrate subscription with http channel"
    (with-test-setup!
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                     :model/Card      {card-id :id}      {}
                     :model/Channel   {channel-id :id}   {}]
        (let [sub-id       (create-subscription!
                            {} dashboard-id
                            [{:card_id card-id}]
                            [{:channel_type "http"
                              :channel_id   channel-id}])
              notification (first (migrate-subscription! (task/scheduler) sub-id))]
          (is (=? {:payload_type   :notification/dashboard
                   :payload        {:dashboard_id dashboard-id}
                   :active         true
                   :creator_id     (mt/user->id :crowberto)
                   :subscriptions  [{:type          :notification-subscription/cron
                                     :cron_schedule cron-daily-6-am}]
                   :handlers       [{:channel_type :channel/http
                                     :channel_id   channel-id}]}
                  notification)))))))
