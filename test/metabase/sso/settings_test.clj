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

(deftest oidc-allowed-networks-is-sysadmin-only-test
  (testing "the network policy defends the host against Metabase admins, so only the environment sets it"
    (is (setting/sysadmin-only? :oidc-allowed-networks))
    (is (= :internal (:visibility (setting/resolve-setting :oidc-allowed-networks))))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"can only be set by the MB_OIDC_ALLOWED_NETWORKS environment variable"
                          (setting/set! :oidc-allowed-networks :allow-all))))
  (testing "a value that reached the application database some other way -- an older version's admin API -- is ignored"
    (mt/with-temporary-raw-setting-values [oidc-allowed-networks "external-only"]
      (mt/with-temp-env-var-value! [mb-oidc-allowed-networks nil]
        (is (= :allow-all (sso.settings/oidc-allowed-networks))))))
  (testing "the environment sets it"
    (mt/with-temp-env-var-value! [mb-oidc-allowed-networks "external-only"]
      (is (= :external-only (sso.settings/oidc-allowed-networks))))))
