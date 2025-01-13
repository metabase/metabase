(ns metabase.events.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.events.notification :as events.notification]
   [metabase.events.schema :as events.schema]
   [metabase.models.notification :as models.notification]
   [metabase.notification.core :as notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def supported-topics @#'events.notification/supported-topics)

(deftest supported-events-with-notification-will-be-sent-test
  (mt/with-model-cleanup [:model/Notification]
    (notification.tu/with-temporary-event-topics! #{:event/test-notification}
      (let [topic      :event/test-notification
            n-1        (models.notification/create-notification!
                        {:payload_type :notification/system-event
                         :active       true}
                        [{:type       :notification-subscription/system-event
                          :event_name topic}]
                        nil)
            n-2         (models.notification/create-notification!
                         {:payload_type :notification/system-event
                          :active       true}
                         [{:type       :notification-subscription/system-event
                           :event_name topic}]
                         nil)
            _inactive  (models.notification/create-notification!
                        {:payload_type :notification/system-event
                         :active       false}
                        [{:type       :notification-subscription/system-event
                          :event_name topic}]
                        nil)
            sent-notis (atom [])]
        (testing "publishing event will send all the actively subscribed notifciations"
          (with-redefs
           [notification/send-notification!      (fn [notification] (swap! sent-notis conj notification))
            events.notification/supported-topics #{:event/test-notification}]
            (events/publish-event! topic {::hi true})
            (is (=? [[(:id n-1) {:event_info {::hi true}}]
                     [(:id n-2) {:event_info {::hi true}}]]
                    (->> @sent-notis
                         (map (juxt :id :payload))
                         (sort-by first))))))))))

(deftest unsupported-events-will-not-send-notification-test
  (mt/with-model-cleanup [:model/Notification]
    (notification.tu/with-temporary-event-topics! #{:event/unsupported-topic}
      (let [topic      :event/unsupported-topic
            sent-notis (atom #{})]
        (models.notification/create-notification!
         {:payload_type :notification/system-event
          :active       true}
         [{:type       :notification-subscription/system-event
           :event_name topic}]
         nil)
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
             :user    (t2/select-one user-hydra-model (mt/user->id :rasta))}]
           ["seq of maps"
            [:sequential
             [:map
              (-> [:user_id :int] (#'events.schema/with-hydrate :user user-hydra-model))]]
            [{:user_id (mt/user->id :rasta)}
             {:user_id (mt/user->id :crowberto)}]
            [{:user_id (mt/user->id :rasta)
              :user    (t2/select-one user-hydra-model (mt/user->id :rasta))}
             {:user_id (mt/user->id :crowberto)
              :user    (t2/select-one user-hydra-model (mt/user->id :crowberto))}]]
           ["ignore keys that don't need hydration"
            [:map
             (-> [:user_id :int] (#'events.schema/with-hydrate :user user-hydra-model))
             [:topic   [:= :user-joined]]]
            {:user_id (mt/user->id :rasta)
             :topic   :user-joined}
            {:user_id (mt/user->id :rasta)
             :user    (t2/select-one user-hydra-model (mt/user->id :rasta))}]
           ["respect the options"
            [:map
             (-> [:user_id {:optional true} :int] (#'events.schema/with-hydrate :user user-hydra-model))]
            {}
            {}]]]
    (testing context
      (= expected (#'events.notification/hydrate! schema value)))))

(deftest record-task-history-test
  (notification.tu/with-notification-testing-setup
    (mt/with-temp [:model/Channel chn-1 (assoc notification.tu/default-can-connect-channel :name (mt/random-name))
                   :model/Channel chn-2 (assoc notification.tu/default-can-connect-channel :name (mt/random-name))]
      (notification.tu/with-temporary-event-topics! #{:event/testing}
        (doseq [_ (range 2)]
          (models.notification/create-notification! {:payload_type :notification/testing}
                                                    [{:type :notification-subscription/system-event
                                                      :event_name :event/testing}]
                                                    [{:channel_type notification.tu/test-channel-type
                                                      :channel_id   (:id chn-1)
                                                      :template_id  nil
                                                      :recipients   [{:type :notification-recipient/user
                                                                      :user_id (mt/user->id :crowberto)}]}
                                                     {:channel_type notification.tu/test-channel-type
                                                      :channel_id   (:id chn-2)
                                                      :template_id  nil
                                                      :recipients   [{:type :notification-recipient/user
                                                                      :user_id (mt/user->id :rasta)}]}]))
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
