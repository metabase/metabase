(ns metabase-enterprise.support-access-grants.core-test
  "Tests for support access grant core business logic."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.support-access-grants.core :as grants]
   [metabase-enterprise.support-access-grants.models.support-access-grant-log :as sag.model]
   [metabase-enterprise.support-access-grants.provider :as sag.provider]
   [metabase-enterprise.support-access-grants.settings :as sag.settings]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

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
            (mt/with-dynamic-fn-redefs [sag.settings/support-access-grant-email (constantly support-email)]
              (let [grant (grants/create-grant! creator-id 240 "SUPPORT-TOKEN-1" "test notes")]
                (is (some? (:token grant)) "Token should be created")
                (is (string? (:token grant)) "Token should be a string")
                (is (re-matches (re-pattern (str support-user-id "_.+")) (:token grant))
                    "Token should start with support user ID")
                (let [auth-identity (t2/select-one :model/AuthIdentity
                                                   'user_id support-user-id
                                                   'provider "support-access-grant")]
                  (is (some? auth-identity) "AuthIdentity should be created for support user")
                  (is (= "support-access-grant" (:provider auth-identity))))))))))))

(deftest create-grant-creates-support-user-if-not-exists-test
  (testing "create-grant! creates a support user if one doesn't exist"
    (let [support-email "new-support@example.com"
          support-first-name "Support"
          support-last-name "User"]
      (mt/with-temp [:model/User {creator-id :id} {}]
        (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
          (mt/with-dynamic-fn-redefs [sag.settings/support-access-grant-email (constantly support-email)
                                      sag.settings/support-access-grant-first-name (constantly support-first-name)
                                      sag.settings/support-access-grant-last-name (constantly support-last-name)]
            (let [grant (grants/create-grant! creator-id 240 "SUPPORT-CREATE-USER" "test notes")
                  created-user (t2/select-one :model/User 'email support-email)]
              (is (some? created-user) "Support user should be created")
              (is (= support-email (:email created-user)))
              (is (= support-first-name (:first_name created-user)))
              (is (= support-last-name (:last_name created-user)))
              (is (some? (:token grant)) "Token should be created for the new support user")
              (is (string? (:token grant)))
              (is (:is_superuser created-user) "Support user should have admin access")
              (let [auth-identity (t2/select-one :model/AuthIdentity
                                                 'user_id (:id created-user)
                                                 'provider "support-access-grant")]
                (is (some? auth-identity) "AuthIdentity should be created for new support user")))))))))

(deftest create-grant-gives-support-user-admin-access-test
  (testing "create-grant! sets is_superuser on existing support user"
    (let [support-email "support-admin@example.com"]
      (mt/with-temp [:model/User {creator-id :id} {}
                     :model/User {support-user-id :id} {:email support-email :is_superuser false}]
        (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity]
          (mt/with-dynamic-fn-redefs [sag.settings/support-access-grant-email (constantly support-email)]
            (grants/create-grant! creator-id 240 "SUPPORT-ADMIN-1" "test notes")
            (let [updated-user (t2/select-one :model/User 'id support-user-id)]
              (is (:is_superuser updated-user) "Support user should have admin access after grant creation")))))))
  (testing "revoking a grant removes is_superuser from support user"
    (let [support-email "support-admin-revoke@example.com"]
      (mt/with-temp [:model/User {creator-id :id} {:is_superuser true}
                     :model/User {support-user-id :id} {:email support-email :is_superuser false}]
        (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity]
          (mt/with-dynamic-fn-redefs [sag.settings/support-access-grant-email (constantly support-email)]
            (let [grant (grants/create-grant! creator-id 240 "SUPPORT-ADMIN-2" "test notes")]
              (grants/revoke-grant! creator-id (:id grant))
              (let [updated-user (t2/select-one :model/User 'id support-user-id)]
                (is (not (:is_superuser updated-user)) "Support user should lose admin access after grant revocation")))))))))

(deftest create-grant-reactivates-support-user-with-admin-access-test
  (testing "create-grant! reactivates a deactivated support user and gives them admin access"
    (let [support-email "support-reactivate@example.com"]
      (mt/with-temp [:model/User {creator-id :id} {}
                     :model/User {support-user-id :id} {:email support-email :is_active false :is_superuser false}]
        (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity]
          (mt/with-dynamic-fn-redefs [sag.settings/support-access-grant-email (constantly support-email)]
            (grants/create-grant! creator-id 240 "SUPPORT-REACTIVATE-1" "test notes")
            (let [updated-user (t2/select-one [:model/User 'id 'is_active 'is_superuser] 'id support-user-id)]
              (is (:is_active updated-user) "Support user should be reactivated")
              (is (:is_superuser updated-user) "Reactivated support user should have admin access"))))))))

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

(deftest expire-ended-grants-tears-down-support-access-test
  (testing "a grant that ends naturally, without ever being revoked, has the support user's access torn down"
    (let [support-email "support-natural-expiry@example.com"]
      ;; the creator is an admin so the support user isn't the last one, and can actually be demoted
      (mt/with-temp [:model/User {creator-id :id} {:is_superuser true}]
        (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
          (mt/with-dynamic-fn-redefs [sag.settings/support-access-grant-email (constantly support-email)]
            (let [grant           (grants/create-grant! creator-id 60 "SUPPORT-NATURAL-EXPIRY" "Time-boxed access")
                  support-user-id (t2/select-one-pk :model/User 'email support-email)]
              (t2/insert! :model/Session {:id      "expiregrant1"
                                          :user_id support-user-id
                                          :session_key (str (random-uuid))})
              (testing "while the grant is still running the sweep leaves everything alone"
                (grants/expire-ended-grants!)
                (is (:is_superuser (t2/select-one :model/User 'id support-user-id)))
                (is (t2/exists? :model/Session 'user_id support-user-id)))
              (testing "once the grant window has passed the sweep revokes access"
                ;; Move the grant's end into the past; `revoked_at` stays nil, so nothing else cleans up.
                (t2/update! :model/SupportAccessGrantLog (:id grant)
                            {:grant_end_timestamp (t/minus (t/instant) (t/minutes 1))})
                (grants/expire-ended-grants!)
                (is (not (:is_superuser (t2/select-one :model/User 'id support-user-id)))
                    "Support user should lose admin access once the grant ends")
                (is (not (t2/exists? :model/Session 'user_id support-user-id))
                    "Support user sessions should be deleted once the grant ends")
                (is (every? :expires_at (t2/select :model/AuthIdentity 'user_id support-user-id))
                    "Support user auth identities should be expired once the grant ends"))
              (testing "the sweep is idempotent"
                (grants/expire-ended-grants!)
                (is (not (:is_superuser (t2/select-one :model/User 'id support-user-id))))
                (is (not (t2/exists? :model/Session 'user_id support-user-id)))))))))))

(deftest expire-ended-grants-ignores-other-users-test
  (testing "the natural-expiry sweep only touches the support user"
    (let [support-email "support-expiry-scope@example.com"]
      (mt/with-temp [:model/User {creator-id :id} {}
                     :model/User {other-user-id :id} {:is_superuser true}]
        (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
          (mt/with-dynamic-fn-redefs [sag.settings/support-access-grant-email (constantly support-email)]
            (let [grant (grants/create-grant! creator-id 60 "SUPPORT-EXPIRY-SCOPE" "Time-boxed access")]
              (t2/insert! :model/Session {:id          "otheruser001"
                                          :user_id     other-user-id
                                          :session_key (str (random-uuid))})
              (t2/update! :model/SupportAccessGrantLog (:id grant)
                          {:grant_end_timestamp (t/minus (t/instant) (t/minutes 1))})
              (grants/expire-ended-grants!)
              (is (:is_superuser (t2/select-one :model/User 'id other-user-id)))
              (is (t2/exists? :model/Session 'user_id other-user-id)))))))))

(deftest expire-ended-grants-does-not-tear-down-a-concurrently-created-grant-test
  (testing "grant creation waits for an in-progress natural-expiry teardown"
    (let [support-email "support-expiry-race@example.com"]
      (mt/with-model-cleanup [:model/SupportAccessGrantLog :model/AuthIdentity :model/User]
        (mt/with-dynamic-fn-redefs [sag.settings/support-access-grant-email (constantly support-email)]
          ;; The creator is inserted directly rather than with `with-temp`, which would run this body inside a
          ;; transaction. `future` conveys that connection, so both threads below would share one transaction and
          ;; their `SELECT ... FOR UPDATE` on the lock row could never conflict — the cluster lock would be a no-op
          ;; and the race this test guards against would go undetected on every appdb except h2.
          ;; The creator is an admin so the support user isn't the last one, and can actually be demoted.
          (let [creator-id                   (t2/insert-returning-pk! :model/User
                                                                      (assoc (t2.with-temp/with-temp-defaults :model/User)
                                                                             :is_superuser true))
                ended-grant                  (grants/create-grant! creator-id 60 "SUPPORT-EXPIRED" nil)
                support-user-id              (t2/select-one-pk :model/User 'email support-email)
                teardown-started             (promise)
                allow-teardown               (promise)
                create-started               (promise)
                original-revoke-user-access! (dynamic-redefs/original-fn
                                              #'sag.model/revoke-support-user-access!)]
            (t2/update! :model/SupportAccessGrantLog (:id ended-grant)
                        {:grant_end_timestamp (t/minus (t/instant) (t/minutes 1))})
            (mt/with-dynamic-fn-redefs
              [sag.model/revoke-support-user-access!
               (fn [user-id ended-at]
                 (deliver teardown-started true)
                 (when (= ::timeout (deref allow-teardown 5000 ::timeout))
                   (throw (ex-info "Timed out waiting to finish support access teardown" {})))
                 (original-revoke-user-access! user-id ended-at))]
              (let [expire-result (future (grants/expire-ended-grants!))]
                (is (true? (deref teardown-started 5000 ::timeout))
                    "Expiry should reach credential teardown")
                (let [create-result (future
                                      (deliver create-started true)
                                      (grants/create-grant! creator-id 60 "SUPPORT-CURRENT" nil))]
                  (try
                    (is (true? (deref create-started 5000 ::timeout)))
                    (is (= ::timeout (deref create-result 250 ::timeout))
                        "Grant creation must wait until the expiry teardown releases its lifecycle lock")
                    (deliver allow-teardown true)
                    (is (not= ::timeout (deref expire-result 5000 ::timeout)))
                    (let [new-grant (deref create-result 5000 ::timeout)
                          support-user (t2/select-one :model/User support-user-id)
                          auth-identity (t2/select-one :model/AuthIdentity
                                                       'user_id support-user-id
                                                       'provider "support-access-grant")]
                      (is (map? new-grant) "Concurrent grant creation should complete")
                      (is (= "SUPPORT-CURRENT" (:ticket_number new-grant)))
                      (is (:is_superuser support-user)
                          "The new grant should restore support admin access")
                      (is (= (:grant_end_timestamp new-grant) (:expires_at auth-identity))
                          "The new grant's credentials must survive the old grant's expiry sweep"))
                    (finally
                      (deliver allow-teardown true)
                      (future-cancel expire-result)
                      (future-cancel create-result))))))))))))

(deftest expire-ended-grants-no-support-user-test
  (testing "the natural-expiry sweep is a no-op when no support user exists"
    (mt/with-dynamic-fn-redefs [sag.settings/support-access-grant-email (constantly "nobody-expiry@example.com")]
      (is (nil? (grants/expire-ended-grants!)))
      (is (not (t2/exists? :model/User 'email "nobody-expiry@example.com"))
          "the sweep must not conjure a support user into existence"))))
