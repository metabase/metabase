(ns metabase.mcp-client.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.mcp-client.test-util :as mcp.tu]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmacro ^:private with-fake-server
  "A fake MCP + authorization server, with the network policy opened up so the client may reach localhost."
  [[base state] & body]
  `(mcp.tu/do-with-fake-server
    (fn [~base ~state]
      (mt/with-temp-env-var-value! [~'mb-mcp-client-allowed-networks "allow-all"]
        (mt/with-model-cleanup [:model/McpServer]
          ~@body)))))

(defn- error-message
  "The message of an error response, which is a bare string for plain 400s and a map for richer ones."
  [body]
  (if (map? body) (:message body) body))

(defn- create-server! [body]
  (mt/user-http-request :crowberto :post 200 "mcp-client/server" body))

(defn- server-url [id & [suffix]]
  (str "mcp-client/server/" id suffix))

(deftest management-requires-superuser-test
  (let [body {:name "x" :url "https://example.com/mcp" :provider "custom" :auth_strategy "none"}]
    (is (= "You don't have permissions to do that." (mt/user-http-request :rasta :post 403 "mcp-client/server" body)))
    (mt/with-temp [:model/McpServer {:keys [id]} {:name "x" :url "https://example.com/mcp" :provider :custom :auth_strategy :none}]
      (is (= "You don't have permissions to do that." (mt/user-http-request :rasta :put 403 (server-url id) {:name "y"})))
      (is (= "You don't have permissions to do that." (mt/user-http-request :rasta :delete 403 (server-url id))))
      (testing "but anyone may see the servers"
        (is (=? [{:id id :name "x" :connection nil}] (mt/user-http-request :rasta :get 200 "mcp-client/server")))))))

(deftest create-server-validation-test
  (mt/with-model-cleanup [:model/McpServer]
    (is (str/includes? (error-message (mt/user-http-request :crowberto :post 400 "mcp-client/server"
                                                            {:name "x" :url "ftp://example.com" :provider "custom" :auth_strategy "none"}))
                       "http or https"))
    (is (str/includes? (error-message (mt/user-http-request :crowberto :post 400 "mcp-client/server"
                                                            {:name "x" :url "https://example.com/mcp" :provider "custom" :auth_strategy "header"}))
                       "header name"))))

(deftest header-server-test
  (with-fake-server [base state]
    (let [{:keys [id] :as server} (create-server! {:name          "Fake"
                                                   :url           (str base "/mcp")
                                                   :provider      "custom"
                                                   :auth_strategy "header"
                                                   :header_name   "Authorization"
                                                   :header_value  "Bearer token-1"})]
      (testing "the shared credential is stored but never shown"
        (is (=? {:auth_strategy "header" :has_credentials true :connection nil} server))
        (is (not (contains? server :credentials)))
        (is (= {:header_name "Authorization" :header_value "Bearer token-1"}
               (:credentials (t2/select-one :model/McpServer :id id)))))
      (testing "connecting needs no browser"
        (is (=? {:redirect_url nil :connection {:status "connected"}}
                (mt/user-http-request :rasta :post 200 (server-url id "/connect"))))
        (is (=? [{:connection {:status "connected"}}] (mt/user-http-request :rasta :get 200 "mcp-client/server"))))
      (testing "tools are listed with the shared credential"
        (is (= ["echo"] (map :name (:tools (mt/user-http-request :rasta :get 200 (server-url id "/tools"))))))
        (is (= "Bearer token-1" (get-in (last (:requests @state)) [:headers "authorization"]))))
      (testing "editing keeps the credential when the value is left blank"
        (mt/user-http-request :crowberto :put 200 (server-url id) {:name "Renamed" :header_name "Authorization" :header_value ""})
        (is (= "Bearer token-1" (get-in (t2/select-one :model/McpServer :id id) [:credentials :header_value]))))
      (testing "disconnecting removes the connection"
        (mt/user-http-request :rasta :delete 204 (server-url id "/connection"))
        (is (=? [{:connection nil}] (mt/user-http-request :rasta :get 200 "mcp-client/server"))))
      (testing "changing the URL disconnects everyone"
        (mt/user-http-request :rasta :post 200 (server-url id "/connect"))
        (mt/user-http-request :crowberto :put 200 (server-url id) {:url (str base "/mcp2")})
        (is (nil? (t2/select-one :model/McpConnection :mcp_server_id id))))
      (testing "deleting the server"
        (mt/user-http-request :crowberto :delete 204 (server-url id))
        (is (nil? (t2/select-one :model/McpServer :id id)))))))

(defn- callback-location [user params]
  (let [response (apply client/client-full-response (test.users/username->token user) :get 302 "mcp-client/oauth/callback"
                        (mapcat identity params))]
    (get-in response [:headers "Location"])))

(deftest oauth-flow-test
  (with-fake-server [base state]
    (mt/with-temporary-setting-values [site-url "http://metabase.test"]
      (let [{:keys [id]} (create-server! {:name "Fake" :url (str base "/mcp") :provider "custom" :auth_strategy "oauth"})
            {:keys [redirect_url connection]} (mt/user-http-request :rasta :post 200 (server-url id "/connect"))
            params (mcp.tu/query-params redirect_url)]
        (testing "connecting hands back the authorization URL and a pending connection"
          (is (= "pending" (:status connection)))
          (is (str/starts-with? redirect_url (str base "/authorize?")))
          (is (=? {:client_id     "client-123"
                   :redirect_uri  "http://metabase.test/api/mcp-client/oauth/callback"
                   :resource      (str base "/mcp")
                   :scope         "default"
                   :code_challenge_method "S256"}
                  params)))
        (testing "the registration is kept on the server for everyone"
          (is (=? {:issuer base :redirect_uri "http://metabase.test/api/mcp-client/oauth/callback" :registration {:client_id "client-123"}}
                  (:oauth_client (t2/select-one :model/McpServer :id id))))
          (is (=? {:application_type "web" :redirect_uris ["http://metabase.test/api/mcp-client/oauth/callback"]}
                  (:registration @state))))
        (swap! state assoc :code-challenge (:code_challenge params))
        (testing "someone else cannot finish this flow"
          (is (str/includes? (callback-location :crowberto {:state (:state params) :code "good-code" :iss base}) "mcp_error="))
          (is (= :pending (:status (t2/select-one :model/McpConnection :mcp_server_id id :user_id (mt/user->id :rasta))))))
        (testing "a mismatched state is refused"
          (is (str/includes? (callback-location :rasta {:state "nope" :code "good-code" :iss base}) "mcp_error=")))
        (testing "the owner finishes it and lands back on the admin page"
          (is (= (str "/admin/metabot/mcp/external?mcp_connected=" id)
                 (callback-location :rasta {:state (:state params) :code "good-code" :iss base}))))
        (let [stored (t2/select-one :model/McpConnection :mcp_server_id id :user_id (mt/user->id :rasta))]
          (testing "tokens and account details are stored, the pending state is gone"
            (is (=? {:status        :connected
                     :access_token  "token-1"
                     :refresh_token "refresh-1"
                     :expires_at    some?
                     :account       {:workspace_name "Fake Workspace"}
                     :oauth_state   nil
                     :oauth_pending nil}
                    stored)))
          (testing "the API shows the connection without its tokens"
            (let [[server] (mt/user-http-request :rasta :get 200 "mcp-client/server")]
              (is (=? {:status "connected" :account {:workspace_name "Fake Workspace"}} (:connection server)))
              (is (not (contains? (:connection server) :access_token)))))
          (testing "tools are listed with the user's token"
            (is (= ["echo"] (map :name (:tools (mt/user-http-request :rasta :get 200 (server-url id "/tools"))))))
            (is (= "Bearer token-1" (get-in (last (:requests @state)) [:headers "authorization"]))))
          (testing "an expiring token is refreshed and the new one stored"
            (t2/update! :model/McpConnection (:id stored) {:expires_at (t/offset-date-time)})
            (mt/user-http-request :rasta :get 200 (server-url id "/tools"))
            (is (=? {:grant_type "refresh_token" :refresh_token "refresh-1"} (:token-request @state)))
            (is (= "Bearer token-2" (get-in (last (:requests @state)) [:headers "authorization"])))
            (is (= "token-2" (:access_token (t2/select-one :model/McpConnection :id (:id stored))))))
          (testing "another user is not connected"
            (is (str/includes? (error-message (mt/user-http-request :crowberto :get 400 (server-url id "/tools"))) "not connected"))))))))
