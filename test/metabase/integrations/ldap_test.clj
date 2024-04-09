(ns metabase.integrations.ldap-test
  (:require
   [clojure.test :refer :all]
   [metabase.integrations.ldap :as ldap]
   [metabase.integrations.ldap.default-implementation :as default-impl]
   [metabase.models.user :as user :refer [User]]
   [metabase.test :as mt]
   [metabase.test.integrations.ldap :as ldap.test]
   [toucan2.core :as t2])
  (:import
   (com.unboundid.ldap.sdk DN LDAPConnectionPool)))

(set! *warn-on-reflection* true)

;; See test_resources/ldap.ldif for fixtures

;; The connection test should pass with valid settings
(deftest connection-test
  (ldap.test/with-ldap-server
    (testing "anonymous binds"
      (testing "successfully connect to IPv4 host"
        (is (= {:status :SUCCESS}
               (ldap/test-ldap-connection (ldap.test/get-ldap-details))))))

    (testing "invalid user search base"
      (is (= :ERROR
             (:status (ldap/test-ldap-connection (assoc (ldap.test/get-ldap-details)
                                                        :user-base "dc=example,dc=com"))))))

    (testing "invalid group search base"
      (is (= :ERROR
             (:status (ldap/test-ldap-connection (assoc (ldap.test/get-ldap-details) :group-base "dc=example,dc=com"))))))

    (testing "invalid bind DN"
      (is (= :ERROR
             (:status (ldap/test-ldap-connection (assoc (ldap.test/get-ldap-details) :bind-dn "cn=Not Directory Manager"))))))

    (testing "invalid bind password"
      (is (= :ERROR
             (:status (ldap/test-ldap-connection (assoc (ldap.test/get-ldap-details) :password "wrong"))))))

    (testing "basic get-connection works, will throw otherwise"
      (is (= nil
             (.close ^LDAPConnectionPool (#'ldap/get-connection)))))

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
             (ldap/verify-password "cn=Sally Brown,ou=People,dc=metabase,dc=com" "password"))))

    (testing "password containing dollar signs succeeds (#15145)"
      (is (= true
             (ldap/verify-password "cn=Fred Taylor,ou=People,dc=metabase,dc=com", "pa$$word"))))))

(deftest find-test
  ;; there are EE-specific versions of this test in [[metabase-enterprise.enhancements.integrations.ldap-test]]
  (mt/with-premium-features #{}
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
                :groups     ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
               (ldap/find-user "fred.taylor@metabase.com"))))

      (testing "find by email, no givenName"
        (is (= {:dn         "cn=Jane Miller,ou=People,dc=metabase,dc=com"
                :first-name nil
                :last-name  "Miller"
                :email      "jane.miller@metabase.com"
                :groups     []}
               (ldap/find-user "jane.miller@metabase.com")))))

    ;; Test group lookups for directory servers that use the memberOf attribute overlay, such as Active Directory
    (ldap.test/with-active-directory-ldap-server
      (testing "find user with one group using memberOf attribute"
        (is (= {:dn         "cn=John Smith,ou=People,dc=metabase,dc=com"
                :first-name "John"
                :last-name  "Smith"
                :email      "John.Smith@metabase.com"
                :groups     ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
               (ldap/find-user "jsmith1"))))

      (testing "find user with two groups using memberOf attribute"
        (is (= {:dn         "cn=Sally Brown,ou=People,dc=metabase,dc=com"
                :first-name "Sally"
                :last-name  "Brown"
                :email      "sally.brown@metabase.com"
                :groups     ["cn=Accounting,ou=Groups,dc=metabase,dc=com",
                             "cn=Engineering,ou=Groups,dc=metabase,dc=com"]}
               (ldap/find-user "sbrown20")))))))

(deftest fetch-or-create-user-test
  ;; there are EE-specific versions of this test in [[metabase-enterprise.enhancements.integrations.ldap-test]]
  (mt/with-premium-features #{}
    (ldap.test/with-ldap-server
      (testing "a new user is created when they don't already exist"
        (try
          (ldap/fetch-or-create-user! (ldap/find-user "jsmith1"))
          (is (= {:first_name       "John"
                  :last_name        "Smith"
                  :common_name      "John Smith"
                  :email            "john.smith@metabase.com"}
                 (into {} (t2/select-one [User :first_name :last_name :email] :email "john.smith@metabase.com"))))
          (finally (t2/delete! User :email "john.smith@metabase.com"))))

      (try
        (testing "a user without a givenName attribute has `nil` for that attribute"
          (ldap/fetch-or-create-user! (ldap/find-user "jmiller"))
          (is (= {:first_name       nil
                  :last_name        "Miller"
                  :common_name      "Miller"}
                 (into {} (t2/select-one [User :first_name :last_name] :email "jane.miller@metabase.com")))))

        (testing "when givenName or sn attributes change in LDAP, they are updated in Metabase on next login"
          (ldap/fetch-or-create-user! (assoc (ldap/find-user "jmiller") :first-name "Jane" :last-name "Doe"))
          (is (= {:first_name       "Jane"
                  :last_name        "Doe"
                  :common_name      "Jane Doe"}
                 (into {} (t2/select-one [User :first_name :last_name] :email "jane.miller@metabase.com")))))

        (testing "if givenName or sn attributes are removed, values stored in Metabase are updated to `nil` to respect the IdP response."
          (ldap/fetch-or-create-user! (assoc (ldap/find-user "jmiller") :first-name nil :last-name nil))
          (is (= {:first_name       nil
                  :last_name        nil
                  :common_name      "jane.miller@metabase.com"}
                 (select-keys (t2/select-one User :email "jane.miller@metabase.com") [:first_name :last_name :common_name]))))
        (finally (t2/delete! User :email "jane.miller@metabase.com"))))))

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

(deftest valid-group-mapping
  (testing "Validating that a group mapping DN can contain a forward slash when set as a keyword (#29629)"
    (mt/with-temporary-setting-values
      [ldap-group-mappings nil]
      (ldap/ldap-group-mappings! {(keyword "CN=People,OU=Security/Distribution Groups,DC=metabase,DC=com") []})
      (is (= {(DN. "CN=People,OU=Security/Distribution Groups,DC=metabase,DC=com") []}
             (ldap/ldap-group-mappings))))))

;; For hosts that do not support IPv6, the connection code will return an error
;; This isn't a failure of the code, it's a failure of the host.
(deftest ipv6-test
  (testing "successfully connect to IPv6 host"
    (let [actual (ldap.test/with-ldap-server
                   (ldap/test-ldap-connection (assoc (ldap.test/get-ldap-details)
                                                     :host "[::1]")))]
      (if (= (:status actual) :ERROR)
        (is (re-matches #"An error occurred while attempting to connect to server \[::1].*" (:message actual)))
        (is (= {:status :SUCCESS} actual))))))
