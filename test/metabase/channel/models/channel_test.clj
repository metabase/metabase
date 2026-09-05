(ns metabase.channel.models.channel-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.channel.models.channel] ;; ensure known-labels are loaded
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(deftest channel-details-is-encrypted
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (encryption-test/with-secret-key "secret"
      (mt/with-model-cleanup [:model/Channel]
        (let [channel (t2/insert-returning-instance! :model/Channel notification.tu/default-can-connect-channel)]
          (is (encryption/possibly-encrypted-string? (t2/select-one-fn :details :channel (:id channel)))))))))

(deftest channel-details-json-encoding-test
  (testing "JSON-encoding a Channel includes :details only for callers who can write it"
    (mt/with-temp
      [:model/Channel channel {:name    "prod-webhook"
                               :type    :channel/http
                               :active  true
                               :details {:url         "https://example.com/hook"
                                         :auth-method "header"
                                         :auth-info   {:Authorization "Bearer token-value"}}}]
      (testing "a user who cannot write the channel gets no :details"
        (mt/with-test-user :rasta
          (let [encoded (json/encode channel)]
            (is (not (re-find #"token-value" encoded)))
            (is (nil? (:details (json/decode+kw encoded))))
            (testing "but the rest of the channel is still present"
              (is (re-find #"prod-webhook" encoded))))))
      (testing "a user who can write the channel still gets :details"
        (mt/with-test-user :crowberto
          (is (re-find #"token-value" (json/encode channel))))))))

(deftest deactivate-channel-test
  (mt/with-temp
    [:model/Channel      {id :id}       notification.tu/default-can-connect-channel
     :model/Pulse        {pulse-id :id} {:name "Test pulse"}
     :model/PulseChannel {pc-id :id}    {:pulse_id pulse-id
                                         :channel_id id
                                         :channel_type "metabase-test"
                                         :enabled true}]
    (testing "do not try to delete pulse-channel if active doesn't change"
      (is (pos? (t2/update! :model/Channel id {:name "New name"})))
      (is (zero? (t2/update! :model/Channel id {:active true})))
      (is (t2/exists? :model/PulseChannel pc-id)))
    (testing "deactivate channel"
      (t2/update! :model/Channel id {:active false})
      (testing "will delete pulse channels"
        (is (not (t2/exists? :model/PulseChannel pc-id))))
      (testing "will change the name"
        (is (= (format "DEACTIVATED_%d New name" id) (t2/select-one-fn :name :model/Channel id)))))))

(deftest deactivate-channel-deactivates-orphaned-notifications-test
  (testing "deactivating a channel also deactivates Notifications left with no other way to deliver (metabase#76712)"
    (mt/with-temp [:model/Channel      {chn-id :id}  notification.tu/default-can-connect-channel
                   :model/Notification {noti-id :id} {:payload_type :notification/system-event
                                                       :active       true}
                   :model/NotificationHandler _       {:notification_id noti-id
                                                        :channel_type    :channel/metabase-test
                                                        :channel_id      chn-id}]
      (t2/update! :model/Channel chn-id {:active false})
      (is (false? (t2/select-one-fn :active :model/Notification noti-id)))))

  (testing "a notification with another still-viable handler is left alone"
    (mt/with-temp [:model/Channel      {chn-1 :id}   notification.tu/default-can-connect-channel
                   :model/Channel      {chn-2 :id}   (assoc notification.tu/default-can-connect-channel :name "Other channel")
                   :model/Notification {noti-id :id} {:payload_type :notification/system-event
                                                       :active       true}
                   :model/NotificationHandler _       {:notification_id noti-id
                                                        :channel_type    :channel/metabase-test
                                                        :channel_id      chn-1}
                   :model/NotificationHandler _       {:notification_id noti-id
                                                        :channel_type    :channel/metabase-test
                                                        :channel_id      chn-2}]
      (t2/update! :model/Channel chn-1 {:active false})
      (is (true? (t2/select-one-fn :active :model/Notification noti-id)))
      (testing "deactivating the last remaining channel does deactivate it"
        (t2/update! :model/Channel chn-2 {:active false})
        (is (false? (t2/select-one-fn :active :model/Notification noti-id)))))))

(deftest channel-template-email-details-test
  (mt/with-model-cleanup [:model/ChannelTemplate]
    (let [insert! (fn [template]
                    (t2/insert-returning-instance! :model/ChannelTemplate
                                                   (merge
                                                    {:channel_type :channel/email
                                                     :name          "My Template"}
                                                    template)))]
      (testing "template is a handlebars template"
        (testing "success"
          (is (some? (insert! {:details {:type    "email/handlebars-text"
                                         :subject "Hello {{name}}"
                                         :body    "Welcome {{name}}"}}))))
        (testing "invalid template"
          (is (thrown? Exception
                       (insert! {:details {:type    "email/handlebars-text"
                                           :subject "Hello {{name}"
                                           :body    nil}})))))
      (testing "template is a resource path"
        (testing "success"
          (is (some? (insert! {:details {:type    "email/handlebars-resource"
                                         :subject "Hello {{name}}"
                                         :path    "password_reset"}}))))
        (testing "invalid path"
          (is (thrown? Exception
                       (insert! {:details {:type    "email/handlebars-resource"
                                           :subject "Hello {{name}}"
                                           :path    "/path/to/resource"}}))))
        (testing "invalid template"
          (is (thrown? Exception
                       (insert! {:details {:type    "email/handlebars-resource"
                                           :subject "Hello {{name}}"
                                           :path    nil}}))))))))

(deftest channel-template-create-prometheus-metric-test
  (testing "creating a ChannelTemplate increments the template-create prometheus counter"
    (mt/with-prometheus-system! [_ system]
      (mt/with-model-cleanup [:model/ChannelTemplate]
        (t2/insert-returning-instance! :model/ChannelTemplate
                                       {:channel_type :channel/email
                                        :name         "Test Template"
                                        :details      {:type    :email/handlebars-text
                                                       :subject "Hello {{name}}"
                                                       :body    "Welcome {{name}}"}})
        (is (= 1.0 (mt/metric-value system :metabase-notification/template-create
                                    {:channel-type :channel/email})))))))

(deftest channel-template-update-prometheus-metric-test
  (testing "updating a ChannelTemplate increments the template-update prometheus counter"
    (mt/with-prometheus-system! [_ system]
      (mt/with-temp [:model/ChannelTemplate {id :id} {:channel_type :channel/email
                                                      :name         "Test Template"
                                                      :details      {:type    :email/handlebars-text
                                                                     :subject "Hello"
                                                                     :body    "Original body"}}]
        (t2/update! :model/ChannelTemplate id {:details {:type    :email/handlebars-text
                                                         :subject "Hello"
                                                         :body    "Updated body"}})
        (is (= 1.0 (mt/metric-value system :metabase-notification/template-update
                                    {:channel-type :channel/email})))))))

(deftest channel-template-create-logging-test
  (testing "creating a user-provided template logs template metadata, without leaking the template body"
    (mt/with-log-messages-for-level [messages :info]
      (mt/with-model-cleanup [:model/ChannelTemplate]
        (t2/insert-returning-instance! :model/ChannelTemplate
                                       {:channel_type :channel/email
                                        :name         "Test Template"
                                        :details      {:type    :email/handlebars-text
                                                       :subject "Hello"
                                                       :body    "Secret {{password}}"}})
        (is (some (fn [{:keys [message]}]
                    (and (re-find #"ChannelTemplate create" message)
                         (re-find #"handlebars-text" message)))
                  (messages)))
        (testing "the template body itself is not logged"
          (is (not (some (fn [{:keys [message]}]
                           (re-find #"Secret" message))
                         (messages)))))))))
