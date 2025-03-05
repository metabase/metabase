(ns metabase.notification.send-test
  (:require
   [clojure.test :refer :all]
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
        (let [queue           (#'notification.send/create-blocking-queue)
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
