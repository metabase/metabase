(ns metabase-enterprise.public-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]))

(use-fixtures :once (fixtures/initialize :db))

(deftest can-turn-off-password-login-with-jwt-enabled
  (tu/with-temporary-setting-values [jwt-enabled               true
                                     jwt-identity-provider-uri "example.com"
                                     jwt-shared-secret         "0123456789012345678901234567890123456789012345678901234567890123"
                                     enable-password-login     true]
    (public-settings/enable-password-login! false)
    (is (= false
           (public-settings/enable-password-login)))))

(deftest properties-token-features-test
  (premium-features-test/with-premium-features #{:audit-app
                                                 :advanced-permissions
                                                 :embedding
                                                 :whitelabel
                                                 :advanced-config
                                                 :content-management
                                                 :sso
                                                 :hosting
                                                 :sandboxes
                                                 :snippet-collections
                                                 :disable-password-login
                                                 :official-collections}
    (is (= {:advanced_config        true
            :advanced_permissions   true
            :audit_app              true
            :content_management     true
            :disable_password_login true
            :embedding              true
            :hosting                true
            :official_collections   true
            :sandboxes              true
            :snippet_collections    true
            :sso                    true
            :whitelabel             true}
          (:token-features (mt/user-http-request :crowberto :get 200 "session/properties"))))))
