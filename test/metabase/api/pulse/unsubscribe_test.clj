(ns metabase.api.pulse.unsubscribe-test
  (:require
   [clojure.test :refer :all]
   [metabase.email.messages :as messages]
   [metabase.test :as mt]))

(deftest unsubscribe-hash-test
  (mt/with-temporary-setting-values [site-uuid-for-unsubscribing-url "08534993-94c6-4bac-a1ad-86c9668ee8f5"]
    (let [email         "rasta@pasta.com"
          pulse-id      12345678
          expected-hash "37bc76b4a24279eb90a71c129a629fb8626ad0089f119d6d095bc5135377f2e2884ad80b037495f1962a283cf57cdbad031fd1f06a21d86a40bba7fe674802dd"]
      (testing "We generate a cryptographic hash to validate unsubscribe URLs"
        (is (= expected-hash (messages/generate-pulse-unsubscribe-hash pulse-id email))))

      (testing "The hash value depends on the pulse-id, email, and site-uuid"
        (let [alternate-site-uuid "aa147515-ade9-4298-ac5f-c7e42b69286d"
              alternate-hashes    [(messages/generate-pulse-unsubscribe-hash 87654321 email)
                                   (messages/generate-pulse-unsubscribe-hash pulse-id "hasta@lavista.com")
                                   (mt/with-temporary-setting-values [site-uuid-for-unsubscribing-url alternate-site-uuid]
                                     (messages/generate-pulse-unsubscribe-hash pulse-id email))]]
          (is (= 3 (count (distinct (remove #{expected-hash} alternate-hashes))))))))))

(deftest unsubscribe-test
  (testing "POST /api/pulse/unsubscribe"
    (let [email "test@metabase.com"]
      (testing "Invalid hash"
        (is (= "Invalid hash."
               (mt/client :post 400 "pulse/unsubscribe" {:pulse-id 1
                                                         :email    email
                                                         :hash     "fake-hash"}))))

      (testing "Valid hash but not email"
        (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                       :model/PulseChannel _              {:pulse_id pulse-id}]
          (is (= "Email for pulse-id doesnt exist."
                 (mt/client :post 400 "pulse/unsubscribe" {:pulse-id pulse-id
                                                           :email    email
                                                           :hash     (messages/generate-pulse-unsubscribe-hash pulse-id email)})))))

      (testing "Valid hash and email"
        (mt/with-temp [:model/Pulse        {pulse-id :id} {:name "title"}
                       :model/PulseChannel _              {:pulse_id     pulse-id
                                                           :channel_type "email"
                                                           :details      {:emails [email]}}]
          (is (= {:status "success" :title "title"}
                 (mt/client :post 200 "pulse/unsubscribe" {:pulse-id pulse-id
                                                           :email    email
                                                           :hash     (messages/generate-pulse-unsubscribe-hash pulse-id email)}))))))))

(deftest unsubscribe-event-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-model-cleanup [:model/User]
      (testing "Valid hash and email returns event."
        (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                       :model/PulseChannel _              {:pulse_id     pulse-id
                                                           :channel_type "email"
                                                           :details      {:emails ["test@metabase.com"]}}]
          (mt/client :post 200 "pulse/unsubscribe" {:pulse-id pulse-id
                                                    :email    "test@metabase.com"
                                                    :hash     (messages/generate-pulse-unsubscribe-hash pulse-id "test@metabase.com")})
          (is (= {:topic    :subscription-unsubscribe
                  :user_id  nil
                  :model    "Pulse"
                  :model_id nil
                  :details  {:email "test@metabase.com"}}
                 (mt/latest-audit-log-entry :subscription-unsubscribe))))))))

(deftest unsubscribe-undo-test
  (testing "POST /api/pulse/unsubscribe/undo"
    (let [email "test@metabase.com"]
      (testing "Invalid hash"
        (is (= "Invalid hash."
               (mt/client :post 400 "pulse/unsubscribe/undo" {:pulse-id 1
                                                              :email    email
                                                              :hash     "fake-hash"}))))

      (testing "Valid hash and email doesn't exist"
        (mt/with-temp [:model/Pulse        {pulse-id :id} {:name "title"}
                       :model/PulseChannel _              {:pulse_id pulse-id}]
          (is (= {:status "success" :title "title"}
                 (mt/client :post 200 "pulse/unsubscribe/undo" {:pulse-id pulse-id
                                                                :email    email
                                                                :hash     (messages/generate-pulse-unsubscribe-hash pulse-id email)})))))

      (testing "Valid hash and email already exists"
        (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                       :model/PulseChannel _              {:pulse_id     pulse-id
                                                           :channel_type "email"
                                                           :details      {:emails [email]}}]
          (is (= "Email for pulse-id already exists."
                 (mt/client :post 400 "pulse/unsubscribe/undo" {:pulse-id pulse-id
                                                                :email    email
                                                                :hash     (messages/generate-pulse-unsubscribe-hash pulse-id email)}))))))))

(deftest unsubscribe-undo-event-test
  (testing "POST /api/pulse/unsubscribe/undo"
    (mt/with-premium-features #{:audit-app}
      (mt/with-model-cleanup [:model/User]
        (testing "Undoing valid hash and email returns event"
          (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                         :model/PulseChannel _              {:pulse_id pulse-id}]
            (mt/client :post 200 "pulse/unsubscribe/undo" {:pulse-id pulse-id
                                                           :email    "test@metabase.com"
                                                           :hash     (messages/generate-pulse-unsubscribe-hash pulse-id "test@metabase.com")})
            (is (= {:topic    :subscription-unsubscribe-undo
                    :user_id  nil
                    :model    "Pulse"
                    :model_id nil
                    :details  {:email "test@metabase.com"}}
                   (mt/latest-audit-log-entry :subscription-unsubscribe-undo)))))))))
