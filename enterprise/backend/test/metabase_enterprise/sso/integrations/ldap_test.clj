(ns metabase-enterprise.sso.integrations.ldap-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.appearance.settings :as appearance.settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.sso.ldap :as ldap]
   [metabase.sso.ldap-test-util :as ldap.test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest find-test
  (mt/with-premium-features #{:sso-ldap}
    (ldap.test/with-ldap-server!
      (testing "find by username"
        (is (= {:dn "cn=John Smith,ou=People,dc=metabase,dc=com"
                :first-name "John"
                :last-name "Smith"
                :email "John.Smith@metabase.com"
                :attributes {"uid" "jsmith1"
                             "mail" "John.Smith@metabase.com"
                             "givenname" "John"
                             "sn" "Smith"
                             "cn" "John Smith"}
                :groups ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
               (ldap/find-user "jsmith1"))))

      (testing "find by email"
        (is (= {:dn "cn=John Smith,ou=People,dc=metabase,dc=com"
                :first-name "John"
                :last-name "Smith"
                :email "John.Smith@metabase.com"
                :attributes {"uid" "jsmith1"
                             "mail" "John.Smith@metabase.com"
                             "givenname" "John"
                             "sn" "Smith"
                             "cn" "John Smith"}
                :groups ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
               (ldap/find-user "John.Smith@metabase.com"))))

      (testing "find by email, no groups"
        (is (= {:dn "cn=Fred Taylor,ou=People,dc=metabase,dc=com"
                :first-name "Fred"
                :last-name "Taylor"
                :email "fred.taylor@metabase.com"
                :attributes {"mail" "fred.taylor@metabase.com"
                             "cn" "Fred Taylor"
                             "givenname" "Fred"
                             "sn" "Taylor"}
                :groups ["cn=Accounting,ou=Groups,dc=metabase,dc=com"]}
               (ldap/find-user "fred.taylor@metabase.com"))))

      (testing "find by email, no givenName"
        (is (= {:dn "cn=Jane Miller,ou=People,dc=metabase,dc=com"
                :first-name nil
                :last-name "Miller"
                :email "jane.miller@metabase.com"
                :attributes {"uid" "jmiller"
                             "mail" "jane.miller@metabase.com"
                             "cn" "Jane Miller"
                             "sn" "Miller"}
                :groups []}
               (ldap/find-user "jane.miller@metabase.com"))))

      (mt/with-temporary-setting-values [ldap-group-membership-filter "memberUid={uid}"]
        (testing "find by username with custom group membership filter"
          (is (= {:dn "cn=Sally Brown,ou=People,dc=metabase,dc=com"
                  :first-name "Sally"
                  :last-name "Brown"
                  :email "sally.brown@metabase.com"
                  :attributes {"uid" "sbrown20"
                               "mail" "sally.brown@metabase.com"
                               "givenname" "Sally"
                               "sn" "Brown"
                               "cn" "Sally Brown"}
                  :groups ["cn=Engineering,ou=Groups,dc=metabase,dc=com"]}
                 (ldap/find-user "sbrown20"))))

        (testing "find by email with custom group membership filter"
          (is (= {:dn "cn=Sally Brown,ou=People,dc=metabase,dc=com"
                  :first-name "Sally"
                  :last-name "Brown"
                  :email "sally.brown@metabase.com"
                  :attributes {"uid" "sbrown20"
                               "mail" "sally.brown@metabase.com"
                               "givenname" "Sally"
                               "sn" "Brown"
                               "cn" "Sally Brown"}
                  :groups ["cn=Engineering,ou=Groups,dc=metabase,dc=com"]}
                 (ldap/find-user "sally.brown@metabase.com"))))))))

(deftest attribute-sync-test
  (mt/with-premium-features #{:sso-ldap}
    (ldap.test/with-ldap-server!
      (testing "find by email/username should return other attributes as well"
        (is (= {:dn "cn=Lucky Pigeon,ou=Birds,dc=metabase,dc=com"
                :first-name "Lucky"
                :last-name "Pigeon"
                :email "lucky@metabase.com"
                :attributes {"uid" "lucky"
                             "mail" "lucky@metabase.com"
                             "title" "King Pigeon"
                             "givenname" "Lucky"
                             "sn" "Pigeon"
                             "cn" "Lucky Pigeon"}
                :groups []}
               (ldap/find-user "lucky"))))
      (testing "ignored attributes should not be returned"
        (mt/with-temporary-setting-values [ldap-sync-user-attributes-blacklist
                                           (cons "title" (sso-settings/ldap-sync-user-attributes-blacklist))]
          (is (= {:dn "cn=Lucky Pigeon,ou=Birds,dc=metabase,dc=com"
                  :first-name "Lucky"
                  :last-name "Pigeon"
                  :email "lucky@metabase.com"
                  :attributes {"uid" "lucky"
                               "mail" "lucky@metabase.com"
                               "givenname" "Lucky"
                               "sn" "Pigeon"
                               "cn" "Lucky Pigeon"}
                  :groups []}
                 (ldap/find-user "lucky")))))
      (testing "if attribute sync is disabled, no attributes should come back at all"
        (mt/with-temporary-setting-values [ldap-sync-user-attributes false]
          (is (= {:dn "cn=Lucky Pigeon,ou=Birds,dc=metabase,dc=com"
                  :first-name "Lucky"
                  :last-name "Pigeon"
                  :email "lucky@metabase.com"
                  :attributes nil
                  :groups []}
                 (ldap/find-user "lucky"))))))))

(deftest new-user-attributes-synced-test
  (mt/with-premium-features #{:sso-ldap}
    (mt/with-model-cleanup [:model/User]
      (ldap.test/with-ldap-server!
        (testing "when creating a new user via provider/login!, user attributes should get synced"
          (let [result (auth-identity/login! :provider/ldap
                                             {:username "jsmith1"
                                              :password "strongpassword"
                                              :device-info {:device_id "test-device"
                                                            :device_description "Test Device"
                                                            :ip_address "127.0.0.1"
                                                            :embedded false}})]
            (is (true? (:success? result)))
            (is (= {:first_name "John"
                    :last_name "Smith"
                    :email "john.smith@metabase.com"
                    :login_attributes {"uid" "jsmith1"
                                       "mail" "John.Smith@metabase.com"
                                       "givenname" "John"
                                       "sn" "Smith"
                                       "cn" "John Smith"}
                    :common_name "John Smith"}
                   (into {} (t2/select-one [:model/User :first_name :last_name :email :login_attributes]
                                           :email "john.smith@metabase.com"))))))))))

(deftest new-user-attributes-not-synced-when-disabled-test
  (mt/with-premium-features #{:sso-ldap}
    (mt/with-model-cleanup [:model/User]
      (ldap.test/with-ldap-server!
        (testing "when creating a new user via provider/login! and attribute sync is disabled, attributes should not be synced"
          (mt/with-temporary-setting-values [ldap-sync-user-attributes false]
            (let [result (auth-identity/login! :provider/ldap
                                               {:username "jsmith1"
                                                :password "strongpassword"
                                                :device-info {:device_id "test-device"
                                                              :device_description "Test Device"
                                                              :ip_address "127.0.0.1"
                                                              :embedded false}})]
              (is (true? (:success? result)))
              (is (= {:first_name "John"
                      :last_name "Smith"
                      :email "john.smith@metabase.com"
                      :login_attributes nil
                      :common_name "John Smith"}
                     (into {} (t2/select-one [:model/User :first_name :last_name :email :login_attributes]
                                             :email "john.smith@metabase.com")))))))))))

(deftest update-attributes-on-login-test
  (mt/with-premium-features #{:sso-ldap}
    (mt/with-model-cleanup [:model/User]
      (ldap.test/with-ldap-server!
        (testing "Existing user's attributes are updated via provider/login!"
          (let [result1 (auth-identity/login! :provider/ldap
                                              {:username "jsmith1"
                                               :password "strongpassword"
                                               :device-info {:device_id "test-device"
                                                             :device_description "Test Device"
                                                             :ip_address "127.0.0.1"
                                                             :embedded false}})
                result2 (auth-identity/login! :provider/ldap
                                              {:username "jsmith1"
                                               :password "strongpassword"
                                               :device-info {:device_id "test-device"
                                                             :device_description "Test Device"
                                                             :ip_address "127.0.0.1"
                                                             :embedded false}})]
            (is (true? (:success? result1)))
            (is (true? (:success? result2)))
            (is (= {:first_name "John"
                    :last_name "Smith"
                    :common_name "John Smith"
                    :email "john.smith@metabase.com"
                    :login_attributes {"uid" "jsmith1"
                                       "mail" "John.Smith@metabase.com"
                                       "givenname" "John"
                                       "sn" "Smith"
                                       "cn" "John Smith"}}
                   (into {} (t2/select-one [:model/User :first_name :last_name :email :login_attributes]
                                           :email "john.smith@metabase.com"))))))))))

(deftest update-attributes-disabled-test
  (mt/with-premium-features #{:sso-ldap}
    (mt/with-model-cleanup [:model/User]
      (ldap.test/with-ldap-server!
        (testing "Existing user's attributes are not updated via provider/login! when attribute sync is disabled"
          (mt/with-temporary-setting-values [ldap-sync-user-attributes false]
            (let [result1 (auth-identity/login! :provider/ldap
                                                {:username "jsmith1"
                                                 :password "strongpassword"
                                                 :device-info {:device_id "test-device"
                                                               :device_description "Test Device"
                                                               :ip_address "127.0.0.1"
                                                               :embedded false}})
                  result2 (auth-identity/login! :provider/ldap
                                                {:username "jsmith1"
                                                 :password "strongpassword"
                                                 :device-info {:device_id "test-device"
                                                               :device_description "Test Device"
                                                               :ip_address "127.0.0.1"
                                                               :embedded false}})]
              (is (true? (:success? result1)))
              (is (true? (:success? result2)))
              (is (= {:first_name "John"
                      :last_name "Smith"
                      :common_name "John Smith"
                      :email "john.smith@metabase.com"
                      :login_attributes nil}
                     (into {} (t2/select-one [:model/User :first_name :last_name :email :login_attributes]
                                             :email "john.smith@metabase.com")))))))))))

(deftest create-new-user-test
  (mt/with-premium-features #{:sso-ldap}
    (mt/with-model-cleanup [:model/User]
      (ldap.test/with-ldap-server!
        (testing "a new user is created via provider/login! when they don't already exist"
          (let [result (auth-identity/login! :provider/ldap
                                             {:username "jsmith1"
                                              :password "strongpassword"
                                              :device-info {:device_id "test-device"
                                                            :device_description "Test Device"
                                                            :ip_address "127.0.0.1"
                                                            :embedded false}})]
            (is (true? (:success? result)))
            (is (= {:first_name "John"
                    :last_name "Smith"
                    :common_name "John Smith"
                    :email "john.smith@metabase.com"}
                   (into {} (t2/select-one [:model/User :first_name :last_name :email] :email "john.smith@metabase.com"))))))))))

(deftest create-user-without-givenname-test
  (mt/with-premium-features #{:sso-ldap}
    (mt/with-model-cleanup [:model/User]
      (ldap.test/with-ldap-server!
        (testing "a user without a givenName attribute has nil for that attribute"
          (let [result (auth-identity/login! :provider/ldap
                                             {:username "jmiller"
                                              :password "n0peeking"
                                              :device-info {:device_id "test-device"
                                                            :device_description "Test Device"
                                                            :ip_address "127.0.0.1"
                                                            :embedded false}})]
            (is (true? (:success? result)))
            (is (= {:first_name nil
                    :last_name "Miller"
                    :common_name "Miller"}
                   (into {} (t2/select-one [:model/User :first_name :last_name] :email "jane.miller@metabase.com"))))))))))

(deftest ldap-no-user-provisioning-test
  (mt/with-premium-features #{:sso-ldap}
    (mt/with-model-cleanup [:model/User]
      (ldap.test/with-ldap-server!
        (testing "an error is thrown when a new user attempts to login via provider/login! and user provisioning is not enabled"
          (with-redefs [sso-settings/ldap-user-provisioning-enabled? (constantly false)
                        appearance.settings/site-name (constantly "test")]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Sorry, but you'll need a test account to view this page. Please contact your administrator."
                 (auth-identity/login! :provider/ldap
                                       {:username "jsmith1"
                                        :password "strongpassword"
                                        :device-info {:device_id "test-device"
                                                      :device_description "Test Device"
                                                      :ip_address "127.0.0.1"
                                                      :embedded false}})))))))))
