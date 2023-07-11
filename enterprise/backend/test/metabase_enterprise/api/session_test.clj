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
