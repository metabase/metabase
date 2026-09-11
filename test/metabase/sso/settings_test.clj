(ns metabase.sso.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.settings.core :as setting]
   [metabase.sso.ldap :as ldap]
   [metabase.sso.ldap-test-util :as ldap.test]
   [metabase.sso.settings :as sso.settings]
   [metabase.test :as mt]))

(deftest ldap-enabled-test
  (ldap.test/with-ldap-server!
    (testing "`ldap-enabled` setting validates currently saved LDAP settings"
      (mt/with-temporary-setting-values [ldap-enabled false]
        (mt/with-dynamic-fn-redefs [ldap/test-current-ldap-details (constantly {:status :ERROR :message "test error"})]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                #"Unable to connect to LDAP server"
                                (sso.settings/ldap-enabled! true))))
        (mt/with-dynamic-fn-redefs [ldap/test-current-ldap-details (constantly {:status :SUCCESS})]
          (sso.settings/ldap-enabled! true)
          (is (sso.settings/ldap-enabled))
          (sso.settings/ldap-enabled! false)
          (is (not (sso.settings/ldap-enabled))))))))

(deftest ^:parallel send-new-sso-user-admin-email?-test
  (is ((some-fn nil? boolean?) (sso.settings/send-new-sso-user-admin-email?))
      "Make sure this Setting returns a boolean, not some other type of value. (It was returning a function before I fixed it.)"))

(deftest ldap-group-mappings-invalid-dn-test
  (testing "a mapping keyed by something other than a DN is a bad request that names the key and shows an example"
    (let [before (sso.settings/ldap-group-mappings)]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"^qwf is not a valid DN\. Example: cn=people,ou=groups,dc=example,dc=org$"
                            (sso.settings/ldap-group-mappings! {"qwf" [1]})))
      (is (= "qwf is not a valid DN. Example: cn=people,ou=groups,dc=example,dc=org"
             (mt/user-http-request :crowberto :put 400 "setting" {:ldap-group-mappings {"qwf" [1]}})))
      (testing "the rejected write left the stored mappings alone"
        (is (= before (sso.settings/ldap-group-mappings)))))))

(deftest ldap-attribute-defaults-read-as-unset-test
  (testing "an attribute left at its default reports no value, even though its getter lower-cases it"
    (mt/with-temporary-setting-values [ldap-attribute-email     nil
                                       ldap-attribute-firstname nil
                                       ldap-attribute-lastname  nil]
      (doseq [k [:ldap-attribute-email :ldap-attribute-firstname :ldap-attribute-lastname]]
        (testing k
          (is (nil? (setting/user-facing-value k))))))))
