(ns metabase.auth-identity.session-test
  "Tests for AuthIdentity and Session integration."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Session Tracking Tests --------------------------------------------------

(deftest create-session-with-password-auth-tracking-test
  (testing "Creating a session with password authentication tracks the auth_identity_id"
    (mt/with-temp [:model/User user {}]
      (let [password-auth (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "password")
            device-info {:device_id "test-device-123"
                         :embedded false
                         :device_description "Test Browser"
                         :ip_address "127.0.0.1"}
            session (auth-identity/create-session-with-auth-tracking!
                     user device-info :provider/password)]
        (is (some? session))
        (is (string? (:key session)))
        (is (= (:id password-auth) (:auth_identity_id session)))
        (let [persisted-session (t2/select-one :model/Session :id (:id session))]
          (is (= (:id password-auth) (:auth_identity_id persisted-session))))))))

(deftest create-session-with-google-sso-auth-tracking-test
  (testing "Creating a session with Google SSO authentication tracks the auth_identity_id"
    (mt/with-temp [:model/User user {}
                   :model/AuthIdentity google-auth {:user_id (:id user)
                                                    :provider "google"
                                                    :metadata {:sso_source "google"}}]
      (let [device-info {:device_id "test-device-456"
                         :embedded false
                         :device_description "Chrome Browser"
                         :ip_address "127.0.0.1"}
            session (auth-identity/create-session-with-auth-tracking! user device-info :provider/google)]
        (is (some? session))
        (is (= (:id google-auth) (:auth_identity_id session)))
        (let [persisted-session (t2/select-one :model/Session :id (:id session))]
          (is (= (:id google-auth) (:auth_identity_id persisted-session))))))))

(deftest create-session-with-ldap-auth-tracking-test
  (testing "Creating a session with LDAP authentication tracks the auth_identity_id"
    (mt/with-temp [:model/User user {}
                   :model/AuthIdentity ldap-auth {:user_id (:id user)
                                                  :provider "ldap"
                                                  :metadata {:login_attributes {:uid "testuser"}}}]
      (let [device-info {:device_id "test-device-789"
                         :embedded false
                         :device_description "Firefox Browser"
                         :ip_address "127.0.0.1"}
            session (auth-identity/create-session-with-auth-tracking! user device-info :provider/ldap)]
        (is (some? session))
        (is (= (:id ldap-auth) (:auth_identity_id session)))
        (let [persisted-session (t2/select-one :model/Session :id (:id session))]
          (is (= (:id ldap-auth) (:auth_identity_id persisted-session))))))))

(deftest create-session-updates-last-used-at-test
  (testing "Creating a session updates the last_used_at timestamp on the AuthIdentity"
    (mt/with-temp [:model/User user {}]
      (let [password-auth (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "password")
            device-info {:device_id "test-device-last-used"
                         :embedded false
                         :device_description "Test Browser"
                         :ip_address "127.0.0.1"}
            original-last-used (:last_used_at password-auth)]
        (is (nil? original-last-used))
        (auth-identity/create-session-with-auth-tracking! user device-info :provider/password)
        (let [updated-auth (t2/select-one :model/AuthIdentity :id (:id password-auth))]
          (is (some? (:last_used_at updated-auth))))))))

(deftest multiple-sessions-same-auth-identity-test
  (testing "Multiple sessions can reference the same AuthIdentity"
    (mt/with-temp [:model/User user {}]
      (let [password-auth (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "password")
            device-info-1 {:device_id "device-1"
                           :embedded false
                           :device_description "Browser 1"
                           :ip_address "127.0.0.1"}
            device-info-2 {:device_id "device-2"
                           :embedded false
                           :device_description "Browser 2"
                           :ip_address "127.0.0.1"}
            session-1 (auth-identity/create-session-with-auth-tracking!
                       user device-info-1 :provider/password)
            session-2 (auth-identity/create-session-with-auth-tracking!
                       user device-info-2 :provider/password)]
        (is (some? session-1))
        (is (some? session-2))
        (is (not= (:id session-1) (:id session-2)))
        (is (= (:id password-auth) (:auth_identity_id session-1)))
        (is (= (:id password-auth) (:auth_identity_id session-2)))))))

(deftest session-cascade-delete-on-auth-identity-deletion-test
  (testing "Deleting an AuthIdentity cascades to delete associated Sessions"
    (mt/with-temp [:model/User user {}]
      (let [password-auth (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "password")
            device-info {:device_id "test-device-cascade"
                         :embedded false
                         :device_description "Test Browser"
                         :ip_address "127.0.0.1"}
            session (auth-identity/create-session-with-auth-tracking!
                     user device-info :provider/password)]
        (is (some? session))
        (is (some? (t2/select-one :model/Session :id (:id session))))
        (t2/delete! :model/AuthIdentity :id (:id password-auth))
        (is (nil? (t2/select-one :model/Session :id (:id session))))))))

(deftest session-creation-with-user-having-multiple-providers-test
  (testing "User with multiple providers can create sessions with different providers"
    (mt/with-temp [:model/User user {}
                   :model/AuthIdentity google-auth {:user_id (:id user)
                                                    :provider "google"}]
      (let [password-auth (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "password")
            device-info {:device_id "test-device-multi"
                         :embedded false
                         :device_description "Test Browser"
                         :ip_address "127.0.0.1"}
            password-session (auth-identity/create-session-with-auth-tracking!
                              user device-info :provider/password)
            google-session (auth-identity/create-session-with-auth-tracking!
                            user device-info :provider/google)]
        (is (some? password-session))
        (is (some? google-session))
        (is (= (:id password-auth) (:auth_identity_id password-session)))
        (is (= (:id google-auth) (:auth_identity_id google-session)))))))

(deftest session-includes-type-field-test
  (testing "Session creation returns a session with :type field"
    (mt/with-temp [:model/User user {}]
      (let [device-info {:device_id "test-device-type"
                         :embedded false
                         :device_description "Test Browser"
                         :ip_address "127.0.0.1"}
            session (auth-identity/create-session-with-auth-tracking! user device-info :provider/password)]
        (is (some? session))
        (is (contains? session :type))
        (is (= :normal (:type session)))))))

(deftest session-includes-type-field-embed-test
  (testing "Session creation returns a session with :type field"
    (request/with-current-request {:headers {"x-metabase-embedded" "true"}}
      (mt/with-temp [:model/User user {}]
        (let [device-info {:device_id "test-device-type"
                           :embedded false
                           :device_description "Test Browser"
                           :ip_address "127.0.0.1"}
              session (auth-identity/create-session-with-auth-tracking! user device-info :provider/password)]
          (is (some? session))
          (is (contains? session :type))
          (is (= :full-app-embed (:type session))))))))

(deftest session-inherits-expires-at-test
  (testing "Session inherits expires_at from auth-identity"
    (mt/with-temp [:model/User user {}]
      (let [expires-at (t/plus (t/offset-date-time) (t/days 7))
            password-auth (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "password")]
        (t2/update! :model/AuthIdentity (:id password-auth) {:expires_at expires-at})
        (let [device-info {:device_id "test-device-expires"
                           :embedded false
                           :device_description "Test Browser"
                           :ip_address "127.0.0.1"}
              session (auth-identity/create-session-with-auth-tracking! user device-info :provider/password)]
          (is (some? (:expires_at session))
              "Session should have expires_at")
          (is (instance? java.time.OffsetDateTime (:expires_at session))
              "expires_at should be OffsetDateTime")
          (is (t2/exists? :model/AuthIdentity :id (:id password-auth) :expires_at (:expires_at session))
              "Session expires_at should match auth-identity expires_at"))))))

(deftest session-no-expires-at-when-auth-identity-has-none-test
  (testing "Session has no expires_at when auth-identity doesn't have one"
    (mt/with-temp [:model/User user {}]
      (let [password-auth (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "password")
            device-info {:device_id "test-device-no-expires"
                         :embedded false
                         :device_description "Test Browser"
                         :ip_address "127.0.0.1"}
            session (auth-identity/create-session-with-auth-tracking! user device-info :provider/password)]
        (is (nil? (:expires_at password-auth))
            "Auth-identity should not have expires_at")
        (is (nil? (:expires_at session))
            "Session should not have expires_at when auth-identity doesn't")))))
