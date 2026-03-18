(ns metabase.oauth-server.core-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.test :as mt]))

(use-fixtures :each (fn [thunk]
                      (oauth-server/reset-provider!)
                      (thunk)
                      (oauth-server/reset-provider!)))

(deftest get-provider-test
  (testing "get-provider returns a Provider instance"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [provider (oauth-server/get-provider)]
        (is (some? provider))
        (is (instance? oidc_provider.core.Provider provider))))))

(deftest provider-endpoints-test
  (testing "provider's config contains endpoints rooted at the configured site-url"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [provider (oauth-server/get-provider)
            config   (:config provider)]
        (is (= "http://localhost:3000" (:issuer config)))
        (is (= "http://localhost:3000/oauth/authorize" (:authorization-endpoint config)))
        (is (= "http://localhost:3000/oauth/token" (:token-endpoint config)))
        (is (= "http://localhost:3000/oauth/jwks" (:jwks-uri config)))))))

(deftest signing-key-persistence-test
  (testing "signing key is generated on first call and reused on subsequent calls"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"
                                       oauth-server-signing-key nil]
      ;; First call generates the key
      (oauth-server/get-provider)
      (let [stored-key-1 (oauth-settings/oauth-server-signing-key)]
        (is (string? stored-key-1))
        ;; Reset provider to force re-creation, but key should be read from settings
        (oauth-server/reset-provider!)
        (oauth-server/get-provider)
        (let [stored-key-2 (oauth-settings/oauth-server-signing-key)]
          (is (= stored-key-1 stored-key-2)))))))
