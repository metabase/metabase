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
                                                 :embedding
                                                 :whitelabel
                                                 :advanced-config
                                                 :sso
                                                 :hosting
                                                 :sandboxes
                                                 :snippet-collections
                                                 :disable-password-login
                                                 :official-collections}
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
            :snippet_collections         true
            :sso                     true
            :whitelabel              true}
          (:token-features (mt/user-http-request :crowberto :get 200 "session/properties"))))))
