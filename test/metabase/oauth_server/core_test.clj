(ns metabase.oauth-server.core-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   ;; Loaded for its load-time side effects: it registers the agent API endpoints, from which
   ;; `get-provider` derives the provider's supported scopes (see [[metabase.mcp.core/all-scopes]]).
   [metabase.agent-api.api]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.test :as mt]
   [oidc-provider.store :as oidc.store]
   [toucan2.core :as t2]))

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
