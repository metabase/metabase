(ns metabase-enterprise.workspaces.containment-test
  "GHY-4062: the containment proof suite. This suite IS the answer to \"how can we be
  certain\" — it fails the build when someone widens the hole.

  Three layers:
  1. Static allowlist sweep: exactly the intended endpoints carry the
     `mb:workspace-manager` scope tag, and no other loaded namespace does.
  2. Parent side, workspace-scoped OAuth token: reaches the allowlist, 403s
     everywhere else (default-deny via `ensure-scopes-checked`).
  3. Child side, all-users api-key: the admin exfil paths (database connection
     edit, remote-sync repoint/test-connection) are dead; sync operations work
     only in workspace mode and only for a data analyst.

  Refresh-cannot-widen is pinned in `metabase.oauth-server.api-test`
  (token-refresh-cannot-widen-scope-test); full-scope revocation at workspace
  login in workspace-login-revokes-full-scope-sessions-test."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.api.workspace-manager]
   [metabase-enterprise.workspaces.core :as ws-mode]
   [metabase.api-keys.core :as api-keys]
   [metabase.api.macros :as api.macros]
   [metabase.initialization-status.core :as init-status]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.users-rest.api]
   [metabase.util.secret :as u.secret]
   [oidc-provider.store :as oidc.store]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; the OAuth bearer bridge is gated on initialization being complete; the isolated
;; test runner never boots the web server, so mark it complete as session tests do.
(init-status/set-complete!)

;;; ------------------------------------ 1. static allowlist sweep ------------------------------------

(def ^:private workspace-manager-scope "mb:workspace-manager")

(defn- scope-tagged-endpoints
  "Endpoints in `ns-sym` whose defendpoint metadata carries the workspace-manager scope."
  [ns-sym]
  (into []
        (filter #(= workspace-manager-scope (get-in % [:form :metadata :scope])))
        (vals (api.macros/ns-routes ns-sym))))

(deftest scope-allowlist-is-exactly-the-intended-surface-test
  (testing "all 7 workspace-manager endpoints are tagged"
    (let [routes (vals (api.macros/ns-routes 'metabase-enterprise.workspaces.api.workspace-manager))]
      (is (= 7 (count routes)))
      (is (= 7 (count (scope-tagged-endpoints 'metabase-enterprise.workspaces.api.workspace-manager)))
          "every workspace-manager endpoint must carry the scope tag")))
  (testing "users-rest exposes exactly one tagged endpoint (GET /current, whoami)"
    (is (= 1 (count (scope-tagged-endpoints 'metabase.users-rest.api)))))
  (testing "NO other loaded namespace tags an endpoint with mb:workspace-manager"
    (let [allowed  '#{metabase-enterprise.workspaces.api.workspace-manager
                      metabase.users-rest.api}
          offender (for [n     (all-ns)
                         :when (and (:api/endpoints (meta n))
                                    (not (contains? allowed (ns-name n))))
                         :when (seq (scope-tagged-endpoints (ns-name n)))]
                     (ns-name n))]
      (is (empty? offender)
          "widening the workspace-manager scope surface requires updating this proof suite"))))

;;; ------------------------------- 2. workspace-scoped token, parent side -------------------------------

(defn- bearer [token]
  {:request-options {:headers {"authorization" (str "Bearer " token)}}})

(defn- seed-scoped-token!
  "Save a workspace-manager-scoped OAuth access token for `user` through the live
   provider's token store (the library hashes tokens at rest, so seeding must go
   through it, not raw t2). Returns the bearer token string."
  [user expiry]
  (let [token (str "containment-" (random-uuid))]
    (oidc.store/save-access-token (:token-store (oauth-server/get-provider))
                                  token
                                  (str (mt/user->id user))
                                  "containment-suite"
                                  [workspace-manager-scope]
                                  expiry
                                  nil)
    token))

(deftest workspace-scoped-token-reaches-only-the-allowlist-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      ;; no rollback-only transaction here: the handler may look the token up outside
      ;; this thread's transaction, so insert for real and clean up in `finally`
      (let [token (seed-scoped-token! :crowberto (+ (inst-ms (java.util.Date.)) (* 60 60 1000)))]
        (try
          (testing "allowlist: workspace-manager list + whoami respond 200"
            (is (sequential? (client/client :get 200 "ee/workspace-manager/" (bearer token))))
            (is (=? {:email "crowberto@metabase.com"}
                    (client/client :get 200 "user/current" (bearer token)))))
          (testing "everything outside the allowlist rejects with scope_not_permitted"
            (doseq [[method url] [[:post "card"]
                                  [:get  "dashboard"]
                                  [:get  "database"]
                                  [:post "dataset"]
                                  [:get  "collection"]
                                  [:get  "user"]
                                  [:get  "api-key"]
                                  [:get  "permissions/group"]
                                  [:put  "setting/site-name"]
                                  [:get  "ee/workspace-instance/current"]]]
              (testing (str method " /api/" url)
                (is (= "scope_not_permitted"
                       (:error (client/client method 403 url (bearer token))))))))
          (testing "an expired scoped token does not authenticate at all"
            (let [expired (seed-scoped-token! :crowberto (- (inst-ms (java.util.Date.)) 1000))]
              (client/client :get 401 "user/current" (bearer expired))))
          (finally
            (t2/delete! :model/OAuthAccessToken :client_id "containment-suite")))))))

;;; ---------------------------------- 3. child api-key, all-users group ----------------------------------

(defn- api-key-header [k]
  {:request-options {:headers {"x-api-key" k}}})

(deftest child-api-key-exfil-paths-are-dead-test
  (mt/with-premium-features #{:workspaces :remote-sync}
    (let [api-key (mt/with-current-user (mt/user->id :crowberto)
                    (api-keys/create-api-key-with-new-user! {:key-name "containment agent key"}))
          k       (u.secret/expose (:unmasked_key api-key))]
      (try
        (testing "db-connection-host swap: PUT /api/database/:id is 403 for the all-users key"
          (mt/with-temp [:model/Database {db-id :id} {:engine :h2 :details {}}]
            (client/client :put 403 (str "database/" db-id) (api-key-header k)
                           {:details {:db "evil://exfil"}})))
        (testing "remote-sync repoint: PUT /api/ee/remote-sync/settings is 403"
          (client/client :put 403 "ee/remote-sync/settings" (api-key-header k)
                         {:remote-sync-url "https://github.com/evil/exfil.git"}))
        (testing "remote-sync test-connection (URL probe with stored token) is 403"
          (client/client :post 403 "ee/remote-sync/test-connection" (api-key-header k) {}))
        (testing "sync operations: workspace mode + data-analyst required"
          (mt/with-data-analyst-role! (:user_id api-key)
            (testing "outside workspace mode: 403 even for a data analyst"
              (client/client :get 403 "ee/remote-sync/is-dirty" (api-key-header k)))
            (testing "in workspace mode: is-dirty answers the key"
              (try
                (ws-mode/set-instance-workspace! {:name      "containment-ws"
                                                  :databases {(mt/id) {:input_schemas ["_"]
                                                                       :output        {:schema "ws_out"}}}})
                (is (=? {:is_dirty boolean?}
                        (client/client :get 200 "ee/remote-sync/is-dirty" (api-key-header k))))
                (finally
                  (ws-mode/clear-instance-workspace!)))))
          (testing "workspace mode alone is not enough: non-analyst key user is 403"
            (try
              (ws-mode/set-instance-workspace! {:name      "containment-ws"
                                                :databases {(mt/id) {:input_schemas ["_"]
                                                                     :output        {:schema "ws_out"}}}})
              (client/client :get 403 "ee/remote-sync/is-dirty" (api-key-header k))
              (finally
                (ws-mode/clear-instance-workspace!)))))
        (finally
          (t2/delete! :model/ApiKey :id (:id api-key))
          (t2/delete! :model/User :id (:user_id api-key)))))))
