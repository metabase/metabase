(ns metabase.api.ldap-test
  (:require [clojure.set :as set]
            [clojure.test :refer :all]
            [metabase.api.ldap :as api.ldap]
            [metabase.integrations.ldap :as ldap]
            [metabase.models.setting :as setting]
            [metabase.test :as mt]
            [metabase.test.integrations.ldap :as ldap.test]))

(defn ldap-test-details
  []
  (-> (ldap.test/get-ldap-details)
      (set/rename-keys (set/map-invert @#'api.ldap/mb-settings->ldap-details))
      #_(assoc :ldap-enabled true)))

(comment
  (ldap.test/with-ldap-server (Integer. (ldap.test/get-ldap-port)))
  )

(deftest ldap-settings-test
  (testing "PUT /api/ldap/settings"
    (ldap.test/with-ldap-server
      (testing "Valid LDAP settings can be saved via an API call"
        (mt/user-http-request :crowberto :put 200 "ldap/settings" (ldap-test-details)))

      (testing "Invalid LDAP settings return a server error"
        (mt/user-http-request :crowberto :put 500 "ldap/settings"
                              (assoc (ldap-test-details) :ldap-password "wrong-password")))

      (testing "Invalid LDAP settings cannot be saved"
        (mt/user-http-request :crowberto :put 500 "ldap/settings"
                              (assoc (ldap-test-details) :ldap-password "wrong-password"))
        (mt/user-http-request :crowberto :put 500 "ldap/settings"
                              (assoc (ldap-test-details) :ldap-user-base nil))
        (mt/user-http-request :crowberto :put 500 "ldap/settings"
                              (update (ldap-test-details) :ldap-port dec)))

      (testing "Valid LDAP settings can still be saved if port is a integer (#18936)"
        (mt/user-http-request :crowberto :put 200 "ldap/settings"
                              (assoc (ldap-test-details)
                                     :ldap-port (Integer. (ldap.test/get-ldap-port)))))

      (testing "Could update with obfuscated password"
        (mt/user-http-request :crowberto :put 200 "ldap/settings"
                              (update (ldap-test-details) :ldap-password #(setting/obfuscate-value %))))

      (testing "Requires superusers"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ldap/settings"
                                     (assoc (ldap-test-details) :ldap-port "" :ldap-enabled false))))))))
