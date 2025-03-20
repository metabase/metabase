(ns metabase.api.ldap-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.api.ldap :as api.ldap]
   [metabase.integrations.ldap :as ldap]
   [metabase.models.setting :as setting]
   [metabase.test :as mt]
   [metabase.test.integrations.ldap :as ldap.test]))

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
        (is (= {:errors {:ldap-password "Password was incorrect"}}
               (mt/user-http-request :crowberto :put 500 "ldap/settings"
                                     (assoc (ldap-test-details) :ldap-password "wrong-password")))))

      (testing "Unreachable port setting returns a server error"
        (is (= {:errors {:ldap-host "Wrong host or port"
                         :ldap-port "Wrong host or port"}}
               (mt/user-http-request :crowberto :put 500 "ldap/settings"
                                     (assoc (ldap-test-details) :ldap-port 5299)))))

      (testing "LDAP settings that don't match the provided schema error"
        (is (= {:specific-errors {:ldap-enabled ["should be a boolean, received: 0"]}
                :errors {:ldap-enabled "nullable boolean"}}
               (mt/user-http-request :crowberto :put 400 "ldap/settings"
                                     (assoc (ldap-test-details) :ldap-enabled 0))))
        (is (= {:specific-errors {:ldap-host ["should be a string, received: 0"]}
                :errors {:ldap-host "nullable string"}}
               (mt/user-http-request :crowberto :put 400 "ldap/settings"
                                     (assoc (ldap-test-details) :ldap-host 0))))
        (is (= {:specific-errors {:ldap-password ["should be a string, received: 0"]}
                :errors {:ldap-password "nullable string"}}
               (mt/user-http-request :crowberto :put 400 "ldap/settings"
                                     (assoc (ldap-test-details) :ldap-password 0))))
        (is (= {:specific-errors {:ldap-port ["should be a positive int, received: 0"]}
                :errors {:ldap-port "nullable integer greater than 0"}}
               (mt/user-http-request :crowberto :put 400 "ldap/settings"
                                     (assoc (ldap-test-details) :ldap-port "0")))))

      (testing "Valid LDAP settings can still be saved if port is a integer (#18936)"
        (mt/user-http-request :crowberto :put 200 "ldap/settings"
                              (assoc (ldap-test-details)
                                     :ldap-port (Integer. (ldap.test/get-ldap-port)))))

      (testing "Passing ldap-enabled=false will disable LDAP"
        (mt/user-http-request :crowberto :put 200 "ldap/settings" (ldap-test-details false))
        (is (not (api.ldap/ldap-enabled))))

      (testing "Passing ldap-enabled=false still validates the LDAP settings"
        (mt/user-http-request :crowberto :put 500 "ldap/settings"
                              (assoc (ldap-test-details false) :ldap-password "wrong-password")))

      (with-redefs [ldap/test-ldap-connection (constantly {:status :SUCCESS})]
        (testing "LDAP port is saved as default value if passed as an empty string (#18936)"
          (is (= true
                 (mt/user-http-request :crowberto :put 200 "ldap/settings"
                                       (assoc (ldap-test-details) :ldap-port ""))))
          (is (= 389 (ldap/ldap-port)))))

      (testing "Could update with obfuscated password"
        (mt/user-http-request :crowberto :put 200 "ldap/settings"
                              (update (ldap-test-details) :ldap-password setting/obfuscate-value)))

      (testing "Requires superusers"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ldap/settings"
                                     (assoc (ldap-test-details) :ldap-port "" :ldap-enabled false))))))))

(deftest ldap-enabled-test
  (ldap.test/with-ldap-server!
    (testing "`ldap-enabled` setting validates currently saved LDAP settings"
      (mt/with-temporary-setting-values [ldap-enabled false]
        (with-redefs [ldap/test-current-ldap-details (constantly {:status :ERROR :message "test error"})]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                #"Unable to connect to LDAP server"
                                (api.ldap/ldap-enabled! true))))
        (with-redefs [ldap/test-current-ldap-details (constantly {:status :SUCCESS})]
          (api.ldap/ldap-enabled! true)
          (is (api.ldap/ldap-enabled))

          (api.ldap/ldap-enabled! false)
          (is (not (api.ldap/ldap-enabled))))))))
