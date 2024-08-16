(ns metabase-enterprise.api.session-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest properties-token-features-test
  (mt/with-premium-features #{:advanced-permissions
                              :attached-dwh
                              :audit-app
                              :cache-granular-controls
                              :config-text-file
                              :content-verification
                              :dashboard-subscription-filters
                              :disable-password-login
                              :email-allow-list
                              :email-restrict-recipients
                              :embedding
                              :hosting
                              :llm-autodescription
                              :no-upsell
                              :official-collections
                              :sandboxes
                              :scim
                              :serialization
                              :session-timeout-config
                              :snippet-collections
                              :sso-google
                              :sso-jwt
                              :sso-ldap
                              :sso-saml
                              :upload_management
                              :whitelabel
                              :collection-cleanup}
          (is (= {:advanced_permissions           true
                  :attached_dwh                   true
                  :audit_app                      true
                  :cache_granular_controls        true
                  :config_text_file               true
                  :content_verification           true
                  :dashboard_subscription_filters true
                  :disable_password_login         true
                  :email_allow_list               true
                  :email_restrict_recipients      true
                  :embedding                      true
                  :hosting                        true
                  :llm_autodescription            true
                  :official_collections           true
                  :sandboxes                      true
                  :scim                           true
                  :session_timeout_config         true
                  :snippet_collections            true
                  :sso_google                     true
                  :sso_jwt                        true
                  :sso_ldap                       true
                  :sso_saml                       true
                  :upload_management              false
                  :whitelabel                     true
                  :collection_cleanup             true}
                 (:token-features (mt/user-http-request :crowberto :get 200 "session/properties"))))))
