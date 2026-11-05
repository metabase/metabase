(ns metabase-enterprise.workspaces.scope-test
  "`mb:workspace-manager` is the scope of exactly the workspace manager endpoints, and a credential holding only it,
  an API key or an OAuth token, reaches those and nothing else."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.api]
   [metabase.api-scope.workspace-manager :as api-scope.workspace-manager]
   [metabase.api.macros :as api.macros]
   [metabase.initialization-status.core :as init-status]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [oidc-provider.store :as oidc.store]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- tagged-endpoints
  "Endpoints of `ns-sym` whose metadata carries the workspace-manager scope."
  [ns-sym]
  (filter #(= api-scope.workspace-manager/workspace-manager (get-in % [:form :metadata :scope]))
          (vals (api.macros/ns-routes ns-sym))))

(deftest every-workspace-manager-endpoint-and-nothing-else-is-tagged-test
  (let [routes (vals (api.macros/ns-routes 'metabase-enterprise.workspaces.api))]
    (is (seq routes))
    (is (= (count routes) (count (tagged-endpoints 'metabase-enterprise.workspaces.api)))))
  (testing "no other loaded namespace tags an endpoint with the scope"
    (is (empty? (for [n     (all-ns)
                      :when (and (:api/endpoints (meta n))
                                 (not= 'metabase-enterprise.workspaces.api (ns-name n))
                                 (seq (tagged-endpoints (ns-name n))))]
                  (ns-name n))))))

(defn- reaches-only-workspace-routes [request-options]
  (testing "a workspace manager route answers"
    (is (=? {:data sequential?, :total int?}
            (client/client :get 200 "ee/workspace-manager/" {:request-options request-options}))))
  (testing "other routes refuse the scope"
    (doseq [path ["user/current" "database" "setting" "api-key" "collection"]]
      (testing path
        (is (contains? #{"scope_not_permitted" "unsupported_scope"}
                       (:error (client/client :get 403 path {:request-options request-options}))))))))

(deftest workspace-manager-api-key-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-model-cleanup [:model/ApiKey]
      (let [{admin-key :unmasked_key} (mt/user-http-request :crowberto :post 200 "api-key"
                                                            {:group_id (:id (perms-group/admin))
                                                             :name     "CI workspaces"
                                                             :scope    "workspace-manager"})
            {member-key :unmasked_key} (mt/user-http-request :crowberto :post 200 "api-key"
                                                             {:group_id (:id (perms-group/all-users))
                                                              :name     "CI workspaces, not an admin"
                                                              :scope    "workspace-manager"})]
        (reaches-only-workspace-routes {:headers {"x-api-key" admin-key}})
        (testing "the scope narrows an admin key and never widens a non-admin one"
          (is (= "You don't have permissions to do that."
                 (client/client :get 403 "ee/workspace-manager/" {:request-options {:headers {"x-api-key" member-key}}}))))))))

(deftest workspace-manager-oauth-token-test
  ;; the bearer bridge is gated on initialization being complete, which the test runner never marks
  (init-status/set-complete!)
  (mt/with-premium-features #{:workspaces}
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (mt/with-temp [:model/OAuthClient {client-id :client_id} {:client_id         (str (random-uuid))
                                                                 :redirect_uris     ["https://example.com/callback"]
                                                                 :grant_types       ["authorization_code"]
                                                                 :response_types    ["code"]
                                                                 :scopes            ["mb:workspace-manager"]
                                                                 :registration_type "static"}]
        (let [token (str "scope-test-" (random-uuid))]
          ;; through the provider's store, which hashes tokens at rest
          (oidc.store/save-access-token (:token-store (oauth-server/get-provider)) token
                                        (str (mt/user->id :crowberto)) client-id
                                        [api-scope.workspace-manager/workspace-manager]
                                        (+ (System/currentTimeMillis) (* 60 60 1000)) nil)
          (try
            (reaches-only-workspace-routes {:headers {"authorization" (str "Bearer " token)}})
            (finally
              (t2/delete! :model/OAuthAccessToken :client_id client-id))))))))
