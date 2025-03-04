(ns metabase.task.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.models.notification :as models.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.notification.send :as notification.send]
   [metabase.task :as task]
   [metabase.task.notification :as task.notification]
   [metabase.test :as mt]
   [metabase.util :as u]
   [java-time.api :as t]
   [toucan2.core :as t2])
  (:import
   (org.quartz CronExpression)
   (java.util Date)))

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
  (mt/with-temp [:model/Notification]
    (mt/with-temp-scheduler!
      (task/init! ::task.notification/SendNotifications)
      (let [notification (models.notification/create-notification!
                          {:payload_type :notification/testing}
                          [{:type :notification-subscription/cron
                            :cron_schedule every-second}]
                          [])
            notification-triggers (notification.tu/notification-triggers (:id notification))]
        (testing "sanity check that it has triggers to begin with"
          (is (not-empty notification-triggers)))
        (testing "init send notification triggers are idempotent if the subscription doesn't change"
          (task.notification/init-send-notification-triggers!)
          (is (= notification-triggers (notification.tu/notification-triggers (:id notification)))))))))

(deftest cron->next-execution-times-test
  (testing "cron->next-execution-times returns the expected number of execution times"
    (let [cron-schedule "0 0 12 * * ? *" ; noon every day
          n 5
          times (#'notification.send/cron->next-execution-times cron-schedule n)]
      (is (= n (count times)))
      (is (every? #(instance? Date %) times))))
  
  (testing "execution times are sequential"
    (let [cron-schedule "0 0 12 * * ? *" ; noon every day
          times (#'notification.send/cron->next-execution-times cron-schedule 5)]
      (is (= times (sort times))))))

(deftest avg-interval-seconds-test
  (testing "avg-interval-seconds calculates correct average"
    (let [hourly-cron "0 0 * * * ? *"
          daily-cron "0 0 12 * * ? *"
          minutely-cron "0 * * * * ? *"]
      
      (testing "hourly schedule"
        (is (= 3600.0 (#'notification.send/avg-interval-seconds hourly-cron 2)))
        (is (mt/approx= 3600.0 (#'notification.send/avg-interval-seconds hourly-cron 5) 0.1)))
      
      (testing "daily schedule"
        (is (= 86400.0 (#'notification.send/avg-interval-seconds daily-cron 2)))
        (is (mt/approx= 86400.0 (#'notification.send/avg-interval-seconds daily-cron 5) 0.1)))
      
      (testing "minutely schedule"
        (is (= 60.0 (#'notification.send/avg-interval-seconds minutely-cron 2)))
        (is (mt/approx= 60.0 (#'notification.send/avg-interval-seconds minutely-cron 5) 0.1)))))
  
  (testing "throws assertion error when n < 2"
    (is (thrown? AssertionError (#'notification.send/avg-interval-seconds "0 0 12 * * ? *" 1)))))

(deftest subscription->deadline-test
  (testing "subscription->deadline returns appropriate deadlines based on frequency"
    (let [now (t/local-date-time)
          test-subscription (fn [cron-schedule]
                              {:type :notification-subscription/cron
                               :cron_schedule cron-schedule})]
      
      (testing "very frequent notifications (< 1 minute) get shortest deadline"
        (let [deadline (#'notification.send/subscription->deadline (test-subscription "* * * * * ? *"))]
          (is (t/before? now deadline))
          (is (t/before? deadline (t/plus now (t/seconds 10))))))
      
      (testing "frequent notifications (< 5 minutes) get short deadline"
        (let [deadline (#'notification.send/subscription->deadline (test-subscription "0 */2 * * * ? *"))]
          (is (t/before? now deadline))
          (is (t/before? deadline (t/plus now (t/seconds 15))))))
      
      (testing "medium frequency notifications (< 30 minutes) get medium deadline"
        (let [deadline (#'notification.send/subscription->deadline (test-subscription "0 */15 * * * ? *"))]
          (is (t/before? now deadline))
          (is (t/before? deadline (t/plus now (t/seconds 20))))))
      
      (testing "less frequent notifications (< 1 hour) get longer deadline"
        (let [deadline (#'notification.send/subscription->deadline (test-subscription "0 30 * * * ? *"))]
          (is (t/before? now deadline))
          (is (t/before? deadline (t/plus now (t/seconds 35))))))
      
      (testing "infrequent notifications (>= 1 hour) get longest deadline"
        (let [deadline (#'notification.send/subscription->deadline (test-subscription "0 0 */2 * * ? *"))]
          (is (t/before? now deadline))
          (is (t/before? deadline (t/plus now (t/seconds 65))))))))
  
  (testing "non-cron subscription types get default deadline"
    (let [now (t/local-date-time)
          deadline (#'notification.send/subscription->deadline {:type :some-other-type})]
      (is (t/before? now deadline))
      (is (t/before? deadline (t/plus now (t/seconds 35)))))))
