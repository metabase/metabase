(ns metabase.sso.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.sso.db :as sso.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest auth-identity-exists?-test
  (mt/with-temp [:model/User {user-id :id} {}
                 :model/AuthIdentity _ {:user_id user-id :provider "password" :provider_id "U123"
                                        :credentials {:password_hash "h" :password_salt "s"}}]
    (testing "the provider is compared as a value"
      (is (sso.db/auth-identity-exists? user-id "password"))
      (is (not (sso.db/auth-identity-exists? user-id "ldap"))))
    (testing "a provider that looks like SQL matches nothing rather than being compiled"
      (is (not (sso.db/auth-identity-exists? user-id "password' OR '1'='1"))))))
