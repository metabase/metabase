(ns metabase.auth-identity.core-test
  "Integration tests for the AuthIdentity system."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Model Tests --------------------------------------------------

(deftest auth-identity-model-test
  (testing "AuthIdentity model basic operations"
    (mt/with-temp [:model/User user {}]
      (testing "can create an AuthIdentity"
        (mt/with-model-cleanup [:model/AuthIdentity]
          ;; Use google provider to avoid conflict with auto-created password AuthIdentity
          (let [auth-identity (t2/insert-returning-instance! :model/AuthIdentity
                                                             {:user_id (:id user)
                                                              :provider "google"
                                                              :metadata {:email "test@example.com"}})]
            (is (some? auth-identity))
            (is (= (:id user) (:user_id auth-identity)))
            (is (= "google" (:provider auth-identity)))
            (is (= {:email "test@example.com"}
                   (:metadata auth-identity))))))
      (testing "can update an AuthIdentity"
        ;; Use the auto-created password AuthIdentity
        (let [auth-identity (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "password")]
          (t2/update! :model/AuthIdentity (:id auth-identity)
                      {:credentials {:password_hash "new_hash"
                                     :password_salt "new_salt"}})
          (let [updated (t2/select-one :model/AuthIdentity :id (:id auth-identity))]
            (is (= {:password_hash "new_hash" :password_salt "new_salt"}
                   (:credentials updated))))))
      (testing "can delete an AuthIdentity"
        ;; Create a google AuthIdentity to delete (don't delete the password one)
        (mt/with-temp [:model/AuthIdentity auth-identity {:user_id (:id user)
                                                          :provider "google"}]
          (t2/delete! :model/AuthIdentity :id (:id auth-identity))
          (is (nil? (t2/select-one :model/AuthIdentity :id (:id auth-identity)))))))))

(deftest auth-identity-json-transform-test
  (testing "JSON transformation for credentials and metadata"
    (mt/with-temp [:model/User user {}
                   :model/AuthIdentity auth-identity {:user_id (:id user)
                                                      :provider "google"
                                                      :metadata {:sso_source "google"
                                                                 :login_attributes {:email "test@example.com"}}}]
      (let [fetched (t2/select-one :model/AuthIdentity :id (:id auth-identity))]
        (is (map? (:metadata fetched)))
        (is (= "google" (get-in fetched [:metadata :sso_source])))
        (is (= {:email "test@example.com"} (get-in fetched [:metadata :login_attributes])))))))

(deftest auth-identity-unique-constraint-test
  (testing "Cannot create duplicate AuthIdentity for same user and provider"
    (mt/with-model-cleanup [:model/AuthIdentity :model/User]
      (let [user-id (t2/insert-returning-pk! :model/User (mt/with-temp-defaults :model/User))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"duplicate|Duplicate|Unique"
             (t2/insert! :model/AuthIdentity
                         {:user_id user-id
                          :provider "password"
                          :credentials {:password_hash "different_hash" :password_salt "asdfasdf"}})))))))

;;; -------------------------------------------------- Multiple Providers Test --------------------------------------------------

(deftest multiple-providers-per-user-test
  (testing "A user can have multiple authentication providers"
    (mt/with-temp [:model/User user {}]
      ;; User already has password AuthIdentity from creation
      (let [password-auth (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "password")
            google-auth (t2/insert-returning-instance! :model/AuthIdentity
                                                       {:user_id (:id user)
                                                        :provider "google"
                                                        :metadata {:sso_source "google"}})
            ldap-auth (t2/insert-returning-instance! :model/AuthIdentity
                                                     {:user_id (:id user)
                                                      :provider "ldap"
                                                      :metadata {:login_attributes {:uid "testuser"}}})]
        (is (some? password-auth))
        (is (some? google-auth))
        (is (some? ldap-auth))
        (let [providers (t2/select :model/AuthIdentity :user_id (:id user))]
          (is (= 3 (count providers)))
          (is (= #{"password" "google" "ldap"} (set (map :provider providers)))))
        (is (some? (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "password")))
        (is (some? (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "google")))
        (is (some? (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "ldap")))
        (is (some? (:credentials password-auth)))
        (is (= {:sso_source "google"}
               (:metadata google-auth)))
        (is (= {:login_attributes {:uid "testuser"}}
               (:metadata ldap-auth)))))))
