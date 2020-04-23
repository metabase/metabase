(ns metabase.integrations.ldap-test
  (:require [expectations :refer [expect]]
            [metabase.integrations.ldap :as ldap]
            [metabase.test.integrations.ldap :as ldap.test]
            [metabase.test.util :as tu]))

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
(expect
  {:status :SUCCESS}
  (ldap.test/with-ldap-server
    (ldap/test-ldap-connection (get-ldap-details))))

;; The connection test should allow anonymous binds
(expect
  {:status :SUCCESS}
  (ldap.test/with-ldap-server
    (ldap/test-ldap-connection (dissoc (get-ldap-details) :bind-dn))))

;; The connection test should fail with an invalid user search base
(expect
  :ERROR
  (ldap.test/with-ldap-server
    (:status (ldap/test-ldap-connection (assoc (get-ldap-details) :user-base "dc=example,dc=com")))))

;; The connection test should fail with an invalid group search base
(expect
  :ERROR
  (ldap.test/with-ldap-server
    (:status (ldap/test-ldap-connection (assoc (get-ldap-details) :group-base "dc=example,dc=com")))))

;; The connection test should fail with an invalid bind DN
(expect
  :ERROR
  (ldap.test/with-ldap-server
    (:status (ldap/test-ldap-connection (assoc (get-ldap-details) :bind-dn "cn=Not Directory Manager")))))

;; The connection test should fail with an invalid bind password
(expect
  :ERROR
  (ldap.test/with-ldap-server
    (:status (ldap/test-ldap-connection (assoc (get-ldap-details) :password "wrong")))))

;; Make sure the basic connection stuff works, this will throw otherwise
(expect
  nil
  (ldap.test/with-ldap-server
    (.close (#'ldap/get-connection))))

;; Login with everything right should succeed
(expect
  (ldap.test/with-ldap-server
    (ldap/verify-password "cn=Directory Manager" "password")))

;; Login with wrong password should fail
(expect
  false
  (ldap.test/with-ldap-server
    (ldap/verify-password "cn=Directory Manager" "wrongpassword")))

;; Login with invalid DN should fail
(expect
  false
  (ldap.test/with-ldap-server
    (ldap/verify-password "cn=Nobody,ou=nowhere,dc=metabase,dc=com" "password")))

;; Login for regular users should also work
(expect
  (ldap.test/with-ldap-server
    (ldap/verify-password "cn=Sally Brown,ou=People,dc=metabase,dc=com" "1234")))

;; Login for regular users should also fail for the wrong password
(expect
  false
  (ldap.test/with-ldap-server
    (ldap/verify-password "cn=Sally Brown,ou=People,dc=metabase,dc=com" "password")))

;; Find by username should work (given the default LDAP filter and test fixtures)
(expect
  {:dn         "cn=John Smith,ou=People,dc=metabase,dc=com"
   :first-name "John"
   :last-name  "Smith"
   :email      "John.Smith@metabase.com"
   :groups     ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
  (ldap.test/with-ldap-server
    (ldap/find-user "jsmith1")))

;; Find by email should also work (also given our default settings and fixtures)
(expect
  {:dn         "cn=John Smith,ou=People,dc=metabase,dc=com"
   :first-name "John"
   :last-name  "Smith"
   :email      "John.Smith@metabase.com"
   :groups     ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
  (ldap.test/with-ldap-server
    (ldap/find-user "John.Smith@metabase.com")))

;; Find by email should also work (also given our default settings and fixtures)
(expect
  {:dn         "cn=Fred Taylor,ou=People,dc=metabase,dc=com"
   :first-name "Fred"
   :last-name  "Taylor"
   :email      "fred.taylor@metabase.com"
   :groups     []}
  (ldap.test/with-ldap-server
    (ldap/find-user "fred.taylor@metabase.com")))

;; LDAP group matching should identify Metabase groups using DN equality rules
(expect
  #{1 2 3}
  (tu/with-temporary-setting-values [ldap-group-mappings {"cn=accounting,ou=groups,dc=metabase,dc=com" [1 2]
                                                          "cn=shipping,ou=groups,dc=metabase,dc=com" [2 3]}]
    (#'ldap/ldap-groups->mb-group-ids ["CN=Accounting,OU=Groups,DC=metabase,DC=com"
                                       "CN=Shipping,OU=Groups,DC=metabase,DC=com"])))
