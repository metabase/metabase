(ns metabase.notification.api.unsubscribe-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.email.core :as messages]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest unsubscribe-hash-test
  (mt/with-temporary-setting-values [site-uuid-for-unsubscribing-url "08534993-94c6-4bac-a1ad-86c9668ee8f5"]
    (let [email "rasta@pasta.com"
          notification-handler-id 12345678
          expected-hash "f3cfa7bc3021186b2abeceac80c3e75524457203e54d27744672e320c65df51a98674961b38683d84d8b36f4b12b310489235dd08e5a9b8464dc8fec51c3d3f4"]
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
          (notification.tu/with-card-notification
            [notification {:handlers [{:channel_type :channel/email
                                       :recipients   []}]}]
            (let [handler-id (-> notification :handlers first :id)]
              (is (= "Email doesn't exist."
                     (api:unsubscribe 400 handler-id email))))))

        (testing "Valid hash and email"
          (notification.tu/with-card-notification
            [notification {:handlers [{:channel_type :channel/email
                                       :recipients   [{:type    :notification-recipient/raw-value
                                                       :details {:value email}}]}]}]
            (let [handler-id (-> notification :handlers first :id)]
              (is (= {:status "success"
                      :title  "Card notification test card"}
                     (api:unsubscribe 200 handler-id email)))
              (is (not (t2/exists? :model/NotificationRecipient :notification_handler_id handler-id)))
              (is (= {:topic    :notification-unsubscribe-ex
                      :user_id  nil
                      :model    "NotificationHandler"
                      :model_id handler-id
                      :details  {:email "test@metabase.com"}}
                     (mt/latest-audit-log-entry :notification-unsubscribe-ex))))))))))

(deftest unsubscribe-undo-test
  (mt/with-premium-features #{:audit-app}
    (testing "POST /api/notification/unsubscribe/undo"
      (let [email "test@metabase.com"]
        (testing "Invalid hash"
          (is (= "Invalid hash."
                 (api:unsubscribe-undo 400 1 email "fake-hash"))))

        (testing "Valid hash and email doesn't exist (should succeed and create recipient)"
          (notification.tu/with-card-notification
            [notification {:handlers [{:channel_type :channel/email
                                       :recipients   []}]}]
            (let [handler-id (-> notification :handlers first :id)]
              (is (= {:status "success"
                      :title  "Card notification test card"}
                     (api:unsubscribe-undo 200 handler-id email)))
              (is (=? [{:notification_handler_id handler-id
                        :type                    :notification-recipient/raw-value
                        :details                 {:value email}}]
                      (t2/select :model/NotificationRecipient :notification_handler_id handler-id)))
              (is (= {:topic    :notification-unsubscribe-undo-ex
                      :user_id  nil
                      :model    "NotificationHandler"
                      :model_id handler-id
                      :details  {:email "test@metabase.com"}}
                     (mt/latest-audit-log-entry :notification-unsubscribe-undo-ex)))))

          (testing "Valid hash but email already exists"
            (notification.tu/with-card-notification
              [notification {:handlers [{:channel_type :channel/email
                                         :recipients   [{:type    :notification-recipient/raw-value
                                                         :details {:value email}}]}]}]
              (let [handler-id (-> notification :handlers first :id)]
                (is (= "Email already exist."
                       (api:unsubscribe-undo 400 handler-id email)))))))))))
