(ns metabase.oauth-server.core-test
  (:require
   [clojure.string :as str]
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

(deftest mb-full-stays-out-of-the-protected-resource-doc-test
  (testing "`mb:full` is a first-party full-access scope, not specific to the MCP resource: it
            belongs in the authorization-server metadata but not the RFC 9728 protected-resource
            doc. (This assertion used to ride along with an `agent:snippets:read` opt-in test;
            GHY-4225 folded the per-type read scopes into `agent:content:read`, so there is no
            longer a v2 opt-in read scope to assert about.)"
    (is (contains? (set (oauth-server/supported-scopes)) "mb:full"))
    (is (not (contains? (set (oauth-server/protected-resource-scopes)) "mb:full")))))

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

(deftest rationalized-scopes-are-in-the-default-grant-test
  (testing "GHY-4225: the five v2 scopes must all reach the default grant a dynamically-registered
            client receives, or the tool surface advertises capabilities no such client can use.
            (This replaces a check on `agent:document:create`, which duplicate_content required
            until GHY-4225 collapsed the per-type create scopes into `agent:content:write`.)"
    (let [granted (set (oauth-server/all-agent-scopes))]
      (doseq [scope ["agent:content:read" "agent:content:write" "agent:query:run"
                     "agent:sql:run" "agent:delivery:write"]]
        (testing scope
          (is (contains? granted scope)))))))

(deftest v2-resource-advertises-only-the-v2-surface-test
  (testing "RFC 9728 metadata answers \"what does *this* resource accept\", and the surfaces differ:
            the v2 MCP resource accepts the rationalized scopes its tool registry gates on, while the
            wider set also carries every agent-API endpoint scope. Advertising the union for v2 is
            what makes a client's consent screen list per-entity v1 scopes the v2 tools never use."
    (let [v2   (set (oauth-server/v2-resource-scopes))
          wide (set (oauth-server/protected-resource-scopes))]
      (testing "the five rationalized scopes are advertised for v2"
        (doseq [scope ["agent:content:read" "agent:content:write" "agent:query:run"
                       "agent:sql:run" "agent:delivery:write"]]
          (testing scope
            (is (contains? v2 scope)))))
      (testing "v1 agent-API per-entity scopes are not"
        (doseq [scope ["agent:collection:create" "agent:dashboard:create" "agent:dashboard:update"
                       "agent:metric:create" "agent:metric:update" "agent:question:create"
                       "agent:query:construct" "agent:query:execute" "agent:sql:construct"]]
          (testing scope
            (is (not (contains? v2 scope))))))
      (testing "but they remain advertised on the wider set, since those resources do accept them"
        (is (contains? wide "agent:collection:create"))
        (is (contains? wide "agent:query:execute")))
      (testing "so the v2 surface is strictly narrower"
        (is (< (count v2) (count wide)))))))

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

;;; ----------------------------------- RFC 8707 resource narrowing -----------------------------------

(deftest narrow-scope-to-resource-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (let [v2-uri "http://localhost:3000/api/metabase-mcp/v2"
          scopes #(set (some-> % (str/split #"\s+")))]
      (testing "an indicator naming the v2 resource drops scopes that surface does not accept"
        (let [narrowed (scopes (oauth-server/narrow-scope-to-resource
                                [v2-uri]
                                "agent:content:read agent:question:create agent:sql:execute agent:query:run"))]
          (is (= #{"agent:content:read" "agent:query:run"} narrowed))))
      (testing "every scope v2 advertises survives narrowing — otherwise the resource doc would
                advertise a scope its own consent flow strips"
        (let [advertised (oauth-server/v2-resource-scopes)]
          (is (= (set advertised)
                 (scopes (oauth-server/narrow-scope-to-resource
                          [v2-uri] (str/join " " advertised)))))))
      (testing "`mb:full` survives: a first-party client may legitimately request it alongside MCP
                scopes, and it is deliberately absent from the v2 resource doc"
        (is (= #{"mb:full" "agent:content:read"}
               (scopes (oauth-server/narrow-scope-to-resource
                        [v2-uri] "mb:full agent:content:read agent:question:create")))))
      (testing "no indicator, or one naming a different resource, leaves the scope alone"
        (let [wide "agent:content:read agent:question:create"]
          (is (= wide (oauth-server/narrow-scope-to-resource nil wide)))
          (is (= wide (oauth-server/narrow-scope-to-resource [] wide)))
          (is (= wide (oauth-server/narrow-scope-to-resource
                       ["http://localhost:3000/api/metabase-mcp"] wide)))))
      (testing "nil rather than an empty scope when nothing survives, so the caller drops the
                parameter instead of sending a blank one"
        (is (nil? (oauth-server/narrow-scope-to-resource [v2-uri] "agent:question:create"))))
      (testing "blank and missing scopes stay absent rather than becoming an empty parameter"
        (doseq [blank [nil "" "   "]]
          (testing (pr-str blank)
            (is (nil? (oauth-server/narrow-scope-to-resource [v2-uri] blank)))
            (is (nil? (oauth-server/narrow-scope-to-resource nil blank))))))
      (testing "narrowing only ever removes — a client cannot gain a scope it did not request"
        (let [requested "agent:content:read agent:question:create mb:full"]
          (is (every? (scopes requested)
                      (scopes (oauth-server/narrow-scope-to-resource [v2-uri] requested)))))))))

(deftest narrow-scope-to-resource-canonicalization-test
  (testing "resource indicators are compared canonically, not byte-for-byte. Clients disagree on
            trailing slashes, case, and default ports -- a live Claude Code bug appends a trailing
            slash via WHATWG URL -- and a mismatch silently skips narrowing, handing the caller the
            wide consent screen. RFC 3986 makes scheme and host case-insensitive and the default
            port elidable; the path is neither."
    (let [wide     "agent:content:read agent:question:create"
          narrowed "agent:content:read"]
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (doseq [indicator ["http://localhost:3000/api/metabase-mcp/v2"
                           "http://localhost:3000/api/metabase-mcp/v2/"
                           "HTTP://LOCALHOST:3000/api/metabase-mcp/v2"
                           "http://LocalHost:3000/api/metabase-mcp/v2/"]]
          (testing (str "matches " (pr-str indicator))
            (is (= narrowed (oauth-server/narrow-scope-to-resource [indicator] wide))))))
      (testing "the default port is elidable in both directions"
        (mt/with-temporary-setting-values [site-url "https://example.com"]
          (doseq [indicator ["https://example.com/api/metabase-mcp/v2"
                             "https://example.com:443/api/metabase-mcp/v2"]]
            (testing (str "matches " (pr-str indicator))
              (is (= narrowed (oauth-server/narrow-scope-to-resource [indicator] wide))))))
        (mt/with-temporary-setting-values [site-url "http://example.com"]
          (is (= narrowed (oauth-server/narrow-scope-to-resource
                           ["http://example.com:80/api/metabase-mcp/v2"] wide)))))
      (testing "canonicalization does not make unrelated resources match"
        (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
          (doseq [indicator ["http://localhost:3000/api/metabase-mcp"
                             "http://localhost:3000/api/metabase-mcp/v2/extra"
                             "http://localhost:3000/API/METABASE-MCP/V2"
                             "http://localhost:3001/api/metabase-mcp/v2"
                             "https://localhost:3000/api/metabase-mcp/v2"
                             "http://evil.example.com/api/metabase-mcp/v2"
                             "not-a-uri"]]
            (testing (str "leaves scope alone for " (pr-str indicator))
              (is (= wide (oauth-server/narrow-scope-to-resource [indicator] wide))))))))))
