(ns metabase-enterprise.sso.api.sso-test
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]
            [metabase-enterprise.sso.integrations.saml-test :as saml-test]))

(def ^:private default-idp-uri  "http://test.idp.metabase.com")
(def ^:private default-idp-cert (slurp "test_resources/sso/auth0-public-idp.cert"))

(deftest saml-settings-test
  (testing "PUT /auth/sso/saml/settings"
    (testing "Valid SAML settings can be saved via an API call"
      (mt/with-temporary-setting-values [saml-identity-provider-uri nil
                                         saml-identity-provider-certificate nil]
        (saml-test/client :put 200 "/auth/sso/saml/settings"
                          {:body {:identity-provider-uri         default-idp-uri
                                  :identity-provider-certificate default-idp-cert}})))))


