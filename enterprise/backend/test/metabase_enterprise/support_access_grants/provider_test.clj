(ns metabase-enterprise.support-access-grants.provider-test
  "Tests for support access grant provider functionality."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.support-access-grants.provider :as sag.provider]
   [metabase.auth-identity.provider :as provider]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest create-support-access-reset-with-active-grant-test
  (testing "create-support-access-reset! creates AuthIdentity when active grant exists"
    (mt/with-temp [:model/User {grant-creator-id :id} {}
                   :model/User {user-id :id email :email} {}
                   :model/SupportAccessGrantLog {grant-end :grant_end_timestamp :as grant}
                   {:user_id grant-creator-id
                    :ticket_number "TEST-123"
                    :notes "Test grant"
                    :grant_start_timestamp (t/offset-date-time)
                    :grant_end_timestamp (t/plus (t/offset-date-time) (t/hours 1))
                    :revoked_at nil}]
      (let [token (sag.provider/create-support-access-reset! user-id grant)]
        (is (string? token))
        (is (re-matches (re-pattern (str user-id "_.+")) token))
        (let [auth-identity (t2/select-one :model/AuthIdentity
                                           :user_id user-id
                                           :provider "support-access-grant")]
          (is (some? auth-identity))
          (is (= "support-access-grant" (:provider auth-identity)))
          (is (= user-id (:user_id auth-identity)))
          (is (= email (:provider_id auth-identity)))
          (is (contains? (:credentials auth-identity) :token_hash))
          (is (contains? (:credentials auth-identity) :expires_at))
          (is (contains? (:credentials auth-identity) :grant_ends_at))
          (is (nil? (get-in auth-identity [:credentials :consumed_at])))
          (is (= email (get-in auth-identity [:metadata :email])))
          (is (= (str grant-end) (str (get-in auth-identity [:credentials :grant_ends_at])))))))))

(deftest create-support-access-reset-without-active-grant-test
  (testing "create-support-access-reset! throws when no grant provided"
    (mt/with-temp [:model/User {user-id :id} {}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"no grant provided"
           (sag.provider/create-support-access-reset! user-id nil))))))

(deftest create-support-access-reset-with-expired-grant-test
  (testing "create-support-access-reset! throws when grant has expired"
    (mt/with-temp [:model/User {grant-creator-id :id} {}
                   :model/User {user-id :id} {}
                   :model/SupportAccessGrantLog grant
                   {:user_id grant-creator-id
                    :ticket_number "TEST-123"
                    :notes "Expired grant"
                    :grant_start_timestamp (t/minus (t/offset-date-time) (t/hours 2))
                    :grant_end_timestamp (t/minus (t/offset-date-time) (t/hours 1))
                    :revoked_at nil}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"grant has expired"
           (sag.provider/create-support-access-reset! user-id grant))))))

(deftest create-support-access-reset-updates-existing-auth-identity-test
  (testing "create-support-access-reset! updates existing AuthIdentity instead of creating duplicate"
    (mt/with-temp [:model/User {grant-creator-id :id} {}
                   :model/User {user-id :id} {}
                   :model/SupportAccessGrantLog grant
                   {:user_id grant-creator-id
                    :ticket_number "TEST-123"
                    :notes "Test grant"
                    :grant_start_timestamp (t/offset-date-time)
                    :grant_end_timestamp (t/plus (t/offset-date-time) (t/hours 1))
                    :revoked_at nil}]
      (let [first-token (sag.provider/create-support-access-reset! user-id grant)
            first-auth-identity (t2/select-one :model/AuthIdentity
                                               :user_id user-id
                                               :provider "support-access-grant")
            second-token (sag.provider/create-support-access-reset! user-id grant)
            auth-identities (t2/select :model/AuthIdentity
                                       :user_id user-id
                                       :provider "support-access-grant")]
        (is (= 1 (count auth-identities)))
        (is (not= first-token second-token))
        (is (= (:id first-auth-identity) (:id (first auth-identities))))))))

(deftest support-access-login-sets-expires-at-test
  (testing "login! :after sets expires_at on password auth-identity based on grant_ends_at"
    (mt/with-temp [:model/User {grant-creator-id :id} {}
                   :model/User {user-id :id} {}
                   :model/SupportAccessGrantLog {grant-end :grant_end_timestamp :as grant}
                   {:user_id grant-creator-id
                    :ticket_number "TEST-123"
                    :notes "Test grant"
                    :grant_start_timestamp (t/offset-date-time)
                    :grant_end_timestamp (t/plus (t/offset-date-time) (t/hours 1))
                    :revoked_at nil}]

      (let [token (sag.provider/create-support-access-reset! user-id grant)
            auth-identity (t2/select-one :model/AuthIdentity
                                         :user_id user-id
                                         :provider "support-access-grant")
            new-password "new-secure-password-123"]
        (provider/login! :provider/support-access-grant {:token token
                                                         :password new-password})
        (let [updated-user (t2/select-one [:model/User :password] :id user-id)
              updated-pw-auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")
              updated-auth-identity (t2/select-one :model/AuthIdentity :id (:id auth-identity) :provider "support-access-grant")
              session (t2/select-one :model/Session :auth_identity_id (:id updated-auth-identity))]
          (is (some? (:expires_at session)))
          (is (= grant-end (:expires_at updated-pw-auth-identity)))
          (is (= (get-in updated-pw-auth-identity [:credentials :password_hash]) (:password updated-user)))
          (is (some? (get-in updated-auth-identity [:credentials :consumed_at]))))))))

(deftest support-access-authenticate-inherits-from-emailed-secret-test
  (testing "support-access-grant provider inherits authenticate from emailed-secret"
    (mt/with-temp [:model/User {grant-creator-id :id} {}
                   :model/User {user-id :id} {}
                   :model/SupportAccessGrantLog grant
                   {:user_id grant-creator-id
                    :ticket_number "TEST-123"
                    :notes "Test grant"
                    :grant_start_timestamp (t/offset-date-time)
                    :grant_end_timestamp (t/plus (t/offset-date-time) (t/hours 1))
                    :revoked_at nil}]
      (let [token (sag.provider/create-support-access-reset! user-id grant)
            result (provider/authenticate :provider/support-access-grant {:token token})]
        (is (true? (:success? result)))
        (is (= user-id (:user-id result)))
        (is (some? (:auth-identity result)))
        (is (= "support-access-grant" (get-in result [:auth-identity :provider])))))))

(deftest support-access-authenticate-rejects-invalid-token-test
  (testing "authenticate rejects invalid token"
    (mt/with-temp [:model/User {grant-creator-id :id} {}
                   :model/User {user-id :id} {}
                   :model/SupportAccessGrantLog grant
                   {:user_id grant-creator-id
                    :ticket_number "TEST-123"
                    :notes "Test grant"
                    :grant_start_timestamp (t/offset-date-time)
                    :grant_end_timestamp (t/plus (t/offset-date-time) (t/hours 1))
                    :revoked_at nil}]
      (sag.provider/create-support-access-reset! user-id grant)
      (let [result (provider/authenticate :provider/support-access-grant {:token (str user-id "_invalid-token")})]
        (is (false? (:success? result)))
        (is (= :invalid-token (:error result)))))))

(deftest support-access-authenticate-rejects-expired-token-test
  (testing "authenticate rejects expired token"
    (mt/with-temp [:model/User {grant-creator-id :id} {}
                   :model/User {user-id :id} {}
                   :model/SupportAccessGrantLog grant
                   {:user_id grant-creator-id
                    :ticket_number "TEST-123"
                    :notes "Test grant"
                    :grant_start_timestamp (t/offset-date-time)
                    :grant_end_timestamp (t/plus (t/offset-date-time) (t/hours 1))
                    :revoked_at nil}]
      (let [token (sag.provider/create-support-access-reset! user-id grant)
            auth-identity (t2/select-one :model/AuthIdentity
                                         :user_id user-id
                                         :provider "support-access-grant")]
        (t2/update! :model/AuthIdentity (:id auth-identity)
                    {:credentials (assoc (:credentials auth-identity)
                                         :expires_at (t/minus (t/offset-date-time) (t/hours 1)))})
        (let [result (provider/authenticate :provider/support-access-grant {:token token})]
          (is (false? (:success? result)))
          (is (= :expired-token (:error result))))))))
