(ns metabase.notification.send-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.models.notification :as models.notification]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.send :as notification.send]
   [metabase.notification.test-util :as notification.tu]
   [metabase.pulse.send :as pulse.send]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
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
              (with-redefs [channel/send! send!]
                (notification.send/send-notification-sync! n))
              (is (some? @send-args))
              (is (=? {:task "channel-send"
                       :task_details {:attempted_retries 1
                                      :retry_config      (mt/malli=? :map)
                                      :retry_errors      (mt/malli=? [:sequential [:map {:closed true}
                                                                                   [:timestamp :string]
                                                                                   [:message :string]]])}}
                      (t2/select-one :model/TaskHistory :task "channel-send"))))))))))

(deftest alert-send-failed-send-email-test
  (testing "if a notification fails to send, we send the creator an email"
    (notification.tu/with-notification-testing-setup
      (mt/with-temp
        [:model/Card         {card-id :id}  {:name          "Test Card"
                                             :dataset_query (mt/mbql-query orders {:limit 1})}
         :model/Pulse        {pulse-id :id} {:name            "Test Pulse"
                                             :alert_condition "rows"
                                             :creator_id      (mt/user->id :crowberto)}
         :model/PulseCard    _              {:pulse_id pulse-id
                                             :card_id  card-id}
         :model/PulseChannel _              {:pulse_id pulse-id
                                             :channel_type "email"
                                             :details      {:emails ["foo@metabase.com"]}}]
        (let [original-payload @#'notification.payload/payload
              regexes         [#"failed to send with the following error: test-exception"
                               (re-pattern (format "alert of <a href=\".*/question/%d\">Test Card</a>" card-id))]]
          (with-redefs [notification.payload/payload (fn [x]
                                                       (if (= {:payload_type :notification/card
                                                               :id           pulse-id}
                                                              (select-keys x [:payload_type :id]))
                                                         (throw (Exception. "test-exception"))
                                                         (original-payload x)))]
            (is (=? {:recipients #{"crowberto@metabase.com"}
                     :message  [(zipmap (map str regexes) (repeat true))]}
                    (-> (pulse.send/send-pulse! (t2/select-one :model/Pulse pulse-id))
                        (notification.tu/with-captured-channel-send!)
                        :channel/email
                        first
                        (#(apply mt/summarize-multipart-single-email % regexes)))))))))))

(deftest dashboard-subscription-send-failed-send-email-test
  (testing "if a dashboard subscription fails to send, we send the creator an email"
    (notification.tu/with-notification-testing-setup
      (mt/with-temp
        [:model/Card          {card-id :id}     {:name          "Test Card"
                                                 :dataset_query (mt/mbql-query orders {:limit 1})}
         :model/Dashboard     {dashboard-id :id} {:name       "Test Dashboard"
                                                  :creator_id (mt/user->id :crowberto)}
         :model/DashboardCard _                 {:dashboard_id dashboard-id
                                                 :card_id     card-id}
         :model/Pulse         {pulse-id :id}    {:name         "Test Subscription"
                                                 :dashboard_id dashboard-id
                                                 :creator_id   (mt/user->id :crowberto)}
         :model/PulseCard     _                 {:pulse_id          pulse-id
                                                 :card_id           card-id}
         :model/PulseChannel  _                 {:pulse_id     pulse-id
                                                 :channel_type "email"
                                                 :details      {:emails ["foo@metabase.com"]}}]
        (let [original-payload @#'notification.payload/payload
              regexes         [#"failed to send with the following error: test-exception"
                               (re-pattern (format "dashboard subscription of <a href=\".*/dashboard/%d\">Test Dashboard</a>" dashboard-id))]]
          (with-redefs [notification.payload/payload (fn [x]
                                                       (if (= {:payload_type :notification/dashboard
                                                               :id           pulse-id}
                                                              (select-keys x [:payload_type :id]))
                                                         (throw (Exception. "test-exception"))
                                                         (original-payload x)))]
            (is (=? {:recipients #{"crowberto@metabase.com"}
                     :message    [(zipmap (map str regexes) (repeat true))]}
                    (-> (pulse.send/send-pulse! (t2/select-one :model/Pulse pulse-id))
                        (notification.tu/with-captured-channel-send!)
                        :channel/email
                        first
                        (#(apply mt/summarize-multipart-single-email % regexes)))))))))))
