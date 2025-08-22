(ns metabase.sso.ldap.default-implementation-test
  (:require
   [clojure.test :refer :all]
   [metabase.sso.ldap.default-implementation :as sut]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(deftest ldap-user-passwords-test
  (testing (str "LDAP users should not persist their passwords. Check that if somehow we get passed an LDAP user "
                "password, it gets swapped with something random")
    (mt/with-model-cleanup [:model/User]
      (sut/create-new-ldap-auth-user! {:email      "ldaptest@metabase.com"
                                       :first_name "Test"
                                       :last_name  "SomeLdapStuff"
                                       :password   "should be removed"})
      (let [{:keys [password password_salt]} (t2/select-one [:model/User :password :password_salt] :email "ldaptest@metabase.com")]
        (is (= false
               (u.password/verify-password "should be removed" password_salt password)))))))

(deftest ldap-sequential-login-attributes-test
  (testing "You should be able to create a new LDAP user if some `login_attributes` are vectors (#10291)"
    (mt/with-model-cleanup [:model/User]
      (sut/create-new-ldap-auth-user! {:email            "ldaptest@metabase.com"
                                       :first_name       "Test"
                                       :last_name        "SomeLdapStuff"
                                       :login_attributes {:local_birds ["Steller's Jay" "Mountain Chickadee"]}})
      (is (= {"local_birds" ["Steller's Jay" "Mountain Chickadee"]}
             (t2/select-one-fn :login_attributes :model/User :email "ldaptest@metabase.com"))))))

(deftest ldap-bad-email-test
  (testing "If the ldap server supplies an invalid email it should throw"
    (mt/with-model-cleanup [:model/User]
      ;; disable the schema enforcement since it doesn't happen in the real world
      (mu/disable-enforcement
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid email supplied by LDAP server"
                              (sut/create-new-ldap-auth-user! {:email            "ldaptest@metabase"
                                                               :first_name       "Test"
                                                               :last_name        "SomeLdapStuff"
                                                               :login_attributes {:local_birds ["Steller's Jay" "Mountain Chickadee"]}})))))))
