(ns metabase-enterprise.api.session-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest properties-token-features-test
  (premium-features-test/with-premium-features #{:dashboard-subscription-filters
                                                 :question-error-logs
                                                 :disable-password-login
                                                 :audit-app
                                                 :snippet-collections
                                                 :advanced-permissions
                                                 :embedding
                                                 :official-collections
                                                 :whitelabel
                                                 :no-upsell
                                                 :advanced-config
                                                 :cache-granular-controls
                                                 :content-verification
                                                 :serialization
                                                 :content-management
                                                 :sso-saml
                                                 :config-text-file
                                                 :email-allow-list
                                                 :hosting
                                                 :sso
                                                 :sso-jwt
                                                 :sandboxes
                                                 :email-restrict-recipients
                                                 :sso-ldap
                                                 :session-timeout-config}
          (is (= {:advanced_config                true
                  :advanced_permissions           true
                  :audit_app                      true
                  :cache_granular_controls        true
                  :config_text_file               true
                  :content_management             true
                  :content_verification           true
                  :dashboard_subscription_filters true
                  :disable_password_login         true
                  :email_allow_list               true
                  :email_restrict_recipients      true
                  :embedding                      true
                  :question_error_logs true
                  :hosting                        true
                  :official_collections           true
                  :sandboxes                      true
                  :snippet_collections            true
                  :sso                            true
                  :sso_jwt                        true
                  :sso_saml                       true
                  :sso_ldap                       true
                  :whitelabel                     true}
                 (:token-features (mt/user-http-request :crowberto :get 200 "session/properties"))))))
