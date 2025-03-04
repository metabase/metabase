(ns metabase.notification.send-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.channel.core :as channel]
   [metabase.models.notification :as models.notification]
   [metabase.notification.core :as notification]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.send :as notification.send]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CountDownLatch PriorityBlockingQueue CountDownLatch)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :web-server))

(deftest send-notification!*-test
  (testing "sending a notification will call render on all of its handlers"
    (notification.tu/with-notification-testing-setup!
      (mt/with-temp [:model/Channel         chn-1 notification.tu/default-can-connect-channel
                     :model/Channel         chn-2 (assoc notification.tu/default-can-connect-channel :name "Channel 2")
                     :model/ChannelTemplate tmpl  {:channel_type notification.tu/test-channel-type}]
        (let [n                 (models.notification/create-notification!
                                 {:payload_type :notification/system-event}
                                 nil
                                 [{:channel_type notification.tu/test-channel-type
                                   :channel_id   (:id chn-1)
                                   :template_id  (:id tmpl)
                                   :recipients   [{:type    :notification-recipient/user
                                                   :user_id (mt/user->id :crowberto)}]}
                                  {:channel_type notification.tu/test-channel-type
                                   :channel_id   (:id chn-2)
                                   :recipients   [{:type    :notification-recipient/user
                                                   :user_id (mt/user->id :rasta)}]}])
              notification-info (assoc n :payload {:event_info  {:test true}
                                                   :event_topic :event/test})
              expected-notification-payload (mt/malli=?
                                             [:map
                                              [:payload_type [:= :notification/system-event]]
                                              [:context :map]
                                              [:payload :map]])
              renders           (atom [])]
          (mt/with-dynamic-fn-redefs [channel/render-notification (fn [channel-type notification-payload template recipients]
                                                                    (swap! renders conj {:channel-type channel-type
                                                                                         :notification-payload notification-payload
                                                                                         :template template
                                                                                         :recipients recipients})
                                                                 ;; rendered messages are recipients
                                                                    recipients)]
            (testing "channel/send! are called on rendered messages"
              (is (=? {:channel/metabase-test [{:type :notification-recipient/user :user_id (mt/user->id :crowberto)}
                                               {:type :notification-recipient/user :user_id (mt/user->id :rasta)}]}
                      (notification.tu/with-captured-channel-send!
                        (notification.send/send-notification-sync! notification-info)))))

            (testing "render-notification is called on all handlers with the correct channel and template"
              (is (=? [{:channel-type (keyword notification.tu/test-channel-type)
                        :notification-payload expected-notification-payload
                        :template     tmpl
                        :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :crowberto)}]}
                       {:channel-type (keyword notification.tu/test-channel-type)
                        :notification-payload expected-notification-payload
                        :template     nil
                        :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :rasta)}]}]
                      @renders)))))))))

(deftest send-notification-record-task-history-test
  (mt/with-temp [:model/Channel chn notification.tu/default-can-connect-channel]
    (notification.tu/with-notification-testing-setup!
      (let [n (models.notification/create-notification!
               {:payload_type :notification/testing}
               nil
               [{:channel_type notification.tu/test-channel-type
                 :channel_id   (:id chn)
                 :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :crowberto)}]}])]
        (t2/delete! :model/TaskHistory)
        (notification.send/send-notification-sync! n)
        (is (=? [{:task         "notification-send"
                  :task_details {:notification_id (:id n)
                                 :notification_handlers [{:id           (mt/malli=? :int)
                                                          :channel_type "channel/metabase-test"
                                                          :channel_id   (:id chn)
                                                          :template_id  nil}]}}
                 {:task          "channel-send"
                  :task_details {:retry_config    (mt/malli=? :map)
                                 :channel_id      (:id chn)
                                 :channel_type    "channel/metabase-test"
                                 :template_id     nil
                                 :notification_id (:id n)
                                 :recipient_ids   (mt/malli=? [:sequential :int])}}]
                (t2/select [:model/TaskHistory :task :task_details] :task [:in ["channel-send" "notification-send"]]
                           {:order-by [[:started_at :asc]]})))))))

(deftest notification-send-retrying-test
  (notification.tu/with-notification-testing-setup!
    (mt/with-temp [:model/Channel chn notification.tu/default-can-connect-channel]
      (let [n (models.notification/create-notification!
               {:payload_type :notification/testing}
               nil
               [{:channel_type notification.tu/test-channel-type
                 :channel_id   (:id chn)
                 :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :crowberto)}]}])]
        (testing "send-notification! retries on failure"
          (t2/delete! :model/TaskHistory :task "channel-send")
          (testing "and record exception in task history"
            (let [retry-count (atom 0)
                  send-args   (atom nil)
                  send!       (fn [& args]
                                (swap! retry-count inc)
                                ;; failed once then work on the next try
                                (if (= @retry-count 1)
                                  (throw (Exception. "test-exception"))
                                  (reset! send-args args)))]
              (mt/with-dynamic-fn-redefs [channel/send! send!]
                (notification.send/send-notification-sync! n))
              (is (some? @send-args))
              (is (=? {:task "channel-send"
                       :task_details {:attempted_retries 1
                                      :retry_config      (mt/malli=? :map)
                                      :retry_errors      (mt/malli=? [:sequential [:map {:closed true}
                                                                                   [:timestamp :string]
                                                                                   [:message :string]]])}}
                      (t2/select-one :model/TaskHistory :task "channel-send"))))))))))

(deftest send-notification-record-prometheus-metrics-test
  (mt/with-prometheus-system! [_ system]
    (notification.tu/with-notification-testing-setup!
      (mt/with-temp [:model/Channel ch notification.tu/default-can-connect-channel]
        (let [n (models.notification/create-notification!
                 {:payload_type :notification/testing}
                 nil
                 [{:channel_type notification.tu/test-channel-type
                   :channel_id   (:id ch)
                   :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :crowberto)}]}])
              original-render @#'channel/render-notification]
          (with-redefs [channel/render-notification (fn [& args]
                                                      (testing "during execution of render-notification, concurrent-tasks metric is updated"
                                                        (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-notification/concurrent-tasks {:payload-type "notification/testing"}))))
                                                      (apply original-render args))]
            (notification.tu/with-captured-channel-send!
              (notification/send-notification! n {:notification/sync? true})))
          (testing "once the execution is done, concurrent tasks is decreased"
            (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-notification/concurrent-tasks {:payload-type "notification/testing"}))))
          (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-notification/send-ok {:payload-type "notification/testing"})))
          (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-notification/channel-send-ok {:payload-type "notification/testing"
                                                                                                         :channel-type "channel/metabase-test"})))
          (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-notification/channel-send-ok {:payload-type "notification/testing"
                                                                                                         :channel-type "channel/metabase-test"})))
          (is (prometheus-test/approx= 1 (:count (mt/metric-value system :metabase-notification/send-duration-ms {:payload-type "notification/testing"}))))
          (is (prometheus-test/approx= 1 (:count (mt/metric-value system :metabase-notification/wait-duration-ms {:payload-type "notification/testing"}))))
          (is (prometheus-test/approx= 1 (:count (mt/metric-value system :metabase-notification/total-duration-ms {:payload-type "notification/testing"})))))))))

(deftest send-notification-record-prometheus-error-metrics-test
  (mt/with-prometheus-system! [_ system]
    (notification.tu/with-notification-testing-setup!
      (mt/with-temp [:model/Channel chn notification.tu/default-can-connect-channel]
        (let [n (models.notification/create-notification!
                 {:payload_type :notification/testing}
                 nil
                 [{:channel_type notification.tu/test-channel-type
                   :channel_id   (:id chn)
                   :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :crowberto)}]}])]
          (mt/with-dynamic-fn-redefs [notification.payload/notification-payload (fn [& _]
                                                                                  (throw (Exception. "test-exception")))]
            (is (thrown? Exception (notification.send/send-notification-sync! n)))
            (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-notification/send-error
                                                            {:payload-type "notification/testing"})))))))))

(deftest send-notification-record-prometheus-channel-error-metrics-test
  (mt/with-temporary-setting-values [site-url "https://metabase.com/testmb"]
    (mt/with-prometheus-system! [_ system]
      (notification.tu/with-notification-testing-setup!
        (mt/with-temp [:model/Channel chn notification.tu/default-can-connect-channel]
          (let [n (models.notification/create-notification!
                   {:payload_type :notification/testing}
                   nil
                   [{:channel_type notification.tu/test-channel-type
                     :channel_id   (:id chn)
                     :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :crowberto)}]}])]
            (with-redefs [notification.send/default-retry-config (assoc @#'notification.send/default-retry-config :max-attempts 1)
                          channel/send! (fn [& _]
                                          (throw (Exception. "test-channel-exception")))]
              (notification.send/send-notification-sync! n)
              (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-notification/channel-send-error
                                                              {:payload-type "notification/testing"
                                                               :channel-type "channel/metabase-test"}))))))))))

(deftest cron->next-execution-times-test
  (t/with-clock (t/mock-clock (t/instant "2023-01-01T10:00:00Z"))
    (let [cron-schedule "0 0 12 * * ? *"] ; noon every day
      (is (= [(t/instant "2023-01-01T12:00:00Z")
              (t/instant "2023-01-02T12:00:00Z")
              (t/instant "2023-01-03T12:00:00Z")]
             (#'notification.send/cron->next-execution-times cron-schedule 3))))))

(deftest avg-interval-seconds-test
  (testing "avg-interval-seconds calculates correct average"
    (let [hourly-cron "0 0 * * * ? *"
          daily-cron "0 0 12 * * ? *"
          minutely-cron "0 * * * * ? *"]

      (testing "hourly schedule"
        (is (= 3600 (#'notification.send/avg-interval-seconds hourly-cron 5))))

      (testing "daily schedule"
        (is (= 86400 (#'notification.send/avg-interval-seconds daily-cron 5))))

      (testing "minutely schedule"
        (is (= 60 (#'notification.send/avg-interval-seconds minutely-cron 5))))))

  (testing "throws assertion error when n < 2"
    (is (thrown? AssertionError (#'notification.send/avg-interval-seconds "0 0 12 * * ? *" 1)))))

(deftest subscription->deadline-test
  (t/with-clock (t/mock-clock (t/instant))
    (let [now (t/local-date-time)]
      (testing "subscription->deadline returns appropriate deadlines based on frequency"
        (let [deadline (#'notification.send/subscription->deadline
                        {:type :notification-subscription/cron
                         :cron_schedule "* * * * * ? *"})]
          (is (t/before? now deadline))
          (is (t/before? deadline (t/plus now (t/seconds 10))))))

      (testing "non-cron subscription types get default deadline"
        (let [deadline (#'notification.send/subscription->deadline {:type :some-other-type})]
          (is (t/before? now deadline))
          (is (t/before? deadline (t/plus now (t/seconds 35)))))))))

(deftest deadline-comparator-test
  (testing "deadline-comparator sorts notifications by deadline"
    (let [now        (t/instant)
          later      (t/plus now (t/minutes 5))
          even-later (t/plus now (t/minutes 10))
          items      [{:id "3" :deadline even-later}
                      {:id "1" :deadline now}
                      {:id "2" :deadline later}]
          queue (PriorityBlockingQueue. 10 @#'notification.send/deadline-comparator)]

      ;; Add items to queue in random order
      (doseq [item items]
        (.put queue item))

      ;; Items should come out in deadline order
      (is (= "1" (:id (.take queue))))
      (is (= "2" (:id (.take queue))))
      (is (= "3" (:id (.take queue)))))))

(deftest notification-dispatcher-test
  (testing "notification dispatcher"
    (let [sent-notifications  (atom [])
          wait-for-processing #(u/poll {:thunk       (fn [] (count @sent-notifications))
                                        :done?       (fn [cnt] (= cnt %))
                                        :interval-ms 10
                                        :timeout-ms  1000})]
      (with-redefs [notification.send/send-notification-sync! (fn [notification]
                                                                ;; fake latency
                                                                (Thread/sleep 20)
                                                                (swap! sent-notifications conj notification))]
        (let [test-dispatcher (#'notification.send/create-notification-dispatcher 2)]
          (testing "basic processing"
            (reset! sent-notifications [])
            (let [notification {:id 1 :test-value "A"}]
              (test-dispatcher notification)
              (wait-for-processing 1)
              (is (= [notification] @sent-notifications))))

          (testing "notifications without IDs are all processed"
            (reset! sent-notifications [])
            (test-dispatcher {:test-value "B"})
            (test-dispatcher {:test-value "C"})
            (wait-for-processing 2)
            (is (= 2 (count @sent-notifications)))
            (is (= #{"B" "C"} (into #{} (map :test-value @sent-notifications)))))

          (testing "notifications with same ID are replaced in queue"
            (reset! sent-notifications [])
            ;; make the queue busy
            (test-dispatcher {:id 40 :test-value "D"})
            (test-dispatcher {:id 41 :test-value "D"})
            (test-dispatcher {:id 42 :test-value "D"})
            (test-dispatcher {:id 42 :test-value "E"})
            (u/poll {:thunk       (fn [] (->> @sent-notifications
                                              (filter #(= 42 (:id %)))
                                              first :test-value))
                     :done?       (fn [value] (= "E" value))
                     :interval-ms 10
                     :timeout-ms  1000}))

          (testing "error handling - worker errors don't crash the dispatcher"
            (reset! sent-notifications [])
            (let [error-thrown (atom false)]
              (with-redefs [notification.send/send-notification-sync!
                            (fn [notification]
                              (if (= "F" (:test-value notification))
                                (do
                                  (reset! error-thrown true)
                                  (throw (Exception. "Test exception")))
                                (swap! sent-notifications conj notification)))]
                (test-dispatcher {:id 1 :test-value "F"})
                (test-dispatcher {:id 2 :test-value "G"})
                (wait-for-processing 1)
                (is @error-thrown)
                (is (= 1 (count @sent-notifications)))
                (is (= "G" (:test-value (first @sent-notifications))))))))))))

(deftest notification-priority-test
  (testing "notifications are processed in priority order (by deadline)"
    (let [processed-notifications (atom [])
          first-job-latch (CountDownLatch. 1)
          processing-started-latch (CountDownLatch. 1)]
      (with-redefs [notification.send/send-notification-sync! (fn [notification]
                                                                (when (= (:id notification) "blocking-job")
                                                                  (.countDown processing-started-latch)
                                                                  (.await first-job-latch 5 java.util.concurrent.TimeUnit/SECONDS))
                                                                (swap! processed-notifications conj (:id notification)))]

        (let [dispatcher (#'notification.send/create-notification-dispatcher 1)
              blocking-job {:id "blocking-job"
                            :triggering_subscription {:type :notification-subscription/cron
                                                      :cron_schedule "0 0 0 * * ? *"}}
              low-priority {:id "low-priority"
                            :triggering_subscription {:type :notification-subscription/cron
                                                      :cron_schedule "0 0 0 * * ? *"}}
              high-priority {:id "high-priority"
                             :triggering_subscription {:type :notification-subscription/cron
                                                       :cron_schedule "0 * * * * ? *"}}]
          (dispatcher blocking-job)
          ;; blocking to have time to put other notifications in the queue
          (.await processing-started-latch 5 java.util.concurrent.TimeUnit/SECONDS)
          (dispatcher low-priority)
          (dispatcher high-priority)
          (.countDown first-job-latch)
          (u/poll {:thunk       (fn [] (count @processed-notifications))
                   :done?       (fn [cnt] (= 3 cnt))
                   :interval-ms 10
                   :timeout-ms 1000})
          (is (= ["blocking-job" "high-priority" "low-priority"] @processed-notifications)))))))

(deftest notification-replacement-test
  (testing "notifications with same ID are replaced in queue while preserving original deadline"
    ;; This test verifies that when a notification with the same ID is added to the queue:
    ;; 1. The content is updated to the latest version
    ;; 2. The original deadline is preserved (not recalculated)
    ;; 3. The processing order based on priority is maintained
    ;;
    ;; Testing approach:
    ;; - We use different cron schedules (daily vs minutely) to create different priorities
    ;; - We replace a notification with a version that has a higher priority schedule
    ;; - If the deadline was recalculated on replacement, the order would change
    ;; - By observing the processing order, we can verify deadline preservation
    (let [processed-notifications (atom [])
          blocking-job-latch (CountDownLatch. 1)
          processing-started-latch (CountDownLatch. 1)]
      (with-redefs [notification.send/send-notification-sync! (fn [notification]
                                                                (when (= (:id notification) "blocking-job")
                                                                  (.countDown processing-started-latch)
                                                                  (.await blocking-job-latch 5 java.util.concurrent.TimeUnit/SECONDS))
                                                                (swap! processed-notifications conj notification))]
        (let [dispatcher (#'notification.send/create-notification-dispatcher 1)
              blocking-job    {:id "blocking-job"
                               :triggering_subscription {:type :notification-subscription/cron
                                                         :cron_schedule "0 0 0 * * ? *"}}
              high-priority   {:id "high-priority"
                               :triggering_subscription {:type :notification-subscription/cron
                                                         :cron_schedule "0 * * * * ? *"}}
              notification-v1 {:id "same-id"
                               :version 1
                               :triggering_subscription {:type :notification-subscription/cron
                                                         :cron_schedule "0 0 0 * * ? *"}}
              notification-v2 {:id "same-id"
                               :version 2
                               :triggering_subscription {:type :notification-subscription/cron
                                                         :cron_schedule "0 * * * * ? *"}}]
          (dispatcher blocking-job)
          (.await processing-started-latch 5 java.util.concurrent.TimeUnit/SECONDS)

          (dispatcher high-priority)
          (dispatcher notification-v1)
          ;; notification-v2 here will have a lower deadline to high-priority, but since we preserve
          ;; the original deadline, it should be processed after high-priority
          (dispatcher notification-v2)

          (.countDown blocking-job-latch)
          (u/poll {:thunk       (fn [] (count @processed-notifications))
                   :done?       (fn [cnt] (= 3 cnt))
                   :interval-ms 10
                   :timeout-ms 1000})

          ;; Verify that high-priority was processed before same-id,
          ;; proving that the deadline of same-id wasn't updated when replaced
          (is (= ["blocking-job" "high-priority" "same-id"]
                 (map :id @processed-notifications)))

          ;; Verify that the content was updated to v2 even though deadline wasn't
          (is (= 2 (:version (last @processed-notifications)))))))))
