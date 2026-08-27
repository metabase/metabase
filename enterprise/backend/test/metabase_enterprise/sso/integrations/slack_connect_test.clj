(ns metabase-enterprise.sso.integrations.slack-connect-test
  "EE-specific tests for Slack Connect that require EE SSO types like SAML."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.sso.integrations.slack-connect-test :as slack-connect-test]
   [metabase.sso.test-helpers :as sso.test-helpers]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]))

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

(deftest auth-sso-does-not-dispatch-to-slack-connect-test
  (testing "with only Slack Connect enabled, GET /auth/sso returns 400 (UXW-3940)"
    ;; Slack Connect uses /auth/sso/slack-connect, not /auth/sso. The /auth/sso multimethod
    ;; only handles SAML and JWT, so it must surface "not enabled" rather than dispatching
    ;; to a non-existent :slack-connect implementation.
    (mt/with-additional-premium-features #{:sso-saml :sso-jwt}
      (sso.test-helpers/with-slack-default-setup!
        (is (partial=
             {:cause   "SSO has not been enabled and/or configured"
              :data    {:status "error-sso-disabled" :status-code 400}
              :message "SSO has not been enabled and/or configured"
              :status  "error-sso-disabled"}
             (client/client :get 400 "/auth/sso")))))))
