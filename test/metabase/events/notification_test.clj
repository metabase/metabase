(ns metabase.events.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.events.notification :as events.notification]
   [metabase.models.notification :as models.notification]
   [metabase.notification.core :as notification]
   [metabase.test :as mt]))

(def supported-topics @#'events.notification/supported-topics)

(defmacro with-temporary-event-topics
  "Temporarily make `topics` valid event topics."
  [topics & body]
  `(let [topics# ~topics]
     (try
       (doseq [topic# topics#]
         (derive topic# :metabase/event))
       ~@body
       (finally
         (doseq [topic# topics#]
           (underive topic# :metabase/event))))))

(deftest supported-events-with-notification-will-be-sent-test
  (mt/with-model-cleanup [:model/Notification]
    (with-temporary-event-topics #{:event/test-notification}
      (let [topic      :event/test-notification
            noti-1     (models.notification/create-notification!
                        {:payload_type :notification/system-event
                         :active       true}
                        [{:type       :notification-subscription/system-event
                          :event_name topic}]
                        nil)
            noti-2     (models.notification/create-notification!
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
            sent-notis (atom #{})]
        (testing "publishing event will send all the actively subscribed notifciations"
          (with-redefs [notification/send-notification!      (fn [notification] (swap! sent-notis conj notification))
                        events.notification/supported-topics #{:event/test-notification}]
            (events/publish-event! topic {::hi true})
            (is (= #{[(:id noti-1) {::hi true}]
                     [(:id noti-2) {::hi true}]}
                   (set (map (juxt :id :event-info) @sent-notis))))))))))

(deftest unsupported-events-will-not-send-notification-test
  (mt/with-model-cleanup [:model/Notification]
    (with-temporary-event-topics #{:event/unsupported-topic}
      (let [topic      :event/unsupported-topic
            sent-notis (atom #{})]
        (models.notification/create-notification!
         {:payload_type :notification/system-event
          :active       true}
         [{:type       :notification-subscription/system-event
           :event_name topic}]
         nil)
        (testing "publish an event that is not supported for notifications will not send any notifications"
          (with-redefs [notification/send-notification!      (fn [notification] (swap! sent-notis conj notification))
                        events.notification/supported-topics #{}]
            (events/publish-event! :event/unsupported-topic {::hi true})
            (is (empty? @sent-notis))))))))
