(ns metabase-enterprise.enhancements.integrations.ldap-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.enhancements.integrations.ldap :as ldap-ee]
            [metabase.integrations.ldap :as ldap]
            [metabase.models.user :as user :refer [User]]
            [metabase.public-settings.metastore :as metastore]
            [metabase.test :as mt]
            [metabase.test.integrations.ldap :as ldap.test]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(deftest find-test
  (with-redefs [metastore/enable-enhancements? (constantly true)]
    (ldap.test/with-ldap-server
      (testing "find by username"
        (is (= {:dn         "cn=John Smith,ou=People,dc=metabase,dc=com"
                :first-name "John"
                :last-name  "Smith"
                :email      "John.Smith@metabase.com"
                :attributes {:uid       "jsmith1"
                             :mail      "John.Smith@metabase.com"
                             :givenname "John"
                             :sn        "Smith"
                             :cn        "John Smith"}
                :groups     ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
               (ldap/find-user "jsmith1"))))

      (testing "find by email"
        (is (= {:dn         "cn=John Smith,ou=People,dc=metabase,dc=com"
                :first-name "John"
                :last-name  "Smith"
                :email      "John.Smith@metabase.com"
                :attributes {:uid       "jsmith1"
                             :mail      "John.Smith@metabase.com"
                             :givenname "John"
                             :sn        "Smith"
                             :cn        "John Smith"}
                :groups     ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
               (ldap/find-user "John.Smith@metabase.com"))))

      (testing "find by email, no groups"
        (is (= {:dn         "cn=Fred Taylor,ou=People,dc=metabase,dc=com"
                :first-name "Fred"
                :last-name  "Taylor"
                :email      "fred.taylor@metabase.com"
                :attributes {:uid       "ftaylor300"
                             :mail      "fred.taylor@metabase.com"
                             :cn        "Fred Taylor"
                             :givenname "Fred"
                             :sn        "Taylor"}
                :groups     []}
               (ldap/find-user "fred.taylor@metabase.com"))))

      (testing "find by email, no givenName"
        (is (= {:dn         "cn=Jane Miller,ou=People,dc=metabase,dc=com"
                :first-name nil
                :last-name  "Miller"
                :email      "jane.miller@metabase.com"
                :attributes {:uid       "jmiller"
                             :mail      "jane.miller@metabase.com"
                             :cn        "Jane Miller"
                             :sn        "Miller"}
                :groups     []}
               (ldap/find-user "jane.miller@metabase.com"))))

      (mt/with-temporary-setting-values [ldap-group-membership-filter "memberUid={uid}"]
        (testing "find by username with custom group membership filter"
          (is (= {:dn         "cn=Sally Brown,ou=People,dc=metabase,dc=com"
                  :first-name "Sally"
                  :last-name  "Brown"
                  :email      "sally.brown@metabase.com"
                  :attributes {:uid       "sbrown20"
                               :mail      "sally.brown@metabase.com"
                               :givenname "Sally"
                               :sn        "Brown"
                               :cn        "Sally Brown"}
                  :groups     ["cn=Engineering,ou=Groups,dc=metabase,dc=com"]}
                 (ldap/find-user "sbrown20"))))

        (testing "find by email with custom group membership filter"
          (is (= {:dn         "cn=Sally Brown,ou=People,dc=metabase,dc=com"
                  :first-name "Sally"
                  :last-name  "Brown"
                  :email      "sally.brown@metabase.com"
                  :attributes {:uid       "sbrown20"
                               :mail      "sally.brown@metabase.com"
                               :givenname "Sally"
                               :sn        "Brown"
                               :cn        "Sally Brown"}
                  :groups     ["cn=Engineering,ou=Groups,dc=metabase,dc=com"]}
                 (ldap/find-user "sally.brown@metabase.com"))))))))

(deftest attribute-sync-test
  (with-redefs [metastore/enable-enhancements? (constantly true)]
    (ldap.test/with-ldap-server
      (testing "find by email/username should return other attributes as well"
        (is (= {:dn         "cn=Lucky Pigeon,ou=Birds,dc=metabase,dc=com"
                :first-name "Lucky"
                :last-name  "Pigeon"
                :email      "lucky@metabase.com"
                :attributes {:uid       "lucky"
                             :mail      "lucky@metabase.com"
                             :title     "King Pigeon"
                             :givenname "Lucky"
                             :sn        "Pigeon"
                             :cn        "Lucky Pigeon"}
                :groups     []}
               (ldap/find-user "lucky"))))

      (testing "ignored attributes should not be returned"
        (mt/with-temporary-setting-values [ldap-sync-user-attributes-blacklist
                                           (cons "title" (ldap-ee/ldap-sync-user-attributes-blacklist))]
          (is (= {:dn         "cn=Lucky Pigeon,ou=Birds,dc=metabase,dc=com"
                  :first-name "Lucky"
                  :last-name  "Pigeon"
                  :email      "lucky@metabase.com"
                  :attributes {:uid       "lucky"
                               :mail      "lucky@metabase.com"
                               :givenname "Lucky"
                               :sn        "Pigeon"
                               :cn        "Lucky Pigeon"}
                  :groups     []}
                 (ldap/find-user "lucky")))))

      (testing "if attribute sync is disabled, no attributes should come back at all"
        (mt/with-temporary-setting-values [ldap-sync-user-attributes false]
          (is (= {:dn         "cn=Lucky Pigeon,ou=Birds,dc=metabase,dc=com"
                  :first-name "Lucky"
                  :last-name  "Pigeon"
                  :email      "lucky@metabase.com"
                  :attributes nil
                  :groups     []}
                 (ldap/find-user "lucky")))))

      (testing "when creating a new user, user attributes should get synced"
        (try
          (ldap/fetch-or-create-user! (ldap/find-user "jsmith1"))
          (is (= {:first_name       "John"
                  :last_name        "Smith"
                  :email            "john.smith@metabase.com"
                  :login_attributes {"uid"       "jsmith1"
                                     "mail"      "John.Smith@metabase.com"
                                     "givenname" "John"
                                     "sn"        "Smith"
                                     "cn"        "John Smith"}
                  :common_name      "John Smith"}
                 (into {} (db/select-one [User :first_name :last_name :email :login_attributes]
                                         :email "john.smith@metabase.com"))))
          (finally
            (db/delete! User :%lower.email "john.smith@metabase.com"))))

      (testing "when creating a new user and attribute sync is disabled, attributes should not be synced"
        (mt/with-temporary-setting-values [ldap-sync-user-attributes false]
          (try
            (ldap/fetch-or-create-user! (ldap/find-user "jsmith1"))
            (is (= {:first_name       "John"
                    :last_name        "Smith"
                    :email            "john.smith@metabase.com"
                    :login_attributes nil
                    :common_name      "John Smith"}
                   (into {} (db/select-one [User :first_name :last_name :email :login_attributes]
                                           :email "john.smith@metabase.com"))))
            (finally
              (db/delete! User :%lower.email "john.smith@metabase.com"))))))))

(deftest update-attributes-on-login-test
  (with-redefs [metastore/enable-enhancements? (constantly true)]
    (ldap.test/with-ldap-server
      (testing "Existing user's attributes are updated on fetch"
        (try
          (let [user-info (ldap/find-user "jsmith1")]
            (testing "First let a user get created for John Smith"
              (is (schema= {:email    (s/eq "john.smith@metabase.com")
                            s/Keyword s/Any}
                           (ldap/fetch-or-create-user! user-info))))
            (testing "Call fetch-or-create-user! again to trigger update"
              (is (schema= {:id su/IntGreaterThanZero,  s/Keyword s/Any}
                           (ldap/fetch-or-create-user! (assoc-in user-info [:attributes :unladenspeed] 100)))))
            (is (= {:first_name       "John"
                    :last_name        "Smith"
                    :common_name      "John Smith"
                    :email            "john.smith@metabase.com"
                    :login_attributes {"uid"          "jsmith1"
                                       "mail"         "John.Smith@metabase.com"
                                       "givenname"    "John"
                                       "sn"           "Smith"
                                       "cn"           "John Smith"
                                       "unladenspeed" 100}}
                   (into {} (db/select-one [User :first_name :last_name :email :login_attributes]
                                           :email "john.smith@metabase.com")))))
          (finally
            (db/delete! User :%lower.email "john.smith@metabase.com"))))

      (testing "Existing user's attributes are not updated on fetch, when attribute sync is disabled"
        (try
          (mt/with-temporary-setting-values [ldap-sync-user-attributes false]
            (let [user-info (ldap/find-user "jsmith1")]
              (testing "First let a user get created for John Smith"
                (is (schema= {:email    (s/eq "john.smith@metabase.com")
                              s/Keyword s/Any}
                             (ldap/fetch-or-create-user! user-info))))
              (testing "Call fetch-or-create-user! again to trigger update"
                (is (schema= {:id su/IntGreaterThanZero,  s/Keyword s/Any}
                             (ldap/fetch-or-create-user! (assoc-in user-info [:attributes :unladenspeed] 100)))))
              (is (= {:first_name       "John"
                      :last_name        "Smith"
                      :common_name      "John Smith"
                      :email            "john.smith@metabase.com"
                      :login_attributes nil}
                     (into {} (db/select-one [User :first_name :last_name :email :login_attributes]
                                             :email "john.smith@metabase.com"))))))
          (finally
            (db/delete! User :%lower.email "john.smith@metabase.com")))))))

(deftest fetch-or-create-user-test
  (with-redefs [metastore/enable-enhancements? (constantly true)]
    (ldap.test/with-ldap-server
      (testing "a new user is created when they don't already exist"
        (try
         (ldap/fetch-or-create-user! (ldap/find-user "jsmith1"))
         (is (= {:first_name       "John"
                 :last_name        "Smith"
                 :common_name      "John Smith"
                 :email            "john.smith@metabase.com"}
                (into {} (db/select-one [User :first_name :last_name :email] :email "john.smith@metabase.com"))))
         (finally (db/delete! User :email "john.smith@metabase.com"))))

      (try
       (testing "a user without a givenName attribute defaults to Unknown"
         (ldap/fetch-or-create-user! (ldap/find-user "jmiller"))
         (is (= {:first_name       "Unknown"
                 :last_name        "Miller"
                 :common_name      "Unknown Miller"}
                (into {} (db/select-one [User :first_name :last_name] :email "jane.miller@metabase.com")))))

       (testing "when givenName or sn attributes change in LDAP, they are updated in Metabase on next login"
         (ldap/fetch-or-create-user! (assoc (ldap/find-user "jmiller") :first-name "Jane" :last-name "Doe"))
         (is (= {:first_name       "Jane"
                 :last_name        "Doe"
                 :common_name      "Jane Doe"}
                (into {} (db/select-one [User :first_name :last_name] :email "jane.miller@metabase.com")))))

       (testing "if givenName or sn attributes are removed, values stored in Metabase are not overwritten on next login"
         (ldap/fetch-or-create-user! (assoc (ldap/find-user "jmiller") :first-name nil :last-name nil))
         (is (= {:first_name       "Jane"
                 :last_name        "Doe"
                 :common_name      "Jane Doe"}
                (into {} (db/select-one [User :first_name :last_name] :email "jane.miller@metabase.com")))))
       (finally (db/delete! User :email "jane.miller@metabase.com"))))))
