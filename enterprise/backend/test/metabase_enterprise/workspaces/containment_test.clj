(ns metabase-enterprise.workspaces.containment-test
  "GHY-4062: the containment proof suite. This suite IS the answer to \"how can we be
  certain\" — it fails the build when someone widens the hole.

  Two layers, both about the parent-side `mb:workspace-manager` OAuth token:
  1. Static allowlist sweep: exactly the intended endpoints carry the
     `mb:workspace-manager` scope tag, and no other loaded namespace does.
  2. Workspace-scoped OAuth token: reaches the allowlist, 403s everywhere else
     (default-deny via `ensure-scopes-checked`).

  Refresh-cannot-widen is pinned in `metabase.oauth-server.api-test`
  (token-refresh-cannot-widen-scope-test); revocation of other sessions at
  workspace login in workspace-login-revokes-other-sessions-test.

  Child-side containment is out of scope: the child agent key is an admin key
  (v0), so there is no child-endpoint allowlist to prove."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.api.workspace-manager]
   [metabase.api.macros :as api.macros]
   [metabase.initialization-status.core :as init-status]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.users-rest.api]
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
          (testing "session/properties stays reachable (:scope :unchecked) — it serves anonymous
                    callers, so a scoped token must never be weaker than no token (CLI preflight)"
            (is (map? (client/client :get 200 "session/properties" (bearer token)))))
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
