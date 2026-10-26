(ns metabase.oauth-server.core-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   ;; load-bearing: the advertised scope sets are derived from the agent-api routes and the v2 tool
   ;; registry, so both must be loaded for these assertions to see the real surface
   [metabase.agent-api.api]
   [metabase.mcp.core :as mcp]
   [metabase.mcp.v2.api :as v2.api]
   [metabase.oauth-server.api.metadata :as metadata]
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

(defn- advertised-scopes
  "The `scopes_supported` the RFC 9728 metadata publishes for the MCP resource at `path`."
  [path]
  (-> (#'metadata/protected-resource-metadata path) :body :scopes_supported))

(deftest mb-full-is-advertised-nowhere-test
  (testing "GHY-4226: `mb:full` grants full user-equivalent REST access, and advertising it put that
            in front of every client reading discovery metadata. It is now absent from both advertised
            sets and from the default DCR grant, so no client is led toward it and none can request it
            without having registered for it explicitly."
    (is (not (contains? (set (oauth-server/supported-scopes)) "mb:full")))
    (is (not (contains? (set (advertised-scopes (mcp/mcp-canonical-path))) "mb:full")))))

(deftest default-grant-covers-everything-advertised-test
  (testing "GHY-4226: the DCR default is a ceiling, and clients derive what to request from
            discovery metadata rather than from what they registered with. A scope we advertise but
            do not register for is therefore not a narrower grant — it is an `invalid_scope`
            rejection at /authorize for any client that asks for everything advertised, which is
            what Claude and ChatGPT both do."
    (let [ceiling (set (oauth-server/supported-scopes))]
      (doseq [path (mcp/mcp-endpoint-paths)]
        (testing path
          (is (empty? (remove ceiling (advertised-scopes path)))))))))

(deftest v2-default-ask-is-the-whole-surface-and-is-requestable-test
  (testing "ENG-11089: the v2 401 challenge asks an uninstructed client for every v2 scope. A manual reconnect from
            Claude's connector settings asks for exactly this, so a baseline-only challenge left SQL, writes and
            delivery unreachable. The user can still untick each one outside the baseline on the consent page."
    (is (= #{"agent:content:read" "agent:content:write" "agent:query:run"
             "agent:sql:run" "agent:delivery:write"}
           (set @#'v2.api/default-ask-scopes)))
    (testing "every asked scope is inside the ceiling, or the ask itself would be rejected"
      (let [ceiling (set (oauth-server/supported-scopes))]
        (doseq [scope @#'v2.api/default-ask-scopes]
          (testing scope
            (is (contains? ceiling scope))))))
    (testing "GHY-4226: the wider agent-API scopes stay out — asking for the surface is not asking for the REST API"
      (doseq [scope ["mb:full" "agent:question:create" "agent:timelines:write"]]
        (testing scope
          (is (not (contains? (set @#'v2.api/default-ask-scopes) scope))))))))

(deftest advertised-scopes-are-distinct-test
  (testing "GHY-4151: `scopes_supported` is a set of scope strings (RFC 8414, RFC 9728), so no scope may be
            advertised twice. The protected-resource metadata copies the v2 surface literal, so a scope repeated
            there is repeated on the wire."
    (let [duplicates (fn [scopes] (->> scopes frequencies (filter (fn [[_ n]] (> n 1))) (map key) sort vec))]
      (doseq [path (mcp/mcp-endpoint-paths)]
        (testing path
          (is (empty? (duplicates (advertised-scopes path))))))
      (testing "the v2 surface literal has no duplicates of its own"
        (is (empty? (duplicates (mcp/v2-scopes))))))))

(deftest rationalized-scopes-are-in-the-default-grant-test
  (testing "GHY-4225: the five v2 scopes must all reach the default grant a dynamically-registered
            client receives, or the tool surface advertises capabilities no such client can use."
    (let [granted (set (oauth-server/supported-scopes))]
      (doseq [scope ["agent:content:read" "agent:content:write" "agent:query:run"
                     "agent:sql:run" "agent:delivery:write"]]
        (testing scope
          (is (contains? granted scope)))))))

(deftest ^:parallel widen-to-grant-ceiling-test
  (let [widen   #'oauth-server/widen-to-grant-ceiling
        mcp     ["agent:content:read" "agent:sql:run"]
        ceiling ["agent:content:read" "agent:sql:run" "agent:question:create"]]
    (testing "GHY-4543: while registration is enabled, a dynamic client gains every ceiling scope it lacks, after the
              scopes it registered with"
      (is (= ["mb:full" "agent:content:read" "agent:sql:run" "agent:question:create"]
             (:scopes (widen {:registration-type "dynamic" :scopes ["mb:full" "agent:content:read"]}
                             true mcp ceiling)))))
    (testing "GHY-4543: while registration is disabled, a dynamic client still gains the MCP scopes, so a client that
              registered with the baseline can step up, but none of the other ceiling scopes"
      (is (= ["agent:content:read" "agent:sql:run"]
             (:scopes (widen {:registration-type "dynamic" :scopes ["agent:content:read"]} false mcp ceiling)))))
    (testing "a static client is unchanged"
      (let [client {:registration-type "static" :scopes ["profile"]}]
        (is (= client (widen client true mcp ceiling)))
        (is (= client (widen client false mcp ceiling)))))
    (testing "a missing client stays missing"
      (is (nil? (widen nil true mcp ceiling)))
      (is (nil? (widen nil false mcp ceiling))))))

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
