(ns metabase.sso.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.sso.ldap :as ldap]
   [metabase.sso.ldap-test-util :as ldap.test]
   [metabase.sso.settings :as sso.settings]
   [metabase.test :as mt]))

(deftest ldap-enabled-test
  (ldap.test/with-ldap-server!
    (testing "`ldap-enabled` setting validates currently saved LDAP settings"
      (mt/with-temporary-setting-values [ldap-enabled false]
        (with-redefs [ldap/test-current-ldap-details (constantly {:status :ERROR :message "test error"})]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                #"Unable to connect to LDAP server"
                                (sso.settings/ldap-enabled! true))))
        (with-redefs [ldap/test-current-ldap-details (constantly {:status :SUCCESS})]
          (sso.settings/ldap-enabled! true)
          (is (sso.settings/ldap-enabled))

          (sso.settings/ldap-enabled! false)
          (is (not (sso.settings/ldap-enabled))))))))

(deftest ^:parallel send-new-sso-user-admin-email?-test
  (is ((some-fn nil? boolean?) (sso.settings/send-new-sso-user-admin-email?))
      "Make sure this Setting returns a boolean, not some other type of value. (It was returning a function before I fixed it.)"))
