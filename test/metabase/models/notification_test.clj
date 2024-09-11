(ns metabase.models.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.notification :as models.notification]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;; ------------------------------------------------------------------------------------------------;;
;;                                      Life cycle test                                            ;;
;; ------------------------------------------------------------------------------------------------;;

(deftest notification-type-test
  (mt/with-model-cleanup [:model/Notification]
    (testing "success if :payload_type is supported"
      (let [noti-id (t2/insert-returning-pk! :model/Notification {:payload_type :notification/system-event
                                                                  :created_at   :%now
                                                                  :updated_at   :%now})]
        (is (some? (t2/select-one :model/Notification noti-id)))))

    (testing "failed if payload_type is invalid"
      (is (thrown-with-msg? Exception #"Invalid value :notification/not-existed\. Must be one of .*"
                            (t2/insert! :model/Notification {:payload_type :notification/not-existed}))))))

(deftest notification-subscription-type-test
  (mt/with-temp [:model/Notification {noti-id :id} {}]
    (testing "success path"
      (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/system-event
                                                                             :event_name      :event/card-create
                                                                             :notification_id noti-id})]
        (is (some? (t2/select-one :model/NotificationSubscription sub-id)))))

    (testing "failed if type is invalid"
      (is (thrown-with-msg? Exception #"Invalid value :notification-subscription/not-existed\. Must be one of .*"
                            (t2/insert! :model/NotificationSubscription {:type           :notification-subscription/not-existed
                                                                         :event_name     :event/card-create
                                                                         :notification_id noti-id}))))))

(deftest notification-subscription-event-name-test
  (mt/with-temp [:model/Notification {noti-id :id} {}]
    (testing "success path"
      (let [sub-id (t2/insert-returning-pk! :model/NotificationSubscription {:type            :notification-subscription/system-event
                                                                             :event_name      (first (descendants :metabase/event))
                                                                             :notification_id noti-id})]
        (is (some? (t2/select-one :model/NotificationSubscription sub-id)))))

    (testing "failed if type is invalid"
      (is (thrown-with-msg? Exception #"Event name must be a namespaced keyword under :event"
                            (t2/insert! :model/NotificationSubscription {:type           :notification-subscription/system-event
                                                                         :event_name     :user-join
                                                                         :notification_id noti-id}))))))

(def default-system-event-notification
  {:payload_type :notification/system-event
   :active       true})

(def default-user-invited-subscription
  {:type       :notification-subscription/system-event
   :event_name :event/user-invited})

(def default-card-created-subscription
  {:type       :notification-subscription/system-event
   :event_name :event/card-create})

(deftest create-notification!-test
  (mt/with-model-cleanup [:model/Notification]
    (testing "create a notification with 2 subscriptions"
      (let [noti (models.notification/create-notification!
                  default-system-event-notification
                  [default-user-invited-subscription
                   default-card-created-subscription])]
        (testing "return the created notification"
          (is (= (t2/select-one :model/Notification (:id noti))
                 noti)))

        (testing "there are 2 subscriptions"
          (is (= [default-card-created-subscription
                  default-user-invited-subscription]
                 (t2/select [:model/NotificationSubscription :type :event_name]
                            :notification_id (:id noti)
                            {:order-by [:event_name]}))))))))
