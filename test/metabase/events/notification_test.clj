(ns metabase.events.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.events.notification :as events.notification]
   [metabase.models.notification :as models.notification]
   [metabase.notification.core :as notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]))

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
            (is (= [[(:id n-1) {::hi true}]
                    [(:id n-2) {::hi true}]]
                   (->> @sent-notis
                        (map (juxt :id :event-info))
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
          (is (= {:event-info {:foo :bar}
                  :settings   {:application-name "Metabase Test"
                               :site-name        "Metabase Test"}}
                 (#'events.notification/enriched-event-info event-info))))))))
