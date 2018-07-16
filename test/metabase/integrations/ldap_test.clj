(ns metabase.integrations.ldap-test
  (:require [expectations :refer :all]
            [metabase.integrations.ldap :as ldap]
            [metabase.test.integrations.ldap :refer [expect-with-ldap-server get-ldap-port]]))

(defn- get-ldap-details []
  {:host       "localhost"
   :port       (get-ldap-port)
   :bind-dn    "cn=Directory Manager"
   :password   "password"
   :security   "none"
   :user-base  "dc=metabase,dc=com"
   :group-base "dc=metabase,dc=com"})

;; See test_resources/ldap.ldif for fixtures

(expect
  "\\20\\2AJohn \\28Dude\\29 Doe\\5C"
  (#'ldap/escape-value " *John (Dude) Doe\\"))

(expect
  "John\\2BSmith@metabase.com"
  (#'ldap/escape-value "John+Smith@metabase.com"))

;; The connection test should pass with valid settings
(expect-with-ldap-server
  {:status :SUCCESS}
  (ldap/test-ldap-connection (get-ldap-details)))

;; The connection test should allow anonymous binds
(expect-with-ldap-server
  {:status :SUCCESS}
  (ldap/test-ldap-connection (dissoc (get-ldap-details) :bind-dn)))

;; The connection test should fail with an invalid user search base
(expect-with-ldap-server
  :ERROR
  (:status (ldap/test-ldap-connection (assoc (get-ldap-details) :user-base "dc=example,dc=com"))))

;; The connection test should fail with an invalid group search base
(expect-with-ldap-server
  :ERROR
  (:status (ldap/test-ldap-connection (assoc (get-ldap-details) :group-base "dc=example,dc=com"))))

;; The connection test should fail with an invalid bind DN
(expect-with-ldap-server
  :ERROR
  (:status (ldap/test-ldap-connection (assoc (get-ldap-details) :bind-dn "cn=Not Directory Manager"))))

;; The connection test should fail with an invalid bind password
(expect-with-ldap-server
  :ERROR
  (:status (ldap/test-ldap-connection (assoc (get-ldap-details) :password "wrong"))))

;; Make sure the basic connection stuff works, this will throw otherwise
(expect-with-ldap-server
 nil
 (.close (#'ldap/get-connection)))

;; Login with everything right should succeed
(expect-with-ldap-server
  true
  (ldap/verify-password "cn=Directory Manager" "password"))

;; Login with wrong password should fail
(expect-with-ldap-server
  false
  (ldap/verify-password "cn=Directory Manager" "wrongpassword"))

;; Login with invalid DN should fail
(expect-with-ldap-server
  false
  (ldap/verify-password "cn=Nobody,ou=nowhere,dc=metabase,dc=com" "password"))

;; Login for regular users should also work
(expect-with-ldap-server
  true
  (ldap/verify-password "cn=Sally Brown,ou=People,dc=metabase,dc=com" "1234"))

;; Login for regular users should also fail for the wrong password
(expect-with-ldap-server
  false
  (ldap/verify-password "cn=Sally Brown,ou=People,dc=metabase,dc=com" "password"))

;; Find by username should work (given the default LDAP filter and test fixtures)
(expect-with-ldap-server
  {:dn         "cn=John Smith,ou=People,dc=metabase,dc=com"
   :first-name "John"
   :last-name  "Smith"
   :email      "John.Smith@metabase.com"
   :groups     ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
  (ldap/find-user "jsmith1"))

;; Find by email should also work (also given our default settings and fixtures)
(expect-with-ldap-server
  {:dn         "cn=John Smith,ou=People,dc=metabase,dc=com"
   :first-name "John"
   :last-name  "Smith"
   :email      "John.Smith@metabase.com"
   :groups     ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
  (ldap/find-user "John.Smith@metabase.com"))
