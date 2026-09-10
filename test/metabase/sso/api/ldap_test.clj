(ns metabase.sso.api.ldap-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.settings.core :as setting]
   [metabase.sso.ldap :as ldap]
   [metabase.sso.ldap-test-util :as ldap.test]
   [metabase.sso.settings :as sso.settings]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
                                     :ldap-port (int (ldap.test/get-ldap-port)))))
      (testing "Passing ldap-enabled=false will disable LDAP"
        (mt/user-http-request :crowberto :put 200 "ldap/settings" (ldap-test-details false))
        (is (not (sso.settings/ldap-enabled))))
      (testing "Passing ldap-enabled=false still validates the LDAP settings"
        (mt/user-http-request :crowberto :put 500 "ldap/settings"
                              (assoc (ldap-test-details false) :ldap-password "wrong-password")))
      (mt/with-dynamic-fn-redefs [ldap/test-ldap-connection (constantly {:status :SUCCESS})]
        (testing "LDAP port is saved as default value if passed as an empty string (#18936)"
          (is (true?
               (mt/user-http-request :crowberto :put 200 "ldap/settings"
                                     (assoc (ldap-test-details) :ldap-port ""))))
          (is (= 389 (sso.settings/ldap-port)))))
      (testing "Could update with obfuscated password"
        ;; the block above left the port at its default; put the real settings back first, because reusing the stored
        ;; password is only legitimate while the audience is unchanged
        (mt/user-http-request :crowberto :put 200 "ldap/settings" (ldap-test-details))
        (mt/user-http-request :crowberto :put 200 "ldap/settings"
                              (update (ldap-test-details) :ldap-password setting/obfuscate-value)))
      (testing "...but not while also moving the server, which is what would deliver the stored password to it"
        (is (= "This secret is not bound to the requested audience."
               (:message (mt/user-http-request :crowberto :put 400 "ldap/settings"
                                               (-> (ldap-test-details)
                                                   (assoc :ldap-host "elsewhere.example.com")
                                                   (update :ldap-password setting/obfuscate-value)))))))
      (testing "Requires superusers"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ldap/settings"
                                     (assoc (ldap-test-details) :ldap-port "" :ldap-enabled false))))))))

(deftest ldap-settings-reset-test
  (testing "PUT /api/ldap/settings clearing the settings disables LDAP and clears the host"
    (ldap.test/with-ldap-server!
      (mt/user-http-request :crowberto :put 200 "ldap/settings" (ldap-test-details))
      (is (sso.settings/ldap-enabled))
      (mt/with-dynamic-fn-redefs [ldap/test-ldap-connection (constantly {:status :SUCCESS})]
        (mt/user-http-request :crowberto :put 200 "ldap/settings" {:ldap-host nil :ldap-enabled false}))
      (is (not (sso.settings/ldap-enabled)))
      (is (nil? (sso.settings/ldap-host))))))

(deftest ldap-host-change-requires-the-bind-password-again-test
  (testing "moving the directory server, or weakening the channel to it, while the stored bind password would be
           reused is refused (SEC: credential redirection). The stored password is a bound Secret, so the refusal
           comes from opening it to the new destination, before the connection test would have bound with it."
    (mt/with-temporary-setting-values [ldap-host     "ldap.example.com"
                                       ldap-port     636
                                       ldap-security "ssl"
                                       ldap-password "bind-secret"]
      (let [attempted (atom [])]
        (with-redefs [ldap/test-ldap-connection (fn [details]
                                                  ;; the real sink: building the options is where the stored Secret is opened
                                                  (#'ldap/details->ldap-options details)
                                                  (swap! attempted conj details)
                                                  {:status :SUCCESS})]
          (testing "a new host with the mask echoed back"
            (let [resp (mt/user-http-request :crowberto :put 400 "ldap/settings"
                                             {:ldap-host     "evil.example.com"
                                              :ldap-password (setting/obfuscate-value "bind-secret")})]
              (is (= "secret-audience-mismatch" (:error-code resp)))
              (is (= [] @attempted) "no bind was attempted, so the password never left")))
          (testing "same host, weaker channel -- the downgrade case"
            (reset! attempted [])
            (let [resp (mt/user-http-request :crowberto :put 400 "ldap/settings"
                                             {:ldap-security "none"
                                              :ldap-port     389
                                              :ldap-password (setting/obfuscate-value "bind-secret")})]
              (is (= "secret-audience-mismatch" (:error-code resp)))
              (is (= [] @attempted))))
          (testing "the stored password and host are untouched"
            (is (= "bind-secret" (mt/plaintext (sso.settings/ldap-password))))
            (is (= "ldap.example.com" (sso.settings/ldap-host))))
          (testing "supplying a fresh password authorizes the move"
            (reset! attempted [])
            (mt/user-http-request :crowberto :put 200 "ldap/settings"
                                  {:ldap-host "new.example.com" :ldap-password "brand-new"})
            (is (= 1 (count @attempted)))
            (is (= "brand-new" (:password (first @attempted))))
            (is (= "new.example.com" (sso.settings/ldap-host)))
            (is (= "brand-new" (mt/plaintext (sso.settings/ldap-password)))))
          (testing "omitting the password clears it rather than reusing it: the bind is attempted with none, and the
                   stored one never leaves"
            (reset! attempted [])
            (mt/user-http-request :crowberto :put 200 "ldap/settings"
                                  {:ldap-host "other.example.com"})
            (is (= [nil] (map :password @attempted)))
            (is (nil? (sso.settings/ldap-password)))))))))

(deftest ldap-trust-store-change-requires-the-bind-password-again-test
  (testing "the trust store is part of the bind password's audience. It is not on the LDAP settings form, so a change
           arrives through the generic settings endpoint and is caught by the write-time guard instead"
    (mt/with-temporary-setting-values [ldap-host        "ldap.example.com"
                                       ldap-port        636
                                       ldap-security    "ssl"
                                       ldap-trust-store "/etc/metabase/ldap.jks"
                                       ldap-password    "bind-secret"]
      (let [resp (mt/user-http-request :crowberto :put 400 "setting/ldap-trust-store"
                                       {:value "/etc/metabase/other.jks"})]
        (is (= "setting-audience-change-requires-secret" (:error-code resp)))
        (is (= "/etc/metabase/ldap.jks" (sso.settings/ldap-trust-store)))))))

(deftest echoed-mask-does-not-rewrite-the-stored-bind-password-test
  (testing "reusing the stored bind password writes nothing back, so the audit log records no change"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temporary-setting-values [ldap-host     "ldap.example.com"
                                         ldap-port     636
                                         ldap-security "ssl"
                                         ldap-password "bind-secret"]
        (with-redefs [ldap/test-ldap-connection (fn [details]
                                                  (#'ldap/details->ldap-options details)
                                                  {:status :SUCCESS})]
          (let [audit-events #(count (filter (fn [e] (= "ldap-password" (get-in e [:details :key])))
                                             (t2/select :model/AuditLog :topic :setting-update)))
                before       (audit-events)]
            (mt/user-http-request :crowberto :put 200 "ldap/settings"
                                  {:ldap-host     "ldap.example.com"
                                   :ldap-port     636
                                   :ldap-security "ssl"
                                   :ldap-password (setting/obfuscate-value "bind-secret")})
            (is (= before (audit-events)))
            (is (= "bind-secret" (mt/plaintext (sso.settings/ldap-password))))))))))
