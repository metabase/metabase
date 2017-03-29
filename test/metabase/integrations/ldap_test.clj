(ns metabase.integrations.ldap-test
  (:require [expectations :refer :all]
            [metabase.integrations.ldap :as ldap]
            (metabase.test [util :refer [resolve-private-vars]])
            (metabase.test.integrations [ldap :refer [expect-with-ldap-server get-ldap-port]])))

(resolve-private-vars metabase.integrations.ldap escape-value settings->ldap-options get-ldap-connection)


(defn- get-ldap-details []
  {:host     "localhost"
   :port     (get-ldap-port)
   :bind-dn  "cn=Directory Manager"
   :password "password"
   :security "none"
   :base     "dc=metabase,dc=com"})

;; See test_resources/ldap.ldif for fixtures

(expect
  "\\2AJohn \\28Dude\\29 Doe\\5C"
  (escape-value "*John (Dude) Doe\\"))

;; The connection test should pass with valid settings
(expect-with-ldap-server
  {:status :SUCCESS}
  (ldap/test-ldap-connection (get-ldap-details)))

;; The connection test should fail with an invalid search base
(expect-with-ldap-server
  {:status  :ERROR
   :message "Search base does not exist or is unreadable"}
  (ldap/test-ldap-connection (assoc (get-ldap-details) :base "dc=example,dc=com")))

;; The connection test should fail with an invalid bind DN
(expect-with-ldap-server
  {:status  :ERROR
   :message "Unable to bind as user 'cn=Not Directory Manager' because no such entry exists in the server."}
  (ldap/test-ldap-connection (assoc (get-ldap-details) :bind-dn "cn=Not Directory Manager")))

;; The connection test should fail with an invalid bind password
(expect-with-ldap-server
  {:status  :ERROR
   :message "Unable to bind as user 'cn=Directory Manager' because the provided password was incorrect."}
  (ldap/test-ldap-connection (assoc (get-ldap-details) :password "wrong")))

;; Make sure the basic connection stuff works, this will throw otherwise
(expect-with-ldap-server
  nil
  (.close (get-ldap-connection)))

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
  (ldap/verify-password "cn=Sally Brown,ou=people,dc=metabase,dc=com" "1234"))

;; Login for regular users should also fail for the wrong password
(expect-with-ldap-server
  false
  (ldap/verify-password "cn=Sally Brown,ou=people,dc=metabase,dc=com" "password"))

;; Find by username should work (given the default LDAP filter and test fixtures)
(expect-with-ldap-server
  {:dn         "cn=Sally Brown,ou=people,dc=metabase,dc=com"
   :first-name "Sally"
   :last-name  "Brown"
   :email      "sally.brown@metabase.com"
   :groups     []}
  (ldap/find-user "sbrown20"))

;; Find by email should also work (also given our default settings and fixtures)
(expect-with-ldap-server
  {:dn         "cn=Sally Brown,ou=people,dc=metabase,dc=com"
   :first-name "Sally"
   :last-name  "Brown"
   :email      "sally.brown@metabase.com"
   :groups     []}
  (ldap/find-user "sally.brown@metabase.com"))
