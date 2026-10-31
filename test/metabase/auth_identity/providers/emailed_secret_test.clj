(ns metabase.auth-identity.providers.emailed-secret-test
  "Tests for emailed_secret provider functionality."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.auth-identity.providers.emailed-secret :as emailed-secret]
   [metabase.test :as mt]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(deftest authenticate-runs-one-bcrypt-check-for-every-token-test
  (testing "authenticate checks bcrypt once for every token, so timing does not show which users have a pending reset"
    (mt/with-temp [:model/User {pending-id :id} {}
                   :model/User {expired-id :id} {}
                   :model/User {idle-id :id} {}]
      (let [valid-token (emailed-secret/create-password-reset! pending-id)
            _           (emailed-secret/create-password-reset! expired-id)
            expired-ai  (t2/select-one :model/AuthIdentity :user_id expired-id :provider "emailed-secret-password-reset")
            _           (t2/update! :model/AuthIdentity :id (:id expired-ai)
                                    {:credentials (assoc (:credentials expired-ai) :expires_at (t/minus (t/instant) (t/days 1)))})
            checks      (atom 0)
            bcrypt      u.password/bcrypt-verify]
        (mt/with-dynamic-fn-redefs [u.password/bcrypt-verify (fn [token hash] (swap! checks inc) (bcrypt token hash))]
          (doseq [[label token success?] [["malformed"          "not-a-token"                      false]
                                          ["no pending reset"   (str idle-id "_" (random-uuid))    false]
                                          ["wrong secret"       (str pending-id "_" (random-uuid)) false]
                                          ["expired"            (str expired-id "_" (random-uuid)) false]
                                          ["valid"              valid-token                        true]]]
            (testing label
              (reset! checks 0)
              (is (= success?
                     (:success? (auth-identity/authenticate :provider/emailed-secret-password-reset {:token token}))))
              (is (= 1 @checks)))))))))
