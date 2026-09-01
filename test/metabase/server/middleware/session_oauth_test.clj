(ns metabase.server.middleware.session-oauth-test
  "Tests for the OAuth bearer-token bridge in the core session middleware — the single place an OAuth
  access token authenticates a request to the general (`/api/*`) API, and the single place the granted
  OAuth scopes are mapped onto `:token-scopes` for the scope-enforcement middleware."
  (:require
   [clojure.test :refer [deftest is testing]]
   ;; Loaded for its load-time side effects: it registers the agent API endpoints, from which the
   ;; OAuth provider derives its scopes-supported (see [[metabase.mcp.core/all-scopes]]). In a full
   ;; server boot [[metabase.api-routes.routes]] loads it; the isolated test classpath does not
   ;; mount the routes, so require it here as that route ns does.
   [metabase.agent-api.api]
   [metabase.api.macros.scope :as scope]
   [metabase.initialization-status.core :as init-status]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.events.revoke-on-deactivation] ; for side effects: revokes tokens on deactivation
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [oidc-provider.store :as oidc.store]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; The OAuth bearer path is gated on initialization being complete (like the session/api-key paths);
;; the isolated test runner never boots the web server, so mark init complete as session_test does.
(init-status/set-complete!)

(def ^:private merge-current-user-info #'mw.session/merge-current-user-info)
(def ^:private oauth-token->token-scopes #'mw.session/oauth-token->token-scopes)

(defn- bearer-request [token]
  {:headers {"authorization" (str "Bearer " token)}})

(defn- save-access-token!
  "Persist an OAuth access token into the live provider's token store (the one [[oauth-server/resolve-access-token]]
   reads from) for the given user, client, scopes, and expiry (epoch millis). `client-id` should come from
   [[oauth-server.tu/with-oauth-client]]."
  [token user-id client-id scopes expiry]
  (oidc.store/save-access-token (:token-store (oauth-server/get-provider))
                                token (str user-id) client-id (vec scopes) expiry nil))

(defn- revoke-access-token!
  "Revoke a token in the live provider's token store, as the `/oauth/revoke` endpoint does on logout."
  [token]
  (oidc.store/revoke-token (:token-store (oauth-server/get-provider)) token))

;; Wall-clock epoch millis for token expiry timestamps (not duration measurements) — use Date/inst-ms
;; rather than System/currentTimeMillis, matching the oauth-server store tests.
(defn- now-ms [] (inst-ms (java.util.Date.)))
(defn- in-one-hour [] (+ (now-ms) 3600000))
(defn- one-hour-ago [] (- (now-ms) 3600000))

;;; ----------------------------------------- scope mapping (the trust hinge) -----------------------------------------

(deftest oauth-token->token-scopes-test
  (testing "a token carrying the full-access scope maps to the unrestricted sentinel (general REST reachable)"
    (is (= #{::scope/unrestricted}
           (oauth-token->token-scopes #{oauth-server/full-access-scope})))
    (is (= #{::scope/unrestricted}
           (oauth-token->token-scopes #{oauth-server/full-access-scope "agent:query:execute"}))))
  (testing "any narrower scope set is passed through verbatim (only opted-in agent endpoints reachable)"
    (is (= #{"agent:query:execute"}
           (oauth-token->token-scopes #{"agent:query:execute"})))
    (is (= #{} (oauth-token->token-scopes #{})))))

(deftest token-scopes-satisfy-scope-middleware-test
  (testing "the full-access mapping passes endpoints that declare no :scope; a narrow one is rejected"
    (let [reached  (fn [token-scopes]
                     (let [p       (promise)
                           wrapped (scope/ensure-scopes-checked
                                    (fn [_ respond _] (respond {:status 200})))]
                       (wrapped {:token-scopes token-scopes}
                                (fn [resp] (deliver p (:status resp)))
                                (fn [e] (deliver p e)))
                       @p))]
      (is (= 200 (reached (oauth-token->token-scopes #{oauth-server/full-access-scope}))))
      (is (= 403 (reached (oauth-token->token-scopes #{"agent:query:execute"})))))))

;;; -------------------------------------------- end-to-end bridge (DB-backed) ----------------------------------------

;; The bearer bridge builds the OAuth provider (via `get-provider`), whose config derives its
;; issuer/endpoints from `site-url` — unset, that fails the provider's `ProviderSetup` schema. Set
;; it for every test that resolves a token, matching the other oauth-server tests.

(deftest bearer-bridge-full-access-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (oauth-server.tu/with-oauth-client [client-id]
        (let [user-id (mt/user->id :rasta)
              token   (str (random-uuid))]
          (save-access-token! token user-id client-id [oauth-server/full-access-scope] (in-one-hour))
          (let [req (merge-current-user-info (bearer-request token))]
            (testing "resolves the bearer token to the user"
              (is (= user-id (:metabase-user-id req))))
            (testing "marks the request as oauth-authenticated"
              (is (= "oauth" (:embedding/auth-method req))))
            (testing "grants unrestricted token-scopes so the whole REST API is reachable"
              (is (= #{::scope/unrestricted} (:token-scopes req))))))))))

(deftest bearer-bridge-narrow-scope-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (oauth-server.tu/with-oauth-client [client-id]
        (let [user-id (mt/user->id :rasta)
              token   (str (random-uuid))]
          (save-access-token! token user-id client-id ["agent:query:execute"] (in-one-hour))
          (let [req (merge-current-user-info (bearer-request token))]
            (testing "resolves the user but only carries the narrow granted scopes"
              (is (= user-id (:metabase-user-id req)))
              (is (= #{"agent:query:execute"} (:token-scopes req))))))))))

(deftest bearer-bridge-expired-token-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (oauth-server.tu/with-oauth-client [client-id]
        (let [token (str (random-uuid))]
          (save-access-token! token (mt/user->id :rasta) client-id [oauth-server/full-access-scope] (one-hour-ago))
          (let [req (merge-current-user-info (bearer-request token))]
            (testing "an expired access token does not authenticate"
              (is (nil? (:metabase-user-id req)))
              (is (nil? (:token-scopes req))))))))))

(deftest bearer-bridge-unknown-token-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (let [req (merge-current-user-info (bearer-request (str (random-uuid))))]
      (testing "an unknown bearer token does not authenticate"
        (is (nil? (:metabase-user-id req)))
        (is (nil? (:token-scopes req)))))))

(deftest bearer-bridge-revoked-token-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (oauth-server.tu/with-oauth-client [client-id]
        (let [user-id (mt/user->id :rasta)
              token   (str (random-uuid))]
          (save-access-token! token user-id client-id [oauth-server/full-access-scope] (in-one-hour))
          (testing "the token authenticates before it is revoked"
            (is (= user-id (:metabase-user-id (merge-current-user-info (bearer-request token))))))
          (revoke-access-token! token)
          (testing "after revocation (as on logout) the same token no longer authenticates"
            (let [req (merge-current-user-info (bearer-request token))]
              (is (nil? (:metabase-user-id req)))
              (is (nil? (:token-scopes req))))))))))

(deftest bearer-bridge-deactivation-revokes-test
  (testing "deactivating the user revokes the bearer token, and reactivating does NOT revive it (SEC-863)"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (oauth-server.tu/with-oauth-client [client-id]
          (let [user-id (mt/user->id :rasta)
                token   (str (random-uuid))]
            (save-access-token! token user-id client-id [oauth-server/full-access-scope] (in-one-hour))
            (testing "authenticates before deactivation"
              (is (= user-id (:metabase-user-id (merge-current-user-info (bearer-request token))))))
            (t2/update! :model/User user-id {:is_active false})
            (testing "after deactivation the token no longer authenticates"
              (is (nil? (:metabase-user-id (merge-current-user-info (bearer-request token))))))
            (t2/update! :model/User user-id {:is_active true})
            (testing "after reactivation the same token STILL does not authenticate"
              (is (nil? (:metabase-user-id (merge-current-user-info (bearer-request token))))))))))))

(deftest resolve-access-token-deactivated-user-test
  (testing "S1: a still-live token for a user who has since been deactivated does NOT resolve — the shared
            resolver gates on is_active so the v1 MCP transport (which dispatches straight on :user-id,
            with no is_active re-check of its own) can't authenticate a deactivated user's bearer token"
    ;; Uses :rasta (a shared fixture user) but restores `is_active` and deletes the token in a `finally`,
    ;; so the deactivation can't leak to sibling tests. A rollback-only transaction does NOT isolate the
    ;; update from tests running on other connections; a `with-temp` user hits an FK on teardown because the
    ;; token row still references it.
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (let [user-id (mt/user->id :rasta)
            token   (str (random-uuid))]
        (try
          (save-access-token! token user-id [oauth-server/full-access-scope] (in-one-hour))
          (testing "resolves while the user is active"
            (is (= user-id (:user-id (oauth-server/resolve-access-token token)))))
          (t2/update! :model/User user-id {:is_active false})
          (testing "stops resolving once the user is deactivated"
            (is (nil? (oauth-server/resolve-access-token token))))
          (finally
            (t2/update! :model/User user-id {:is_active true})
            (t2/delete! :model/OAuthAccessToken :token token)))))))

(deftest bearer-bridge-precedence-test
  (testing "session/api-key auth takes precedence — bearer resolution is not even attempted"
    (let [called? (atom false)]
      (with-redefs [oauth-server/resolve-access-token (fn [_] (reset! called? true) nil)
                    ;; pretend an API key authenticated the request
                    mw.session/current-user-info-for-api-key (fn [_] {:metabase-user-id 99 :is-superuser? false})]
        (let [req (merge-current-user-info {:headers {"authorization" "Bearer anything"
                                                      "x-api-key"     "mb_whatever"}})]
          (is (= 99 (:metabase-user-id req)))
          (is (= "api-key" (:embedding/auth-method req)))
          (is (nil? (:token-scopes req)) "api-key auth must not set token-scopes")
          (is (false? @called?) "bearer token store must not be consulted when api-key already authenticated"))))))
