(ns metabase-enterprise.sso.integrations.slack-connect-test
  "EE-specific tests for Slack Connect that require EE SSO types like SAML."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.sso.integrations.slack-connect-test :as slack-connect-test]
   [metabase.sso.test-helpers :as sso.test-helpers]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))
(use-fixtures :each slack-connect-test/do-with-url-prefix-disabled)

(deftest multiple-sso-methods-test
  (testing "with SAML and Slack Connect configured, a GET request to /auth/sso/slack-connect should redirect to Slack"
    (slack-connect-test/with-test-encryption!
      (sso.test-helpers/with-slack-default-setup!
        (mt/with-temporary-setting-values
          [saml-enabled                       true
           saml-identity-provider-uri         "http://test.idp.metabase.com"
           saml-identity-provider-certificate (slurp "test_resources/sso/auth0-public-idp.cert")]
          (slack-connect-test/with-successful-oidc!
            (let [result       (mt/client-full-response :get 302 "/auth/sso/slack-connect"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :redirect slack-connect-test/default-redirect-uri)
                  redirect-url (get-in result [:headers "Location"])]
              (is (str/starts-with? redirect-url "http://example.com/slack")))))))))
