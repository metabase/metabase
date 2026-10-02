(ns metabase.mcp.oauth-only-test
  "The MCP endpoint serves only OAuth bearer tokens bound to the MCP resource. Every other way to authenticate a
  Metabase request is refused there with the 401 discovery challenge, so the client starts the OAuth flow, and nothing
  is dispatched."
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.test-util :as mcp.tu]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [oidc-provider.store :as oidc.store]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private probe-tool "oauth_only_probe")

(defn- do-with-probe-tool!
  "Register a tool that counts its calls, call `f` with the count atom, then restore the registry."
  [f]
  (let [tools-atom @#'registry/tools*
        snapshot   @tools-atom
        calls      (atom 0)]
    (try
      (registry/register-tool! {:name        probe-tool
                                :scope       metabot.scope/agent-content-read
                                :description "test-only tool that counts its calls"
                                :annotations {:readOnlyHint true}
                                :args        [:map]
                                :handler     (fn [_ _]
                                               (swap! calls inc)
                                               {:content [{:type "text" :text "ran"}]})})
      (f calls)
      (finally
        (reset! tools-atom snapshot)
        (reset! @#'registry/manifest-cache nil)))))

(defn- jsonrpc-request [method params]
  {:jsonrpc "2.0" :method method :params params :id 1})

(def ^:private mcp-requests
  "The requests each caller sends to each MCP path: `[label method body-fn]`. `body-fn` takes the MCP session id."
  [["POST initialize" :post   (fn [_] (jsonrpc-request "initialize" {:capabilities {}}))]
   ["POST tools/call" :post   (fn [_] (jsonrpc-request "tools/call" {:name probe-tool :arguments {}}))]
   ["GET (SSE)"       :get    (constantly nil)]
   ["DELETE"          :delete (constantly nil)]])

(defn- send!
  "Send one MCP request to `path` with `headers`, plus the `Mcp-Session-Id` header naming `session-id`, expecting
  `expected-status` (the test client throws on an unexpected 401)."
  [expected-status method path headers session-id body]
  (apply client/client-full-response method expected-status path
         {:request-options {:headers (cond-> headers session-id (assoc "mcp-session-id" session-id))}}
         (when body [body])))

(defn- anonymous-challenge
  "The `WWW-Authenticate` header an unauthenticated request to `path` gets."
  [path]
  (get-in (client/client-full-response :post 401 path {:request-options {:headers {}}}
                                       (jsonrpc-request "initialize" {:capabilities {}}))
          [:headers "WWW-Authenticate"]))

(defn- session-cookie [session-key]
  {"cookie" (str "metabase.SESSION=" session-key)})

(defn- bearer [token]
  {"authorization" (str "Bearer " token)})

(defn- mint!
  "An access token for `user-id` holding `scopes`, with the given options for
  [[oauth-server.tu/insert-access-token!]]."
  [user-id client-id scopes & {:as opts}]
  (apply oauth-server.tu/insert-access-token! user-id client-id scopes (mapcat identity opts)))

(defn- refused-callers!
  "`[label user-id headers]` for every way a caller can authenticate that the MCP endpoint must refuse. `client-id`
  names a live OAuth client for the tokens; `api-keys` maps a label to `[user-id key]`."
  [client-id api-keys]
  (let [rasta     (mt/user->id :rasta)
        crowberto (mt/user->id :crowberto)
        mcp-res   (oauth-server.tu/mcp-resource)
        ui-cred   (let [sid (mcp.session/create! rasta)]
                    (mcp.session/issue-ui-credential sid rasta mcp.tu/all-scopes nil))
        revoked   (mint! rasta client-id mcp.tu/all-scopes :resource mcp-res)]
    (oidc.store/revoke-token (:token-store (oauth-server/get-provider)) revoked)
    (concat
     [["no credential"                   rasta     {}]
      ["a cookie session"                rasta     (session-cookie (test.users/username->token :rasta))]
      ["an admin's cookie session"       crowberto (session-cookie (test.users/username->token :crowberto))]
      ["an X-Metabase-Session header"    rasta     {"x-metabase-session" (test.users/username->token :rasta)}]
      ["a data-app request with a session"
       rasta     (assoc (session-cookie (test.users/username->token :rasta)) "x-metabase-client" "data-app")]
      ["an MCP Apps UI credential"       rasta     {"x-metabase-mcp-ui-auth" ui-cred}]
      ["a REST OAuth token with MCP scopes"
       rasta     (bearer (mint! rasta client-id mcp.tu/all-scopes))]
      ["a REST OAuth token with mb:full"
       rasta     (bearer (mint! rasta client-id [oauth-server/full-access-scope]))]
      ["an OAuth token bound to another resource"
       rasta     (bearer (mint! rasta client-id mcp.tu/all-scopes :resource ["http://localhost:3000/api"]))]
      ["an expired MCP-bound OAuth token"
       rasta     (bearer (mint! rasta client-id mcp.tu/all-scopes :resource mcp-res
                                :expiry (- (inst-ms (java.util.Date.)) 3600000)))]
      ["a revoked MCP-bound OAuth token" rasta     (bearer revoked)]]
     (for [[label [user-id api-key]] api-keys]
       [label user-id {"x-api-key" api-key}]))))

(defn- create-api-key!
  "Create an API key in `group`. Returns `[key-id user-id unmasked-key]`."
  [group]
  (let [{:keys [id unmasked_key]} (mt/user-http-request :crowberto :post 200 "api-key"
                                                        {:group_id (:id group) :name (str (random-uuid))})]
    [id (t2/select-one-fn :user_id :model/ApiKey :id id) unmasked_key]))

(deftest only-mcp-bound-oauth-tokens-reach-the-mcp-endpoint-test
  (testing "Every caller that is not an OAuth token bound to the MCP resource gets the 401 discovery challenge at
            every MCP path, for every request the transport serves, and no tool runs. A request that carried a bearer
            token gets the same challenge with `error=\"invalid_token\"`."
    (mcp.tu/do-with-site-url!
     (fn []
       (mt/test-helpers-set-global-values!
         (oauth-server.tu/with-oauth-client [client-id]
           (mt/with-temp [:model/User {deactivated-id :id} {}]
             (mt/with-model-cleanup [:model/OAuthAccessToken]
               (let [deactivated (mint! deactivated-id client-id mcp.tu/all-scopes
                                        :resource (oauth-server.tu/mcp-resource))
                     _           (t2/query {:update :core_user :set {:is_active false} :where [:= :id deactivated-id]})
                     api-keys    (into {} (for [[label group] [["a regular group's API key" (perms-group/all-users)]
                                                               ["an admin API key" (perms-group/admin)]]]
                                            [label (create-api-key! group)]))]
                 (try
                   (do-with-probe-tool!
                    (fn [calls]
                      (doseq [[label user-id headers]
                              (concat (refused-callers! client-id (update-vals api-keys (fn [[_ u k]] [u k])))
                                      [["an MCP-bound OAuth token whose user is deactivated"
                                        deactivated-id (bearer deactivated)]])
                              path                   ["metabase-mcp" "mcp"]
                              [req-label method body-fn] mcp-requests]
                        (testing (str label ", " path ", " req-label)
                          (let [session-id (mcp.session/create! user-id)
                                response   (send! 401 method path headers session-id (body-fn session-id))
                                challenge  (cond-> (anonymous-challenge path)
                                             (contains? headers "authorization") (str ", error=\"invalid_token\""))]
                            (is (= 401 (:status response)))
                            (is (= challenge (get-in response [:headers "WWW-Authenticate"])))
                            (is (nil? (get-in response [:headers "Mcp-Session-Id"])))
                            (is (nil? (get-in response [:body :result]))))))
                      (testing "no tool ran"
                        (is (zero? @calls)))
                      (testing "control: an MCP-bound OAuth token holding the scope is served at both paths"
                        (doseq [path ["metabase-mcp" "mcp"]]
                          (testing path
                            (let [headers    (mcp.tu/bearer-headers! :rasta)
                                  init       (send! 200 :post path headers nil
                                                    (jsonrpc-request "initialize" {:capabilities {}}))
                                  session-id (get-in init [:headers "Mcp-Session-Id"])]
                              (is (= 200 (:status init)))
                              (is (= 200 (:status (send! 200 :post path headers session-id
                                                         (jsonrpc-request "tools/call"
                                                                          {:name probe-tool :arguments {}})))))
                              (testing "DELETE gets past auth to the transport's own 405"
                                (is (= 405 (:status (send! 405 :delete path headers session-id nil))))))))
                        (is (= 2 @calls)))))
                   (finally
                     (doseq [[key-id] (vals api-keys)]
                       (mt/user-http-request :crowberto :delete 204 (str "api-key/" key-id)))
                     (t2/query {:update :core_user :set {:is_active true} :where [:= :id deactivated-id]}))))))))))))

(deftest mcp-bearer-plus-another-users-cookie-never-runs-as-the-cookie-user-test
  (testing "An MCP-bound bearer for rasta sent with crowberto's session cookie: the session middleware prefers the
            session, so the request is not OAuth-authenticated and the MCP endpoint refuses it. It never runs as
            crowberto."
    (mcp.tu/do-with-site-url!
     (fn []
       (do-with-probe-tool!
        (fn [calls]
          (let [headers    (merge (mcp.tu/bearer-headers! :rasta)
                                  (session-cookie (test.users/username->token :crowberto)))
                session-id (mcp.session/create! (mt/user->id :crowberto))]
            (doseq [path ["metabase-mcp" "mcp"]
                    [label method body-fn] mcp-requests]
              (testing (str path ", " label)
                (let [response (send! 401 method path headers session-id (body-fn session-id))]
                  (is (= 401 (:status response)))
                  (is (nil? (get-in response [:body :result]))))))
            (is (zero? @calls)))))))))
