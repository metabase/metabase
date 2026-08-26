(ns metabase.auth-identity.models.auth-identity-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.test :as mt]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(deftest set-password!-creates-password-auth-identity-test
  (testing "set-password! creates a password AuthIdentity with a hashed password, and User creation does not"
    (mt/with-temp [:model/User {user-id :id}]
      (is (nil? (t2/select-one :model/AuthIdentity :user_id user-id :provider "password"))
          "creating a User does not create a password AuthIdentity")
      (auth-identity/set-password! user-id "test-password-123")
      (let [auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")]
        (is (some? auth-identity))
        (is (some? (get-in auth-identity [:credentials :password_hash])))
        (is (some? (get-in auth-identity [:credentials :password_salt])))
        (is (nil? (get-in auth-identity [:credentials :plaintext_password])))))))

(deftest set-password!-invalidates-reset-token-test
  (testing "set-password! deletes the user's password-reset token, so a reset link can't be replayed once the password is set"
    (mt/with-temp [:model/User {user-id :id}]
      (auth-identity/create-password-reset! user-id)
      (is (some? (t2/select-one :model/AuthIdentity :user_id user-id :provider "emailed-secret-password-reset"))
          "sanity: a pending reset token exists")
      (auth-identity/set-password! user-id "new-password")
      (is (nil? (t2/select-one :model/AuthIdentity :user_id user-id :provider "emailed-secret-password-reset"))
          "setting a password removes the pending reset token"))))

(deftest set-password!-clears-stale-expiry-test
  (testing "a plain set-password! clears any :expires_at a prior support-access grant left on the credential"
    (mt/with-temp [:model/User {user-id :id}]
      (auth-identity/set-password! user-id "granted" {:expires-at (t/instant "2000-01-01T00:00:00Z")})
      (is (some? (t2/select-one-fn :expires_at :model/AuthIdentity :user_id user-id :provider "password"))
          "sanity: the grant set an expiry")
      (auth-identity/set-password! user-id "new-password")
      (is (nil? (t2/select-one-fn :expires_at :model/AuthIdentity :user_id user-id :provider "password"))
          "setting a password without an expiry clears the stale one"))))

(deftest plaintext-password-hashed-on-update-test
  (testing "Plaintext password is hashed on update"
    (mt/with-temp [:model/User {user-id :id}]
      (auth-identity/set-password! user-id "initial-password")
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
      (auth-identity/set-password! user-id "initial-password")
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
      (auth-identity/set-password! (:id user-1) "same-password")
      (auth-identity/set-password! (:id user-2) "same-password")
      (let [auth-1 (t2/select-one :model/AuthIdentity :user_id (:id user-1) :provider "password")
            auth-2 (t2/select-one :model/AuthIdentity :user_id (:id user-2) :provider "password")]
        (is (not= (get-in auth-1 [:credentials :password_salt])
                  (get-in auth-2 [:credentials :password_salt]))
            "Salts should be different")
        (is (not= (get-in auth-1 [:credentials :password_hash])
                  (get-in auth-2 [:credentials :password_hash]))
            "Hashes should be different due to different salts")))))

(deftest credentials-plaintext-rows-still-readable-test
  (testing "rows written before encryption (plain JSON in the column) still read as maps"
    (encryption-test/with-secret-key "key-for-auth-identity-test-2"
      (mt/with-temp [:model/User {user-id :id}]
        (t2/insert! :model/AuthIdentity {:user_id user-id :provider "google" :credentials {}})
        ;; simulate a legacy plaintext row by writing raw JSON straight to the table
        (t2/update! :auth_identity {:user_id user-id :provider "google"}
                    {:credentials "{\"secret\":\"legacy-plain\"}"})
        (is (= "legacy-plain"
               (get-in (t2/select-one :model/AuthIdentity :user_id user-id :provider "google")
                       [:credentials :secret])))))))
