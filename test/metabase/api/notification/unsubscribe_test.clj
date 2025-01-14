(ns metabase.api.notification.unsubscribe-test
  (:require
   [clojure.test :refer :all]
   [metabase.email.messages :as messages]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest unsubscribe-hash-test
  (mt/with-temporary-setting-values [site-uuid-for-unsubscribing-url "08534993-94c6-4bac-a1ad-86c9668ee8f5"]
    (let [email "rasta@pasta.com"
          notification-handler-id 12345678
          expected-hash "9463fdc177a2349c64accd5899d594a81af22636769c92ff62434e5f4fc52640c9e514c29fd750d3c39ae81b02cdece25d575d1825f6c74782bd92448d4fdb57"]
      (testing "We generate a cryptographic hash to validate unsubscribe URLs"
        (is (= expected-hash (messages/generate-notification-unsubscribe-hash notification-handler-id email))))

      (testing "The hash value depends on the notification-id, email, and site-uuid"
        (let [alternate-site-uuid "aa147515-ade9-4298-ac5f-c7e42b69286d"
              alternate-hashes [(messages/generate-notification-unsubscribe-hash 87654321 email)
                                (messages/generate-notification-unsubscribe-hash notification-handler-id "hasta@lavista.com")
                                (mt/with-temporary-setting-values [site-uuid-for-unsubscribing-url alternate-site-uuid]
                                  (messages/generate-notification-unsubscribe-hash notification-handler-id email))]]
          (is (= 3 (count (distinct (remove #{expected-hash} alternate-hashes))))))))))

(defn api:unsubscribe
  ([expected-status handler-id email]
   (api:unsubscribe expected-status handler-id email
                    (messages/generate-notification-unsubscribe-hash handler-id email)))
  ([expected-status handler-id email hash]
   (mt/client :post expected-status "notification/unsubscribe"
              {:notification-handler-id handler-id
               :email    email
               :hash     hash})))

(defn api:unsubscribe-undo
  ([expected-status handler-id email]
   (api:unsubscribe-undo
    expected-status handler-id email
    (messages/generate-notification-unsubscribe-hash handler-id email)))
  ([expected-status handler-id email hash]
   (mt/client :post expected-status "notification/unsubscribe/undo"
              {:notification-handler-id handler-id
               :email    email
               :hash     hash})))

(deftest unsubscribe-test
  (mt/with-premium-features #{:audit-app}
    (testing "POST /api/notification/unsubscribe"
      (let [email "test@metabase.com"]
        (testing "Invalid hash"
          (is (= "Invalid hash."
                 (api:unsubscribe 400 1 email "fake-hash"))))

        (testing "Valid hash but email doesn't exist"
          (mt/with-temp [:model/Notification        {notification-id :id} {}
                         :model/NotificationHandler {handler-id :id} {:notification_id notification-id
                                                                      :channel_type   :channel/email}]
            (is (= "Email doesn't exist."
                   (api:unsubscribe 400 handler-id email)))))

        (testing "Valid hash and email"
          (mt/with-temp [:model/Notification        {notification-id :id} {}
                         :model/NotificationHandler {handler-id :id} {:notification_id notification-id
                                                                      :channel_type   :channel/email}
                         :model/NotificationRecipient nr {:notification_handler_id handler-id
                                                          :type :notification-recipient/raw-value
                                                          :details {:value email}}]
            (is (= {:status "success", :title "Notification Unsubscribed"}
                   (api:unsubscribe 200 handler-id email)))
            (is (not (t2/exists? :model/NotificationRecipient (:id nr))))
            (is (= {:topic    :subscription-unsubscribe
                    :user_id  nil
                    :model    "NotificationHandler"
                    :model_id nil
                    :details  {:email "test@metabase.com"}}
                   (mt/latest-audit-log-entry :subscription-unsubscribe)))))))))

(deftest unsubscribe-undo-test
  (testing "POST /api/notification/unsubscribe/undo"
    (let [email "test@metabase.com"]
      (testing "Invalid hash"
        (is (= "Invalid hash."
               (api:unsubscribe-undo 400 1 email "fake-hash"))))

      (testing "Valid hash and email doesn't exist (should succeed and create recipient)"
        (mt/with-temp [:model/Notification        {notification-id :id} {}
                       :model/NotificationHandler {handler-id :id} {:notification_id notification-id
                                                                    :channel_type   :channel/email}]
          (is (= {:status "success" :title "Notification Resubscribed"}
                 (api:unsubscribe-undo 200 handler-id email)))
          (is (=? [{:notification_handler_id handler-id
                    :type :notification-recipient/raw-value
                    :details {:value email}}]
                  (t2/select :model/NotificationRecipient :notification_handler_id handler-id)))
          (is (= {:topic    :subscription-unsubscribe-undo
                  :user_id  nil
                  :model    "NotificationHandler"
                  :model_id nil
                  :details  {:email "test@metabase.com"}}
                 (mt/latest-audit-log-entry :subscription-unsubscribe-undo)))))

      (testing "Valid hash but email already exists"
        (mt/with-temp [:model/Notification        {notification-id :id} {}
                       :model/NotificationHandler {handler-id :id} {:notification_id notification-id
                                                                    :channel_type   :channel/email}
                       :model/NotificationRecipient _ {:notification_handler_id handler-id
                                                       :type :notification-recipient/raw-value
                                                       :details {:value email}}]
          (is (= "Email already exist."
                 (api:unsubscribe-undo 400 handler-id email))))))))
