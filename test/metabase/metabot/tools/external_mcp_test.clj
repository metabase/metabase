(ns metabase.metabot.tools.external-mcp-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.mcp-client.test-util :as mcp.tu]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools :as tools]
   [metabase.metabot.tools.external-mcp :as external-mcp]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel tool-name-test
  (testing "server and tool names are reduced to the characters providers accept"
    (is (= "notion_prod__notion-search" (external-mcp/tool-name "Notion (Prod)" "notion-search")))
    (is (= "mcp__api_v1_search" (external-mcp/tool-name "" "API/v1 search")))
    (is (= "linear__tool" (external-mcp/tool-name "Linear" "!!!"))))
  (testing "names are capped at 64 characters"
    (let [long-name (external-mcp/tool-name (str/join (repeat 40 "a")) (str/join (repeat 70 "b")))]
      (is (= 64 (count long-name)))
      (is (str/starts-with? long-name (str (str/join (repeat 24 "a")) "__"))))))

(deftest ^:parallel parameters-test
  (testing "a missing or non-object schema becomes an empty object schema"
    (is (= {:type "object" :properties {}} (external-mcp/parameters nil)))
    (is (= {:type "object" :properties {}} (external-mcp/parameters {:type "string"}))))
  (testing "an object schema is passed through"
    (let [schema {:type "object" :properties {:q {:type "string"}} :required ["q"]}]
      (is (= schema (external-mcp/parameters schema))))))

(deftest ^:parallel result->tool-result-test
  (testing "text content is joined and non-text content summarized"
    (is (= {:output "a\nb\n[image omitted]\nResource: Spec (file:///spec)"}
           (external-mcp/result->tool-result
            {:content [{:type "text" :text "a"}
                       {:type "text" :text "b"}
                       {:type "image" :data "..." :mimeType "image/png"}
                       {:type "resource_link" :uri "file:///spec" :name "Spec"}]}))))
  (testing "structured content stands in for missing text"
    (is (= {:output "{\"n\":1}"} (external-mcp/result->tool-result {:content [] :structuredContent {:n 1}}))))
  (testing "an empty result says so"
    (is (= {:output "The tool returned no output."} (external-mcp/result->tool-result {}))))
  (testing "tool errors are labelled"
    (is (= {:output "Error: boom"}
           (external-mcp/result->tool-result {:isError true :content [{:type "text" :text "boom"}]}))))
  (testing "long output is truncated"
    (let [{:keys [output]} (external-mcp/result->tool-result
                            {:content [{:type "text" :text (str/join (repeat 70000 "x"))}]})]
      (is (str/ends-with? output "[output truncated]"))
      (is (< (count output) 61000)))))

(deftest ^:parallel summary-test
  (testing "the first sentence or line of the description, whitespace collapsed"
    (is (= "Search across pages." (external-mcp/summary {:description "Search across pages.  Then more.\nAnd more"})))
    (is (= "Search across pages" (external-mcp/summary {:description "Search across pages\nDetails follow"}))))
  (testing "falls back to the title, then the name"
    (is (= "Echo" (external-mcp/summary {:name "echo" :title "Echo"})))
    (is (= "echo" (external-mcp/summary {:name "echo" :description ""}))))
  (testing "long summaries are cut"
    (let [s (external-mcp/summary {:description (str/join (repeat 300 "a"))})]
      (is (= 200 (count s)))
      (is (str/ends-with? s "…")))))

(def ^:private deferred-entries
  {"fake__echo" {:tool-name  "fake__echo"
                 :doc        "Echoes text."
                 :schema     [:=> [:cat :map] :any]
                 :parameters {:type "object" :properties {:text {:type "string"}}}
                 :deferred   {:group "Fake" :summary "Echoes text."}
                 :fn         identity}
   "fake__ping" {:tool-name  "fake__ping"
                 :doc        "Pings."
                 :schema     [:=> [:cat :map] :any]
                 :parameters {:type "object" :properties {}}
                 :deferred   {:group "Fake" :summary "Pings."}
                 :fn         identity}})

(deftest ^:parallel load-tool-entry-test
  (let [{:keys [tool-name fn]} (external-mcp/load-tool-entry deferred-entries)]
    (is (= external-mcp/load-tool-name tool-name))
    (testing "loading returns each tool's description and parameter schema, and names unknown tools"
      (is (= {:output (str "## fake__echo\nEchoes text.\n\nParameters (JSON Schema): "
                           "{\"type\":\"object\",\"properties\":{\"text\":{\"type\":\"string\"}}}\n\n"
                           "Unknown external tool: \"nope\". Load only names listed under \"External tools\".")}
             (fn {:names ["fake__echo" "nope" "fake__echo"]}))))))

(deftest ^:parallel loaded-tool-names-test
  (testing "names are collected from load calls with string or keyword argument keys, ignoring other tools"
    (is (= #{"a" "b"}
           (external-mcp/loaded-tool-names
            [{:role :user :content "hi"}
             {:type :tool-input :id "1" :function "load_mcp_tools" :arguments {"names" ["a"]}}
             {:type :tool-output :id "1" :result {:output "..."}}
             {:type :tool-input :id "2" :function "load_mcp_tools" :arguments {:names ["b" 3]}}
             {:type :tool-input :id "3" :function "search" :arguments {:names ["c"]}}]))))
  (is (= #{} (external-mcp/loaded-tool-names []))))

(deftest ^:parallel declared-tools-test
  (let [tools (assoc deferred-entries
                     "search" {:tool-name "search" :schema [:=> [:cat :map] :any] :fn identity}
                     "load_mcp_tools" (external-mcp/load-tool-entry deferred-entries))
        load  (fn [& names] {:type :tool-input :id "1" :function "load_mcp_tools" :arguments {:names (vec names)}})]
    (testing "deferred tools are withheld until the conversation loads them"
      (is (= #{"search" "load_mcp_tools"} (set (keys (tools/declared-tools tools [])))))
      (is (= #{"search" "load_mcp_tools" "fake__ping"}
             (set (keys (tools/declared-tools tools [(load "fake__ping" "unknown")]))))))
    (testing "loaded tools keep their full entry"
      (is (= (get tools "fake__ping")
             (get (tools/declared-tools tools [(load "fake__ping")]) "fake__ping"))))))

(defn- do-with-fake-server
  "Run `(f server state)` with the fake MCP server registered and `:rasta` connected to it."
  [f]
  (mcp.tu/do-with-fake-server
   (fn [base state]
     (mt/with-temp-env-var-value! [mb-mcp-client-allowed-networks "allow-all"]
       (mt/with-temp [:model/McpServer server {:name          "Fake"
                                               :url           (str base "/mcp")
                                               :provider      :custom
                                               :auth_strategy :header
                                               :enabled       true
                                               :credentials   {:header_name "Authorization" :header_value "Bearer token-1"}}
                      :model/McpConnection _ {:mcp_server_id (:id server)
                                              :user_id       (mt/user->id :rasta)
                                              :status        :connected}]
         (f server state))))))

(deftest tool-entries-test
  (do-with-fake-server
   (fn [server _state]
     (let [entries (external-mcp/tool-entries (mt/user->id :rasta))
           entry   (get entries "fake__echo")]
       (testing "each MCP tool becomes a tool entry named after its server"
         (is (= #{"fake__echo"} (set (keys entries))))
         (is (=? {:tool-name  "fake__echo"
                  :parameters (:inputSchema mcp.tu/echo-tool)
                  :scope      scope/agent-external-mcp-call
                  :deferred   {:group "Fake" :summary (external-mcp/summary mcp.tu/echo-tool)}}
                 entry))
         (is (str/starts-with? (:doc entry) "Echoes text"))
         (is (str/includes? (:doc entry) (:name server)))
         (is (= "Using Fake: echo" ((:title-fn entry) {:text "hi"}))))
       (testing "calling the entry calls the server and folds the result into output"
         (is (= {:output "echo: hi"} ((:fn entry) {:text "hi"}))))))))

(deftest with-external-mcp-tools-test
  (do-with-fake-server
   (fn [_server state]
     (let [user-id  (mt/user->id :rasta)
           built-in {"search" {:tool-name "search" :schema [:=> [:cat :map] :any] :fn identity}}]
       (testing "external tools and the load tool are added to the built-in tool map when the user's scope allows them"
         (binding [scope/*current-user-scope* api-scope/unrestricted]
           (let [tools (tools/with-external-mcp-tools built-in user-id)]
             (is (= #{"search" "fake__echo" "load_mcp_tools"} (set (keys tools))))
             (is (= {:output "echo: hi"} ((get-in tools ["fake__echo" :fn]) {:text "hi"})))
             (is (str/starts-with? (:output ((get-in tools ["load_mcp_tools" :fn]) {:names ["fake__echo"]}))
                                   "## fake__echo")))))
       (testing "a user connected to no server gets the built-in tools unchanged, without a load tool"
         (binding [scope/*current-user-scope* api-scope/unrestricted]
           (is (= built-in (tools/with-external-mcp-tools built-in (mt/user->id :crowberto))))))
       (testing "the external tools' and the load tool's fns are scope-checked at call time"
         (let [tools (binding [scope/*current-user-scope* api-scope/unrestricted]
                       (tools/with-external-mcp-tools built-in user-id))]
           (binding [scope/*current-user-scope* #{"agent:search"}]
             (is (= {:output "You do not have permission to use this tool."}
                    ((get-in tools ["fake__echo" :fn]) {:text "hi"})))
             (is (= {:output "You do not have permission to use this tool."}
                    ((get-in tools ["load_mcp_tools" :fn]) {:names ["fake__echo"]}))))))
       (testing "without the scope no server is contacted and the built-in tools are returned unchanged"
         (let [before (count (:requests @state))]
           (binding [scope/*current-user-scope* #{"agent:search"}]
             (is (= built-in (tools/with-external-mcp-tools built-in user-id))))
           (is (= before (count (:requests @state))))))
       (testing "a built-in tool keeps its name over a colliding external tool"
         (binding [scope/*current-user-scope* api-scope/unrestricted]
           (let [shadowing {"fake__echo" {:tool-name "fake__echo" :schema [:=> [:cat :map] :any] :fn (constantly :built-in)}}
                 tools     (tools/with-external-mcp-tools shadowing user-id)]
             (is (= :built-in ((get-in tools ["fake__echo" :fn]) {}))))))))))
