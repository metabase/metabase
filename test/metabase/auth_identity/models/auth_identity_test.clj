(ns metabase.auth-identity.models.auth-identity-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(deftest user-creation-creates-password-auth-identity-test
  (testing "User creation automatically creates password AuthIdentity with hashed password"
    (mt/with-temp [:model/User {user-id :id}]
      (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")]
        (is (some? auth-identity)
            "AuthIdentity should be created automatically")
        (is (some? (get-in auth-identity [:credentials :password_hash]))
            "Credentials should contain password_hash")
        (is (some? (get-in auth-identity [:credentials :password_salt]))
            "Credentials should contain password_salt")
        (is (nil? (get-in auth-identity [:credentials :plaintext_password]))
            "Plaintext password should not be stored")))))

(deftest plaintext-password-hashed-on-update-test
  (testing "Plaintext password is hashed on update"
    (mt/with-temp [:model/User {user-id :id}]
      (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")
            auth-identity-id (:id auth-identity)
            new-password "new-password-456"]
        (t2/update! :model/AuthIdentity auth-identity-id
                    {:credentials {:plaintext_password new-password}})
        (let [updated (t2/select-one :model/AuthIdentity :id auth-identity-id)
              {:keys [password_hash password_salt]} (:credentials updated)]
          (is (some? password_hash)
              "New password should be hashed")
          (is (some? password_salt)
              "New password should have salt")
          (is (nil? (get-in updated [:credentials :plaintext_password]))
              "Plaintext password should not be stored")
          (is (true? (u.password/verify-password new-password password_salt password_hash))
              "New password should be verifiable"))))))

(deftest non-credential-updates-dont-trigger-hashing-test
  (testing "Non-credential updates don't trigger password hashing"
    (mt/with-temp [:model/User {user-id :id}]
      (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")
            auth-identity-id (:id auth-identity)
            original-hash (get-in auth-identity [:credentials :password_hash])
            original-salt (get-in auth-identity [:credentials :password_salt])]
        (t2/update! :model/AuthIdentity auth-identity-id
                    {:metadata {:last_login "2024-01-01"}})
        (let [updated (t2/select-one :model/AuthIdentity :id auth-identity-id)]
          (is (= original-hash (get-in updated [:credentials :password_hash]))
              "Password hash should remain unchanged")
          (is (= original-salt (get-in updated [:credentials :password_salt]))
              "Password salt should remain unchanged"))))))

(deftest sso-provider-not-affected-by-password-hashing-test
  (testing "Non-password providers are not affected by password hashing"
    (mt/with-temp [:model/User {user-id :id}]
      (let [auth-identity (t2/insert-returning-instance!
                           :model/AuthIdentity
                           {:user_id user-id
                            :provider "google"
                            :metadata {:email "test@example.com"}})]
        (is (= "test@example.com" (get-in auth-identity [:metadata :email]))
            "Metadata should be preserved without modification")))))

(deftest sso-provider-updates-unaffected-test
  (testing "SSO provider updates are not affected"
    (mt/with-temp [:model/User {user-id :id}]
      (let [auth-identity (t2/insert-returning-instance!
                           :model/AuthIdentity
                           {:user_id user-id
                            :provider "google"
                            :metadata {:email "old@example.com"}})
            auth-identity-id (:id auth-identity)]
        (t2/update! :model/AuthIdentity auth-identity-id
                    {:metadata {:email "new@example.com"}})
        (let [updated (t2/select-one :model/AuthIdentity :id auth-identity-id)]
          (is (= "new@example.com" (get-in updated [:metadata :email]))
              "Metadata should be updated correctly"))))))

(deftest password-salt-uniqueness-test
  (testing "Each password hash uses a unique salt"
    (mt/with-temp [:model/User user-1 {}
                   :model/User user-2 {}]
      (let [auth-1 (t2/select-one :model/AuthIdentity :user_id (:id user-1) :provider "password")
            auth-2 (t2/select-one :model/AuthIdentity :user_id (:id user-2) :provider "password")]
        (is (not= (get-in auth-1 [:credentials :password_salt])
                  (get-in auth-2 [:credentials :password_salt]))
            "Salts should be different")
        (is (not= (get-in auth-1 [:credentials :password_hash])
                  (get-in auth-2 [:credentials :password_hash]))
            "Hashes should be different due to different salts")))))

(deftest password-auth-identity-syncs-to-user-table-test
  (testing "Password AuthIdentity automatically syncs to User table on creation"
    (mt/with-temp [:model/User {user-id :id}]
      (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")
            {:keys [password_hash password_salt]} (:credentials auth-identity)
            user (t2/select-one [:model/User :password :password_salt] :id user-id)]
        (is (= password_hash (:password user))
            "User table should contain matching password hash")
        (is (= password_salt (:password_salt user))
            "User table should contain matching password salt")))))

(deftest non-password-providers-dont-sync-to-user-table-test
  (testing "Non-password providers don't sync to User table"
    (mt/with-temp [:model/User {user-id :id}]
      (let [password-auth (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")
            original-password (get-in password-auth [:credentials :password_hash])
            original-salt (get-in password-auth [:credentials :password_salt])]
        (t2/insert-returning-instance!
         :model/AuthIdentity
         {:user_id user-id
          :provider "google"
          :metadata {:email "test@example.com"}})
        (let [user (t2/select-one [:model/User :password :password_salt] :id user-id)]
          (is (= original-password (:password user))
              "User password should remain unchanged after SSO AuthIdentity creation")
          (is (= original-salt (:password_salt user))
              "User password salt should remain unchanged after SSO AuthIdentity creation"))))))

(deftest password-update-syncs-to-user-table-test
  (testing "Password update syncs to User table"
    (mt/with-temp [:model/User {user-id :id}]
      (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")
            auth-identity-id (:id auth-identity)
            new-password "new-password-456"]
        (t2/update! :model/AuthIdentity auth-identity-id
                    {:credentials {:plaintext_password new-password}})
        (let [updated-auth (t2/select-one :model/AuthIdentity :id auth-identity-id)
              {:keys [password_hash password_salt]} (:credentials updated-auth)
              user (t2/select-one [:model/User :password :password_salt] :id user-id)]
          (is (= password_hash (:password user))
              "User table should be updated with new password hash")
          (is (= password_salt (:password_salt user))
              "User table should be updated with new password salt")
          (is (true? (u.password/verify-password new-password (:password_salt user) (:password user)))
              "New password in User table should be verifiable"))))))

(deftest non-credential-updates-dont-trigger-sync-test
  (testing "Non-credential updates don't trigger sync to User table"
    (mt/with-temp [:model/User {user-id :id}]
      (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")
            auth-identity-id (:id auth-identity)
            original-user (t2/select-one [:model/User :password :password_salt] :id user-id)]
        (t2/update! :model/AuthIdentity auth-identity-id
                    {:metadata {:last_login "2024-01-01"}})
        (let [user (t2/select-one [:model/User :password :password_salt] :id user-id)]
          (is (= (:password original-user) (:password user))
              "User password should remain unchanged after metadata update")
          (is (= (:password_salt original-user) (:password_salt user))
              "User password salt should remain unchanged after metadata update"))))))

(deftest sso-provider-updates-dont-sync-to-user-table-test
  (testing "SSO provider updates don't sync to User table"
    (mt/with-temp [:model/User {user-id :id}]
      (let [password-auth (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")
            original-password (get-in password-auth [:credentials :password_hash])
            original-salt (get-in password-auth [:credentials :password_salt])
            sso-auth-identity (t2/insert-returning-instance!
                               :model/AuthIdentity
                               {:user_id user-id
                                :provider "google"
                                :metadata {:email "old@example.com"}})
            sso-auth-identity-id (:id sso-auth-identity)]
        (t2/update! :model/AuthIdentity sso-auth-identity-id
                    {:metadata {:email "new@example.com"}})
        (let [user (t2/select-one [:model/User :password :password_salt] :id user-id)]
          (is (= original-password (:password user))
              "User password should remain unchanged after SSO metadata update")
          (is (= original-salt (:password_salt user))
              "User password salt should remain unchanged after SSO metadata update"))))))

(deftest auth-identity-user-consistency-test
  (testing "AuthIdentity and User table remain consistent"
    (mt/with-temp [:model/User {user-id :id}]
      (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")
            auth-creds (:credentials auth-identity)
            user (t2/select-one [:model/User :password :password_salt] :id user-id)]
        (is (= (:password_hash auth-creds) (:password user))
            "Password hash should match between AuthIdentity and User")
        (is (= (:password_salt auth-creds) (:password_salt user))
            "Password salt should match between AuthIdentity and User")))))
