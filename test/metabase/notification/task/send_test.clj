(ns metabase.notification.task.send-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.driver :as driver]
   [metabase.notification.models :as models.notification]
   [metabase.notification.payload.execute :as notification.execute]
   [metabase.notification.send :as notification.send]
   [metabase.notification.task.send :as task.notification]
   [metabase.notification.task.send-trigger :as notification.task.send-trigger]
   [metabase.notification.test-util :as notification.tu]
   [metabase.task.core :as task]
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

(deftest send-notification-job-completes-run-test
  (testing "the job records the run of a scheduled alert as success after its `notification-trigger` row ends (GDGT-3331)"
    ;; with the testing setup the send runs on the job's thread, so it ends while the `notification-trigger` row is
    ;; still started, and only the job's own call can set the final status
    (mt/with-model-cleanup [:model/TaskRun :model/TaskHistory]
      (notification.tu/with-notification-testing-setup!
        (notification.tu/with-card-notification
          [notification {:subscriptions [{:type          :notification-subscription/cron
                                          :cron_schedule every-second}]
                         :handlers      [{:channel_type :channel/email
                                          :recipients   [{:type    :notification-recipient/user
                                                          :user_id (mt/user->id :crowberto)}]}]}]
          (with-redefs [channel/render-notification (fn [& _] [{:stub-message true}])
                        channel/send!               (constantly nil)]
            (#'task.notification/send-notification* (-> notification :subscriptions first :id)))
          (let [run (t2/select-one :model/TaskRun :notification_id (:id notification))]
            (is (= :success (:status run)))
            (is (some? (:ended_at run)))
            (is (= #{"notification-trigger" "notification-send"}
                   (t2/select-fn-set :task :model/TaskHistory :run_id (:id run) :task [:not= "channel-send"])))))))))

(deftest send-notification-job-async-run-status-test
  (testing "a worker thread sends a scheduled alert, and the run gets the status of all of its channels (GDGT-3331)"
    ;; no `mt/with-temp`: it keeps its rows in a transaction that the worker thread cannot see
    (mt/with-model-cleanup [:model/Card :model/TaskRun :model/TaskHistory]
      (notification.tu/with-notification-cleanup!
        (doseq [[slack-fails? expected] [[false :success] [true :failed]]]
          (testing (if slack-fails? "Slack fails" "both channels deliver")
            (let [card         (t2/insert-returning-instance! :model/Card {:name                   "Async alert card"
                                                                           :display                :table
                                                                           :dataset_query          (mt/native-query {:query "SELECT 1"})
                                                                           :visualization_settings {}
                                                                           :creator_id             (mt/user->id :crowberto)})
                  notification (models.notification/create-notification!
                                {:payload_type :notification/card
                                 :payload      {:card_id (:id card)}
                                 :creator_id   (mt/user->id :crowberto)}
                                ;; a schedule that never fires, so the scheduler does not start a second run
                                [{:type          :notification-subscription/cron
                                  :cron_schedule "0 0 0 1 1 ? 2099"}]
                                [{:channel_type :channel/email
                                  :recipients   [{:type    :notification-recipient/user
                                                  :user_id (mt/user->id :crowberto)}]}
                                 {:channel_type :channel/slack
                                  :recipients   [{:type    :notification-recipient/raw-value
                                                  :details {:value "#general"}}]}])
                  release      (promise)]
              ;; `with-redefs`, not `mt/with-dynamic-fn-redefs`: the worker thread does not get the test's bindings
              (with-redefs [;; no card query: the query processor saves its `query` row later, on another thread, and
                            ;; other tests insert the same query
                            notification.execute/execute-card    (fn [_creator-id card-id]
                                                                   {:type   :card
                                                                    :card   (t2/select-one :model/Card card-id)
                                                                    :result {:status :completed :row_count 1 :data {:rows [[1]]}}})
                            channel/render-notification          (fn [& _]
                                                                   ;; the worker waits until the test checked the run
                                                                   (deref release 5000 nil)
                                                                   [{:stub-message true}])
                            channel/send!                        (fn [channel _]
                                                                   (when (and slack-fails? (= :channel/slack (:type channel)))
                                                                     (throw (ex-info "Slack is down" {}))))
                            notification.send/should-skip-retry? (constantly true)]
                (#'task.notification/send-notification* (t2/select-one-pk :model/NotificationSubscription
                                                                          :notification_id (:id notification)))
                (let [run-id     (t2/select-one-pk :model/TaskRun :notification_id (:id notification))
                      run-status #(t2/select-one-fn :status :model/TaskRun run-id)]
                  (is (= :started (run-status))
                      "the job has ended, and the run stays started while the worker sends")
                  (deliver release true)
                  (is (= expected (u/poll {:thunk       run-status
                                           :done?       #{:success :failed}
                                           :timeout-ms  5000
                                           :interval-ms 50})))
                  (is (= 2 (t2/count :model/TaskHistory :run_id run-id :task "channel-send"))))))))))))

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
          (notification.task.send-trigger/init-send-notification-triggers!)
          (is (= notification-triggers (notification.tu/send-notification-triggers subscription-id))))
        (testing "Re-create triggers if it's not existed"
          (task/delete-trigger! (TriggerKey. (-> notification-triggers first :key)))
          (testing "sanity check that the trigger is deleted"
            (is (empty? (notification.tu/send-notification-triggers subscription-id))))
          (notification.task.send-trigger/init-send-notification-triggers!)
          (is (= notification-triggers (notification.tu/send-notification-triggers subscription-id))))
        (testing "deletes triggers for subscriptions that no longer exist"
          (let [subscription-id (first (t2/select-pks-vec :model/NotificationSubscription
                                                          :notification_id (:id notification)))]
            (t2/delete! :notification_subscription subscription-id)
            (testing "sanity check that it has trigger before"
              (is (not-empty (notification.tu/send-notification-triggers subscription-id))))
            (notification.task.send-trigger/init-send-notification-triggers!)
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
          (notification.task.send-trigger/init-send-notification-triggers!)
          (is (empty? (notification.tu/send-notification-triggers subscription-id))))
        (testing "recreates triggers when notification is reactivated"
          ;; Reactivate the notification
          (t2/update! :model/Notification (:id notification) {:active true})
          (notification.task.send-trigger/init-send-notification-triggers!)
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
              (notification.task.send-trigger/update-send-notification-triggers-timezone!)
              ;; Verify the timezone was updated
              (let [updated-triggers (notification.tu/send-notification-triggers subscription-id)]
                (is (not-empty updated-triggers))
                (is (= new-timezone (:timezone (first updated-triggers))))))))))))
