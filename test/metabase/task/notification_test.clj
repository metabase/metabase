(ns metabase.task.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.models.notification :as models.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.task :as task]
   [metabase.task.notification :as task.notification]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def every-second "* * * 1/1 * ? *")

(defn- latest-task-history-entry
  [task-name]
  (t2/select-one-fn #(dissoc % :id :started_at :ended_at :duration)
                    :model/TaskHistory
                    :task (name task-name)
                    {:order-by [[:started_at :desc]]}))

(deftest e2e-test
  (notification.tu/with-notification-testing-setup
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
