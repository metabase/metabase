(ns metabase-enterprise.sso.api.sso-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.sso.integrations.saml-test :as saml-test]
            [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
            [metabase.test :as mt]
            [metabase.test.data.users :as test.users]))

(def ^:private default-idp-uri  "http://test.idp.metabase.com")
(def ^:private default-idp-cert (slurp "test_resources/sso/auth0-public-idp.cert"))

(deftest saml-settings-test
  (testing "PUT /auth/sso/saml/settings"
    (testing "Valid SAML settings can be saved via an API call"
      (mt/with-temporary-setting-values [saml-identity-provider-uri nil
                                         saml-identity-provider-certificate nil
                                         saml-enabled false]
        (saml-test/client (test.users/username->token :crowberto) :put 200 "/auth/sso/saml/settings" {:saml-identity-provider-certificate default-idp-cert
                                                                                                      :saml-identity-provider-uri         default-idp-uri
                                                                                                      :saml-enabled                       true})
        (is (= default-idp-uri  (sso-settings/saml-identity-provider-uri)))
        (is (= default-idp-cert (sso-settings/saml-identity-provider-certificate)))
        (is (= true             (sso-settings/saml-enabled)))))

    (testing "Invalid SAML settings cannot be saved via an API call"
      (mt/with-temporary-setting-values [saml-identity-provider-uri nil
                                         saml-identity-provider-certificate nil
                                         saml-enabled false]
        (saml-test/client (test.users/username->token :crowberto)
                          :put 400 "/auth/sso/saml/settings" {:saml-identity-provider-certificate "invalid cert"
                                                              :saml-identity-provider-uri         default-idp-uri
                                                              :saml-enabled                       true})
        (is (= nil   (sso-settings/saml-identity-provider-uri)))
        (is (= nil   (sso-settings/saml-identity-provider-certificate)))
        (is (= false (sso-settings/saml-enabled)))))))
