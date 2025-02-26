(ns metabase.sso.api.ldap-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.models.setting :as setting]
   [metabase.sso.ldap :as ldap]
   [metabase.sso.ldap-test-util :as ldap.test]
   [metabase.sso.settings :as sso.settings]
   [metabase.test :as mt]))

(defn ldap-test-details
  ([] (ldap-test-details true))
  ([enabled?]
   (-> (ldap.test/get-ldap-details)
       (set/rename-keys (set/map-invert @#'ldap/mb-settings->ldap-details))
       (assoc :ldap-enabled enabled?))))

(deftest ldap-settings-test
  (testing "PUT /api/ldap/settings"
    (ldap.test/with-ldap-server!
      (testing "Valid LDAP settings can be saved via an API call"
        (mt/user-http-request :crowberto :put 200 "ldap/settings" (ldap-test-details)))

      (testing "Invalid LDAP settings return a server error"
        (mt/user-http-request :crowberto :put 500 "ldap/settings"
                              (assoc (ldap-test-details) :ldap-password "wrong-password")))

      (testing "Valid LDAP settings can still be saved if port is a integer (#18936)"
        (mt/user-http-request :crowberto :put 200 "ldap/settings"
                              (assoc (ldap-test-details)
                                     :ldap-port (Integer. (ldap.test/get-ldap-port)))))

      (testing "Passing ldap-enabled=false will disable LDAP"
        (mt/user-http-request :crowberto :put 200 "ldap/settings" (ldap-test-details false))
        (is (not (sso.settings/ldap-enabled))))

      (testing "Passing ldap-enabled=false still validates the LDAP settings"
        (mt/user-http-request :crowberto :put 500 "ldap/settings"
                              (assoc (ldap-test-details false) :ldap-password "wrong-password")))

      (with-redefs [ldap/test-ldap-connection (constantly {:status :SUCCESS})]
        (testing "LDAP port is saved as default value if passed as an empty string (#18936)"
          (is (= true
                 (mt/user-http-request :crowberto :put 200 "ldap/settings"
                                       (assoc (ldap-test-details) :ldap-port ""))))
          (is (= 389 (sso.settings/ldap-port)))))

      (testing "Could update with obfuscated password"
        (mt/user-http-request :crowberto :put 200 "ldap/settings"
                              (update (ldap-test-details) :ldap-password setting/obfuscate-value)))

      (testing "Requires superusers"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ldap/settings"
                                     (assoc (ldap-test-details) :ldap-port "" :ldap-enabled false))))))))
