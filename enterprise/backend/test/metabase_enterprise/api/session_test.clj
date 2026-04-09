(ns metabase-enterprise.api.session-test
  ;; TODO (Cam 10/30/25) -- Move this somewhere better
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest properties-token-features-test
  (mt/with-premium-features #{:admin-security-center
                              :advanced-permissions
                              :ai-controls
                              :attached-dwh
                              :audit-app
                              :cache-granular-controls
                              :cache-preemptive
                              :config-text-file
                              :content-translation
                              :content-verification
                              :dashboard-subscription-filters
                              :disable-password-login
                              :database-auth-providers
                              :library
                              :development-mode
                              :email-allow-list
                              :email-restrict-recipients
                              :embedding
                              :embedding-sdk
                              :embedding-simple
                              :embedding-hub
                              :hosting
                              :metabase-ai-managed
                              :offer-metabase-ai-managed
                              :no-upsell
                              :official-collections
                              :query-reference-validation
                              :remote-sync
                              :sandboxes
                              :scim
                              :semantic-search
                              :serialization
                              :session-timeout-config
                              :snippet-collections
                              :sso-google
                              :sso-jwt
                              :sso-ldap
                              :sso-oidc
                              :sso-saml
                              :support-users
                              :transforms-basic
                              :transforms-python
                              :upload-management
                              :whitelabel
                              :collection-cleanup
                              :database-routing
                              :tenants
                              :cloud-custom-smtp
                              :workspaces
                              :writable-connection}
    (is (= {:admin_security_center          false ;; requires self-hosted (non-cloud) and non-H2 app db
            :advanced_permissions           true
            :ai_controls                    true
            :attached_dwh                   true
            :audit_app                      true
            :cache_granular_controls        true
            :cache_preemptive               true
            :config_text_file               true
            :content_translation            true
            :content_verification           true
            :dashboard_subscription_filters true
            :disable_password_login         true
            :database_auth_providers        true
            :library                        true
            :development_mode               true
            :email_allow_list               true
            :email_restrict_recipients      true
            :embedding                      true
            :embedding_sdk                  true
            :embedding_simple               true
            :hosting                        true
            :metabase-ai-managed            true
            :offer-metabase-ai-managed      true
            :official_collections           true
            :query_reference_validation     true
            :remote_sync                    true
            :sandboxes                      true
            :scim                           true
            :semantic_search                true
            :serialization                  true
            :session_timeout_config         true
            :snippet_collections            true
            :sso_google                     true
            :sso_jwt                        true
            :sso_ldap                       true
            :sso_oidc                       true
            :sso_saml                       true
            :support-users                  true
            :table_data_editing             false
            :transforms-basic               true
            :transforms-python              true
            :upload_management              true
            :whitelabel                     true
            :collection_cleanup             true
            :database_routing               true
            :tenants                        true
            :cloud_custom_smtp              true
            :etl_connections                false
            :etl_connections_pg             false
            :dependencies                   false
            :workspaces                     true
            :writable_connection            true}
           (:token-features (mt/user-http-request :crowberto :get 200 "session/properties"))))))

(deftest security-center-token-feature-test
  (testing "admin_security_center is true for self-hosted with the feature flag and non-H2 app db"
    (try
      (reset! premium-features/skip-security-center-env-checks true)
      (mt/with-premium-features #{:admin-security-center}
        (is (true? (:admin_security_center
                    (:token-features (mt/user-http-request :crowberto :get 200 "session/properties"))))))
      (finally
        (reset! premium-features/skip-security-center-env-checks false)))))
