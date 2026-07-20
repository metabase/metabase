(ns metabase.oauth-server.core-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   ;; load-bearing: all-agent-scopes reads the agent-api routes and the v2 tool registry, so both
   ;; must be loaded for the snippet-scope assertions to see the real surface
   [metabase.agent-api.api]
   [metabase.mcp.v2.api]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.test :as mt]))

(comment metabase.agent-api.api/keep-me metabase.mcp.v2.api/keep-me)

;; TODO (Chris 2026-03-24) — remove kondo ignore once linter respects the thread-safe list in use-fixtures
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :each (fn [thunk]
                      (oauth-server/reset-provider!)
                      (thunk)
                      (oauth-server/reset-provider!)))

(deftest snippet-scope-is-opt-in-test
  (testing "GHY-4137: agent:snippets:read is advertised for explicit request but kept out of the
            default grant a dynamically-registered client receives — like mb:full — so snippet SQL
            bodies aren't exposed unless a token asks for the scope"
    (testing "it is advertised in scopes-supported"
      (is (contains? (set (oauth-server/supported-scopes)) "agent:snippets:read")))
    (testing "it is NOT in the default grant"
      (is (not (contains? (set (oauth-server/all-agent-scopes)) "agent:snippets:read"))))))

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
