(ns metabase.auth-identity.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.auth-identity.db :as auth-identity.db]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(deftest operator-shaped-provider-is-not-structure-test
  (testing "GHY-4590: with schema enforcement off, as in prod, an operator form passed as `provider` must not
            become SQL structure. Unbound, `[:like \"%\"]` compiled to `provider LIKE '%'` and matched every
            provider."
    (mt/with-temp [:model/User         {user-id :id} {}
                   :model/AuthIdentity _             {:user_id user-id :provider "google"}]
      (mu/disable-enforcement
        (doseq [[fn-name f] {"auth-identity"          auth-identity.db/auth-identity
                             "auth-identity-id"       auth-identity.db/auth-identity-id
                             "auth-identity-expiry"   auth-identity.db/auth-identity-expiry
                             "auth-identity-exists?"  auth-identity.db/auth-identity-exists?
                             "delete-auth-identities!" auth-identity.db/delete-auth-identities!}]
          (testing fn-name
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Marked a whole operator form"
                                  (f user-id [:like "%"])))))
        (is (t2/exists? :model/AuthIdentity :user_id user-id :provider "google"))))))

(deftest lookups-filter-by-user-and-provider-test
  (mt/with-temp [:model/User         {user-id :id}  {}
                 :model/User         {other-id :id} {}
                 :model/AuthIdentity {ai-id :id}    {:user_id user-id :provider "google"}
                 :model/AuthIdentity _              {:user_id other-id :provider "google"}]
    (testing "a matching user and provider finds the identity"
      (is (= ai-id (:id (auth-identity.db/auth-identity user-id "google"))))
      (is (= ai-id (auth-identity.db/auth-identity-id user-id "google")))
      (is (= ai-id (:id (auth-identity.db/auth-identity-expiry user-id "google"))))
      (is (true? (auth-identity.db/auth-identity-exists? user-id "google"))))
    (testing "another provider matches nothing"
      (is (nil? (auth-identity.db/auth-identity user-id "password")))
      (is (nil? (auth-identity.db/auth-identity-id user-id "password")))
      (is (nil? (auth-identity.db/auth-identity-expiry user-id "password")))
      (is (false? (auth-identity.db/auth-identity-exists? user-id "password"))))
    (testing "a SQL-shaped provider is compared as a string, matching nothing"
      (is (false? (auth-identity.db/auth-identity-exists? user-id "google' OR '1'='1"))))
    (testing "delete removes only the given user's identity at the given provider"
      (is (= 0 (auth-identity.db/delete-auth-identities! user-id "password")))
      (is (= 1 (auth-identity.db/delete-auth-identities! user-id "google")))
      (is (t2/exists? :model/AuthIdentity :user_id other-id :provider "google")))
    (testing "an id-only lookup still finds the user"
      (is (true? (auth-identity.db/user-active? user-id))))))
