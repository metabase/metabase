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

(use-fixtures :each (fn [thunk]
                      (oauth-server/reset-provider!)
                      (thunk)
                      (oauth-server/reset-provider!)))

(deftest snippet-scope-is-opt-in-test
  (testing "GHY-4137: agent:snippets:read is advertised for explicit request but kept out of the
            default grant a dynamically-registered client receives — like mb:full — so snippet SQL
            bodies aren't exposed unless a token asks for the scope"
    (testing "it is advertised in the authorization-server metadata (scopes-supported)"
      (is (contains? (set (oauth-server/supported-scopes)) "agent:snippets:read")))
    (testing "it is NOT in the default grant"
      (is (not (contains? (set (oauth-server/all-agent-scopes)) "agent:snippets:read"))))
    (testing "GHY-4137: it is also advertised in the protected-resource metadata (RFC 9728), or a
              client discovering scopes that way can never learn the scope exists to request it"
      (is (contains? (set (oauth-server/protected-resource-scopes)) "agent:snippets:read")))
    (testing "the protected-resource doc omits mb:full — a first-party full-access scope, not
              specific to the MCP resource; it stays in the authorization-server metadata"
      (is (contains? (set (oauth-server/supported-scopes)) "mb:full"))
      (is (not (contains? (set (oauth-server/protected-resource-scopes)) "mb:full"))))))

(deftest advertised-scopes-are-distinct-test
  (testing "GHY-4151: scopes_supported is a set of scope strings (RFC 8414) — it unions the default
            grant with the opt-in scopes, so a scope declared in both buckets would be advertised
            twice. Duplicates also mean a mandatory scope was filed as opt-in."
    (doseq [[metadata scopes] {"authorization-server" (oauth-server/supported-scopes)
                               "protected-resource"   (oauth-server/protected-resource-scopes)}]
      (testing metadata
        (is (= (count (distinct scopes)) (count scopes))
            (str "duplicate scopes: "
                 (->> scopes frequencies (filter (fn [[_ n]] (> n 1))) (map key) sort vec)))))))

(deftest document-create-scope-is-in-the-default-grant-test
  (testing "GHY-4151: duplicate_content hard-requires agent:document:create for type \"document\",
            and no other v2 tool carries that scope — so if it ever leaves the default grant, a
            dynamically-registered client can list the tool and then 403 on every document copy"
    (is (contains? (set (oauth-server/all-agent-scopes)) "agent:document:create"))))

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
