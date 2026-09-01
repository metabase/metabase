(ns metabase.auth-identity.models.auth-identity-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(deftest set-password!-creates-password-auth-identity-test
  (testing "set-password! creates a password AuthIdentity with a hashed password, and User creation does not"
    (mt/with-temp [:model/User {user-id :id}]
      (is (nil? (t2/select-one :model/AuthIdentity 'user_id user-id 'provider "password"))
          "creating a User does not create a password AuthIdentity")
      (auth-identity/set-password! user-id "test-password-123")
      (let [auth-identity (t2/select-one :model/AuthIdentity 'user_id user-id 'provider "password")]
        (is (some? auth-identity))
        (is (some? (get-in auth-identity [:credentials :password_hash])))
        (is (some? (get-in auth-identity [:credentials :password_salt])))
        (is (nil? (get-in auth-identity [:credentials :plaintext_password])))))))

(deftest set-password!-invalidates-reset-token-test
  (testing "set-password! deletes the user's password-reset token, so a reset link can't be replayed once the password is set"
    (mt/with-temp [:model/User {user-id :id}]
      (auth-identity/create-password-reset! user-id)
      (is (some? (t2/select-one :model/AuthIdentity 'user_id user-id 'provider "emailed-secret-password-reset"))
          "sanity: a pending reset token exists")
      (auth-identity/set-password! user-id "new-password")
      (is (nil? (t2/select-one :model/AuthIdentity 'user_id user-id 'provider "emailed-secret-password-reset"))
          "setting a password removes the pending reset token"))))

(deftest set-password!-clears-stale-expiry-test
  (testing "a plain set-password! clears any :expires_at a prior support-access grant left on the credential"
    (mt/with-temp [:model/User {user-id :id}]
      (auth-identity/set-password! user-id "granted" {:expires-at (t/instant "2000-01-01T00:00:00Z")})
      (is (some? (t2/select-one-fn :expires_at :model/AuthIdentity 'user_id user-id 'provider "password"))
          "sanity: the grant set an expiry")
      (auth-identity/set-password! user-id "new-password")
      (is (nil? (t2/select-one-fn :expires_at :model/AuthIdentity 'user_id user-id 'provider "password"))
          "setting a password without an expiry clears the stale one"))))

(deftest plaintext-password-hashed-on-update-test
  (testing "Plaintext password is hashed on update"
    (mt/with-temp [:model/User {user-id :id}]
      (auth-identity/set-password! user-id "initial-password")
      (let [auth-identity (t2/select-one :model/AuthIdentity 'user_id user-id 'provider "password")
            auth-identity-id (:id auth-identity)
            new-password "new-password-456"]
        (t2/update! :model/AuthIdentity auth-identity-id
                    {:credentials {:plaintext_password new-password}})
        (let [updated (t2/select-one :model/AuthIdentity 'id auth-identity-id)
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
      (let [auth-identity (t2/select-one :model/AuthIdentity 'user_id user-id 'provider "password")
            auth-identity-id (:id auth-identity)
            original-hash (get-in auth-identity [:credentials :password_hash])
            original-salt (get-in auth-identity [:credentials :password_salt])]
        (t2/update! :model/AuthIdentity auth-identity-id
                    {:metadata {:last_login "2024-01-01"}})
        (let [updated (t2/select-one :model/AuthIdentity 'id auth-identity-id)]
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
        (let [updated (t2/select-one :model/AuthIdentity 'id auth-identity-id)]
          (is (= "new@example.com" (get-in updated [:metadata :email]))
              "Metadata should be updated correctly"))))))

(deftest password-salt-uniqueness-test
  (testing "Each password hash uses a unique salt"
    (mt/with-temp [:model/User user-1 {}
                   :model/User user-2 {}]
      (auth-identity/set-password! (:id user-1) "same-password")
      (auth-identity/set-password! (:id user-2) "same-password")
      (let [auth-1 (t2/select-one :model/AuthIdentity 'user_id (:id user-1) 'provider "password")
            auth-2 (t2/select-one :model/AuthIdentity 'user_id (:id user-2) 'provider "password")]
        (is (not= (get-in auth-1 [:credentials :password_salt])
                  (get-in auth-2 [:credentials :password_salt]))
            "Salts should be different")
        (is (not= (get-in auth-1 [:credentials :password_hash])
                  (get-in auth-2 [:credentials :password_hash]))
            "Hashes should be different due to different salts")))))

(deftest credentials-encrypted-at-rest-test
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (testing "with a secret key set, the raw credentials column is ciphertext, not JSON"
      (encryption-test/with-secret-key "key-for-auth-identity-test-1"
        (mt/with-temp [:model/User {user-id :id}]
          (t2/insert! :model/AuthIdentity {:user_id     user-id
                                           :provider    "google"
                                           :credentials {:secret "super-secret"}})
          (let [raw (t2/select-one-fn :credentials :auth_identity
                                      'user_id user-id 'provider "google")]
            (is (encryption/possibly-encrypted-string? raw)
                "Raw column value should be encrypted")
            (is (not (re-find #"super-secret" (str raw)))
                "Plaintext must not appear in the stored value"))
          (testing "and the model transform round-trips the plaintext map"
            (is (= "super-secret"
                   (get-in (t2/select-one :model/AuthIdentity 'user_id user-id 'provider "google")
                           [:credentials :secret])))))))))

(deftest credentials-reject-plaintext-when-key-set-test
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (testing "with a key set, encrypted credentials read back but a plaintext value written directly via SQL is rejected"
      (encryption-test/with-secret-key "key-for-auth-identity-test-2"
        (mt/with-temp [:model/User {user-id :id}]
          (t2/insert! :model/AuthIdentity {:user_id user-id :provider "google" :credentials {:secret "legit"}})
          (is (= "legit"
                 (get-in (t2/select-one :model/AuthIdentity 'user_id user-id 'provider "google")
                         [:credentials :secret])))
          (t2/update! :auth_identity {'user_id user-id 'provider "google"}
                      {:credentials "{\"secret\":\"injected\"}"})
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not encrypted"
                                (t2/select-one :model/AuthIdentity 'user_id user-id 'provider "google"))))))))

(deftest credentials-plaintext-allowed-without-key-test
  ;; isolated app DB: runs with an encryption key active, so nothing here may touch the shared test DB
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? false)
    (testing "with no key set there is nothing to sign with, so plaintext credentials read back as-is"
      (encryption-test/with-secret-key nil
        (mt/with-temp [:model/User {user-id :id}]
          (t2/insert! :model/AuthIdentity {:user_id user-id :provider "google" :credentials {}})
          (t2/update! :auth_identity {'user_id user-id 'provider "google"}
                      {:credentials "{\"secret\":\"plain\"}"})
          (is (= "plain"
                 (get-in (t2/select-one :model/AuthIdentity 'user_id user-id 'provider "google")
                         [:credentials :secret]))))))))
