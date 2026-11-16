(ns metabase-enterprise.workspaces.scope-test
  "`mb:workspace-manager` is the scope of exactly the workspace manager endpoints, and a credential holding only it,
  an API key or an OAuth token, reaches those and nothing else."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.api.workspace-manager]
   [metabase.api-scope.core :as api-scope]
   [metabase.api-scope.workspace-manager :as api-scope.workspace-manager]
   [metabase.api.macros :as api.macros]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [oidc-provider.store :as oidc.store]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; `:web-server` marks initialization complete, which API key and bearer auth both require
(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(def ^:private manager-ns 'metabase-enterprise.workspaces.api.workspace-manager)

(defn- tagged-endpoints
  "Endpoints of `ns-sym` whose metadata carries the workspace-manager scope."
  [ns-sym]
  (filter #(= api-scope.workspace-manager/workspace-manager (get-in % [:form :metadata :scope]))
          (vals (api.macros/ns-routes ns-sym))))

(deftest every-workspace-manager-endpoint-and-nothing-else-is-tagged-test
  (let [routes (vals (api.macros/ns-routes manager-ns))]
    (is (seq routes))
    (is (= (count routes) (count (tagged-endpoints manager-ns)))))
  (testing "no other loaded namespace tags an endpoint with the scope"
    (is (empty? (for [n     (all-ns)
                      :when (and (:api/endpoints (meta n))
                                 (not= manager-ns (ns-name n))
                                 (seq (tagged-endpoints (ns-name n))))]
                  (ns-name n))))))

(defn- reaches-only-workspace-routes [request-options]
  (testing "workspace manager routes answer"
    (is (sequential? (client/client :get 200 "ee/workspace-manager/" {:request-options request-options})))
    (is (= "Not found."
           (client/client :get 404 (str "ee/workspace-manager/" Integer/MAX_VALUE)
                          {:request-options request-options}))))
  (testing "other routes refuse the scope"
    (doseq [path ["user/current" "database" "setting" "api-key" "collection"]]
      (testing path
        (is (contains? #{"scope_not_permitted" "unsupported_scope"}
                       (:error (client/client :get 403 path {:request-options request-options}))))))))

(deftest workspace-manager-api-key-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-model-cleanup [:model/ApiKey :model/User]
      (let [{admin-key :unmasked_key} (mt/user-http-request :crowberto :post 200 "api-key"
                                                            {:group_id (:id (perms-group/admin))
                                                             :name     "CI workspaces"
                                                             :scope    "workspace-manager"})
            {member-key :unmasked_key} (mt/user-http-request :crowberto :post 200 "api-key"
                                                             {:group_id (:id (perms-group/all-users))
                                                              :name     "CI workspaces, not an admin"
                                                              :scope    "workspace-manager"})
            {full-key :unmasked_key} (mt/user-http-request :crowberto :post 200 "api-key"
                                                           {:group_id (:id (perms-group/admin))
                                                            :name     "full admin"})]
        (reaches-only-workspace-routes {:headers {"x-api-key" admin-key}})
        (testing "the scope does not widen a non-admin key"
          (is (= "You don't have permissions to do that."
                 (client/client :get 403 "ee/workspace-manager/" {:request-options {:headers {"x-api-key" member-key}}}))))
        (testing "an unscoped admin key is unaffected"
          (doseq [path ["ee/workspace-manager/" "user/current" "database" "setting"]]
            (testing path
              (is (client/client :get 200 path {:request-options {:headers {"x-api-key" full-key}}})))))))))

(defn- do-with-workspace-manager-oauth-token!
  "Call `f` with the request options of an OAuth bearer token for crowberto that holds only `mb:workspace-manager`."
  [f]
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
          (f {:headers {"authorization" (str "Bearer " token)}})
          (finally
            (t2/delete! :model/OAuthAccessToken :client_id client-id)))))))

(deftest workspace-manager-oauth-token-test
  (mt/with-premium-features #{:workspaces}
    (do-with-workspace-manager-oauth-token! reaches-only-workspace-routes)))

(deftest workspace-manager-scope-description-names-the-config-download-test
  (testing "the consent text says the scope can download config files that hold database credentials"
    (let [description (str (api-scope/scope-description api-scope.workspace-manager/workspace-manager))]
      (is (str/includes? description "config"))
      (is (str/includes? description "credentials")))))

(defn- do-with-config-download-credentials!
  "Call `f` with a map of request options by credential: `:scoped-key` (an API key with scope `workspace-manager`),
  `:oauth-token` (an OAuth token with `mb:workspace-manager`), and `:full-key` (an unscoped admin API key)."
  [f]
  (mt/with-model-cleanup [:model/ApiKey :model/User]
    (let [create-key! (fn [body]
                        (:unmasked_key (mt/user-http-request :crowberto :post 200 "api-key"
                                                             (merge {:group_id (:id (perms-group/admin))} body))))
          as-key      (fn [k] {:headers {"x-api-key" k}})
          scoped-key  (create-key! {:name "CI workspaces", :scope "workspace-manager"})
          full-key    (create-key! {:name "full admin"})]
      (do-with-workspace-manager-oauth-token!
       (fn [oauth-token]
         (f {:scoped-key  (as-key scoped-key)
             :oauth-token oauth-token
             :full-key    (as-key full-key)}))))))

(defn- download-config [expected-status ws-id request-options]
  (client/client :get expected-status (str "ee/workspace-manager/" ws-id "/config")
                 {:request-options request-options}))

(deftest scoped-config-download-of-a-tunnelled-database-answers-422-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp [:model/Database {db-id :id} {:name    "Tunnel DW"
                                                :engine  :postgres
                                                :details {:host               "db.example"
                                                          :port               5432
                                                          :tunnel-enabled     true
                                                          :tunnel-host        "bastion.example"
                                                          :tunnel-user        "tunnel"
                                                          :tunnel-auth-option "password"
                                                          :tunnel-pass        "PARENT-TUNNEL-PASSWORD"}}
                   :model/Workspace {ws-id :id} {:name       "tunnel"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _ {:workspace_id     ws-id
                                               :database_id      db-id
                                               :database_details {:user "ws_user" :password "ws-pass"}
                                               :output_namespace "ws_tunnel"
                                               :input_schemas    ["public"]
                                               :status           :provisioned}]
      (do-with-config-download-credentials!
       (fn [{:keys [scoped-key oauth-token full-key]}]
         (testing "the scoped key cannot read the database"
           (is (= "unsupported_scope"
                  (:error (client/client :get 403 (str "database/" db-id) {:request-options scoped-key})))))
         (doseq [[credential request-options] {"a scoped API key" scoped-key, "a scoped OAuth token" oauth-token}]
           (testing (str "a config download with " credential " answers 422 and names the database")
             (is (= (str "Database \"Tunnel DW\" uses an SSH tunnel. A credential with the mb:workspace-manager scope "
                         "cannot download the config of a workspace with a tunnelled database, because the config "
                         "would need the parent's tunnel secrets. Download it with an unscoped admin credential, or "
                         "remove the database from the workspace.")
                    (download-config 422 ws-id request-options)))))
         (testing "an unscoped admin key's config download carries the tunnel password"
           (let [body (str (download-config 200 ws-id full-key))]
             (is (str/includes? body "bastion.example"))
             (is (str/includes? body "PARENT-TUNNEL-PASSWORD")))))))))

(deftest scoped-config-download-without-a-tunnelled-database-is-unchanged-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp [:model/Database {db-id :id} {:name    "Plain DW"
                                                :engine  :postgres
                                                :details {:host "db.example" :port 5432}}
                   :model/Workspace {ws-id :id} {:name       "plain"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _ {:workspace_id     ws-id
                                               :database_id      db-id
                                               :database_details {:user "ws_user" :password "ws-pass"}
                                               :output_namespace "ws_plain"
                                               :input_schemas    ["public"]
                                               :status           :provisioned}]
      (do-with-config-download-credentials!
       (fn [{:keys [scoped-key oauth-token full-key]}]
         (let [full-body (download-config 200 ws-id full-key)]
           (is (str/includes? full-body "ws-pass"))
           (doseq [[credential request-options] {"a scoped API key" scoped-key, "a scoped OAuth token" oauth-token}]
             (testing (str "a config download with " credential " answers 200 with the unscoped admin's config")
               (is (= full-body (download-config 200 ws-id request-options)))))))))))
