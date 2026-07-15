(ns metabase.oauth-server.core-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.api-scope.core :as api-scope]
   [metabase.api.macros.scope :as scope]
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

(deftest workspace-manager-scope-test
  (testing "mb:workspace-manager is registered and advertised in the provider's supported scopes"
    (is (api-scope/registered-scope? oauth-server/workspace-manager-scope))
    (is (contains? (set (oauth-server/supported-scopes)) oauth-server/workspace-manager-scope)))
  (testing "a workspace-manager token passes scope-tagged endpoints and nothing else"
    (let [status-through (fn [middleware token-scopes]
                           (let [p       (promise)
                                 wrapped (middleware (fn [_ respond _] (respond {:status 200})))]
                             (wrapped {:token-scopes token-scopes}
                                      (fn [resp] (deliver p (:status resp)))
                                      (fn [e] (deliver p e)))
                             @p))
          ws-scopes      #{oauth-server/workspace-manager-scope}]
      (testing "passes endpoints tagged {:scope \"mb:workspace-manager\"}"
        (is (= 200 (status-through (scope/enforce-scope oauth-server/workspace-manager-scope) ws-scopes))))
      (testing "rejected by untagged endpoints (default-deny)"
        (is (= 403 (status-through scope/ensure-scopes-checked ws-scopes))))
      (testing "rejected by endpoints tagged with a different scope"
        (is (= 403 (status-through (scope/enforce-scope "agent:query:execute") ws-scopes)))))))
