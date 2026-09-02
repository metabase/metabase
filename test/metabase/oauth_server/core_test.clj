(ns metabase.oauth-server.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   ;; load-bearing: the advertised scope sets are derived from the agent-api routes and the v2 tool
   ;; registry, so both must be loaded for these assertions to see the real surface
   [metabase.agent-api.api]
   [metabase.mcp.v2.api :as v2.api]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.test :as mt]
   [oidc-provider.store :as oidc.store]
   [toucan2.core :as t2]))

(comment metabase.agent-api.api/keep-me)

(use-fixtures :each (fn [thunk]
                      (oauth-server/reset-provider!)
                      (thunk)
                      (oauth-server/reset-provider!)))

(deftest mb-full-is-advertised-nowhere-test
  (testing "GHY-4226: `mb:full` grants full user-equivalent REST access, and advertising it put that
            in front of every client reading discovery metadata. It is now absent from all three
            advertised sets and from the default DCR grant, so no client is led toward it and none
            can request it without having registered for it explicitly."
    (is (not (contains? (set (oauth-server/supported-scopes)) "mb:full")))
    (is (not (contains? (set (oauth-server/protected-resource-scopes)) "mb:full")))
    (is (not (contains? (set (oauth-server/mcp-resource-scopes)) "mb:full")))
    (is (not (contains? (set (oauth-server/default-grant-scopes)) "mb:full")))))

(deftest default-grant-covers-everything-advertised-test
  (testing "GHY-4226: the DCR default is a ceiling, and clients derive what to request from
            discovery metadata rather than from what they registered with. A scope we advertise but
            do not register for is therefore not a narrower grant — it is an `invalid_scope`
            rejection at /authorize for any client that asks for everything advertised, which is
            what Claude and ChatGPT both do."
    (let [ceiling (set (oauth-server/default-grant-scopes))]
      (doseq [[metadata scopes] {"authorization-server" (oauth-server/supported-scopes)
                                 "protected-resource"   (oauth-server/protected-resource-scopes)
                                 "mcp-resource"          (oauth-server/mcp-resource-scopes)}]
        (testing metadata
          (is (empty? (remove ceiling scopes))))))))

(deftest v2-default-ask-covers-the-surface-and-is-requestable-test
  (testing "the v2 401 challenge asks an uninstructed client for every scope the surface accepts, and
            nothing else. Asking for less does not degrade gracefully: `list-tools` filters by token
            scopes, so an unasked-for write scope removes those tools from `tools/list` entirely, with
            no in-product way for the user to request them afterwards."
    (is (= (set (oauth-server/mcp-resource-scopes))
           (set @#'v2.api/default-ask-scopes))
        "the ask and the accepted set are the same — a scope in one but not the other is a bug in whichever moved")
    (testing "every asked scope is inside the ceiling, or the ask itself would be rejected"
      (let [ceiling (set (oauth-server/default-grant-scopes))]
        (doseq [scope @#'v2.api/default-ask-scopes]
          (testing scope
            (is (contains? ceiling scope))))))
    (testing "GHY-4226: the wider agent-API scopes stay out — asking for the surface is not asking for the REST API"
      (doseq [scope ["mb:full" "agent:question:create" "agent:timelines:write"]]
        (testing scope
          (is (not (contains? (set @#'v2.api/default-ask-scopes) scope))))))))

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
    (let [granted (set (oauth-server/default-grant-scopes))]
      (doseq [scope ["agent:content:read" "agent:content:write" "agent:query:run"
                     "agent:sql:run" "agent:delivery:write"]]
        (testing scope
          (is (contains? granted scope)))))))

(deftest mcp-resource-advertises-only-the-mcp-surface-test
  (testing "RFC 9728 metadata answers \"what does *this* resource accept\", and the resources differ:
            the MCP resource accepts the rationalized scopes its tool registry gates on, while the
            wider set also carries every agent-API endpoint scope. Advertising the union for MCP is
            what makes a client's consent screen list per-entity scopes the MCP tools never use."
    (let [mcp  (set (oauth-server/mcp-resource-scopes))
          wide (set (oauth-server/protected-resource-scopes))]
      (testing "the five rationalized scopes are advertised for MCP"
        (doseq [scope ["agent:content:read" "agent:content:write" "agent:query:run"
                       "agent:sql:run" "agent:delivery:write"]]
          (testing scope
            (is (contains? mcp scope)))))
      (testing "agent-API per-entity scopes are not"
        (doseq [scope ["agent:collection:create" "agent:dashboard:create" "agent:dashboard:update"
                       "agent:metric:create" "agent:metric:update" "agent:question:create"
                       "agent:query:construct" "agent:query:execute" "agent:sql:construct"]]
          (testing scope
            (is (not (contains? mcp scope))))))
      (testing "but they remain advertised on the wider set, since those resources do accept them"
        (is (contains? wide "agent:collection:create"))
        (is (contains? wide "agent:query:execute")))
      (testing "so the MCP surface is strictly narrower"
        (is (< (count mcp) (count wide)))))))

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

(deftest resolve-access-token-requires-existing-client-test
  (testing "an access token stops authenticating once its oauth_client row is deleted (SEC-863)"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (oauth-server.tu/with-oauth-client [client-id]
          (let [token   (str (random-uuid))
                user-id (mt/user->id :rasta)
                expiry  (+ (inst-ms (java.util.Date.)) 3600000)]
            (oidc.store/save-access-token (:token-store (oauth-server/get-provider))
                                          token (str user-id) client-id ["openid"] expiry nil)
            (testing "resolves while the client exists"
              (is (=? {:user-id user-id
                       :scopes  #{"openid"}}
                      (oauth-server/resolve-access-token token))))
            (testing "returns nil once the client row is gone — token must not outlive its client"
              (t2/delete! :model/OAuthClient :client_id client-id)
              (is (nil? (oauth-server/resolve-access-token token))))))))))

;;; ----------------------------------- RFC 8707 resource narrowing -----------------------------------

(deftest narrow-scope-to-resource-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (let [mcp-uri "http://localhost:3000/api/metabase-mcp"
          scopes #(set (some-> % (str/split #"\s+")))]
      (testing "an indicator naming the MCP resource drops scopes that surface does not accept"
        (let [narrowed (scopes (oauth-server/narrow-scope-to-resource
                                [mcp-uri]
                                "agent:content:read agent:question:create agent:sql:execute agent:query:run"))]
          (is (= #{"agent:content:read" "agent:query:run"} narrowed))))
      (testing "every scope the surface advertises survives narrowing — otherwise the resource doc would
                advertise a scope its own consent flow strips"
        (let [advertised (oauth-server/mcp-resource-scopes)]
          (is (= (set advertised)
                 (scopes (oauth-server/narrow-scope-to-resource
                          [mcp-uri] (str/join " " advertised)))))))
      (testing "GHY-4226: `mb:full` is dropped like any other scope the surface does not accept. A
                client naming the MCP resource wants a token for that surface, which accepts none of
                the REST API that scope unlocks."
        (is (= #{"agent:content:read"}
               (scopes (oauth-server/narrow-scope-to-resource
                        [mcp-uri] "mb:full agent:content:read agent:question:create"))))
        (testing "and it is the only thing requested, nothing survives"
          (is (nil? (oauth-server/narrow-scope-to-resource [mcp-uri] "mb:full")))))
      (testing "GHY-4250: every alias narrows, not just the canonical path — a client that connected
                through an alias was handed that path as its resource identifier, so recognizing
                only the canonical one would silently hand it the wide consent screen"
        (doseq [path ["/api/metabase-mcp" "/api/mcp" "/api/metabase-mcp/v2"]]
          (testing path
            (is (= "agent:content:read"
                   (oauth-server/narrow-scope-to-resource
                    [(str "http://localhost:3000" path)]
                    "agent:content:read agent:question:create"))))))
      (testing "no indicator, or one naming a different resource, leaves the scope alone"
        (let [wide "agent:content:read agent:question:create"]
          (is (= wide (oauth-server/narrow-scope-to-resource nil wide)))
          (is (= wide (oauth-server/narrow-scope-to-resource [] wide)))
          (is (= wide (oauth-server/narrow-scope-to-resource
                       ["http://localhost:3000/api/agent"] wide)))))
      (testing "nil rather than an empty scope when nothing survives, so the caller drops the
                parameter instead of sending a blank one"
        (is (nil? (oauth-server/narrow-scope-to-resource [mcp-uri] "agent:question:create"))))
      (testing "blank and missing scopes stay absent rather than becoming an empty parameter"
        (doseq [blank [nil "" "   "]]
          (testing (pr-str blank)
            (is (nil? (oauth-server/narrow-scope-to-resource [mcp-uri] blank)))
            (is (nil? (oauth-server/narrow-scope-to-resource nil blank))))))
      (testing "narrowing only ever removes — a client cannot gain a scope it did not request"
        (let [requested "agent:content:read agent:question:create mb:full"]
          (is (every? (scopes requested)
                      (scopes (oauth-server/narrow-scope-to-resource [mcp-uri] requested)))))))))

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
          (doseq [indicator ["http://localhost:3000/api/metabase-mcp/v2/extra"
                             "http://localhost:3000/API/METABASE-MCP/V2"
                             "http://localhost:3001/api/metabase-mcp/v2"
                             "https://localhost:3000/api/metabase-mcp/v2"
                             "http://evil.example.com/api/metabase-mcp/v2"
                             "not-a-uri"]]
            (testing (str "leaves scope alone for " (pr-str indicator))
              (is (= wide (oauth-server/narrow-scope-to-resource [indicator] wide))))))))))
