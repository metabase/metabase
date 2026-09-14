(ns metabase.oauth-server.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   ;; load-bearing: the advertised scope sets are derived from the agent-api routes and the v2 tool
   ;; registry, so both must be loaded for these assertions to see the real surface
   [metabase.agent-api.api]
   [metabase.mcp.core :as mcp]
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
    (is (not (contains? (set (oauth-server/mcp-resource-scopes (mcp/mcp-canonical-path))) "mb:full")))
    (is (not (contains? (set (oauth-server/mcp-resource-scopes (mcp/mcp-canonical-path))) "mb:full")))
    (is (not (contains? (set (oauth-server/default-grant-scopes)) "mb:full")))))

(deftest default-grant-covers-everything-advertised-test
  (testing "GHY-4226: the DCR default is a ceiling, and clients derive what to request from
            discovery metadata rather than from what they registered with. A scope we advertise but
            do not register for is therefore not a narrower grant — it is an `invalid_scope`
            rejection at /authorize for any client that asks for everything advertised, which is
            what Claude and ChatGPT both do.

            Iterated over every endpoint path rather than over the sets `default-grant-scopes` is
            built from: asserting a set covers the sets it is defined as the union of cannot fail.
            The per-path arities are the ones a client actually meets, and the v1 aliases are inside
            the ceiling only incidentally today, because `all-scopes` also feeds `supported-scopes`."
    (let [ceiling (set (oauth-server/default-grant-scopes))]
      (doseq [path (mcp/mcp-endpoint-paths)]
        (testing path
          (is (empty? (remove ceiling (oauth-server/mcp-resource-scopes path))))))
      (testing "and the authorization-server metadata set"
        (is (empty? (remove ceiling (oauth-server/supported-scopes))))))))

(deftest v2-default-ask-covers-the-surface-and-is-requestable-test
  (testing "the v2 401 challenge asks an uninstructed client for every scope the surface accepts, and
            nothing else. Asking for less does not degrade gracefully: `list-tools` filters by token
            scopes, so an unasked-for write scope removes those tools from `tools/list` entirely, with
            no in-product way for the user to request them afterwards."
    (is (= (set (oauth-server/mcp-resource-scopes (mcp/mcp-canonical-path)))
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
  (testing "GHY-4151: `scopes_supported` is a set of scope strings (RFC 8414), so no scope may be
            advertised twice.

            Asserted on the sources rather than on the output. Every advertised set is built through
            a `sorted-set`, which makes the output distinct by construction no matter what goes in --
            so counting the result can never fail. What can go wrong is upstream: the same scope
            declared in both `v2-surface-scopes` and a v1 resource scope list, which the sorted-set
            silently swallows."
    (doseq [path (mcp/mcp-endpoint-paths)]
      (testing path
        (let [scopes (oauth-server/mcp-resource-scopes path)]
          (is (= (count (distinct scopes)) (count scopes))
              (str "duplicate scopes: "
                   (->> scopes frequencies (filter (fn [[_ n]] (> n 1))) (map key) sort vec))))))
    (testing "the v2 surface literal has no duplicates of its own"
      (is (= (count (distinct (mcp/v2-scopes))) (count (mcp/v2-scopes)))))))

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
  (testing "RFC 9728 metadata answers \"what does *this* resource accept\". Every MCP endpoint path now
            reaches the same v2 surface, so each advertises the rationalized scopes its tool registry
            gates on and none of the agent-API per-entity scopes. While v1 was still served the aliases
            that reached it had to advertise the wider set; with v1 retired that would list per-entity
            scopes on a consent screen for tools that no longer exist."
    (doseq [path (mcp/mcp-endpoint-paths)]
      (testing path
        (let [mcp (set (oauth-server/mcp-resource-scopes path))]
          (testing "the rationalized scopes are advertised"
            (doseq [scope ["agent:content:read" "agent:content:write" "agent:query:run"
                           "agent:sql:run" "agent:delivery:write"]]
              (testing scope
                (is (contains? mcp scope)))))
          (testing "agent-API per-entity scopes are not"
            (doseq [scope ["agent:collection:create" "agent:dashboard:create" "agent:dashboard:update"
                           "agent:metric:create" "agent:metric:update" "agent:question:create"
                           "agent:query:construct" "agent:query:execute" "agent:sql:construct"]]
              (testing scope
                (is (not (contains? mcp scope)))))))))
    (testing "every path answers the same set, since every path reaches the same surface"
      (is (= 1 (count (set (map (comp set oauth-server/mcp-resource-scopes)
                                (mcp/mcp-endpoint-paths)))))))))

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
          v1-uri  "http://localhost:3000/api/mcp"
          scopes #(set (some-> % (str/split #"\s+")))]
      (testing "an alias narrows to the same surface — every MCP path reaches it now, so a
                per-entity scope no tool gates on is dropped rather than carried into the grant"
        (let [narrowed (scopes (oauth-server/narrow-scope-to-resource
                                [v1-uri]
                                "agent:content:read agent:question:create agent:sql:execute agent:query:run"))]
          (is (not (contains? narrowed "agent:question:create")))
          (is (not (contains? narrowed "agent:sql:execute")))
          (is (contains? narrowed "agent:content:read"))
          (is (contains? narrowed "agent:query:run"))))
      (testing "an indicator naming the MCP resource drops scopes that surface does not accept"
        (let [narrowed (scopes (oauth-server/narrow-scope-to-resource
                                [mcp-uri]
                                "agent:content:read agent:question:create agent:sql:execute agent:query:run"))]
          (is (= #{"agent:content:read" "agent:query:run"} narrowed))))
      (testing "every scope the surface advertises survives narrowing — otherwise the resource doc would
                advertise a scope its own consent flow strips"
        (let [advertised (oauth-server/mcp-resource-scopes "/api/metabase-mcp")]
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
                only the canonical one would silently hand it the wide consent screen. Each narrows to
                what its OWN surface accepts: the v2 path to the v2 set, the aliases (still v1 until the
                switchover) to v1's, which is why `mb:full` goes everywhere but `agent:question:create`
                survives only where a v1 tool can still use it."
        (doseq [path ["/api/metabase-mcp" "/api/mcp"]]
          (testing path
            (let [narrowed (oauth-server/narrow-scope-to-resource
                            [(str "http://localhost:3000" path)]
                            "mb:full agent:content:read agent:question:create")]
              (is (not (str/includes? narrowed "mb:full")))
              (is (str/includes? narrowed "agent:content:read"))
              ;; Every path reaches v2, so none of them accept the agent-API per-entity scopes.
              (is (not (str/includes? narrowed "agent:question:create")))))))
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
        (doseq [indicator ["http://localhost:3000/api/metabase-mcp"
                           "http://localhost:3000/api/metabase-mcp/"
                           "HTTP://LOCALHOST:3000/api/metabase-mcp"
                           "http://LocalHost:3000/api/metabase-mcp/"]]
          (testing (str "matches " (pr-str indicator))
            (is (= narrowed (oauth-server/narrow-scope-to-resource [indicator] wide))))))
      (testing "the default port is elidable in both directions"
        (mt/with-temporary-setting-values [site-url "https://example.com"]
          (doseq [indicator ["https://example.com/api/metabase-mcp"
                             "https://example.com:443/api/metabase-mcp"]]
            (testing (str "matches " (pr-str indicator))
              (is (= narrowed (oauth-server/narrow-scope-to-resource [indicator] wide))))))
        (mt/with-temporary-setting-values [site-url "http://example.com"]
          (is (= narrowed (oauth-server/narrow-scope-to-resource
                           ["http://example.com:80/api/metabase-mcp"] wide)))))
      (testing "canonicalization does not make unrelated resources match"
        (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
          (doseq [indicator ["http://localhost:3000/api/metabase-mcp/extra"
                             "http://localhost:3000/API/METABASE-MCP/V2"
                             "http://localhost:3001/api/metabase-mcp"
                             "https://localhost:3000/api/metabase-mcp"
                             "http://evil.example.com/api/metabase-mcp"
                             "not-a-uri"]]
            (testing (str "leaves scope alone for " (pr-str indicator))
              (is (= wide (oauth-server/narrow-scope-to-resource [indicator] wide))))))))))

(deftest narrow-scope-to-resource-multiple-indicators-test
  (testing "RFC 8707 allows several `resource` indicators, and a token has to work against each, so the
            accepted set is the UNION of what the named resources accept. Every MCP path now reaches the
            same v2 surface, so the union is that one surface's set however many paths are named -- and a
            per-entity scope no surface accepts is never re-admitted by naming more of them."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [canonical "http://localhost:3000/api/metabase-mcp"
            alias1    "http://localhost:3000/api/mcp"
            wide      "mb:full agent:content:read agent:question:create agent:sql:execute"
            scopes    #(set (some-> % (str/split #"\s+")))]
        (testing "one indicator each: every path narrows to the v2 surface"
          (doseq [indicator [canonical alias1]]
            (testing indicator
              (let [narrowed (scopes (oauth-server/narrow-scope-to-resource [indicator] wide))]
                (is (contains? narrowed "agent:content:read"))
                (is (not (contains? narrowed "agent:question:create")))
                (is (not (contains? narrowed "agent:sql:execute")))))))
        (testing "naming several paths together is the same union, in either order"
          (doseq [indicators [[canonical alias1] [alias1 canonical]]]
            (testing (pr-str indicators)
              (let [narrowed (scopes (oauth-server/narrow-scope-to-resource indicators wide))]
                (is (contains? narrowed "agent:content:read"))
                (is (not (contains? narrowed "agent:question:create")))))))
        (testing "the union never re-admits a scope no named surface accepts"
          (doseq [indicators [[canonical] [alias1] [canonical alias1] [alias1 canonical]]]
            (testing (pr-str indicators)
              (is (not (contains? (scopes (oauth-server/narrow-scope-to-resource indicators wide))
                                  "mb:full"))))))))))

(deftest narrow-scope-to-resource-bare-string-test
  (testing "a lone indicator may arrive as a bare string -- the endpoint schema allows one. `keep` over a
            String iterates characters, none of which canonicalize, so an un-normalized argument would skip
            narrowing entirely and hand back the wide scope. Narrowing must not depend on the caller having
            vectorized."
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [uri  "http://localhost:3000/api/metabase-mcp"
            wide "mb:full agent:content:read agent:question:create"]
        (is (= (oauth-server/narrow-scope-to-resource [uri] wide)
               (oauth-server/narrow-scope-to-resource uri wide)))
        (is (= "agent:content:read" (oauth-server/narrow-scope-to-resource uri wide)))))))

(deftest narrow-scope-to-resource-underscore-host-test
  (testing "`java.net.URI/getHost` is nil for a host it considers non-conformant -- notably one containing an
            underscore, which is routine for Docker Compose and internal k8s service names, and which
            Metabase's own `u/url?` accepts as a Site URL. Reading the host alone made canonicalization
            return nil on such an instance, so no indicator ever matched and narrowing was disabled
            instance-wide, silently."
    (mt/with-temporary-setting-values [site-url "http://metabase_internal:3000"]
      (let [v2   "http://metabase_internal:3000/api/metabase-mcp"
            wide "mb:full agent:content:read agent:question:create"]
        (is (= "agent:content:read" (oauth-server/narrow-scope-to-resource [v2] wide))
            "narrowing still applies when the Site URL host contains an underscore")))
    (testing "canonicalization keeps the properties it had for conformant hosts"
      (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
        (let [wide     "agent:content:read agent:question:create"
              narrowed "agent:content:read"]
          (testing "userinfo is still stripped rather than compared"
            (is (= narrowed (oauth-server/narrow-scope-to-resource
                             ["http://user:pass@localhost:3000/api/metabase-mcp"] wide))))
          (testing "host case is still folded and the default port still elided"
            (is (= narrowed (oauth-server/narrow-scope-to-resource
                             ["HTTP://LocalHost:3000/api/metabase-mcp"] wide)))))))))
