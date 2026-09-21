(ns metabase.sso.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.settings.core :as setting]
   [metabase.sso.ldap :as ldap]
   [metabase.sso.ldap-test-util :as ldap.test]
   [metabase.sso.settings :as sso.settings]
   [metabase.startup.core :as startup]
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

(deftest oidc-allowed-networks-is-environment-only-test
  (testing "the policy is read from the environment only: a value that reached the setting table -- an older
           version's admin API, a serialization import, a direct write -- is ignored, not trusted"
    (mt/with-temp-env-var-value! [mb-oidc-allowed-networks nil]
      (mt/with-temporary-raw-setting-values [oidc-allowed-networks "external-only"]
        (is (= :allow-all (sso.settings/oidc-allowed-networks))))))
  (testing "and the environment still wins over a stored value"
    (mt/with-temp-env-var-value! [mb-oidc-allowed-networks "external-only"]
      (mt/with-temporary-raw-setting-values [oidc-allowed-networks "allow-all"]
        (is (= :external-only (sso.settings/oidc-allowed-networks))))))
  (testing "an unrecognized policy is refused outright"
    (mt/with-temp-env-var-value! [mb-oidc-allowed-networks "allow-everything"]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid MB_OIDC_ALLOWED_NETWORKS"
                            (sso.settings/oidc-allowed-networks)))))
  (testing "nothing can write it: it is a read-only Setting"
    (is (thrown-with-msg? UnsupportedOperationException
                          #"read-only setting"
                          (setting/set! :oidc-allowed-networks :allow-all)))))

(deftest oidc-allowed-networks-startup-validation-test
  (testing "a policy the environment names but Metabase does not recognize stops the boot, rather than waiting
           for the first login to discover it"
    (mt/with-temp-env-var-value! [mb-oidc-allowed-networks "allow-everything"]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid MB_OIDC_ALLOWED_NETWORKS"
                            (startup/def-startup-validation! ::sso.settings/oidc-allowed-networks)))))
  (testing "a policy it does recognize lets the boot continue"
    (mt/with-temp-env-var-value! [mb-oidc-allowed-networks "external-only"]
      (is (= :external-only
             (startup/def-startup-validation! ::sso.settings/oidc-allowed-networks))))))
