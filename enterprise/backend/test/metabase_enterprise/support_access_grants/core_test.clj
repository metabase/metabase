(ns metabase-enterprise.support-access-grants.core-test
  "Tests for support access grant core business logic."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.support-access-grants.core :as grants]
   [metabase-enterprise.support-access-grants.provider :as sag.provider]
   [metabase-enterprise.support-access-grants.settings :as sag.settings]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest create-grant-returns-grant-test
  (mt/with-temp [:model/User {user-id :id} {:first_name "Bobby" :email "bobby-test@metabase.com"}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (let [ticket-number "SUPPORT-12345"
            duration 240
            notes "Some notes"
            grant (grants/create-grant! user-id duration ticket-number notes)]
        (is (some? grant))
        (is (= user-id (:user_id grant)))
        (is (= ticket-number (:ticket_number grant)))
        (is (= notes (:notes grant)))
        (is (= "Bobby" (:user_name grant)))
        (is (= "bobby-test@metabase.com" (:user_email grant)))
        (is (some? (:grant_start_timestamp grant)))
        (is (some? (:grant_end_timestamp grant)))
        (is (nil? (:revoked_at grant)))
        (is (nil? (:revoked_by_user_id grant)))))))

(deftest create-grant-with-nil-fields-test
  (mt/with-temp [:model/User {user-id :id} {:first_name nil :email "bobby-test@metabase.com"}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (let [grant (grants/create-grant! user-id 240 nil nil)]
        (is (some? grant))
        (is (= user-id (:user_id grant)))
        (is (nil? (:ticket_number grant)))
        (is (nil? (:notes grant)))
        (is (nil? (:user_name grant)))
        (is (= "bobby-test@metabase.com" (:user_email grant)))
        (is (some? (:grant_start_timestamp grant)))
        (is (some? (:grant_end_timestamp grant)))
        (is (nil? (:revoked_at grant)))
        (is (nil? (:revoked_by_user_id grant)))))))

(deftest create-grant-duration-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (let [ticket-number "SUPPORT-12346"
            duration 60
            grant (grants/create-grant! user-id duration ticket-number nil)
            start-time (:grant_start_timestamp grant)
            end-time (:grant_end_timestamp grant)
            duration-mins (t/as (t/duration start-time end-time) :minutes)]
        (is (= duration duration-mins))))))

(deftest create-grant-fails-when-active-grant-exists-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (let [ticket-number "SUPPORT-12347"]
        (grants/create-grant! user-id 240 ticket-number nil)
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Cannot create grant: an active grant already exists"
             (grants/create-grant! user-id 120 "SUPPORT-12348" "Some notes")))))))

(deftest create-grant-succeeds-after-revoked-grant-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (let [ticket-number1 "SUPPORT-12351"
            ticket-number2 "SUPPORT-12352"
            grant1 (grants/create-grant! user-id 240 ticket-number1 nil)]
        (grants/revoke-grant! user-id (:id grant1))
        (let [grant2 (grants/create-grant! user-id 240 ticket-number2 nil)]
          (is (some? grant2))
          (is (not= (:id grant1) (:id grant2))))))))

(deftest revoke-grant-sets-revoked-fields-test
  (mt/with-temp [:model/User {user-id :id} {}
                 :model/User {revoker-id :id} {}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (let [ticket-number "SUPPORT-22345"
            grant (grants/create-grant! user-id 240 ticket-number nil)
            revoked-grant (grants/revoke-grant! revoker-id (:id grant))]
        (is (some? revoked-grant))
        (is (some? (:revoked_at revoked-grant)))
        (is (= revoker-id (:revoked_by_user_id revoked-grant)))))))

(deftest revoke-grant-fails-for-nonexistent-grant-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Grant not found"
         (grants/revoke-grant! user-id 999999)))))

(deftest revoke-grant-fails-for-already-revoked-grant-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (let [ticket-number "SUPPORT-22346"
            grant (grants/create-grant! user-id 240 ticket-number nil)]
        (grants/revoke-grant! user-id (:id grant))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Grant is already revoked"
             (grants/revoke-grant! user-id (:id grant))))))))

(deftest list-grants-default-pagination-test
  (mt/with-temp [:model/User {user-id :id} {}
                 :model/SupportAccessGrantLog _ {:user_id user-id
                                                 :ticket_number "SUPPORT-30"
                                                 :grant_start_timestamp (t/instant)
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}
                 :model/SupportAccessGrantLog {grant-id :id} {:user_id user-id
                                                              :ticket_number "SUPPORT-31"
                                                              :grant_start_timestamp (t/instant)
                                                              :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}
                 :model/SupportAccessGrantLog _ {:user_id user-id
                                                 :ticket_number "SUPPORT-32"
                                                 :grant_start_timestamp (t/instant)
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}]
    (grants/revoke-grant! user-id grant-id)
    (let [result (grants/list-grants {})]
      (is (= 2 (count (:data result))) "Only non-revoked grants by default")
      (is (= 2 (:total result)))
      (is (= 50 (:limit result)))
      (is (= 0 (:offset result))))))

(deftest list-grants-includes-revoked-test
  (mt/with-temp [:model/User {user-id :id} {}
                 :model/SupportAccessGrantLog _ {:user_id user-id
                                                 :ticket_number "SUPPORT-33345"
                                                 :grant_start_timestamp (t/instant)
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))
                                                 :revoked_at (t/instant)
                                                 :revoked_by_user_id user-id}
                 :model/SupportAccessGrantLog _ {:user_id user-id
                                                 :ticket_number "SUPPORT-33346"
                                                 :grant_start_timestamp (t/instant)
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}]
    (let [result (grants/list-grants {:include-revoked true})]
      (is (= 2 (count (:data result))))
      (is (= 2 (:total result))))))

(deftest list-grants-filters-by-ticket-number-test
  (mt/with-temp [:model/User {user-id :id} {}
                 :model/SupportAccessGrantLog _ {:user_id user-id
                                                 :ticket_number "SUPPORT-44345"
                                                 :grant_start_timestamp (t/instant)
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}
                 :model/SupportAccessGrantLog _ {:user_id user-id
                                                 :ticket_number "SUPPORT-44346"
                                                 :grant_start_timestamp (t/instant)
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}]
    (let [result (grants/list-grants {:ticket-number "SUPPORT-44345"})]
      (is (= 1 (count (:data result))))
      (is (= "SUPPORT-44345" (:ticket_number (first (:data result))))))))

(deftest list-grants-filters-by-user-id-test
  (mt/with-temp [:model/User {user1-id :id} {}
                 :model/User {user2-id :id} {}
                 :model/SupportAccessGrantLog _ {:user_id user1-id
                                                 :ticket_number "SUPPORT-55345"
                                                 :grant_start_timestamp (t/instant)
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}
                 :model/SupportAccessGrantLog _ {:user_id user2-id
                                                 :ticket_number "SUPPORT-55346"
                                                 :grant_start_timestamp (t/instant)
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}]
    (let [result (grants/list-grants {:user-id user1-id})]
      (is (= 1 (count (:data result))))
      (is (= user1-id (:user_id (first (:data result))))))))

(deftest list-grants-respects-limit-and-offset-test
  (mt/with-temp [:model/User {user-id :id} {}
                 :model/SupportAccessGrantLog _ {:user_id user-id
                                                 :ticket_number "SUPPORT-60000"
                                                 :grant_start_timestamp (t/instant)
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}
                 :model/SupportAccessGrantLog _ {:user_id user-id
                                                 :ticket_number "SUPPORT-61000"
                                                 :grant_start_timestamp (t/plus (t/instant) (t/millis 10))
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}
                 :model/SupportAccessGrantLog _ {:user_id user-id
                                                 :ticket_number "SUPPORT-62000"
                                                 :grant_start_timestamp (t/plus (t/instant) (t/millis 20))
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}
                 :model/SupportAccessGrantLog _ {:user_id user-id
                                                 :ticket_number "SUPPORT-63000"
                                                 :grant_start_timestamp (t/plus (t/instant) (t/millis 30))
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}
                 :model/SupportAccessGrantLog _ {:user_id user-id
                                                 :ticket_number "SUPPORT-64000"
                                                 :grant_start_timestamp (t/plus (t/instant) (t/millis 40))
                                                 :grant_end_timestamp (t/plus (t/instant) (t/hours 240))}]
    (let [result1 (grants/list-grants {:limit 2 :offset 0})
          result2 (grants/list-grants {:limit 2 :offset 2})]
      (is (= 2 (count (:data result1))))
      (is (= 2 (count (:data result2))))
      (is (not= (map :id (:data result1))
                (map :id (:data result2)))
          "Different pages should return different grants"))))

(deftest list-grants-enforces-maximum-limit-test
  (let [result (grants/list-grants {:limit 150})]
    (is (= 100 (:limit result)))))

(deftest get-current-grant-returns-nil-when-no-grant-exists-test
  (is (nil? (grants/get-current-grant))))

(deftest get-current-grant-returns-active-grant-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (let [ticket-number "SUPPORT-77345"
            notes "here some notes"
            grant (grants/create-grant! user-id 240 ticket-number notes)
            current (grants/get-current-grant)]
        (is (some? current))
        (is (= (:id grant) (:id current)))))))

(deftest get-current-grant-returns-nil-when-grant-revoked-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (let [ticket-number "SUPPORT-77346"
            notes "here some notes"
            grant (grants/create-grant! user-id 240 ticket-number notes)]
        (grants/revoke-grant! user-id (:id grant))
        (is (nil? (grants/get-current-grant)))))))

(deftest get-current-grant-returns-most-recent-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (grants/create-grant! user-id 240 "SUPPORT-77348" nil)
      (let [now (t/instant)
            grant-end (t/plus now (t/minutes 240))]
        (t2/insert! :model/SupportAccessGrantLog
                    {:user_id user-id
                     :ticket_number "SUPPORT-77349"
                     :grant_start_timestamp (t/minus now (t/minutes 5))
                     :grant_end_timestamp grant-end}))
      (let [current (grants/get-current-grant)]
        (is (some? current))
        (is (= "SUPPORT-77349" (:ticket_number current))
            "Returns most recent grant when multiple active grants exist")))))

(deftest create-grant-creates-token-for-support-user-test
  (testing "create-grant! creates a token when support user exists"
    (let [support-email "support@example.com"]
      (mt/with-temp [:model/User {creator-id :id} {}
                     :model/User {support-user-id :id} {:email support-email}]
        (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity]
          (mt/with-temp-env-var-value! [mb-support-access-grant-email support-email]
            (with-redefs [sag.settings/support-access-grant-email (constantly support-email)]
              (let [grant (grants/create-grant! creator-id 240 "SUPPORT-TOKEN-1" "test notes")]
                (is (some? (:token grant)) "Token should be created")
                (is (string? (:token grant)) "Token should be a string")
                (is (re-matches (re-pattern (str support-user-id "_.+")) (:token grant))
                    "Token should start with support user ID")
                (let [auth-identity (t2/select-one :model/AuthIdentity
                                                   :user_id support-user-id
                                                   :provider "support-access-grant")]
                  (is (some? auth-identity) "AuthIdentity should be created for support user")
                  (is (= "support-access-grant" (:provider auth-identity))))))))))))

(deftest create-grant-creates-support-user-if-not-exists-test
  (testing "create-grant! creates a support user if one doesn't exist"
    (let [support-email "new-support@example.com"
          support-first-name "Support"
          support-last-name "User"]
      (mt/with-temp [:model/User {creator-id :id} {}]
        (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
          (with-redefs [sag.settings/support-access-grant-email (constantly support-email)
                        sag.settings/support-access-grant-first-name (constantly support-first-name)
                        sag.settings/support-access-grant-last-name (constantly support-last-name)]
            (let [grant (grants/create-grant! creator-id 240 "SUPPORT-CREATE-USER" "test notes")
                  created-user (t2/select-one :model/User :email support-email)]
              (is (some? created-user) "Support user should be created")
              (is (= support-email (:email created-user)))
              (is (= support-first-name (:first_name created-user)))
              (is (= support-last-name (:last_name created-user)))
              (is (some? (:token grant)) "Token should be created for the new support user")
              (is (string? (:token grant)))
              (let [auth-identity (t2/select-one :model/AuthIdentity
                                                 :user_id (:id created-user)
                                                 :provider "support-access-grant")]
                (is (some? auth-identity) "AuthIdentity should be created for new support user")))))))))

(deftest create-grant-publishes-event-test
  (testing "Creating a grant publishes :event/support-access-grant-created event"
    (let [support-email "support@example.com"
          published-events (atom [])]
      (mt/with-temp [:model/User {creator-id :id} {}]
        (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
          (with-redefs [sag.settings/support-access-grant-email (constantly support-email)
                        sag.settings/support-access-grant-first-name (constantly "Support")
                        sag.settings/support-access-grant-last-name (constantly "User")
                        events/publish-event! (fn [topic payload]
                                                (swap! published-events conj [topic payload]))]
            (let [grant (grants/create-grant! creator-id 60 "TICKET-123" "Test notes")
                  our-events (filter (fn [[topic _]] (= topic :event/support-access-grant-created)) @published-events)]
              (is (some? (:token grant)) "Token should be created")
              (testing "Event was published"
                (is (= 1 (count our-events)) "Exactly one support-access-grant-created event should be published")
                (let [[topic payload] (first our-events)]
                  (is (= :event/support-access-grant-created topic) "Event topic should be correct")
                  (is (= support-email (:support_email payload)) "Payload should contain support email")
                  (is (= "TICKET-123" (:ticket_number payload)) "Payload should contain ticket number")
                  (is (= "Test notes" (:notes payload)) "Payload should contain notes")
                  (is (= 60 (:duration_minutes payload)) "Payload should contain duration")
                  (is (some? (:grant_end_time payload)) "Payload should contain grant end time")
                  (is (some? (:password_reset_url payload)) "Payload should contain password reset URL")
                  (is (str/includes? (:password_reset_url payload) "reset_password")
                      "Password reset URL should have correct path"))))))))))

(deftest create-grant-does-not-publish-event-when-no-token-test
  (testing "No event is published when token creation fails"
    (let [support-email "support@example.com"
          published-events (atom [])]
      (mt/with-temp [:model/User {creator-id :id} {}]
        (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
          (with-redefs [sag.settings/support-access-grant-email (constantly support-email)
                        sag.settings/support-access-grant-first-name (constantly "Support")
                        sag.settings/support-access-grant-last-name (constantly "User")
                        sag.provider/create-support-access-reset! (constantly nil)
                        events/publish-event! (fn [topic payload]
                                                (swap! published-events conj [topic payload]))]
            (let [grant (grants/create-grant! creator-id 60 "TICKET-456" "Test notes")
                  our-events (filter (fn [[topic _]] (= topic :event/support-access-grant-created)) @published-events)]
              (is (nil? (:token grant)) "Token should not be created")
              (is (zero? (count our-events)) "No support-access-grant-created event should be published when token is nil"))))))))

(deftest create-grant-event-payload-has-correct-data-test
  (testing "Event payload contains all required fields with correct values"
    (let [support-email "support@example.com"
          ticket-number "TICKET-789"
          duration-minutes 120
          published-events (atom [])]
      (mt/with-temp [:model/User {creator-id :id} {}]
        (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
          (with-redefs [sag.settings/support-access-grant-email (constantly support-email)
                        sag.settings/support-access-grant-first-name (constantly "Support")
                        sag.settings/support-access-grant-last-name (constantly "User")
                        events/publish-event! (fn [topic payload]
                                                (swap! published-events conj [topic payload]))]
            (let [grant-before (t/instant)
                  _ (grants/create-grant! creator-id duration-minutes ticket-number "Test notes")
                  grant-after (t/instant)
                  our-events (filter (fn [[topic _]] (= topic :event/support-access-grant-created)) @published-events)
                  [_topic payload] (first our-events)
                  grant-end-time (:grant_end_time payload)]
              (is (some? grant-end-time) "Grant end time should be present")
              (is (t/after? grant-end-time grant-before) "Grant end time should be after creation started")
              (is (t/after? grant-end-time grant-after) "Grant end time should be in the future")
              (let [expected-end (t/plus grant-before (t/minutes duration-minutes))
                    diff-seconds (t/as (t/duration expected-end grant-end-time) :seconds)]
                (is (< (Math/abs ^long diff-seconds) 2)
                    "Grant end time should be approximately duration_minutes in the future")))))))))
