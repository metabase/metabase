(ns metabase-enterprise.api.session-test
  ;; TODO (Cam 10/30/25) -- Move this somewhere better
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
                              :cache-preemptive
                              :config-text-file
                              :content-translation
                              :content-verification
                              :dashboard-subscription-filters
                              :disable-password-login
                              :database-auth-providers
                              :data-studio
                              :development-mode
                              :email-allow-list
                              :email-restrict-recipients
                              :embedding
                              :embedding-sdk
                              :embedding-simple
                              :embedding-hub
                              :hosting
                              :llm-autodescription
                              :metabot-v3
                              :ai-entity-analysis
                              :ai-sql-fixer
                              :ai-sql-generation
                              :no-upsell
                              :offer-metabase-ai
                              :offer-metabase-ai-tiered
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
                              :sso-saml
                              :sso-slack
                              :support-users
                              :transforms
                              :transforms-python
                              :upload-management
                              :whitelabel
                              :collection-cleanup
                              :database-routing
                              :tenants
                              :cloud-custom-smtp}
    (is (= {:advanced_permissions           true
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
            :data_studio                    true
            :development_mode               true
            :email_allow_list               true
            :email_restrict_recipients      true
            :embedding                      true
            :embedding_sdk                  true
            :embedding_simple               true
            :hosting                        true
            :llm_autodescription            true
            :metabot_v3                     true
            :ai_entity_analysis             true
            :ai_sql_fixer                   true
            :ai_sql_generation              true
            :offer_metabase_ai              true
            :offer_metabase_ai_tiered       true
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
            :sso_saml                       true
            :sso_slack                      true
            :support-users                  true
            :table_data_editing             false
            :transforms                     true
            :transforms-python              true
            :upload_management              true
            :whitelabel                     true
            :collection_cleanup             true
            :database_routing               true
            :tenants                        true
            :cloud_custom_smtp              true
            :etl_connections                false
            :etl_connections_pg             false
            :dependencies                   false}
           (:token-features (mt/user-http-request :crowberto :get 200 "session/properties"))))))
