(ns metabase.notification.send-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.channel.core :as channel]
   [metabase.notification.core :as notification]
   [metabase.notification.models :as models.notification]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.send :as notification.send]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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
                        (#'notification.send/send-notification-sync! notification-info)))))

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
        (#'notification.send/send-notification-sync! n)
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
                (#'notification.send/send-notification-sync! n))
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
            (is (thrown? Exception (#'notification.send/send-notification-sync! n)))
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
              (#'notification.send/send-notification-sync! n)
              (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-notification/channel-send-error
                                                              {:payload-type "notification/testing"
                                                               :channel-type "channel/metabase-test"}))))))))))

(deftest cron->next-execution-times-test
  (t/with-clock (t/mock-clock (t/instant "2023-01-01T10:00:00Z"))
    (let [cron-schedule "0 0 12 * * ? *"] ; noon every day
      (is (= [(t/instant "2023-01-01T12:00:00Z")
              (t/instant "2023-01-02T12:00:00Z")
              (t/instant "2023-01-03T12:00:00Z")]
             (#'notification.send/cron->next-execution-times cron-schedule 3))))
    (testing "handles one-off cron expressions that don't repeat"
      ;; Use a real cron expression that only executes once in the future
      (let [specific-date-cron "0 0 12 2 1 ? 2023"] ; Noon on Jan 2, 2023 only
        (is (= [(t/instant "2023-01-02T12:00:00Z")]
               (#'notification.send/cron->next-execution-times specific-date-cron 5)))))))

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

  (testing "throws assertion error when n < 1"
    (is (thrown? AssertionError (#'notification.send/avg-interval-seconds "0 0 12 * * ? *" 0))))

  (testing "handles one-off schedules correctly"
    (with-redefs [notification.send/cron->next-execution-times (fn [_ _] [(t/instant)])]
      (is (= 10 (#'notification.send/avg-interval-seconds "0 0 12 * * ? *" 5))))))

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
          items      (->> [{:id 3 :deadline even-later}
                           {:id 1 :deadline now}
                           {:id 2 :deadline later}]
                          (map #(#'notification.send/->NotificationQueueEntry (:id %) (:deadline %)))
                          (sort @#'notification.send/deadline-comparator))]
      (is (= [1 2 3] (map #(.id %) items))))))

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
        (let [queue           (#'notification.send/create-notification-queue)
              test-dispatcher (#'notification.send/create-notification-dispatcher 2 queue)]
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
    (let [queue (#'notification.send/create-notification-queue)
          low-priority    {:id "low-priority"
                           :triggering_subscription {:type :notification-subscription/cron
                                                     :cron_schedule "0 0 0 * * ? *"}} ; daily schedule
          middle-priority {:id "middle-priority"
                           :triggering_subscription {:type :notification-subscription/cron
                                                     :cron_schedule "0 0 * * * ? *"}} ; hourly schedule
          high-priority   {:id "high-priority"
                           :triggering_subscription {:type :notification-subscription/cron
                                                     :cron_schedule "0 * * * * ? *"}}] ; minutely schedule
      (#'notification.send/put-notification! queue middle-priority)
      (#'notification.send/put-notification! queue low-priority)
      (#'notification.send/put-notification! queue high-priority)

      (is (= [high-priority middle-priority low-priority]
             (for [_ (range 3)]
               (#'notification.send/take-notification! queue)))))))

(deftest notification-queue-preserves-deadline-on-replacement-test
  (testing "notifications with same ID are replaced in queue while preserving original deadline"
    (let [queue (#'notification.send/create-notification-queue)
          ;; Create a notification with a daily schedule (lower priority)
          notification-v1 {:id "same-id"
                           :version 1
                           :triggering_subscription {:type :notification-subscription/cron
                                                     :cron_schedule "0 0 0 * * ? *"}} ;; daily schedule
          notification-v2 {:id "same-id"
                           :version 2
                           :triggering_subscription {:type :notification-subscription/cron
                                                     :cron_schedule "* * * * * ? *"}} ;; every second
          high-priority   {:id "high-priority"
                           :triggering_subscription {:type :notification-subscription/cron
                                                     :cron_schedule "0 * * * * ? *"}}] ;; every minute

      (#'notification.send/put-notification! queue notification-v1)
      (#'notification.send/put-notification! queue high-priority)
      (#'notification.send/put-notification! queue notification-v2)

      (is (= [high-priority notification-v2]
             ;; If deadline is preserved, high-priority should come first since it was added after notification-v1
             ;; If deadline was recalculated, notification-v2 would come first due to its minutely schedule
             (for [_ (range 2)]
               (#'notification.send/take-notification! queue)))))))

(deftest notification-queue-test
  (let [queue (#'notification.send/create-notification-queue)]

    (testing "put and take operations work correctly"
      (#'notification.send/put-notification! queue {:id 1 :payload_type :notification/testing :test-value "A"})
      (is (= {:id 1 :payload_type :notification/testing :test-value "A"}
             (#'notification.send/take-notification! queue))))

    (testing "notifications with same ID are replaced in queue"
      (let [queue (#'notification.send/create-notification-queue)]
        (#'notification.send/put-notification! queue {:id 1 :payload_type :notification/testing :test-value "A"})
        (#'notification.send/put-notification! queue {:id 1 :payload_type :notification/testing :test-value "B"})
        (is (= {:id 1 :payload_type :notification/testing :test-value "B"}
               (#'notification.send/take-notification! queue)))))

    (testing "multiple notifications are processed in order"
      (let [queue (#'notification.send/create-notification-queue)]
        (#'notification.send/put-notification! queue {:id 1 :payload_type :notification/testing :test-value "A"})
        (#'notification.send/put-notification! queue {:id 2 :payload_type :notification/testing :test-value "B"})
        (#'notification.send/put-notification! queue {:id 3 :payload_type :notification/testing :test-value "C"})

        (is (= {:id 1 :payload_type :notification/testing :test-value "A"}
               (#'notification.send/take-notification! queue)))
        (is (= {:id 2 :payload_type :notification/testing :test-value "B"}
               (#'notification.send/take-notification! queue)))
        (is (= {:id 3 :payload_type :notification/testing :test-value "C"}
               (#'notification.send/take-notification! queue)))))

    (testing "take blocks until notification is available"
      (let [queue (#'notification.send/create-notification-queue)
            result (atom nil)
            latch (java.util.concurrent.CountDownLatch. 1)
            thread (Thread. (fn []
                              (.countDown latch) ; signal thread is ready
                              (reset! result (#'notification.send/take-notification! queue))))]
        (.start thread)
        (.await latch) ; wait for thread to start
        (Thread/sleep 50) ; give thread time to block on take

        ; Put a notification that the thread should receive
        (#'notification.send/put-notification! queue {:id 42 :payload_type :notification/testing :test-value "X"})

        ; Wait for thread to complete
        (.join ^Thread thread 1000)

        (is (= {:id 42 :payload_type :notification/testing :test-value "X"} @result))))))

(deftest blocking-queue-concurrency-test
  (testing "blocking queue handles concurrent operations correctly"
    (let [queue                  (#'notification.send/create-notification-queue)
          num-producers          5
          num-consumers          3
          num-items-per-producer 20
          total-items            (* num-producers num-items-per-producer)
          received-items         (atom #{})
          producer-latch         (java.util.concurrent.CountDownLatch. 1)
          consumer-latch         (java.util.concurrent.CountDownLatch. total-items)
          producer-fn            (fn [producer-id]
                                   (.await producer-latch)
                                   (dotimes [i num-items-per-producer]
                                     (let [item-id (+ (* producer-id 100) i)
                                           item {:id item-id :producer producer-id :item i}]
                                       (#'notification.send/put-notification! queue item))))
          consumer-fn            (fn [consumer-id]
                                   (try
                                     (while (pos? (.getCount consumer-latch))
                                       (let [item (#'notification.send/take-notification! queue)]
                                         (swap! received-items conj [(:id item) item {:consumer consumer-id}])
                                         (.countDown consumer-latch)))
                                     (catch Exception e
                                       (log/errorf e "Consumer %s error:" consumer-id))))
          producers               (mapv #(doto (Thread. (fn [] (producer-fn %))) .start) (range num-producers))
          _consumers              (mapv #(doto (Thread. (fn [] (consumer-fn %))) .start) (range num-consumers))]

      ; Start all producers simultaneously
      (.countDown producer-latch)

      ; Wait for all items to be consumed
      (is (.await consumer-latch 10000 java.util.concurrent.TimeUnit/MILLISECONDS)
          "Timed out waiting for consumers to process all items")

      ; Wait for all producer threads to complete
      (doseq [t producers] (.join ^Thread t 5000))

      (testing "all items were processed"
        (is (= total-items (count @received-items))))

      (testing "each item was processed exactly once"
        (let [item-ids (map first @received-items)]
          (is (= (count item-ids) (count (set item-ids))))))

      (testing "work was distributed among consumers"
        (let [consumer-counts (->> @received-items
                                   (map #(get-in % [2 :consumer]))
                                   frequencies
                                   vals)]
          (is (> (count consumer-counts) 1))
          (is (every? pos? consumer-counts)))))))
