(ns metabase.notification.send-test
  (:require
   [clojure.test :refer :all]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.channel.core :as channel]
   [metabase.channel.email :as email]
   [metabase.integrations.slack :as slack]
   [metabase.models.notification :as models.notification]
   [metabase.notification.core :as notification]
   [metabase.notification.send :as notification.send]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util.retry :as retry]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :web-server))

(deftest send-notification!*-test
  (testing "sending a ntoification will call render on all of its handlers"
    (notification.tu/with-notification-testing-setup
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

(defn- latest-task-history-entry
  [task-name]
  (t2/select-one-fn #(dissoc % :id :started_at :ended_at :duration)
                    :model/TaskHistory
                    {:order-by [[:started_at :desc]]
                     :where [:= :task (name task-name)]}))

(deftest send-notification-record-task-history-test
  (mt/with-temp [:model/Channel chn notification.tu/default-can-connect-channel]
    (notification.tu/with-notification-testing-setup
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
  (notification.tu/with-notification-testing-setup
    (mt/with-temp [:model/Channel chn notification.tu/default-can-connect-channel]
      (let [n (models.notification/create-notification!
               {:payload_type :notification/testing}
               nil
               [{:channel_type notification.tu/test-channel-type
                 :channel_id   (:id chn)
                 :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :crowberto)}]}])]
        (testing "send-notification! retries on failure"
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
                       :status       :success
                       :task_details {:attempted_retries 1
                                      :retry_config      (mt/malli=? :map)
                                      :retry_errors      (mt/malli=? [:sequential [:map {:closed true}
                                                                                   [:timestamp :string]
                                                                                   [:message :string]]])}}
                      (latest-task-history-entry "channel-send"))))))))))

(deftest notification-send-skip-retry-still-report-failed-task-history-test
  (notification.tu/with-notification-testing-setup
    (mt/with-temp [:model/Channel chn notification.tu/default-can-connect-channel]
      (let [n (models.notification/create-notification!
               {:payload_type :notification/testing}
               nil
               [{:channel_type notification.tu/test-channel-type
                 :channel_id   (:id chn)
                 :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :crowberto)}]}])]
        (testing (str "if channel/send! throws an exception and should-skip-retry? returns true"
                      "the task history should still be recorded and status is failed")
          (testing "and record exception in task history"
            (let [send!       (fn [& _args]
                                (throw (ex-info "Failed to send" {:metadata 42})))]
              (mt/with-dynamic-fn-redefs [notification.send/should-skip-retry? (constantly true)
                                          channel/send!                        send!]
                (#'notification.send/send-notification-sync! n))
              (is (=? {:task "channel-send"
                       :status       :failed
                       :task_details {:attempted_retries 0
                                      :message           "Failed to send"
                                      :ex-data           {:metadata 42
                                                          :metabase.notification.send/skip-retry? true}

                                      :retry_errors      (mt/malli=? [:sequential [:map {:closed true}
                                                                                   [:timestamp :string]
                                                                                   [:message :string]]])}}
                      (latest-task-history-entry "channel-send"))))))))))

(defn- get-positive-retry-metrics [^io.github.resilience4j.retry.Retry retry]
  (let [metrics (bean (.getMetrics retry))]
    (into {}
          (map (fn [field]
                 (let [n (metrics field)]
                   (when (pos? n)
                     [field n]))))
          [:numberOfFailedCallsWithRetryAttempt
           :numberOfFailedCallsWithoutRetryAttempt
           :numberOfSuccessfulCallsWithRetryAttempt
           :numberOfSuccessfulCallsWithoutRetryAttempt])))

(def ^:private fake-email-notification
  {:subject      "test-message"
   :recipients   ["whoever@example.com"]
   :message-type :text
   :message      "test message body"})

(def ^:private test-retry-configuration
  (assoc @#'notification.send/default-retry-config
         :initial-interval-millis 1
         :max-attempts 2))

(deftest email-notification-retry-test
  (testing "send email succeeds w/o retry"
    (let [test-retry (retry/random-exponential-backoff-retry "test-retry" test-retry-configuration)]
      (with-redefs [email/send-email!                      mt/fake-inbox-email-fn
                    retry/random-exponential-backoff-retry (constantly test-retry)]
        (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                           email-smtp-port 587]
          (mt/reset-inbox!)
          (#'notification.send/channel-send-retrying! 1 :notification/card {:channel_type :channel/email} fake-email-notification)
          (is (= {:numberOfSuccessfulCallsWithoutRetryAttempt 1}
                 (get-positive-retry-metrics test-retry)))
          (testing "no retry errors recorded"
            (is (zero? (-> (latest-task-history-entry "channel-send") :task_details :retry_errors count))))
          (is (= 1 (count @mt/inbox)))))))
  (testing "send email succeeds hiding SMTP host not set error"
    (let [test-retry (retry/random-exponential-backoff-retry "test-retry" test-retry-configuration)]
      (with-redefs [email/send-email!                      (fn [& _] (throw (ex-info "Bumm!" {:cause :smtp-host-not-set})))
                    retry/random-exponential-backoff-retry (constantly test-retry)]
        (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                           email-smtp-port 587]
          (mt/reset-inbox!)
          (#'notification.send/channel-send-retrying! 1 :notification/card {:channel_type :channel/email} fake-email-notification)
          (is (= {:numberOfSuccessfulCallsWithoutRetryAttempt 1}
                 (get-positive-retry-metrics test-retry)))
          (is (= 0 (count @mt/inbox)))))))
  (testing "send email fails b/c retry limit"
    (let [retry-config (assoc test-retry-configuration :max-attempts 1)
          test-retry (retry/random-exponential-backoff-retry "test-retry" retry-config)]
      (with-redefs [email/send-email!                      (tu/works-after 1 mt/fake-inbox-email-fn)
                    retry/random-exponential-backoff-retry (constantly test-retry)]
        (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                           email-smtp-port 587]
          (mt/reset-inbox!)
          (#'notification.send/channel-send-retrying! 1 :notification/card {:channel_type :channel/email} fake-email-notification)
          (is (= {:numberOfFailedCallsWithRetryAttempt 1}
                 (get-positive-retry-metrics test-retry)))
          (is (= 0 (count @mt/inbox)))))))
  (testing "send email succeeds w/ retry"
    (let [retry-config (assoc test-retry-configuration :max-attempts 2)
          test-retry   (retry/random-exponential-backoff-retry "test-retry" retry-config)]
      (with-redefs [email/send-email!                      (tu/works-after 1 mt/fake-inbox-email-fn)
                    retry/random-exponential-backoff-retry (constantly test-retry)]
        (mt/with-temporary-setting-values [email-smtp-host "fake_smtp_host"
                                           email-smtp-port 587]
          (mt/reset-inbox!)
          (#'notification.send/channel-send-retrying! 1 :notification/card {:channel_type :channel/email} fake-email-notification)
          (is (= {:numberOfSuccessfulCallsWithRetryAttempt 1}
                 (get-positive-retry-metrics test-retry)))
          (is (= 1 (count @mt/inbox))))))))

(def ^:private fake-slack-notification
  {:channel-id  "#test-channel"
   :attachments [{:blocks [{:type "section", :text {:type "plain_text", :text ""}}]}]})

(deftest slack-notification-retry-test
  (notification.tu/with-send-notification-sync
    (testing "post slack message succeeds w/o retry"
      (let [test-retry (retry/random-exponential-backoff-retry "test-retry" test-retry-configuration)]
        (with-redefs [retry/random-exponential-backoff-retry (constantly test-retry)
                      slack/post-chat-message!               (constantly nil)]
          (#'notification.send/channel-send-retrying! 1 :notification/card {:channel_type :channel/slack} fake-slack-notification)
          (is (= {:numberOfSuccessfulCallsWithoutRetryAttempt 1}
                 (get-positive-retry-metrics test-retry))))))
    (testing "post slack message succeeds hiding token error"
      (let [test-retry (retry/random-exponential-backoff-retry "test-retry" test-retry-configuration)]
        (with-redefs [retry/random-exponential-backoff-retry (constantly test-retry)
                      slack/post-chat-message!               (fn [& _]
                                                               (throw (ex-info "Invalid token"
                                                                               {:errors {:slack-token "Invalid token"}})))]
          (#'notification.send/channel-send-retrying! 1 :notification/card {:channel_type :channel/slack} fake-slack-notification)
          (is (= {:numberOfFailedCallsWithoutRetryAttempt 1}
                 (get-positive-retry-metrics test-retry))))))
    (testing "post slack message fails b/c retry limit"
      (let [retry-config (assoc test-retry-configuration :max-attempts 1)
            test-retry   (retry/random-exponential-backoff-retry "test-retry" retry-config)]
        (with-redefs [slack/post-chat-message!               (tu/works-after 1 (constantly nil))
                      retry/random-exponential-backoff-retry (constantly test-retry)]
          (#'notification.send/channel-send-retrying! 1 :notification/card {:channel_type :channel/slack} fake-slack-notification)
          (is (= {:numberOfFailedCallsWithRetryAttempt 1}
                 (get-positive-retry-metrics test-retry))))))
    (testing "post slack message succeeds with retry"
      (let [retry-config (assoc test-retry-configuration :max-attempts 2)
            test-retry   (retry/random-exponential-backoff-retry "test-retry" retry-config)]
        (with-redefs [slack/post-chat-message!               (tu/works-after 1 (constantly nil))
                      retry/random-exponential-backoff-retry (constantly test-retry)]
          (#'notification.send/channel-send-retrying! 1 :notification/card {:channel_type :channel/slack} fake-slack-notification)
          (is (= {:numberOfSuccessfulCallsWithRetryAttempt 1}
                 (get-positive-retry-metrics test-retry))))))))

(deftest send-channel-record-task-history-test
  (with-redefs [notification.send/default-retry-config {:max-attempts            4
                                                        :initial-interval-millis 1
                                                        :multiplier              2.0
                                                        :randomization-factor    0.1
                                                        :max-interval-millis     30000}]
    (mt/with-model-cleanup [:model/TaskHistory]
      (let [pulse-id             (rand-int 10000)
            default-task-details {:notification_id pulse-id
                                  :notification_type "notification/card"
                                  :channel_type "channel/slack"
                                  :channel_id   nil
                                  :retry_config {:max-attempts            4
                                                 :initial-interval-millis 1
                                                 :multiplier              2.0
                                                 :randomization-factor    0.1
                                                 :max-interval-millis     30000}}
            send!                #(#'notification.send/channel-send-retrying! pulse-id :notification/card {:channel_type :channel/slack} fake-slack-notification)]
        (testing "channel send task history task details include retry config"
          (with-redefs [channel/send! (constantly true)]
            (send!)
            (is (=? {:task         "channel-send"
                     :db_id        nil
                     :status       :success
                     :task_details default-task-details}
                    (latest-task-history-entry :channel-send)))))

        (testing "retry errors are recorded when the task eventually succeeds"
          (with-redefs [channel/send! (tu/works-after 2 (constantly nil))]
            (send!)
            (is (=? {:task         "channel-send"
                     :db_id        nil
                     :status       :success
                     :task_details (merge default-task-details
                                          {:attempted_retries 2
                                           :retry_errors      (mt/malli=?
                                                               [:sequential {:min 2 :max 2}
                                                                [:map
                                                                 [:message :string]
                                                                 [:timestamp :string]]])})}
                    (latest-task-history-entry :channel-send)))))

        (testing "retry errors are recorded when the task eventually fails"
          (with-redefs [channel/send! (tu/works-after 5 (constantly nil))]
            (send!)
            (is (=? {:task         "channel-send"
                     :db_id        nil
                     :status       :failed
                     :task_details {:original-info     default-task-details
                                    :attempted_retries 4
                                    :retry_errors      (mt/malli=?
                                                        [:sequential {:min 4 :max 4}
                                                         [:map
                                                          [:message :string]
                                                          [:timestamp :string]]])}}
                    (latest-task-history-entry :channel-send)))))))))

(deftest send-notification-record-prometheus-metrics-test
  (mt/with-prometheus-system! [_ system]
    (notification.tu/with-notification-testing-setup
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
    (notification.tu/with-notification-testing-setup
      (mt/with-temp [:model/Channel chn notification.tu/default-can-connect-channel]
        (let [n (models.notification/create-notification!
                 {:payload_type :notification/testing}
                 nil
                 [{:channel_type notification.tu/test-channel-type
                   :channel_id   (:id chn)
                   :recipients   [{:type :notification-recipient/user :user_id (mt/user->id :crowberto)}]}])]
          (mt/with-dynamic-fn-redefs [channel/render-notification (fn [& _]
                                                                    (throw (Exception. "test-exception")))]
            (is (thrown? Exception (notification.send/send-notification-sync! n)))
            (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-notification/send-error
                                                            {:payload-type "notification/testing"})))))))))

(deftest send-notification-record-prometheus-channel-error-metrics-test
  (mt/with-temporary-setting-values [site-url "https://metabase.com/testmb"]
    (mt/with-prometheus-system! [_ system]
      (notification.tu/with-notification-testing-setup
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
