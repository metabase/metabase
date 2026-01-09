(ns metabase.auth-identity.providers.emailed-secret-test
  "Tests for emailed_secret provider functionality and AuthIdentity to User sync."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.auth-identity.providers.emailed-secret :as emailed-secret]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest auth-identity-to-user-sync-test
  (testing "When reset token is created in AuthIdentity, it syncs to User model"
    (mt/with-temp [:model/User {user-id :id} {}]
      (emailed-secret/create-password-reset! user-id)
      (let [auth-identity (t2/select-one :model/AuthIdentity
                                         :user_id user-id
                                         :provider "emailed-secret-password-reset")
            user (t2/select-one [:model/User :reset_token :reset_triggered] :id user-id)]
        (is (some? auth-identity))
        (is (= (get-in auth-identity [:credentials :token_hash]) (:reset_token user)))
        (is (int? (:reset_triggered user)))
        (is (pos? (:reset_triggered user)))))))

(deftest auth-identity-token-update-sync-test
  (testing "When reset token is updated in AuthIdentity, it syncs to User model"
    (mt/with-temp [:model/User {user-id :id} {}]
      (emailed-secret/create-password-reset! user-id)
      (let [first-auth-identity (t2/select-one :model/AuthIdentity
                                               :user_id user-id
                                               :provider "emailed-secret-password-reset")
            first-token-hash (get-in first-auth-identity [:credentials :token_hash])]
        (Thread/sleep 10)
        (emailed-secret/create-password-reset! user-id)
        (let [updated-auth-identity (t2/select-one :model/AuthIdentity
                                                   :user_id user-id
                                                   :provider "emailed-secret-password-reset")
              updated-token-hash (get-in updated-auth-identity [:credentials :token_hash])
              user (t2/select-one [:model/User :reset_token :reset_triggered] :id user-id)]
          (is (not= first-token-hash updated-token-hash))
          (is (= updated-token-hash (:reset_token user)))
          (is (int? (:reset_triggered user))))))))

(deftest auth-identity-token-consumed-sync-test
  (testing "When token is marked consumed in AuthIdentity, User model is cleared"
    (mt/with-temp [:model/User {user-id :id} {}]
      (emailed-secret/create-password-reset! user-id)
      (let [auth-identity (t2/select-one :model/AuthIdentity
                                         :user_id user-id
                                         :provider "emailed-secret-password-reset")]
        (is (some? (:reset_token (t2/select-one [:model/User :reset_token] :id user-id))))
        (t2/update! :model/AuthIdentity (:id auth-identity)
                    {:credentials (assoc (:credentials auth-identity) :consumed_at (t/instant))})
        (let [user (t2/select-one [:model/User :reset_token :reset_triggered] :id user-id)]
          (is (nil? (:reset_token user)))
          (is (nil? (:reset_triggered user))))))))

(deftest create-password-reset-creates-auth-identity-test
  (testing "create-password-reset! creates AuthIdentity with correct structure"
    (mt/with-temp [:model/User {user-id :id email :email} {}]
      (emailed-secret/create-password-reset! user-id)
      (let [auth-identity (t2/select-one :model/AuthIdentity
                                         :user_id user-id
                                         :provider "emailed-secret-password-reset")]
        (is (some? auth-identity))
        (is (= "emailed-secret-password-reset" (:provider auth-identity)))
        (is (= user-id (:user_id auth-identity)))
        (is (contains? (:credentials auth-identity) :token_hash))
        (is (contains? (:credentials auth-identity) :expires_at))
        (is (nil? (get-in auth-identity [:credentials :consumed_at])))
        (is (= email (get-in auth-identity [:metadata :email])))))))

(deftest create-password-reset-updates-existing-auth-identity-test
  (testing "create-password-reset! updates existing AuthIdentity instead of creating duplicate"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [first-token (emailed-secret/create-password-reset! user-id)
            first-auth-identity (t2/select-one :model/AuthIdentity
                                               :user_id user-id
                                               :provider "emailed-secret-password-reset")
            second-token (emailed-secret/create-password-reset! user-id)
            auth-identities (t2/select :model/AuthIdentity
                                       :user_id user-id
                                       :provider "emailed-secret-password-reset")]
        (is (= 1 (count auth-identities)))
        (is (not= first-token second-token))
        (is (= (:id first-auth-identity) (:id (first auth-identities))))))))

(deftest create-password-reset-token-format-test
  (testing "create-password-reset! returns token in expected format"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [token (emailed-secret/create-password-reset! user-id)]
        (is (string? token))
        (is (re-matches (re-pattern (str user-id "_.+")) token))))))

(deftest create-password-reset-token-has-expiration-test
  (testing "create-password-reset! creates token with future expiration"
    (mt/with-temp [:model/User {user-id :id} {}]
      (let [before-create (t/instant)]
        (emailed-secret/create-password-reset! user-id)
        (let [auth-identity (t2/select-one :model/AuthIdentity
                                           :user_id user-id
                                           :provider "emailed-secret-password-reset")
              expires-at (get-in auth-identity [:credentials :expires_at])]
          (is (inst? expires-at))
          (is (t/after? expires-at before-create)))))))
