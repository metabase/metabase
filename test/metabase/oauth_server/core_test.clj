(ns metabase.oauth-server.core-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.test :as mt]))

;; TODO (Chris 2026-03-24) — remove kondo ignore once linter respects the thread-safe list in use-fixtures
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
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
        (is (= "http://localhost:3000/oauth/token" (:token-endpoint config)))))))
