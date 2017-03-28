(ns metabase.integrations.ldap-test
  (:require [expectations :refer :all]
            [metabase.integrations.ldap :as ldap]
            (metabase.test [util :refer [resolve-private-vars]])
            (metabase.test.integrations [ldap :refer [expect-with-ldap-server]])))

(resolve-private-vars metabase.integrations.ldap escape-value get-ldap-connection)


;; See test_resources/ldap.ldif for fixtures

(expect
  "\\2AJohn \\28Dude\\29 Doe\\5C"
  (escape-value "*John (Dude) Doe\\"))

(expect-with-ldap-server
  ;; Make sure the basic connection stuff works, this will throw otherwise
  ;; TODO: not sure if there's an "expect no throw"
  nil
  (.close (get-ldap-connection)))

(expect-with-ldap-server
  ;; Login with everything right should succeed
  true
  (ldap/verify-password "cn=Directory Manager" "password"))

(expect-with-ldap-server
  ;; Login with wrong password should fail
  false
  (ldap/verify-password "cn=Directory Manager" "wrongpassword"))

(expect-with-ldap-server
  ;; Login with invalid DN should fail
  false
  (ldap/verify-password "cn=Nobody,ou=people,dc=example,dc=com" "password"))

(expect-with-ldap-server
  ;; Login for regular users should also work
  true
  (ldap/verify-password "cn=Sally Brown,ou=people,dc=example,dc=com" "1234"))

(expect-with-ldap-server
  ;; Login for regular users should also fail for the wrong password
  false
  (ldap/verify-password "cn=Sally Brown,ou=people,dc=example,dc=com" "password"))

(expect-with-ldap-server
  ;; Find by username should work (given the default LDAP filter and test fixtures)
  {:dn         "cn=Sally Brown,ou=people,dc=example,dc=com"
   :first-name "Sally"
   :last-name  "Brown"
   :email      "sally.brown@example.com"
   :groups     []}
  (ldap/find-user "sbrown20"))

(expect-with-ldap-server
  ;; Find by email should also work (also given our test setup)
  {:dn         "cn=Sally Brown,ou=people,dc=example,dc=com"
   :first-name "Sally"
   :last-name  "Brown"
   :email      "sally.brown@example.com"
   :groups     []}
  (ldap/find-user "sally.brown@example.com"))
