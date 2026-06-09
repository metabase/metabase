(ns metabase.server.middleware.session-oauth-test
  "Tests for the OAuth bearer-token bridge in the core session middleware — the single place an OAuth
  access token authenticates a request to the general (`/api/*`) API, and the single place the granted
  OAuth scopes are mapped onto `:token-scopes` for the scope-enforcement middleware."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.api.macros.scope :as scope]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [oidc-provider.store :as oidc.store]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private merge-current-user-info #'mw.session/merge-current-user-info)
(def ^:private oauth-token->token-scopes #'mw.session/oauth-token->token-scopes)

(defn- bearer-request [token]
  {:headers {"authorization" (str "Bearer " token)}})

(defn- save-access-token!
  "Persist an OAuth access token into the live provider's token store (the one [[oauth-server/resolve-access-token]]
   reads from) for the given user, scopes, and expiry (epoch millis)."
  [token user-id scopes expiry]
  (oidc.store/save-access-token (:token-store (oauth-server/get-provider))
                                token (str user-id) "test-client" (vec scopes) expiry nil))

(defn- in-one-hour [] (+ (System/currentTimeMillis) 3600000))
(defn- one-hour-ago [] (- (System/currentTimeMillis) 3600000))

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

(deftest bearer-bridge-full-access-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [user-id (mt/user->id :rasta)
          token   (str (random-uuid))]
      (save-access-token! token user-id [oauth-server/full-access-scope] (in-one-hour))
      (let [req (merge-current-user-info (bearer-request token))]
        (testing "resolves the bearer token to the user"
          (is (= user-id (:metabase-user-id req))))
        (testing "marks the request as oauth-authenticated"
          (is (= "oauth" (:embedding/auth-method req))))
        (testing "grants unrestricted token-scopes so the whole REST API is reachable"
          (is (= #{::scope/unrestricted} (:token-scopes req))))))))

(deftest bearer-bridge-narrow-scope-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [user-id (mt/user->id :rasta)
          token   (str (random-uuid))]
      (save-access-token! token user-id ["agent:query:execute"] (in-one-hour))
      (let [req (merge-current-user-info (bearer-request token))]
        (testing "resolves the user but only carries the narrow granted scopes"
          (is (= user-id (:metabase-user-id req)))
          (is (= #{"agent:query:execute"} (:token-scopes req))))))))

(deftest bearer-bridge-expired-token-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [token (str (random-uuid))]
      (save-access-token! token (mt/user->id :rasta) [oauth-server/full-access-scope] (one-hour-ago))
      (let [req (merge-current-user-info (bearer-request token))]
        (testing "an expired access token does not authenticate"
          (is (nil? (:metabase-user-id req)))
          (is (nil? (:token-scopes req))))))))

(deftest bearer-bridge-unknown-token-test
  (let [req (merge-current-user-info (bearer-request (str (random-uuid))))]
    (testing "an unknown bearer token does not authenticate"
      (is (nil? (:metabase-user-id req)))
      (is (nil? (:token-scopes req))))))

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
