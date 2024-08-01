(ns metabase-enterprise.sso.integrations.sso-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
   [metabase.test :as mt]
   [metabase.test.util :as tu]))

(def ^:private default-idp-uri "http://test.idp.metabase.com")
(def ^:private default-idp-cert (slurp "test_resources/sso/auth0-public-idp.cert"))

(deftest get-saml-settings-token-features-test
  (testing "Getting SAML settings should return their default values without :sso-saml feature flag enabled"
    (mt/with-premium-features #{:sso-saml}
      (tu/with-temporary-setting-values [saml-identity-provider-uri         default-idp-uri
                                         saml-identity-provider-certificate default-idp-cert
                                         saml-identity-provider-issuer      "54321"
                                         saml-application-name              "Not Metabase"
                                         saml-keystore-path                 "test_resources/keystore.jks"
                                         saml-keystore-password             "123456"
                                         saml-keystore-alias                "sp"
                                         saml-attribute-email               "not default email"
                                         saml-attribute-firstname           "not default first_name"
                                         saml-attribute-lastname            "not default last_name"
                                         saml-group-sync                    true
                                         saml-attribute-group               "group"
                                         saml-group-mappings                {:group_1 [1]}
                                         saml-enabled                       true]
        (doseq [feature? [true false]]
          (mt/with-premium-features (if feature? #{:sso-saml} #{})
            (is (= (if feature? default-idp-uri nil)
                   (sso-settings/saml-identity-provider-uri)))
            (is (= (if feature? default-idp-cert nil)
                   (sso-settings/saml-identity-provider-certificate)))
            (is (= (if feature? "54321" nil)
                   (sso-settings/saml-identity-provider-issuer)))
            (is (= (if feature? "Not Metabase" "Metabase")
                   (sso-settings/saml-application-name)))
            (is (= (if feature? "test_resources/keystore.jks" nil)
                   (sso-settings/saml-keystore-path)))
            (is (= (if feature? "123456" "changeit")
                   (sso-settings/saml-keystore-password)))
            (is (= (if feature? "sp" "metabase")
                   (sso-settings/saml-keystore-alias)))
            (is (= (if feature? "not default email" "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress")
                   (sso-settings/saml-attribute-email)))
            (is (= (if feature? "not default first_name" "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname")
                   (sso-settings/saml-attribute-firstname)))
            (is (= (if feature? "not default last_name" "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname")
                   (sso-settings/saml-attribute-lastname)))
            (is (= (if feature? true false)
                   (sso-settings/saml-group-sync)))
            (is (= (if feature? "group" "member_of")
                   (sso-settings/saml-attribute-group)))
            (is (= (if feature? {:group_1 [1]} {})
                   (sso-settings/saml-group-mappings)))
            (is (= (if feature? true false)
                   (sso-settings/saml-configured)))
            (is (= (if feature? true false)
                   (sso-settings/saml-enabled)))))))))

(deftest set-saml-settings-token-features-test
  (testing "Setting SAML settings should error without the :sso-saml feature flag enabled"
    (mt/with-premium-features #{}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-identity-provider-uri is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-identity-provider-uri! default-idp-uri)))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-identity-provider-certificate is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-identity-provider-certificate! default-idp-cert)))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-identity-provider-issuer is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-identity-provider-issuer! "54321")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-application-name is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-application-name! "Not Metabase")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-keystore-path is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-keystore-path! "test_resources/keystore.jks")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-keystore-password is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-keystore-password! "123456")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-keystore-alias is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-keystore-alias! "sp")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-attribute-email is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-attribute-email! "email")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-attribute-firstname is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-attribute-firstname! "firstname")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-attribute-lastname is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-attribute-lastname! "lastname")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-group-sync is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-group-sync! true)))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-attribute-group is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-attribute-group! "group")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-group-mappings is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-group-mappings! {:group_1 [1]})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-enabled is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-enabled! true)))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting saml-slo-enabled is not enabled because feature :sso-saml is not available"
           (sso-settings/saml-slo-enabled! true))))))

(deftest saml-scim-user-provisioning
  (testing "SAML user provisioning is disabled when SCIM is enabled"
    (mt/with-premium-features #{:sso-saml :scim}
      (mt/with-temporary-setting-values [saml-user-provisioning-enabled? true
                                         scim-enabled                    true]
          (is (false? (sso-settings/saml-user-provisioning-enabled?)))))))

(deftest jwt-settings-token-features-test
  (testing "Getting JWT settings should return their default values without :sso-jwt feature flag enabled"
    (doseq [feature? [true false]]
      (mt/with-premium-features #{:sso-jwt}
        (tu/with-temporary-setting-values [jwt-identity-provider-uri default-idp-uri
                                           jwt-shared-secret         "01234"
                                           jwt-attribute-email       "not default email"
                                           jwt-attribute-firstname   "not default first_name"
                                           jwt-attribute-lastname    "not default last_name"
                                           jwt-attribute-groups      "not default groups"
                                           jwt-group-sync            true
                                           jwt-group-mappings        {:group_id [1]}
                                           jwt-enabled               true]
          (mt/with-premium-features (if feature? #{:sso-jwt} #{})
            (is (= (if feature? default-idp-uri nil)
                   (sso-settings/jwt-identity-provider-uri)))
            (is (= (if feature? "01234" nil)
                   (sso-settings/jwt-shared-secret)))
            (is (= (if feature? "not default email" "email")
                   (sso-settings/jwt-attribute-email)))
            (is (= (if feature? "not default first_name" "first_name")
                   (sso-settings/jwt-attribute-firstname)))
            (is (= (if feature? "not default last_name" "last_name")
                   (sso-settings/jwt-attribute-lastname)))
            (is (= (if feature? true false)
                   (sso-settings/jwt-group-sync)))
            (is (= (if feature? "not default groups" "groups")
                   (sso-settings/jwt-attribute-groups)))
            (is (= (if feature? {:group_id [1]} {})
                   (sso-settings/jwt-group-mappings)))
            (is (= (if feature? true false)
                   (sso-settings/jwt-enabled)))))))))

(deftest set-jwt-settings-token-features-test
  (testing "Setting JWT settings should error without the :sso-jwt feature flag enabled"
    (mt/with-premium-features #{}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting jwt-identity-provider-uri is not enabled because feature :sso-jwt is not available"
           (sso-settings/jwt-identity-provider-uri! default-idp-uri)))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting jwt-shared-secret is not enabled because feature :sso-jwt is not available"
           (sso-settings/jwt-shared-secret! "01234")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting jwt-attribute-email is not enabled because feature :sso-jwt is not available"
           (sso-settings/jwt-attribute-email! "email")))
      (is (thrown-with-msg?
            clojure.lang.ExceptionInfo
            #"Setting jwt-attribute-firstname is not enabled because feature :sso-jwt is not available"
            (sso-settings/jwt-attribute-firstname! "first_name")))
      (is (thrown-with-msg?
            clojure.lang.ExceptionInfo
            #"Setting jwt-attribute-lastname is not enabled because feature :sso-jwt is not available"
            (sso-settings/jwt-attribute-lastname! "last_name")))
      (is (thrown-with-msg?
            clojure.lang.ExceptionInfo
            #"Setting jwt-group-sync is not enabled because feature :sso-jwt is not available"
            (sso-settings/jwt-group-sync! true)))
      (is (thrown-with-msg?
            clojure.lang.ExceptionInfo
            #"Setting jwt-attribute-groups is not enabled because feature :sso-jwt is not available"
            (sso-settings/jwt-attribute-groups! "groups")))
      (is (thrown-with-msg?
            clojure.lang.ExceptionInfo
            #"Setting jwt-group-mappings is not enabled because feature :sso-jwt is not available"
            (sso-settings/jwt-group-mappings! {:group_id [1]})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting jwt-enabled is not enabled because feature :sso-jwt is not available"
           (sso-settings/jwt-enabled! true))))))
