(ns metabase.mcp-client.tools-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp-client.test-util :as mcp.tu]
   [metabase.mcp-client.tools :as mcp.tools]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- do-with-fake-server
  "Run `(f base state)` against the fake MCP server with the network policy opened up so the client may reach it."
  [f]
  (mcp.tu/do-with-fake-server
   (fn [base state]
     (mt/with-temp-env-var-value! [mb-mcp-client-allowed-networks "allow-all"]
       (f base state)))))

(defn- header-server
  [base]
  {:name          "Fake"
   :url           (str base "/mcp")
   :provider      :custom
   :auth_strategy :header
   :enabled       true
   :credentials   {:header_name "Authorization" :header_value "Bearer token-1"}})

(defn- tools-list-calls
  [state]
  (count (filter #{"tools/list"} (:mcp-methods @state))))

(deftest user-tools-header-server-test
  (do-with-fake-server
   (fn [base state]
     (mt/with-temp [:model/McpServer {:keys [id]} (header-server base)]
       (let [user-id (mt/user->id :rasta)]
         (testing "a header-authenticated server is hidden until the user connects to it"
           (is (= [] (mcp.tools/user-tools user-id)))
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not connected"
                                 (mcp.tools/call-user-tool! user-id id "echo" {:text "hi"})))
           (is (= 0 (tools-list-calls state))))
         (mt/with-temp [:model/McpConnection _ {:mcp_server_id id :user_id user-id :status :connected}]
           (let [listed (mcp.tools/user-tools user-id)]
             (testing "a connected user sees the server's tools"
               (is (=? [{:server {:id id :name "Fake"} :tools [mcp.tu/echo-tool]}] listed)))
             (testing "the server's credentials are not exposed"
               (is (not (contains? (:server (first listed)) :credentials))))
             (testing "the listing is cached"
               (mcp.tools/user-tools user-id)
               (is (= 1 (tools-list-calls state))))
             (testing "calling a tool reuses the cached client"
               (is (=? {:content [{:type "text" :text "echo: hi"}]}
                       (mcp.tools/call-user-tool! user-id id "echo" {:text "hi"})))
               (is (= 1 (tools-list-calls state)))
               (is (= "Bearer token-1" (get-in (last (:requests @state)) [:headers "authorization"]))))
             (testing "an expired entry is rebuilt"
               (swap! @#'mcp.tools/cache update-vals #(assoc % :expires-at 0))
               (mcp.tools/user-tools user-id)
               (is (= 2 (tools-list-calls state)))))))))))

(deftest user-tools-oauth-server-test
  (do-with-fake-server
   (fn [base _state]
     (mt/with-temp [:model/McpServer {:keys [id]} (assoc (header-server base) :auth_strategy :oauth :credentials nil)]
       (let [user-id (mt/user->id :rasta)]
         (testing "an OAuth server is hidden from users who have not connected"
           (is (= [] (mcp.tools/user-tools user-id)))
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not connected"
                                 (mcp.tools/call-user-tool! user-id id "echo" {:text "hi"}))))
         (testing "a connected user sees its tools and calls them with the stored token"
           (mt/with-temp [:model/McpConnection _ {:mcp_server_id id
                                                  :user_id       user-id
                                                  :status        :connected
                                                  :access_token  "token-1"}]
             (is (=? [{:server {:id id} :tools [mcp.tu/echo-tool]}] (mcp.tools/user-tools user-id)))
             (is (=? {:content [{:type "text" :text "echo: hi"}]}
                     (mcp.tools/call-user-tool! user-id id "echo" {:text "hi"})))))
         (testing "a pending connection is not usable"
           (mt/with-temp [:model/McpConnection _ {:mcp_server_id id :user_id user-id :status :pending}]
             (is (= [] (mcp.tools/user-tools user-id))))))))))

(deftest user-tools-skips-disabled-and-unreachable-servers-test
  (do-with-fake-server
   (fn [base _state]
     (let [user-id (mt/user->id :rasta)]
       (mt/with-temp [:model/McpServer {:keys [id]} (header-server base)
                      :model/McpServer disabled (assoc (header-server base) :name "Disabled" :enabled false)
                      :model/McpServer broken (assoc (header-server base) :name "Broken" :url (str base "/nowhere"))
                      :model/McpConnection _ {:mcp_server_id id :user_id user-id :status :connected}
                      :model/McpConnection _ {:mcp_server_id (:id disabled) :user_id user-id :status :connected}
                      :model/McpConnection _ {:mcp_server_id (:id broken) :user_id user-id :status :connected}]
         (testing "disabled servers are hidden and unreachable servers are skipped without hiding the others"
           (is (=? [{:server {:id id}}] (mcp.tools/user-tools user-id)))))))))

(deftest call-user-tool-unknown-server-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"does not exist"
                        (mcp.tools/call-user-tool! (mt/user->id :rasta) Integer/MAX_VALUE "echo" {}))))
