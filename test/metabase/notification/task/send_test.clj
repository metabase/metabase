(ns metabase.notification.task.send-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.driver :as driver]
   [metabase.notification.models :as models.notification]
   [metabase.notification.task.send :as task.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.task :as task]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (org.quartz TriggerKey)))

(set! *warn-on-reflection* true)

(def every-second "* * * 1/1 * ? *")

(defn- latest-task-history-entry
  [task-name]
  (t2/select-one-fn #(dissoc % :id :started_at :ended_at :duration)
                    :model/TaskHistory
                    :task (name task-name)
                    {:order-by [[:started_at :desc]]}))

(deftest e2e-test
  (notification.tu/with-notification-testing-setup!
    (mt/with-temp-scheduler!
      (task/init! ::task.notification/SendNotifications)
      (mt/test-helpers-set-global-values!
        (mt/with-temp [:model/Channel {chn-id :id} {:type :channel/metabase-test}]
          (notification.tu/with-captured-channel-send!
            (let [captured-messages (atom [])]
              (with-redefs [channel/send! (fn [& args]
                                            (swap! captured-messages conj args))]
                (let [noti (models.notification/create-notification!
                            {:payload_type :notification/testing}
                            [{:type :notification-subscription/cron
                              :cron_schedule every-second}]
                            [{:channel_id chn-id
                              :channel_type notification.tu/test-channel-type}])]
                  (is (not-empty (u/poll {:thunk       (fn [] @captured-messages)
                                          :done?       seq
                                          :timeout-ms  2000
                                          :interval-ms 100})))
                  (is (=? {:task         "notification-trigger"
                           :task_details {:trigger_type                 "notification-subscription/cron"
                                          :notification_subscription_id (mt/malli=? pos-int?)
                                          :cron_schedule                every-second
                                          :notification_ids             [(:id noti)]}}
                          (u/poll {:thunk #(latest-task-history-entry "notification-trigger")
                                   :done? (fn [task] (= [(:id noti)] (get-in task [:task_details :notification_ids])))}))))))))))))

(deftest init-send-notification-triggers-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp-scheduler!
      (task/init! ::task.notification/SendNotifications)
      (let [notification          (models.notification/create-notification!
                                   {:payload_type :notification/testing}
                                   [{:type :notification-subscription/cron
                                     :cron_schedule "0 0 * 1/1 * ? *"}]
                                   [])
            subscription-id       (-> notification models.notification/hydrate-notification :subscriptions first :id)
            notification-triggers (notification.tu/send-notification-triggers subscription-id)]
        (testing "sanity check that it has triggers to begin with"
          (is (not-empty notification-triggers)))
        (testing "init send notification triggers are idempotent if the subscription doesn't change"
          (task.notification/init-send-notification-triggers!)
          (is (= notification-triggers (notification.tu/send-notification-triggers subscription-id))))

        (testing "Re-create triggers if it's not existed"
          (task/delete-trigger! (TriggerKey. (-> notification-triggers first :key)))
          (testing "sanity check that the trigger is deleted"
            (is (empty? (notification.tu/send-notification-triggers subscription-id))))
          (task.notification/init-send-notification-triggers!)
          (is (= notification-triggers (notification.tu/send-notification-triggers subscription-id))))

        (testing "deletes triggers for subscriptions that no longer exist"
          (let [subscription-id (first (t2/select-pks-vec :model/NotificationSubscription
                                                          :notification_id (:id notification)))]
            (t2/delete! :notification_subscription subscription-id)
            (testing "sanity check that it has trigger before"
              (is (not-empty (notification.tu/send-notification-triggers subscription-id))))
            (task.notification/init-send-notification-triggers!)
            (is (empty? (notification.tu/send-notification-triggers subscription-id)))))))))

(deftest init-send-notification-triggers-inactive-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temp-scheduler!
      (task/init! ::task.notification/SendNotifications)
      (let [notification          (models.notification/create-notification!
                                   {:payload_type :notification/testing
                                    :active       true}
                                   [{:type :notification-subscription/cron
                                     :cron_schedule "0 0 * 1/1 * ? *"}]
                                   [])
            subscription-id       (-> notification models.notification/hydrate-notification :subscriptions first :id)
            notification-triggers (notification.tu/send-notification-triggers subscription-id)]
        (testing "sanity check that it has triggers to begin with"
          (is (not-empty notification-triggers)))

        (testing "skips triggers for inactive notifications"
          ;; Deactivate the notification
          (t2/update! :model/Notification (:id notification) {:active false})
          (task.notification/init-send-notification-triggers!)
          (is (empty? (notification.tu/send-notification-triggers subscription-id))))

        (testing "recreates triggers when notification is reactivated"
          ;; Reactivate the notification
          (t2/update! :model/Notification (:id notification) {:active true})
          (task.notification/init-send-notification-triggers!)
          (is (= notification-triggers (notification.tu/send-notification-triggers subscription-id))))))))

(deftest update-send-notification-triggers-timezone-test
  (mt/with-model-cleanup [:model/Notification]
    (mt/with-temporary-setting-values [driver/report-timezone "UTC"]
      (mt/with-temp-scheduler!
        (task/init! ::task.notification/SendNotifications)
        (let [notification    (models.notification/create-notification!
                               {:payload_type :notification/testing}
                               [{:type :notification-subscription/cron
                                 :cron_schedule "0 0 * 1/1 * ? *"}]
                               [])
              subscription-id (-> notification models.notification/hydrate-notification :subscriptions first :id)]

          (testing "sanity check that trigger exists with initial timezone"
            (let [triggers (notification.tu/send-notification-triggers subscription-id)]
              (is (not-empty triggers))
              (is (= "UTC" (:timezone (first triggers))))))

          (testing "updates timezone of triggers when report timezone changes"
            (let [new-timezone "America/Los_Angeles"]
              ;; Change the report timezone
              (driver/report-timezone! new-timezone)

              ;; Call the function under test
              (task.notification/update-send-notification-triggers-timezone!)

              ;; Verify the timezone was updated
              (let [updated-triggers (notification.tu/send-notification-triggers subscription-id)]
                (is (not-empty updated-triggers))
                (is (= new-timezone (:timezone (first updated-triggers))))))))))))
