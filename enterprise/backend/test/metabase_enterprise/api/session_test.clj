(ns metabase-enterprise.api.session-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest properties-token-features-test
  (premium-features-test/with-premium-features #{:audit-app
                                                 :advanced-permissions
                                                 :cache-granular-controls
                                                 :config-text-file
                                                 :content-management
                                                 :content-verification
                                                 :disable-password-login
                                                 :embedding
                                                 :whitelabel
                                                 :advanced-config
                                                 :hosting
                                                 :official-collections
                                                 :sandboxes
                                                 :session-timeout-config
                                                 :snippet-collections
                                                 :sso-google
                                                 :sso-jwt
                                                 :sso-ldap
                                                 :sso-saml}
    (is (= {:advanced_config         true
            :advanced_permissions    true
            :audit_app               true
            :cache_granular_controls true
            :config_text_file        true
            :content_management      true
            :content_verification    true
            :disable_password_login  true
            :embedding               true
            :hosting                 true
            :official_collections    true
            :sandboxes               true
            :session_timeout_config  true
            :snippet_collections     true
            :sso_google              true
            :sso_jwt                 true
            :sso_ldap                true
            :sso_saml                true
            :whitelabel              true}
          (:token-features (mt/user-http-request :crowberto :get 200 "session/properties"))))))
