(ns metabase-enterprise.enhancements.integrations.ldap-test
  (:require [clojure.test :refer :all]
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
               (ldap/find-user "fred.taylor@metabase.com")))))))

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
                                           (cons "title" (ldap/ldap-sync-user-attributes-blacklist))]
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
