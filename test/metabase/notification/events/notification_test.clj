(ns metabase.notification.events.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase.audit-app.models.audit-log :as audit-log]
   [metabase.events.core :as events]
   [metabase.events.schema :as events.schema]
   [metabase.events.test-util :as events.tu]
   [metabase.notification.core :as notification]
   [metabase.notification.events.notification :as events.notification]
   [metabase.notification.models :as models.notification]
   [metabase.notification.send :as notification.send]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest supported-events-with-notification-will-be-sent-test
  (mt/with-model-cleanup [:model/Notification]
    (notification.tu/with-send-notification-sync
      (notification.tu/with-temporary-event-topics! #{:event/test-notification}
        (let [topic      :event/test-notification
              [n-1]        (models.notification/create-notifications! [{:payload_type :notification/system-event
                                                                        :active       true
                                                                        :subscriptions [{:type       :notification-subscription/system-event
                                                                                         :event_name topic}]}])
              n-2         (first (models.notification/create-notifications! [{:payload_type :notification/system-event
                                                                              :active       true
                                                                              :subscriptions [{:type       :notification-subscription/system-event
                                                                                               :event_name topic}]}]))
              _inactive  (first (models.notification/create-notifications! [{:payload_type :notification/system-event
                                                                             :active       false
                                                                             :subscriptions [{:type       :notification-subscription/system-event
                                                                                              :event_name topic}]}]))
              sent-notis (atom [])]
          (testing "publishing event will send all the actively subscribed notifciations"
            (with-redefs [notification.send/send-notification! (fn [notification] (swap! sent-notis conj notification))
                          events.notification/supported-topics #{:event/test-notification}]
              (events/publish-event! topic {::hi true})
              (is (=? [[(:id n-1) {:event_info {::hi true}}]
                       [(:id n-2) {:event_info {::hi true}}]]
                      (->> @sent-notis
                           (map (juxt :id :payload))
                           (sort-by first)))))))))))

(deftest unsupported-events-will-not-send-notification-test
  (mt/with-model-cleanup [:model/Notification]
    (notification.tu/with-temporary-event-topics! #{:event/unsupported-topic}
      (let [topic      :event/unsupported-topic
            sent-notis (atom #{})]
        (models.notification/create-notifications! [{:payload_type :notification/system-event
                                                     :active       true
                                                     :subscriptions [{:type       :notification-subscription/system-event
                                                                      :event_name topic}]}])
        (testing "publish an event that is not supported for notifications will not send any notifications"
          (with-redefs
           [notification/send-notification!      (fn [notification] (swap! sent-notis conj notification))
            events.notification/supported-topics #{}]
            (events/publish-event! :event/unsupported-topic {::hi true})
            (is (empty? @sent-notis))))))))

(def user-hydra-model [:model/User :id :first_name])

(deftest hydrate-event-notifcation-test
  (doseq [[context schema value expected]
          [["single map"
            [:map
             (-> [:user_id :int] (#'events.schema/with-hydrate :user user-hydra-model))]
            {:user_id (mt/user->id :rasta)}
            {:user_id (mt/user->id :rasta)
             :user    (t2/select-one user-hydra-model :id (mt/user->id :rasta))}]
           ["seq of maps"
            [:sequential
             [:map
              (-> [:user_id :int] (#'events.schema/with-hydrate :user user-hydra-model))]]
            [{:user_id (mt/user->id :rasta)}
             {:user_id (mt/user->id :crowberto)}]
            [{:user_id (mt/user->id :rasta)
              :user    (t2/select-one user-hydra-model :id (mt/user->id :rasta))}
             {:user_id (mt/user->id :crowberto)
              :user    (t2/select-one user-hydra-model :id (mt/user->id :crowberto))}]]
           ["ignore keys that don't need hydration"
            [:map
             (-> [:user_id :int] (#'events.schema/with-hydrate :user user-hydra-model))
             [:topic   [:= :user-joined]]]
            {:user_id (mt/user->id :rasta)
             :topic   :user-joined}
            {:user_id (mt/user->id :rasta)
             :user    (t2/select-one user-hydra-model :id (mt/user->id :rasta))
             :topic   :user-joined}]
           ["multiple hydration in the same map"
            [:map
             (-> [:user_id :int] (#'events.schema/with-hydrate :user user-hydra-model))
             (-> [:creator_id :int] (#'events.schema/with-hydrate :creator user-hydra-model))]
            {:user_id    (mt/user->id :rasta)
             :creator_id (mt/user->id :crowberto)}
            {:user_id    (mt/user->id :rasta)
             :user       (t2/select-one user-hydra-model :id (mt/user->id :rasta))
             :creator_id (mt/user->id :crowberto)
             :creator    (t2/select-one user-hydra-model :id (mt/user->id :crowberto))}]
           ["respect the options"
            [:map
             (-> [:user_id {:optional true} :int] (#'events.schema/with-hydrate :user user-hydra-model))]
            {}
            {}]]]
    (testing context
      (is (= expected (#'events.notification/hydrate! schema value))))))

(deftest record-task-history-test
  (notification.tu/with-notification-testing-setup!
    (mt/with-temp [:model/Channel chn-1 (assoc notification.tu/default-can-connect-channel :name (mt/random-name))
                   :model/Channel chn-2 (assoc notification.tu/default-can-connect-channel :name (mt/random-name))]
      (notification.tu/with-temporary-event-topics! #{:event/testing}
        (doseq [_ (range 2)]
          (models.notification/create-notifications! [{:payload_type :notification/testing
                                                       :subscriptions [{:type :notification-subscription/system-event
                                                                        :event_name :event/testing}]
                                                       :handlers [{:channel_type notification.tu/test-channel-type
                                                                   :channel_id   (:id chn-1)
                                                                   :template_id  nil
                                                                   :recipients   [{:type :notification-recipient/user
                                                                                   :user_id (mt/user->id :crowberto)}]}
                                                                  {:channel_type notification.tu/test-channel-type
                                                                   :channel_id   (:id chn-2)
                                                                   :template_id  nil
                                                                   :recipients   [{:type :notification-recipient/user
                                                                                   :user_id (mt/user->id :rasta)}]}]}]))
        (t2/select :model/NotificationSubscription)
        (t2/delete! :model/TaskHistory :task [:in ["notification-send" "channel-send" "notification-trigger"]])
        (events/publish-event! :event/testing {})
        (testing "each notification should have a task history, in which each channel-send will have a task history"
          (is (= {"notification-trigger" 1
                  "notification-send"    2 ; 2 notifications, each send to 2 channels
                  "channel-send"         4}
                 (as-> (t2/select :model/TaskHistory :task [:in ["notification-send" "channel-send" "notification-trigger"]]) th
                   (group-by :task th)
                   (update-vals th count)))))))))

(deftest create-notifications-statement-count-test
  (testing "creating 10 notifications runs as many statements as creating 40, with one audit row for each"
    (mt/with-model-cleanup [:model/Notification :model/NotificationCard :model/AuditLog]
      (mt/with-premium-features #{:audit-app}
        (mt/with-temp [:model/Card {card-id :id} {}]
          (mt/with-test-user :crowberto
            (let [create! (fn [n]
                            (let [rows (vec (for [_ (range n)]
                                              {:payload_type  :notification/card
                                               :active        true
                                               :payload       {:card_id card-id}
                                               :subscriptions [{:type          :notification-subscription/cron
                                                                :cron_schedule "0 0 0 * * ?"}]
                                               :handlers      [{:channel_type :channel/email
                                                                :recipients   [{:type    :notification-recipient/user
                                                                                :user_id (mt/user->id :rasta)}]}]}))
                                  result (atom nil)
                                  stmts  (events.tu/real-statement-count!
                                          #(reset! result (models.notification/create-notifications! rows)))]
                              {:count  stmts
                               :audits (t2/count :model/AuditLog :topic "notification-create" :model "Notification"
                                                 :model_id [:in (map :id @result)])}))]
              (create! 2)
              (let [small (create! 10)
                    large (create! 40)]
                (is (= (:count small) (:count large)))
                (is (= [10 40] [(:audits small) (:audits large)]))))))))))

(deftest create-notifications-audit-row-failure-test
  (testing "when the audit row of one of 3 created notifications cannot be built, the other 2 still get theirs"
    (mt/with-model-cleanup [:model/Notification :model/NotificationCard :model/AuditLog]
      (mt/with-premium-features #{:audit-app}
        (mt/with-temp [:model/Card {card-id :id} {}]
          (mt/with-test-user :crowberto
            (let [audit-row (mt/original-fn #'audit-log/audit-row)
                  built     (atom 0)
                  rows      (vec (for [_ (range 3)]
                                   {:payload_type  :notification/card
                                    :active        true
                                    :payload       {:card_id card-id}
                                    :subscriptions [{:type          :notification-subscription/cron
                                                     :cron_schedule "0 0 0 * * ?"}]
                                    :handlers      [{:channel_type :channel/email
                                                     :recipients   [{:type    :notification-recipient/user
                                                                     :user_id (mt/user->id :rasta)}]}]}))
                  created   (mt/with-dynamic-fn-redefs [audit-log/audit-row (fn [topic params]
                                                                              (when (and (= "notification-create" (name topic))
                                                                                         (= 2 (swap! built inc)))
                                                                                (throw (ex-info "cannot build row" {})))
                                                                              (audit-row topic params))]
                              (models.notification/create-notifications! rows))]
              (is (= 3 (count created)))
              (is (= 2 (t2/count :model/AuditLog :topic "notification-create" :model "Notification"
                                 :model_id [:in (map :id created)]))))))))))
