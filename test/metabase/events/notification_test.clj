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
          (mt/with-dynamic-redefs
            [notification/send-notification!      (fn [notification] (swap! sent-notis conj notification))
             events.notification/supported-topics #{:event/test-notification}]
            (events/publish-event! topic {::hi true})
            (is (=? [[(:id n-1) {:event-info {::hi true}}]
                     [(:id n-2) {:event-info {::hi true}}]]
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
          (mt/with-dynamic-redefs
            [notification/send-notification!      (fn [notification] (swap! sent-notis conj notification))
             events.notification/supported-topics #{}]
            (events/publish-event! :event/unsupported-topic {::hi true})
            (is (empty? @sent-notis))))))))

(deftest enriched-event-info-settings-test
  (let [event-info {:foo :bar}]
    (testing "you shouldn't delete or rename these fields without 100% sure that it's not referenced
             in any channel_template.details or notification_recipient.details"
      (mt/with-additional-premium-features #{:whitelabel}
        (mt/with-temporary-setting-values
          [application-name "Metabase Test"
           site-name        "Metabase Test"]
          (is (= {:event-info  {:foo :bar}
                  :event-topic :event/user-joined
                  :context     {:application-name "Metabase Test"
                                :site-name        "Metabase Test"}}
                 (#'events.notification/enriched-event-info :event/user-joined event-info))))))))

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
