(ns metabase.oauth-server.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-api.api] ;; ensure agent API routes are loaded for scopes discovery
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.test-util :as oauth-test]
   [metabase.test :as mt]))

(deftest get-provider-test
  (testing "get-provider returns a Provider instance"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (oauth-test/with-oauth-system {}
        (let [provider (oauth-server/get-provider)]
          (is (some? provider))
          (is (instance? oidc_provider.core.Provider provider)))))))

(deftest provider-endpoints-test
  (testing "provider's config contains endpoints rooted at the configured site-url"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (oauth-test/with-oauth-system {}
        (let [provider (oauth-server/get-provider)
              config   (:config provider)]
          (is (= "http://localhost:3000" (:issuer config)))
          (is (= "http://localhost:3000/oauth/authorize" (:authorization-endpoint config)))
          (is (= "http://localhost:3000/oauth/token" (:token-endpoint config))))))))
