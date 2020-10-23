(ns metabase.integrations.ldap-test
  (:require [clojure.test :refer :all]
            [metabase.integrations.ldap :as ldap]
            [metabase.integrations.ldap.default-implementation :as default-impl]
            [metabase.public-settings.metastore :as metastore]
            [metabase.test :as mt]
            [metabase.test.integrations.ldap :as ldap.test]))

(defn- get-ldap-details []
  {:host       "localhost"
   :port       (ldap.test/get-ldap-port)
   :bind-dn    "cn=Directory Manager"
   :password   "password"
   :security   "none"
   :user-base  "dc=metabase,dc=com"
   :group-base "dc=metabase,dc=com"})

;; See test_resources/ldap.ldif for fixtures

;; The connection test should pass with valid settings
(deftest connection-test
  (ldap.test/with-ldap-server
    (testing "anonymous binds"
      (testing "successfully connect to IPv4 host"
        (is (= {:status :SUCCESS}
               (ldap/test-ldap-connection (get-ldap-details))))))

    (testing "invalid user search base"
      (is (= :ERROR
             (:status (ldap/test-ldap-connection (assoc (get-ldap-details)
                                                        :user-base "dc=example,dc=com"))))))

    (testing "invalid group search base"
      (is (= :ERROR
             (:status (ldap/test-ldap-connection (assoc (get-ldap-details) :group-base "dc=example,dc=com"))))))

    (testing "invalid bind DN"
      (is (= :ERROR
             (:status (ldap/test-ldap-connection (assoc (get-ldap-details) :bind-dn "cn=Not Directory Manager"))))))

    (testing "invalid bind password"
      (is (= :ERROR
             (:status (ldap/test-ldap-connection (assoc (get-ldap-details) :password "wrong"))))))

    (testing "basic get-connection works, will throw otherwise"
      (is (= nil
             (.close (#'ldap/get-connection)))))

    (testing "login should succeed"
      (is (= true
             (ldap/verify-password "cn=Directory Manager" "password"))))

    (testing "wrong password"
      (is (= false
             (ldap/verify-password "cn=Directory Manager" "wrongpassword"))))

    (testing "invalid DN fails"
      (is (= false
             (ldap/verify-password "cn=Nobody,ou=nowhere,dc=metabase,dc=com" "password"))))

    (testing "regular user login"
      (is (= true
             (ldap/verify-password "cn=Sally Brown,ou=People,dc=metabase,dc=com" "1234"))))

    (testing "fail regular user login with bad password"
      (is (= false
             (ldap/verify-password "cn=Sally Brown,ou=People,dc=metabase,dc=com" "password"))))))

(deftest find-test
  ;; there are EE-specific versions of this test in `metabase-enterprise.enhancements.integrations.ldap-test`
  (with-redefs [metastore/enable-enhancements? (constantly false)]
    (ldap.test/with-ldap-server
      (testing "find by username"
        (is (= {:dn         "cn=John Smith,ou=People,dc=metabase,dc=com"
                :first-name "John"
                :last-name  "Smith"
                :email      "John.Smith@metabase.com"
                :groups     ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
               (ldap/find-user "jsmith1"))))

      (testing "find by email"
        (is (= {:dn         "cn=John Smith,ou=People,dc=metabase,dc=com"
                :first-name "John"
                :last-name  "Smith"
                :email      "John.Smith@metabase.com"
                :groups     ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
               (ldap/find-user "John.Smith@metabase.com"))))

      (testing "find by email, no groups"
        (is (= {:dn         "cn=Fred Taylor,ou=People,dc=metabase,dc=com"
                :first-name "Fred"
                :last-name  "Taylor"
                :email      "fred.taylor@metabase.com"
                :groups     []}
               (ldap/find-user "fred.taylor@metabase.com")))))))

(deftest group-matching-test
  (testing "LDAP group matching should identify Metabase groups using DN equality rules"
    (is (= #{1 2 3}
           (mt/with-temporary-setting-values
             [ldap-group-mappings {"cn=accounting,ou=groups,dc=metabase,dc=com" [1 2]
                                   "cn=shipping,ou=groups,dc=metabase,dc=com" [2 3]}]
             (#'default-impl/ldap-groups->mb-group-ids
              ["CN=Accounting,OU=Groups,DC=metabase,DC=com"
               "CN=Shipping,OU=Groups,DC=metabase,DC=com"]
              {:group-mappings (ldap/ldap-group-mappings)}))))))

;; For hosts that do not support IPv6, the connection code will return an error
;; This isn't a failure of the code, it's a failure of the host.
(deftest ipv6-test
  (testing "successfully connect to IPv6 host"
    (let [actual (ldap.test/with-ldap-server
                   (ldap/test-ldap-connection (assoc (get-ldap-details)
                                                     :host "[::1]")))]
      (if (= (:status actual) :ERROR)
        (is (re-matches #"An error occurred while attempting to connect to server \[::1].*" (:message actual)))
        (is (= {:status :SUCCESS} actual))))))
