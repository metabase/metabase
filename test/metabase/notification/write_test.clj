(ns metabase.notification.write-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.models :as models.notification]
   [metabase.notification.task.send :as task.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.notification.write :as notification.write]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- do-with-notification!
  "Call `f` with a testing Notification that has a cron subscription and a handler with a raw-value recipient."
  [f]
  (mt/with-temp-scheduler!
    (task/init! ::task.notification/SendNotifications)
    (let [notification (models.notification/create-notification!
                        {:payload_type :notification/testing
                         :creator_id   (mt/user->id :rasta)}
                        [{:type :notification-subscription/cron :cron_schedule "0 0 * * * ? *"}]
                        [(assoc @notification.tu/default-email-handler
                                :recipients [{:type    :notification-recipient/raw-value
                                              :details {:value "user@example.com"}}])])
          id           (:id notification)
          handler-id   (t2/select-one-pk :model/NotificationHandler :notification_id id)]
      (try
        (f {:notification-id id
            :subscription-id (t2/select-one-pk :model/NotificationSubscription :notification_id id)
            :handler-id      handler-id
            :recipient-id    (t2/select-one-pk :model/NotificationRecipient :notification_handler_id handler-id)})
        (finally
          (notification.write/delete-notifications! [id] {}))))))

(deftest update-notification-publishes-update-event-test
  (do-with-notification!
   (fn [{:keys [notification-id]}]
     (let [events (notification.tu/published-events!
                   #{:model/Notification}
                   #(mt/with-test-user :crowberto
                      (notification.write/update-notification! notification-id {:active false} {})))]
       (testing "one update event with the row before and after the update"
         (is (=? [{:operation       :update
                   :id              notification-id
                   :user-id         (mt/user->id :crowberto)
                   :previous-object {:active true}
                   :object          {:active false}}]
                 events)))))))

(deftest update-notification-subscription-publishes-update-event-test
  (do-with-notification!
   (fn [{:keys [subscription-id]}]
     (let [events (notification.tu/published-events!
                   #{:model/NotificationSubscription}
                   #(mt/with-test-user :crowberto
                      (notification.write/update-notification-subscription!
                       subscription-id {:cron_schedule "0 1 * * * ? *"} {})))]
       (testing "one update event with the row before and after the update"
         (is (=? [{:operation       :update
                   :id              subscription-id
                   :user-id         (mt/user->id :crowberto)
                   :previous-object {:cron_schedule "0 0 * * * ? *"}
                   :object          {:cron_schedule "0 1 * * * ? *"}}]
                 events)))))))

(deftest update-notification-handler-publishes-update-event-test
  (do-with-notification!
   (fn [{:keys [handler-id]}]
     (let [events (notification.tu/published-events!
                   #{:model/NotificationHandler}
                   #(mt/with-test-user :crowberto
                      (notification.write/update-notification-handler! handler-id {:active false} {})))]
       (testing "one update event with the row before and after the update"
         (is (=? [{:operation       :update
                   :id              handler-id
                   :user-id         (mt/user->id :crowberto)
                   :previous-object {:active true}
                   :object          {:active false}}]
                 events)))))))

(deftest update-notification-recipient-publishes-update-event-test
  (do-with-notification!
   (fn [{:keys [recipient-id]}]
     (let [events (notification.tu/published-events!
                   #{:model/NotificationRecipient}
                   #(mt/with-test-user :crowberto
                      (notification.write/update-notification-recipient!
                       recipient-id {:details {:value "other@example.com"}} {})))]
       (testing "one update event with the row before and after the update"
         (is (=? [{:operation       :update
                   :id              recipient-id
                   :user-id         (mt/user->id :crowberto)
                   :previous-object {:details {:value "user@example.com"}}
                   :object          {:details {:value "other@example.com"}}}]
                 events)))))))

(deftest update-notification-card-publishes-update-event-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (let [notification (models.notification/create-notification!
                        {:payload_type :notification/card
                         :creator_id   (mt/user->id :rasta)
                         :payload      {:card_id        card-id
                                        :send_condition :has_result
                                        :send_once      false}}
                        [] [])
          payload-id   (:payload_id notification)]
      (try
        (let [events (notification.tu/published-events!
                      #{:model/NotificationCard}
                      #(mt/with-test-user :crowberto
                         (notification.write/update-notification-card! payload-id {:send_once true} {})))]
          (testing "one update event with the row before and after the update"
            (is (=? [{:operation       :update
                      :id              payload-id
                      :user-id         (mt/user->id :crowberto)
                      :previous-object {:send_once false}
                      :object          {:send_once true}}]
                    events))))
        (finally
          (notification.write/delete-notifications! [(:id notification)] {}))))))

(deftest delete-notification-deletes-card-payload-and-publishes-delete-events-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (let [notification (models.notification/create-notification!
                        {:payload_type :notification/card
                         :creator_id   (mt/user->id :rasta)
                         :payload      {:card_id        card-id
                                        :send_condition :has_result
                                        :send_once      false}}
                        [] [])
          payload-id   (:payload_id notification)
          events       (notification.tu/published-events!
                        #{:model/Notification :model/NotificationCard}
                        #(notification.write/delete-notifications! [(:id notification)] {}))]
      (is (= #{[:model/Notification :delete] [:model/NotificationCard :delete]}
             (into #{} (map (juxt :model :operation)) events)))
      (is (not (t2/exists? :model/NotificationCard :id payload-id)))
      (is (not (t2/exists? :model/Notification :id (:id notification)))))))

(deftest update-notification-query-count-test
  (do-with-notification!
   (fn [{:keys [notification-id]}]
     (mt/with-test-user :crowberto
       (binding [search.ingestion/*disable-updates* true]
         (notification.write/update-notification! notification-id {:active false} {})
         (t2/with-call-count [call-count]
           (notification.write/update-notification! notification-id {:active true} {})
           (is (<= (call-count) 3))))))))

(deftest update-notification-subscription-query-count-test
  (do-with-notification!
   (fn [{:keys [subscription-id]}]
     (mt/with-test-user :crowberto
       (binding [search.ingestion/*disable-updates* true]
         (notification.write/update-notification-subscription! subscription-id {:cron_schedule "0 1 * * * ? *"} {})
         (t2/with-call-count [call-count]
           (notification.write/update-notification-subscription! subscription-id {:cron_schedule "0 2 * * * ? *"} {})
           (is (<= (call-count) 2))))))))

(deftest update-notification-handler-query-count-test
  (do-with-notification!
   (fn [{:keys [handler-id]}]
     (mt/with-test-user :crowberto
       (binding [search.ingestion/*disable-updates* true]
         (notification.write/update-notification-handler! handler-id {:active false} {})
         (t2/with-call-count [call-count]
           (notification.write/update-notification-handler! handler-id {:active true} {})
           (is (<= (call-count) 2))))))))

(deftest update-notification-recipient-query-count-test
  (do-with-notification!
   (fn [{:keys [recipient-id]}]
     (mt/with-test-user :crowberto
       (binding [search.ingestion/*disable-updates* true]
         (notification.write/update-notification-recipient! recipient-id {:details {:value "a@example.com"}} {})
         (t2/with-call-count [call-count]
           (notification.write/update-notification-recipient! recipient-id {:details {:value "b@example.com"}} {})
           (is (<= (call-count) 2))))))))
