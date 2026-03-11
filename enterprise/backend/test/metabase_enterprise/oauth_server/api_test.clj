(ns metabase-enterprise.oauth-server.api-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.oauth-server.core :as oauth-server]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]))

(use-fixtures :each (fn [thunk]
                      (oauth-server/reset-provider!)
                      (binding [client/*url-prefix* ""]
                        (thunk))
                      (oauth-server/reset-provider!)))

(deftest discovery-endpoint-with-feature-flag-test
  (testing "Discovery endpoint returns valid OIDC metadata when feature enabled"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (let [response (mt/user-http-request :crowberto :get 200
                                             "oauth/.well-known/openid-configuration")]
          (is (contains? response :issuer))
          (is (contains? response :authorization_endpoint))
          (is (contains? response :token_endpoint))
          (is (contains? response :jwks_uri))
          (is (contains? response :response_types_supported))
          (is (contains? response :id_token_signing_alg_values_supported))
          (is (= "http://localhost:3000" (:issuer response)))
          (is (= "http://localhost:3000/oauth/register" (:registration_endpoint response))))))))

(deftest discovery-endpoint-without-feature-flag-test
  (testing "Discovery endpoint returns 404 when feature disabled"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :get 404
                            "oauth/.well-known/openid-configuration"))))

(deftest jwks-endpoint-with-feature-flag-test
  (testing "JWKS endpoint returns valid key set when feature enabled"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                         oauth-server-signing-key nil]
        (let [response (mt/user-http-request :crowberto :get 200 "oauth/jwks")]
          (is (contains? response :keys))
          (is (pos? (count (:keys response))))
          (let [first-key (first (:keys response))]
            (is (= "RSA" (:kty first-key)))
            (is (= "sig" (:use first-key)))))))))

(deftest jwks-endpoint-without-feature-flag-test
  (testing "JWKS endpoint returns 404 when feature disabled"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :get 404 "oauth/jwks"))))
