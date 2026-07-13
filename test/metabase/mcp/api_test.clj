(ns metabase.mcp.api-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.api.macros.scope :as scope]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.api :as mcp.api]
   [metabase.mcp.instructions :as mcp.instructions]
   [metabase.mcp.resources :as mcp.resources]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.skills :as mcp.skills]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.search.test-util :as search.tu]
   [metabase.system.settings :as system.settings]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [throttle.core :as throttle]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

;; Backend-only test runs don't produce embed-mcp.html; install the inline fallback.
(use-fixtures :each
  (fn [thunk]
    (mcp.resources/with-fallback-template (thunk))))

;;; --------------------------------------------------- Helpers ----------------------------------------------------

(def ^:private encoded-query
  "Base64 of a minimal MBQL query — the payload shape handle callers store and read back."
  (u/encode-base64 (json/encode {:database 1 :type "query" :stages [{:source-table 1}]})))

(def ^:private mcp-app-ui-capabilities
  {:extensions {:io.modelcontextprotocol/ui {:mimeTypes ["text/html;profile=mcp-app"]}}})

(defn- with-ui-capabilities
  "Add the per-request `_meta` capabilities a client sends on the stateless protocol to advertise that
   it can render MCP Apps."
  [params]
  (assoc params :_meta {:io.modelcontextprotocol/capabilities mcp-app-ui-capabilities}))

(defn- jsonrpc-request
  "Build a JSON-RPC 2.0 request map."
  ([method]
   (jsonrpc-request method {} 1))
  ([method params]
   (jsonrpc-request method params 1))
  ([method params id]
   {:jsonrpc "2.0" :method method :params params :id id}))

(defn- jsonrpc-notification
  "Build a JSON-RPC 2.0 notification (no id)."
  ([method]
   (jsonrpc-notification method {}))
  ([method params]
   {:jsonrpc "2.0" :method method :params params}))

(defn- mcp-request
  "POST a JSON-RPC body to /api/mcp as :crowberto, with optional extra headers. No handshake, no
   session header — every request stands on its own."
  ([body]
   (mcp-request body {}))
  ([body extra-headers]
   (client/client-full-response (test.users/username->token :crowberto)
                                :post "mcp"
                                {:request-options {:headers extra-headers}}
                                body)))

(defn- mcp-request-as
  "Like `mcp-request` but authenticates as the given test username."
  ([username body]
   (mcp-request-as username body {}))
  ([username body extra-headers]
   (client/client-full-response (test.users/username->token username)
                                :post "mcp"
                                {:request-options {:headers extra-headers}}
                                body)))

(defn- mcp-request-unauthenticated
  "Make an unauthenticated POST request to /api/mcp."
  [body]
  (client/client-full-response :post 401 "mcp" {:request-options {:headers {}}} body))

(defn- mcp-request-with-bearer
  "Make a POST request to /api/mcp with a bearer token."
  [bearer-token expected-status body]
  (client/client-full-response :post expected-status "mcp"
                               {:request-options {:headers {"authorization" (str "Bearer " bearer-token)}}}
                               body))

(def ^:private mcp-endpoint-paths
  "Client paths that serve the MCP endpoint, appended to the test client's `/api`: the canonical
   `metabase-mcp` and the legacy `mcp` alias."
  ["metabase-mcp" "mcp"])

(defn- mcp-request-to
  "Like `mcp-request` but to an explicit endpoint path (e.g. \"metabase-mcp\"), authenticated as :crowberto."
  [path body]
  (client/client-full-response (test.users/username->token :crowberto)
                               :post path
                               {:request-options {:headers {}}}
                               body))

(defn- mcp-request-unauthenticated-to
  "Make an unauthenticated POST to an explicit endpoint path, expecting a 401."
  [path body]
  (client/client-full-response :post 401 path {:request-options {:headers {}}} body))

(defn- tools-list
  "Call `tools/list` and return the tools. `params` lets a caller advertise client capabilities."
  ([]
   (tools-list {}))
  ([params]
   (get-in (mcp-request (jsonrpc-request "tools/list" params)) [:body :result :tools])))

(defn- call-tool
  "Call an MCP tool and return the parsed MCP result content (the JSON-decoded text from the first
   content block). Records test failures if the status is not 200 or the tool returns an error."
  ([tool-name arguments]
   (call-tool tool-name arguments {}))
  ([tool-name arguments params]
   (let [response (mcp-request (jsonrpc-request "tools/call"
                                                (merge {:name tool-name :arguments arguments} params)))
         result   (get-in response [:body :result])]
     (is (= 200 (:status response))
         (str "Expected 200 from tools/call " tool-name))
     (is (not (:isError result))
         (str "Tool " tool-name " error: " (some-> result :content first :text)))
     (when-not (:isError result)
       (is (contains? result :structuredContent)
           (str "Tool " tool-name " declared an outputSchema in tools/list but did "
                "not return structuredContent — MCP spec violation."))
       (json/decode+kw (:text (first (:content result))))))))

(defn- call-ui-tool
  "Call a UI tool, advertising MCP Apps support the way a stateless client does. Returns the raw
   JSON-RPC response so error branches can be asserted."
  ([tool-name arguments]
   (call-ui-tool :crowberto tool-name arguments))
  ([username tool-name arguments]
   (mcp-request-as username
                   (jsonrpc-request "tools/call"
                                    (with-ui-capabilities {:name tool-name :arguments arguments})))))

;;; --------------------------------------------------- Auth -------------------------------------------------------

(deftest authentication-required-test
  (testing "unauthenticated requests return 401"
    (let [response (client/client-full-response :post 401 "mcp" (jsonrpc-request "server/discover"))]
      (is (= 401 (:status response)))
      (is (= -32603 (get-in response [:body :error :code]))))))

(deftest origin-validation-test
  (testing "cross-origin browser requests are rejected when the origin is not configured"
    (let [response (mcp-request (jsonrpc-request "ping")
                                {"host"   "mbtest.poom.dev"
                                 "origin" "http://127.0.0.1:6274"})]
      (is (= 403 (:status response)))
      (is (= "Origin not allowed" (get-in response [:body :error :message])))))
  (testing "cross-origin browser requests are accepted for configured MCP client origins"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins "http://127.0.0.1:6274"]
      (is (= 200 (:status (mcp-request (jsonrpc-request "ping")
                                       {"host"   "mbtest.poom.dev"
                                        "origin" "http://127.0.0.1:6274"}))))))
  (testing "same-origin requests with bracketed IPv6 hosts are accepted"
    (is (= 200 (:status (mcp-request (jsonrpc-request "ping")
                                     {"host"   "[::1]:3000"
                                      "origin" "http://[::1]:3000"})))))
  (testing "same-origin requests with mixed-case host/origin are accepted"
    (is (= 200 (:status (mcp-request (jsonrpc-request "ping")
                                     {"host"   "Example.com"
                                      "origin" "https://example.COM"})))))
  (testing "approved MCP origins match the Origin header case-insensitively"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins "https://Example.COM"]
      (is (= 200 (:status (mcp-request (jsonrpc-request "ping")
                                       {"host"   "mbtest.poom.dev"
                                        "origin" "HTTPS://example.com"}))))))
  (testing "a trailing slash on a configured MCP CORS origin has no effect (#75839)"
    (mt/with-temporary-setting-values [mcp.settings/mcp-apps-cors-custom-origins "http://127.0.0.1:6274/"]
      (is (= 200 (:status (mcp-request (jsonrpc-request "ping")
                                       {"host"   "mbtest.poom.dev"
                                        "origin" "http://127.0.0.1:6274"})))))))

(deftest mcp-enabled-setting-test
  (testing "external MCP requests return 403 when disabled"
    (mt/with-temporary-setting-values [mcp.settings/mcp-enabled? false]
      (let [response (mcp-request (jsonrpc-request "ping"))]
        (is (= 403 (:status response)))
        (is (= "MCP server is not enabled." (:body response)))))))

(deftest ai-features-enabled-setting-test
  (testing "external MCP requests return 403 when AI features are globally disabled"
    (mt/with-temporary-raw-setting-values [:ai-features-enabled? "false"
                                           :mcp-enabled?         "true"]
      (let [response (mcp-request (jsonrpc-request "ping"))]
        (is (= 403 (:status response)))
        (is (= "AI features are not enabled." (:body response)))))))

;;; ------------------------------------------------ Stateless core -------------------------------------------------

(deftest server-discover-test
  (testing "server/discover reports the protocol, capabilities, and server info without establishing anything"
    (let [response (mcp-request (jsonrpc-request "server/discover"))]
      (is (= 200 (:status response)))
      (is (=? {:jsonrpc "2.0"
               :id      1
               :result  {:protocolVersion "2026-07-28"
                         :capabilities    {:tools     {:listChanged true}
                                           :resources {}
                                           :prompts   {:listChanged false}}
                         :serverInfo      {:name "metabase" :version "0.1.0"}
                         :instructions    (mcp.instructions/instructions)}}
              (:body response))))
    (testing "and it does not hand back a session"
      (is (nil? (get-in (mcp-request (jsonrpc-request "server/discover")) [:headers "Mcp-Session-Id"]))))))

(deftest initialize-carries-the-instructions-test
  (testing "a client that predates the stateless core gets the instructions from its handshake, which is
            the only place it will look for them"
    (let [response (mcp-request (jsonrpc-request "initialize" {:protocolVersion "2025-06-18"}))]
      (is (= (mcp.instructions/instructions)
             (get-in response [:body :result :instructions]))))))

;;; --------------------------------------------------- Prompts -----------------------------------------------------

(deftest prompts-list-test
  (testing "the playbooks are advertised with their arguments, and are cacheable like the other listings"
    (let [result (get-in (mcp-request (jsonrpc-request "prompts/list")) [:body :result])]
      (is (=? {:ttlMs      pos-int?
               :cacheScope "session"
               :prompts    [{:name      "explore_database"
                             :arguments [{:name "database" :required true}]}
                            {:name "build_dashboard"}]}
              result)))))

(deftest prompts-get-test
  (testing "prompts/get renders the playbook as a user message with the caller's arguments in it"
    (let [result (get-in (mcp-request (jsonrpc-request "prompts/get"
                                                       {:name      "explore_database"
                                                        :arguments {:database "Sample Database"}}))
                         [:body :result])]
      (is (=? {:description string?
               :messages    [{:role    "user"
                              :content {:type "text"}}]}
              result))
      (is (str/includes? (-> result :messages first :content :text) "Sample Database"))))
  (testing "a missing required argument comes back as invalid-params, naming the argument"
    (is (=? {:code    -32602
             :message #"Missing required argument: database"}
            (get-in (mcp-request (jsonrpc-request "prompts/get" {:name "explore_database"}))
                    [:body :error]))))
  (testing "an unknown prompt is not found"
    (is (=? {:code -32602}
            (get-in (mcp-request (jsonrpc-request "prompts/get" {:name "nope"}))
                    [:body :error])))))

;;; ---------------------------------------------------- Skills ------------------------------------------------------

(deftest skills-are-readable-over-the-wire-test
  (testing "every shipped skill is fetchable at its `skill://` URI, with the cache metadata that lets a
            client hold it across turns"
    (doseq [{:keys [name uri]} (mcp.skills/skills)]
      (testing name
        (let [result (get-in (mcp-request (jsonrpc-request "resources/read" {:uri uri})) [:body :result])]
          (is (=? {:ttlMs      pos-int?
                   :cacheScope "global"
                   :contents   [{:uri uri :mimeType "text/markdown"}]}
                  result))
          (is (str/includes? (-> result :contents first :text) (str "name: " name))))))))

(deftest cold-request-test
  (testing "every method works on a request that arrives cold — no handshake, no session header"
    (doseq [method ["ping" "server/discover" "tools/list" "resources/list" "prompts/list"]]
      (testing method
        (let [response (mcp-request (jsonrpc-request method))]
          (is (= 200 (:status response)))
          (is (nil? (get-in response [:body :error]))))))))

(deftest cold-tools-call-resolves-handles-by-user-test
  (testing "a tools/call arriving with no prior handshake resolves the caller's handle — handles key off
            the user, so a connection that never saw the store still reads from it"
    (let [user-id (mt/user->id :crowberto)
          handle  (mt/with-current-user user-id
                    (mcp.session/store-handle! user-id encoded-query))]
      (is (=? {:status 200
               :body   {:result {:structuredContent {:query encoded-query}}}}
              (call-ui-tool "render_drill_through" {:handle handle}))))))

(deftest cold-request-refuses-another-users-handle-test
  (testing "keying off the user is the whole check: rasta cannot resolve crowberto's handle"
    (let [owner-id (mt/user->id :crowberto)
          payload  (u/encode-base64 (json/encode {:sentinel (str (random-uuid))}))
          handle   (mt/with-current-user owner-id
                     (mcp.session/store-handle! owner-id payload))
          response (call-ui-tool :rasta "visualize_query" {:query_handle handle})]
      (is (=? {:status 200
               :body   {:result {:isError true
                                 :content [{:text #(str/includes? % "Query handle not found")}]}}}
              response))
      (is (not= payload (get-in response [:body :result :structuredContent :query]))
          "cross-user handle resolution must fail"))))

(deftest batching-is-rejected-test
  (testing "JSON-RPC batching was removed from the spec — an array body is refused rather than half-served"
    (let [response (mcp-request [(jsonrpc-request "ping" {} 1)
                                 (jsonrpc-request "tools/list" {} 2)])]
      (is (= 400 (:status response)))
      (is (=? {:error {:code    -32600
                       :message #(str/includes? % "batching is not supported")}}
              (:body response))))))

(deftest delete-needs-no-session-test
  (testing "DELETE is accepted from clients that still send it on disconnect, with or without a session id"
    (doseq [headers [{} {"mcp-session-id" (mcp.session/create! {:supports-mcp-ui? true})}]]
      (is (= 200 (:status (client/client-full-response (test.users/username->token :crowberto)
                                                       :delete "mcp"
                                                       {:request-options {:headers headers}})))))))

(deftest unauthenticated-get-test
  (testing "GET without auth returns 401 rather than opening a stream"
    (is (= 401 (:status (client/client-full-response :get 401 "mcp"))))))

;;; --------------------------------------------- Routing headers ---------------------------------------------------

(deftest routing-headers-test
  (testing "Mcp-Method / Mcp-Name agreeing with the body is accepted — a gateway routed on them and we
            are executing what it routed"
    (is (= 200 (:status (mcp-request (jsonrpc-request "ping") {"mcp-method" "ping"}))))
    (is (= 200 (:status (mcp-request (jsonrpc-request "tools/call"
                                                      {:name "search" :arguments {:term_queries ["orders"]}})
                                     {"mcp-method" "tools/call"
                                      "mcp-name"   "search"})))))
  (testing "a routing header that disagrees with the body is refused, not silently overridden — otherwise
            an intermediary routes one request and we run another"
    (is (=? {:status 400
             :body   {:error {:code    -32600
                              :message #(str/includes? % "Mcp-Method header")}}}
            (mcp-request (jsonrpc-request "ping") {"mcp-method" "tools/call"})))
    (is (=? {:status 400
             :body   {:error {:code    -32600
                              :message #(str/includes? % "Mcp-Name header")}}}
            (mcp-request (jsonrpc-request "tools/call" {:name "search" :arguments {}})
                         {"mcp-method" "tools/call"
                          "mcp-name"   "execute_sql"}))))
  (testing "the headers are optional"
    (is (= 200 (:status (mcp-request (jsonrpc-request "ping")))))))

;;; ------------------------------------------- Cacheable results ---------------------------------------------------

(deftest tools-list-is-cacheable-test
  (testing "tools/list carries the cache metadata that lets a client keep it in its prompt prefix"
    (is (=? {:ttlMs      pos-int?
             :cacheScope "session"}
            (get-in (mcp-request (jsonrpc-request "tools/list")) [:body :result])))))

(deftest resources-list-is-cacheable-test
  (testing "resources/list carries cache metadata"
    (is (=? {:ttlMs      pos-int?
             :cacheScope "session"}
            (get-in (mcp-request (jsonrpc-request "resources/list")) [:body :result])))))

(deftest resources-read-cache-metadata-test
  (testing "a static reference doc is identical for every caller and cacheable for a long time"
    (is (=? {:ttlMs      pos-int?
             :cacheScope "global"}
            (get-in (mcp-request (jsonrpc-request "resources/read"
                                                  {:uri "metabase://docs/construct-query.md"}))
                    [:body :result]))))
  (testing "the MCP Apps iframe embeds the caller's live session key, so it is never advertised as cacheable"
    (let [result (get-in (mcp-request (jsonrpc-request "resources/read"
                                                       {:uri "ui://metabase/visualize-query.html"}))
                         [:body :result])]
      (is (some? (:contents result)))
      (is (not (contains? result :ttlMs)))
      (is (not (contains? result :cacheScope))))))

;;; ----------------------------------------------- Tools listing ---------------------------------------------------

(def ^:private all-tool-names
  #{"browse_data"
    "construct_query"
    "construct_native_query"
    "create_collection"
    "create_dashboard"
    "create_metric"
    "create_question"
    "execute_query"
    "execute_question"
    "execute_sql"
    "query"
    "read_resource"
    "render_drill_through"
    "search"
    "update_dashboard"
    "update_metric"
    "update_question"
    "visualize_query"})

(def ^:private ui-tool-names #{"visualize_query" "render_drill_through"})

(deftest tools-list-is-deterministically-ordered-test
  (testing "the same scopes and capabilities produce byte-identical bytes on the wire — an unstable
            order costs the client its prompt-cache hit on every reconnect"
    (let [once  (tools-list (with-ui-capabilities {}))
          twice (tools-list (with-ui-capabilities {}))]
      (is (seq once))
      (is (= once twice))
      (is (= (sort (map :name once)) (map :name once))
          "tools are sorted by name across both the manifest and the UI registry"))))

(deftest ui-tools-declare-required-extensions-test
  (testing "UI tools declare their own required client extensions"
    (doseq [{:keys [name required-extensions]} (mcp.resources/list-ui-tools)]
      (is (= #{:mcp-app-ui} required-extensions)
          (str name " should require MCP Apps UI support")))))

(deftest tools-list-all-tools-declare-required-hints-test
  (testing "every tool advertises readOnlyHint, destructiveHint, openWorldHint (some MCP clients reject tools that omit them)"
    (let [tools (tools-list (with-ui-capabilities {}))]
      (is (seq tools) "tools/list should return at least one tool")
      (doseq [{:keys [name annotations]} tools]
        (is (contains? annotations :readOnlyHint)    (str name " missing :readOnlyHint"))
        (is (contains? annotations :destructiveHint) (str name " missing :destructiveHint"))
        (is (contains? annotations :openWorldHint)   (str name " missing :openWorldHint"))))))

(deftest tools-list-ui-capability-comes-from-request-meta-test
  (testing "a client that advertises MCP Apps support in the request's _meta sees the UI tools"
    (let [tool-names (set (map :name (tools-list (with-ui-capabilities {}))))]
      (is (= all-tool-names tool-names))))
  (testing "a client that advertises nothing is not a UI host, and never sees a tool it cannot render"
    (let [tool-names (set (map :name (tools-list)))]
      (is (= (apply disj all-tool-names ui-tool-names) tool-names))))
  (testing "an unrelated nested MCP Apps mimeType does not enable UI-only tools"
    (let [params     {:_meta {:io.modelcontextprotocol/capabilities
                              {:experimental {:mimeTypes ["text/html;profile=mcp-app"]}}}}
          tool-names (set (map :name (tools-list params)))]
      (is (empty? (set/intersection ui-tool-names tool-names))))))

(deftest tools-list-test
  (testing "tools/list returns the agent and UI tools"
    (let [tools (tools-list (with-ui-capabilities {}))]
      (is (= all-tool-names (set (map :name tools))))
      (testing "each tool has a description and inputSchema"
        (doseq [tool tools]
          (is (string? (:description tool)))
          (is (map? (:inputSchema tool)))))
      (testing "search description guides clients toward the expected array shape"
        (let [tools-by-name   (into {} (map (juxt :name identity)) tools)
              search-tool     (get tools-by-name "search")
              property-schema (fn [tool-name property-name]
                                (or (get-in tools-by-name [tool-name :inputSchema :properties property-name])
                                    (get-in tools-by-name [tool-name :inputSchema :properties (keyword property-name)])))
              collect-leaves  (fn collect-leaves [schema]
                                (cond
                                  (nil? schema)         []
                                  (:oneOf schema)       (mapcat collect-leaves (:oneOf schema))
                                  (:anyOf schema)       (mapcat collect-leaves (:anyOf schema))
                                  :else                 [schema]))
              leaf-types      (fn [schema] (set (keep :type (collect-leaves schema))))
              array-branch    (fn [schema]
                                (some #(when (= "array" (:type %)) %) (collect-leaves schema)))]
          (is (str/includes? (:description search-tool) "arrays of strings"))
          (is (contains? (leaf-types (property-schema "search" "term_queries")) "array"))
          (is (= "string" (get-in (array-branch (property-schema "search" "term_queries")) [:items :type])))
          (is (contains? (leaf-types (property-schema "search" "semantic_queries")) "array"))
          (is (= "string" (get-in (array-branch (property-schema "search" "semantic_queries")) [:items :type])))))
      (testing "construct_query expects the portable external-query JSON body"
        (let [tools-by-name          (into {} (map (juxt :name identity)) tools)
              construct-query-tool   (get tools-by-name "construct_query")
              construct-query-schema (:inputSchema construct-query-tool)
              query-schema           (or (get-in construct-query-schema [:properties "query"])
                                         (get-in construct-query-schema [:properties :query]))
              required-fields        (set (:required construct-query-schema))
              ;; ::lib.schema/external-query is generated as a deeply-nested :allOf, so the
              ;; root :type tag lives under the first branch rather than the top level.
              query-leaf-type        (or (:type query-schema)
                                         (some :type (:allOf query-schema)))]
          (is (str/includes? (:description construct-query-tool) "construct_notebook_query"))
          (is (contains? required-fields "query"))
          (is (= "object" query-leaf-type)))))))

(deftest tools-list-strict-shape-test
  (testing "no tool's inputSchema uses JSON-Schema constructs that ChatGPT's strict MCP validator rejects"
    ;; Pins the strict-shape guarantee across the whole exposed tool surface. The spec allows JSON
    ;; Schema 2020-12 conditionals; the Claude API and OpenAI strict mode do not, so we publish to the
    ;; client floor and this test is the fence.
    (let [tools (tools-list (with-ui-capabilities {}))]
      (is (pos? (count tools)))
      (doseq [{:keys [name inputSchema]} tools]
        (let [schema-keys (atom #{})]
          (walk/postwalk (fn [x] (when (map? x) (swap! schema-keys into (keys x))) x) inputSchema)
          (is (empty? (select-keys (frequencies @schema-keys) [:allOf :prefixItems]))
              (str "Tool " name " inputSchema contains :allOf or :prefixItems"))
          (is (not (some #(false? (:items %))
                         (->> (tree-seq coll? seq inputSchema) (filter map?))))
              (str "Tool " name " inputSchema contains `items: false` (tuple closure)")))))))

(deftest tools-list-no-refs-test
  (testing "tool inputSchemas have no $ref, no $defs, root type is always object,
            and no top-level oneOf/anyOf/allOf (rejected by mcpjam)"
    (let [tools (mcp.tools/list-tools nil)]
      (doseq [tool tools]
        (when-let [schema (:inputSchema tool)]
          (testing (:name tool)
            (is (not (re-find #"\$ref" (pr-str schema)))
                (str (:name tool) " should have no $ref"))
            (is (not (contains? schema :$defs))
                (str (:name tool) " should have no $defs"))
            (is (= "object" (:type schema))
                (str (:name tool) " root type should be object"))
            (doseq [k [:oneOf :anyOf :allOf]]
              (is (not (contains? schema k))
                  (str (:name tool) " should have no top-level " k)))))))))

(deftest tools-expose-output-schema-test
  (testing "MCP tools/list declares outputSchema for tools that emit structuredContent"
    (let [tools-by-name (into {} (map (juxt :name identity)) (tools-list (with-ui-capabilities {})))]
      (testing "construct_query advertises {query_handle} as its output"
        (let [output-schema (get-in tools-by-name ["construct_query" :outputSchema])
              prop-names    (set (map name (keys (:properties output-schema))))]
          (is (= "object" (:type output-schema)))
          (is (contains? prop-names "query_handle"))))
      (doseq [tool-name ui-tool-names]
        (testing (str tool-name " advertises its structuredContent shape")
          (let [output-schema (get-in tools-by-name [tool-name :outputSchema])]
            (is (= "object" (:type output-schema)))
            (is (contains? (set (map name (keys (:properties output-schema)))) "query"))))))))

;;; ------------------------------------------- Protocol back-compat ------------------------------------------------

(deftest initialize-back-compat-test
  (testing "a pre-RC client's handshake still works and negotiates a version both sides know"
    (let [response (mcp-request (jsonrpc-request "initialize" {:protocolVersion "2025-03-26"}))]
      (is (= 200 (:status response)))
      (is (=? {:result {:protocolVersion "2025-03-26"
                        :capabilities    {:tools {:listChanged true} :resources {}}
                        :serverInfo      {:name "metabase" :version "0.1.0"}}}
              (:body response)))))
  (testing "a client asking for a version we don't know is answered with the one we implement"
    (is (= "2026-07-28"
           (get-in (mcp-request (jsonrpc-request "initialize" {:protocolVersion "1999-01-01"}))
                   [:body :result :protocolVersion]))))
  (testing "notifications/initialized is still accepted as a no-op"
    (is (= 202 (:status (mcp-request (jsonrpc-notification "notifications/initialized")))))))

(deftest initialize-capability-hint-round-trips-test
  (testing "a pre-RC client advertises MCP Apps support once, at initialize, so the id it gets back
            carries the hint and later cold tools/list calls still honor it"
    (let [response   (mcp-request (jsonrpc-request "initialize" {:capabilities mcp-app-ui-capabilities}))
          session-id (get-in response [:headers "Mcp-Session-Id"])]
      (is (some? session-id))
      (is (= all-tool-names
             (set (map :name (get-in (mcp-request (jsonrpc-request "tools/list")
                                                  {"mcp-session-id" session-id})
                                     [:body :result :tools])))))))
  (testing "a pre-RC client that advertised no UI support does not see the UI tools"
    (let [response   (mcp-request (jsonrpc-request "initialize" {}))
          session-id (get-in response [:headers "Mcp-Session-Id"])
          tool-names (set (map :name (get-in (mcp-request (jsonrpc-request "tools/list")
                                                          {"mcp-session-id" session-id})
                                             [:body :result :tools])))]
      (is (empty? (set/intersection ui-tool-names tool-names))))))

;;; ------------------------------------------------ SSE Transport -------------------------------------------------

(deftest sse-post-response-test
  (testing "POST with Accept: text/event-stream returns SSE format"
    (let [response (mcp-request (jsonrpc-request "ping") {"accept" "text/event-stream"})]
      (is (= 200 (:status response)))
      (is (= "text/event-stream" (get-in response [:headers "Content-Type"])))
      (is (string? (:body response)))
      (is (str/includes? (:body response) "event: message"))
      (is (str/includes? (:body response) "data: "))))
  (testing "POST without Accept: text/event-stream returns JSON"
    (let [response (mcp-request (jsonrpc-request "ping"))]
      (is (= 200 (:status response)))
      (is (= "application/json" (get-in response [:headers "Content-Type"])))
      (is (map? (:body response))))))

;;; --------------------------------------------------- Errors ------------------------------------------------------

(deftest ping-test
  (testing "ping returns empty result"
    (let [response (mcp-request (jsonrpc-request "ping"))]
      (is (= 200 (:status response)))
      (is (= {} (get-in response [:body :result]))))))

(deftest method-not-found-test
  (testing "unknown method returns -32601 error"
    (let [response (mcp-request (jsonrpc-request "nonexistent/method"))]
      (is (= 200 (:status response)))
      (is (= -32601 (get-in response [:body :error :code]))))))

(deftest tools-call-unknown-tool-test
  (testing "calling an unknown tool returns isError content"
    (let [result (get-in (mcp-request (jsonrpc-request "tools/call"
                                                       {:name "nonexistent_tool" :arguments {}}))
                         [:body :result])]
      (is (true? (:isError result)))
      (is (= "text" (:type (first (:content result))))))))

(deftest tools-call-missing-params-test
  (testing "tools/call without name returns an error"
    (is (=? {:body {:result {:isError true}}}
            (mcp-request (jsonrpc-request "tools/call" {:arguments {}})))))
  (testing "tools/call with missing path params returns an error"
    (is (=? {:body {:result {:isError true
                             :content [{:text #(str/includes? % "Missing required path parameter")}]}}}
            (mcp-request (jsonrpc-request "tools/call" {:name "update_question" :arguments {}}))))))

(deftest tools-call-string-body-error-surfaces-actionable-message-test
  (testing (str "Claude's connector review explicitly rejects bare-status error messages — "
                "when the agent-api returns a string body (e.g. 404 \"Not found.\"), the MCP "
                "error content surfaces the body verbatim rather than collapsing to "
                "\"Agent API error: <status>\".")
    (let [result  (get-in (mcp-request (jsonrpc-request "tools/call"
                                                        {:name      "update_question"
                                                         :arguments {:id 999999 :name "Bogus"}}))
                          [:body :result])
          message (:text (first (:content result)))]
      (is (true? (:isError result)))
      (is (= "Not found." message)
          "string body should be surfaced verbatim")
      (is (not (str/includes? message "Agent API error"))
          "must not fall through to the bare-status fallback"))))

;;; ------------------------------------------------- Tool calls ----------------------------------------------------

(deftest tools-call-search-test
  (testing "search tool invocation works and returns parseable results"
    ;; Revert to the in-place search engine so test doesn't depend on the appdb search index being built.
    (search.tu/with-legacy-search
      (let [search-data (call-tool "search" {:term_queries ["orders"]})]
        (is (contains? search-data :data))
        (is (contains? search-data :returned)))))
  (testing "search accepts a singleton string as a one-element query list"
    (search.tu/with-legacy-search
      (is (contains? (call-tool "search" {:term_queries "orders"}) :data))))
  (testing "search coerces JSON-stringified arrays so clients that serialize args through a string layer still work"
    (search.tu/with-legacy-search
      (let [search-data (call-tool "search" {:term_queries "[\"orders\"]"})]
        (is (contains? search-data :data))
        (is (contains? search-data :returned))))))

(deftest tool-result-emits-structured-content-test
  (testing "tools that declare outputSchema emit structuredContent — guards the regression where Claude Desktop got 500s because we declared outputSchema without matching structuredContent"
    (let [result (get-in (mcp-request (jsonrpc-request "tools/call"
                                                       {:name      "read_resource"
                                                        :arguments {:uris ["metabase://databases"]}}))
                         [:body :result])]
      (is (not (:isError result))
          (str "read_resource should succeed: " (some-> result :content first :text)))
      (is (map? (:structuredContent result))
          "read_resource declares outputSchema → MUST emit structuredContent as the parsed object")
      (is (sequential? (-> result :structuredContent :resources))
          "structuredContent should mirror the endpoint response shape"))))

(deftest text-content-includes-structured-content-for-maps-test
  (testing "text-content emits structuredContent for map values — MCP spec requires it for tools with outputSchema"
    (let [text-content (var-get #'mcp.tools/text-content)]
      (testing "map → both content and structuredContent"
        (let [result (text-content {:foo "bar"})]
          (is (= {:foo "bar"} (:structuredContent result)))
          (is (= "{\"foo\":\"bar\"}" (-> result :content first :text)))))
      (testing "sequential → structuredContent is the collection"
        (is (= [1 2 3] (:structuredContent (text-content [1 2 3])))))
      (testing "string → no structuredContent (nothing to structure)"
        (let [result (text-content "ok")]
          (is (not (contains? result :structuredContent)))
          (is (= "ok" (-> result :content first :text))))))))

(defn- orders-count-query
  "Simple count query on the orders table — used as the dataset_query for smoke-test metrics."
  []
  (-> (lib/query (mt/metadata-provider)
                 (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
      (lib/aggregate (lib/count))))

(def ^:private smoke-tested-tools
  "Tools exercised by `tools-call-smoke-test`. New tools must be added here (and
   below) — the test compares this set against the Agent API-backed tools and
   fails when they diverge, ensuring no Agent API tool ships without a basic
   invocation check."
  #{"search" "browse_data" "construct_query" "construct_native_query" "query" "execute_query"
    "execute_sql" "read_resource"
    "create_question" "execute_question" "create_metric" "create_dashboard"
    "update_question" "update_metric" "update_dashboard" "create_collection"})

(deftest tools-call-smoke-test-covers-all-agent-api-backed-tools-test
  (testing "every Agent API-backed tool is exercised by the smoke test"
    (is (= (apply disj (set (map :name (mcp.tools/list-tools nil))) ui-tool-names)
           smoke-tested-tools)
        "Add the missing tool to `smoke-tested-tools` and the call sequence below.")))

(deftest tools-call-smoke-test
  (testing "every tool returns a successful response with valid parameters"
    (mt/with-temporary-setting-values [system.settings/site-url "https://stats.metabase.test"]
      (search.tu/with-legacy-search
        (mt/with-temp [:model/Card _metric {:name          "Smoke Metric"
                                            :type          :metric
                                            :database_id   (mt/id)
                                            :dataset_query (orders-count-query)}]
          (let [db-name      (t2/select-one-fn :name :model/Database (mt/id))
                orders-query {:lib/type "mbql/query"
                              :stages   [{:lib/type     "mbql.stage/mbql"
                                          :source-table [db-name "PUBLIC" "ORDERS"]
                                          :limit        5}]}
                ;; A metric needs exactly one aggregation — `create_metric` rejects a plain query.
                metric-query {:lib/type "mbql/query"
                              :stages   [{:lib/type     "mbql.stage/mbql"
                                          :source-table [db-name "PUBLIC" "ORDERS"]
                                          :aggregation  [["count" {}]]}]}
                ;; Track write-tool outputs in atoms so the `finally` cleanup runs even if an
                ;; assertion in `call-tool` fails partway through the sequence.
                question-id  (atom nil)
                metric-id    (atom nil)
                dash-id      (atom nil)
                coll-id      (atom nil)]
            (try
              (let [_              (call-tool "search" {:term_queries ["orders"]})
                    _              (call-tool "browse_data" {:action "list_tables"
                                                             :database_id (mt/id)
                                                             :search "orders"})
                    construct-data (call-tool "construct_query" {:query orders-query})
                    native-data    (call-tool "construct_native_query"
                                              {:database_id (mt/id)
                                               :sql         "SELECT 1"})
                    _              (is (uuid? (parse-uuid (:query_handle native-data))))
                    _              (call-tool "query" {:query orders-query})
                    _              (call-tool "execute_query"
                                              {:query_handle (:query_handle construct-data)})
                    _              (call-tool "execute_sql" {:database_id (mt/id) :sql "SELECT 1"})
                    _              (call-tool "read_resource" {:uris ["metabase://databases"]})
                    ;; Write tools — record IDs as soon as they're known so the `finally` block
                    ;; can clean up even if a later step throws.
                    question-data  (call-tool "create_question"
                                              {:name  "Smoke Question"
                                               :query (mcp.session/read-handle
                                                       (mt/user->id :crowberto)
                                                       (:query_handle construct-data))})
                    _              (reset! question-id (:id question-data))
                    _              (is (= (format "https://stats.metabase.test/question/%d" @question-id)
                                          (:url question-data)))
                    ;; No collection_id given → defaults to the caller's personal collection;
                    ;; collection_path must survive MCP forwarding.
                    _              (is (= (collection/user->personal-collection-name (mt/user->id :crowberto) :user)
                                          (:collection_path question-data)))
                    _              (call-tool "update_question"
                                              {:id          (:id question-data)
                                               :description "Smoke updated description"})
                    metric-handle  (call-tool "construct_query" {:query metric-query})
                    metric-data    (call-tool "create_metric"
                                              {:name         "Smoke Metric Card"
                                               :query_handle (:query_handle metric-handle)})
                    _              (reset! metric-id (:id metric-data))
                    _              (is (= "scalar" (:display metric-data)))
                    _              (call-tool "update_metric"
                                              {:id          (:id metric-data)
                                               :description "Smoke updated metric"})
                    _              (call-tool "execute_question" {:id (:id question-data)})
                    dash-data      (call-tool "create_dashboard" {:name "Smoke Dashboard"})
                    _              (reset! dash-id (:id dash-data))
                    _              (is (= (format "https://stats.metabase.test/dashboard/%d" @dash-id)
                                          (:url dash-data)))
                    _              (call-tool "update_dashboard"
                                              {:id          (:id dash-data)
                                               :description "Smoke updated dashboard"})
                    coll-data      (call-tool "create_collection" {:name "Smoke Collection"})]
                (reset! coll-id (:id coll-data)))
              (finally
                (when-let [qid @question-id] (t2/delete! :model/Card :id qid))
                (when-let [mid @metric-id]   (t2/delete! :model/Card :id mid))
                (when-let [did @dash-id]     (t2/delete! :model/Dashboard :id did))
                (when-let [cid @coll-id]     (t2/delete! :model/Collection :id cid))))))))))

(deftest tools-call-execute-query-test
  (testing "execute_query returns a streaming response captured as MCP text content"
    (let [streamed?   (atom false)
          original-fn (mt/original-fn #'mcp.tools/capture-streaming-response)]
      (mt/with-dynamic-fn-redefs [mcp.tools/capture-streaming-response
                                  (fn [response]
                                    (reset! streamed? true)
                                    (original-fn response))]
        (let [db-name        (t2/select-one-fn :name :model/Database (mt/id))
              external-query {:lib/type "mbql/query"
                              :stages   [{:lib/type     "mbql.stage/mbql"
                                          :source-table [db-name "PUBLIC" "ORDERS"]
                                          :limit        5}]}
              construct-data (call-tool "construct_query" {:query external-query})
              execute-data   (call-tool "execute_query" {:query_handle (:query_handle construct-data)})]
          (is (true? @streamed?) "execute_query should use the streaming response path")
          (is (=? {:status    "completed"
                   :row_count 5
                   :data      {:cols sequential?
                               :rows (fn [rows] (= 5 (count rows)))}}
                  execute-data)))))))

(deftest tools-call-query-accepts-query-handle-test
  (testing "the `query` tool resolves a query_handle and streams results, same as a fresh query body"
    (let [db-name        (t2/select-one-fn :name :model/Database (mt/id))
          external-query {:lib/type "mbql/query"
                          :stages   [{:lib/type     "mbql.stage/mbql"
                                      :source-table [db-name "PUBLIC" "ORDERS"]
                                      :limit        5}]}
          construct-data (call-tool "construct_query" {:query external-query})
          query-data     (call-tool "query" {:query_handle (:query_handle construct-data)})]
      (is (=? {:status             "completed"
               :row_count          5
               :continuation_token nil?
               :data               {:cols sequential?
                                    :rows (fn [rows] (= 5 (count rows)))}}
              query-data)))))

(deftest tools-call-query-stale-query-handle-test
  (testing "the `query` tool returns a tool-level error for an unknown handle rather than a 500"
    (is (=? {:status 200
             :body   {:result {:isError true
                               :content [{:text #(str/includes? % "Query handle not found")}]}}}
            (mcp-request (jsonrpc-request "tools/call"
                                          {:name      "query"
                                           :arguments {:query_handle (str (random-uuid))}}))))))

(deftest construct-query-returns-bare-handle-test
  (testing "construct_query returns just `{:query_handle uuid}` — no widget session plumbing"
    (let [db-name        (t2/select-one-fn :name :model/Database (mt/id))
          external-query {:lib/type "mbql/query"
                          :stages   [{:lib/type     "mbql.stage/mbql"
                                      :source-table [db-name "PUBLIC" "ORDERS"]
                                      :limit        5}]}
          construct-data (call-tool "construct_query" {:query  external-query
                                                       :prompt "show 5 orders"})]
      (is (some? (parse-uuid (:query_handle construct-data))))
      (is (not (contains? construct-data :widgetSessionId))))))

(deftest tools-call-create-question-accepts-query-handle-test
  (testing "create_question resolves query_handle through the MCP layer instead of requiring raw base64"
    (let [db-name        (t2/select-one-fn :name :model/Database (mt/id))
          construct-data (call-tool "construct_query"
                                    {:query {:lib/type "mbql/query"
                                             :stages   [{:lib/type     "mbql.stage/mbql"
                                                         :source-table [db-name "PUBLIC" "ORDERS"]
                                                         :limit        5}]}})
          question-id    (atom nil)]
      (try
        (let [question-data (call-tool "create_question"
                                       {:name         "Handle-Path Question"
                                        :query_handle (:query_handle construct-data)})]
          (reset! question-id (:id question-data))
          (is (pos-int? (:id question-data)))
          (is (= "Handle-Path Question" (:name question-data)))
          ;; Card was actually persisted with a dataset_query (handle resolved correctly).
          (is (some? (t2/select-one-fn :dataset_query :model/Card :id (:id question-data)))))
        (finally
          (when-let [qid @question-id] (t2/delete! :model/Card :id qid)))))))

(deftest tools-call-update-question-accepts-query-handle-test
  (testing "update_question resolves query_handle through the MCP layer"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Card To Re-query via Handle"
                                              :dataset_query (orders-count-query)
                                              :display       :table}]
      (let [db-name         (t2/select-one-fn :name :model/Database (mt/id))
            products-id     (mt/id :products)
            construct-data  (call-tool "construct_query"
                                       {:query {:lib/type "mbql/query"
                                                :stages   [{:lib/type     "mbql.stage/mbql"
                                                            :source-table [db-name "PUBLIC" "PRODUCTS"]
                                                            :limit        5}]}})
            update-data     (call-tool "update_question"
                                       {:id           card-id
                                        :query_handle (:query_handle construct-data)})
            persisted       (t2/select-one-fn :dataset_query :model/Card :id card-id)
            persisted-table (some :source-table (:stages persisted))]
        (is (= card-id (:id update-data)))
        ;; Handle was resolved and applied to the card. Construct sends portable FKs over the
        ;; wire; the persisted dataset_query is the resolved MBQL 5 map with numeric IDs.
        (is (= products-id persisted-table)
            (str "Expected handle-resolved query's :source-table = products id " products-id
                 ", got " persisted-table))))))

(deftest tools-call-update-question-stale-query-handle-test
  (testing "An unknown query_handle returns a tool-level error rather than 500"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Stale-Handle Target"
                                              :dataset_query (orders-count-query)
                                              :display       :table}]
      (let [response (mcp-request (jsonrpc-request "tools/call"
                                                   {:name      "update_question"
                                                    :arguments {:id           card-id
                                                                :query_handle (str (random-uuid))}}))
            result   (get-in response [:body :result])]
        ;; JSON-RPC: HTTP 200, result.isError, friendly message.
        (is (= 200 (:status response)))
        (is (nil? (get-in response [:body :error])))
        (is (true? (:isError result)))
        (is (str/includes? (-> result :content first :text) "Query handle not found")
            "Stale handle should surface the dedicated message from mcp/tools.clj")
        ;; Card should be unchanged - still pointed at orders, not whatever the stale handle would have meant.
        (is (= (mt/id :orders)
               (some :source-table (:stages (t2/select-one-fn :dataset_query :model/Card :id card-id))))
            "A stale handle must not mutate the card's source table.")))))

(deftest tools-call-update-dashboard-move-without-position-test
  (testing "Missing required field on a discriminated mutation surfaces as a tool error, not a JSON-RPC error"
    (mt/with-temp [:model/Dashboard     {dash-id :id} {:name "MCP move validation"}
                   :model/Card          {card-id :id} {:name          "x"
                                                       :dataset_query (orders-count-query)
                                                       :display       :table}
                   :model/DashboardCard {dc-id :id}   {:dashboard_id dash-id :card_id card-id
                                                       :row 0 :col 0 :size_x 6 :size_y 4}]
      (let [response (mcp-request (jsonrpc-request "tools/call"
                                                   {:name      "update_dashboard"
                                                    :arguments {:id        dash-id
                                                                :dashcards [{:action "move" :dashcard_id dc-id}]}}))]
        ;; JSON-RPC layer: HTTP 200, response in `result` not `error`. Bad-input is a tool-level error.
        (is (= 200 (:status response)))
        (is (nil? (get-in response [:body :error])))
        (is (true? (get-in response [:body :result :isError]))
            "missing :position on move should surface as a tool error")))))

(deftest tools-call-read-resource-test
  (testing "read_resource returns the shared dispatcher's response shape"
    (let [result (call-tool "read_resource" {:uris ["metabase://databases"]})]
      ;; `result` is the parsed MCP text-content JSON, which is the dispatcher's
      ;; full return map (`:resources` per-URI + formatted `:output` string).
      (is (= 1 (count (:resources result))))
      (is (= "metabase://databases" (-> result :resources first :uri)))
      (is (some? (-> result :resources first :content))
          "Top-level navigation URI must come back with :content (no :error)")
      (is (str/includes? (:output result) "<resources>")
          "Output is XML-shaped for LLM consumption")))
  (testing "read_resource fetches a single-entity URI"
    (let [uri    (str "metabase://table/" (mt/id :orders))
          result (call-tool "read_resource" {:uris [uri]})]
      (is (= [uri] (mapv :uri (:resources result))))
      (is (some? (-> result :resources first :content)))))
  (testing "read_resource reports a per-URI error rather than failing the whole call"
    (let [result (call-tool "read_resource" {:uris ["metabase://nonsense/path"]})]
      (is (= 1 (count (:resources result))))
      (is (nil? (-> result :resources first :content)))
      (is (some? (-> result :resources first :error))))))

;;; ------------------------------------------------- UI tools ------------------------------------------------------

(deftest tools-call-visualize-query-direct-test
  (testing "visualize_query returns UI structured content"
    (let [result (mcp.tools/call-tool nil "visualize_query" {:query "card__1"})]
      (is (not (:isError result)))
      (is (=? {:content           [{:type "text"}]
               :structuredContent {:query "card__1"}}
              result)))))

(deftest tools-call-rejects-ui-tools-without-ui-capability-test
  (testing "a client that never advertised MCP Apps support cannot call a UI tool"
    (is (=? {:status 200
             :body   {:result {:isError true
                               :content [{:text #(str/includes? % "requires a client that supports MCP Apps UI")}]}}}
            (mcp-request (jsonrpc-request "tools/call"
                                          {:name "visualize_query" :arguments {:query "card__1"}}))))))

(deftest tools-call-visualize-query-test
  (testing "visualize_query echoes the inline query"
    (is (=? {:status 200
             :body   {:result {:structuredContent {:query encoded-query}}}}
            (call-ui-tool "visualize_query" {:query encoded-query}))))
  (testing "visualize_query resolves a stored handle"
    (let [user-id (mt/user->id :crowberto)
          handle  (mt/with-current-user user-id
                    (mcp.session/store-handle! user-id encoded-query))]
      (is (=? {:status 200
               :body   {:result {:structuredContent {:query encoded-query}}}}
              (call-ui-tool "visualize_query" {:query_handle handle})))))
  (testing "visualize_query asks for an argument when neither query nor handle is provided"
    (is (=? {:status 200
             :body   {:result {:isError true
                               :content [{:text #(str/includes? % "Provide either")}]}}}
            (call-ui-tool "visualize_query" {}))))
  (testing "visualize_query returns 'handle not found' when query_handle is unknown"
    (is (=? {:status 200
             :body   {:result {:isError true
                               :content [{:text #(str/includes? % "Query handle not found")}]}}}
            (call-ui-tool "visualize_query" {:query_handle (str (random-uuid))})))))

(deftest tools-call-visualize-query-carries-the-prompt-test
  (testing "visualize_query includes the prompt stored with a construct_query handle, so the iframe can
            attach the user's original request to visualization feedback"
    (let [db-name        (t2/select-one-fn :name :model/Database (mt/id))
          construct-data (call-tool "construct_query"
                                    {:query  {:lib/type "mbql/query"
                                              :stages   [{:lib/type     "mbql.stage/mbql"
                                                          :source-table [db-name "PUBLIC" "ORDERS"]
                                                          :limit        5}]}
                                     :prompt "show 5 orders"})]
      (is (=? {:status 200
               :body   {:result {:structuredContent {:query  string?
                                                     :prompt "show 5 orders"}}}}
              (call-ui-tool "visualize_query" {:query_handle (:query_handle construct-data)}))))))

(deftest render-drill-through-publishes-its-own-resource-uri-test
  (testing "render_drill_through publishes a distinct `_meta.ui.resourceUri` from visualize_query — ChatGPT dedupes iframes by URI, and reusing the visualize_query URI would prevent a fresh drill widget from mounting"
    (let [tools-by-name (into {} (map (juxt :name identity)) (tools-list (with-ui-capabilities {})))
          drill-uri     (get-in tools-by-name ["render_drill_through" :_meta :ui :resourceUri])
          viz-uri       (get-in tools-by-name ["visualize_query" :_meta :ui :resourceUri])]
      (is (string? drill-uri))
      (is (string? viz-uri))
      (is (not= drill-uri viz-uri)
          "render_drill_through and visualize_query must publish different resourceUris"))))

(deftest tools-call-render-drill-through-test
  (testing "render_drill_through resolves a stored handle to its encoded query"
    (let [user-id (mt/user->id :crowberto)
          handle  (mt/with-current-user user-id
                    (mcp.session/store-handle! user-id encoded-query))]
      ;; The error path returns no :structuredContent, so asserting it is present is
      ;; equivalent to asserting :isError is not set.
      (is (=? {:status 200
               :body   {:result {:structuredContent {:query encoded-query}}}}
              (call-ui-tool "render_drill_through" {:handle handle})))))
  (testing "render_drill_through returns an error when the handle is unknown"
    (is (=? {:status 200
             :body   {:result {:isError true}}}
            (call-ui-tool "render_drill_through" {:handle (str (random-uuid))})))))

;;; ----------------------------------------- Canonical and legacy endpoints ---------------------------------------

(deftest endpoint-alias-routing-test
  (testing "server/discover succeeds (session auth) on both the canonical and legacy MCP paths"
    (doseq [path mcp-endpoint-paths]
      (testing (str "/api/" path)
        (is (=? {:status 200
                 :body   {:result {:serverInfo {:name "metabase"}}}}
                (mcp-request-to path (jsonrpc-request "server/discover"))))))))

(deftest endpoint-alias-discovery-401-test
  (testing "unauthenticated request on each path advertises that same path as the protected resource"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (doseq [path mcp-endpoint-paths]
        (testing (str "/api/" path)
          ;; The trailing quote pins the match to the exact path (so /api/mcp can't match /api/metabase-mcp).
          (let [expected (str "/.well-known/oauth-protected-resource/api/" path "\"")]
            (is (=? {:status  401
                     :headers {"WWW-Authenticate" #(str/includes? % expected)}}
                    (mcp-request-unauthenticated-to path (jsonrpc-request "server/discover"))))))))))

(deftest endpoint-alias-trailing-slash-discovery-test
  (testing "a trailing-slash request still advertises the matching path (not canonical fallback)"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (is (=? {:status  401
               :headers {"WWW-Authenticate" #(str/includes? % "/.well-known/oauth-protected-resource/api/mcp\"")}}
              (mcp-request-unauthenticated-to "mcp/" (jsonrpc-request "server/discover")))))))

(deftest unauthenticated-returns-401-test
  (testing "POST without any auth returns 401 with WWW-Authenticate discovery header"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (is (=? {:status  401
               :headers {"WWW-Authenticate" #(str/includes? % "oauth-protected-resource")}}
              (mcp-request-unauthenticated (jsonrpc-request "server/discover")))))))

(deftest endpoint-alias-bearer-token-test
  (testing "bearer-token handling is identical on the legacy path — same invalid_token 401 as canonical"
    ;; Bearer validation (validate-bearer-token) has no path logic, so reaching it via the legacy
    ;; alias must behave exactly like the canonical path. We assert the invalid-token branch since
    ;; it's deterministic and doesn't depend on minting a live token.
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (oauth-server/reset-provider!)
      (try
        (doseq [path mcp-endpoint-paths]
          (testing (str "/api/" path)
            (is (=? {:status  401
                     :headers {"WWW-Authenticate" #(str/includes? % "invalid_token")}}
                    (client/client-full-response
                     :post 401 path
                     {:request-options {:headers {"authorization" "Bearer totally-bogus-token"}}}
                     (jsonrpc-request "server/discover"))))))
        (finally
          (oauth-server/reset-provider!))))))

(deftest invalid-bearer-token-returns-401-test
  (testing "POST with invalid bearer token returns 401 with invalid_token error"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (oauth-server/reset-provider!)
      (try
        (is (=? {:status  401
                 :headers {"WWW-Authenticate" #(str/includes? % "invalid_token")}}
                (mcp-request-with-bearer "totally-bogus-token" 401 (jsonrpc-request "server/discover"))))
        (finally
          (oauth-server/reset-provider!))))))

(defn- insert-expired-oauth-token!
  "Insert an OAuth access token into the DB with an expiry in the past.
   Returns the token string."
  [user-id client-id]
  (let [token   (str (random-uuid))
        expired (- (quot (System/currentTimeMillis) 1000) 3600)]
    (t2/insert! :model/OAuthAccessToken
                {:token     token
                 :user_id   user-id
                 :client_id client-id
                 :scope     ["openid"]
                 :expiry    expired})
    token))

(deftest expired-oauth-bearer-token-returns-401-test
  (testing "POST with expired OAuth bearer token returns 401"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (oauth-server/reset-provider!)
        (let [token (insert-expired-oauth-token! (mt/user->id :crowberto) (str (random-uuid)))]
          (is (=? {:status  401
                   :headers {"WWW-Authenticate" #(str/includes? % "invalid_token")}}
                  (mcp-request-with-bearer token 401 (jsonrpc-request "server/discover")))))))))

;;; ---------------------------------------------- Resources -------------------------------------------------------

(def ^:private construct-query-uri "metabase://docs/construct-query.md")

(deftest resources-list-test
  (testing "resources/list returns the registered construct-query reference resource"
    (let [resources (get-in (mcp-request (jsonrpc-request "resources/list")) [:body :result :resources])]
      (is (=? [{:uri         construct-query-uri
                :name        "Construct Query Reference"
                :description string?
                :mimeType    "text/markdown"}]
              (filter #(= construct-query-uri (:uri %)) resources))))))

(deftest resources-read-test
  (testing "resources/read returns the markdown contents for the construct-query reference"
    (is (=? {:contents [{:uri      construct-query-uri
                         :mimeType "text/markdown"
                         :text     #(str/starts-with? % "# Construct Query Reference")}]}
            (get-in (mcp-request (jsonrpc-request "resources/read" {:uri construct-query-uri}))
                    [:body :result]))))
  (testing "resources/read for an unknown URI returns -32602"
    (is (= -32602 (get-in (mcp-request (jsonrpc-request "resources/read"
                                                        {:uri "metabase://does/not/exist"}))
                          [:body :error :code]))))
  (testing "resources/read with missing :uri reports the missing parameter"
    (is (=? {:error {:code    -32602
                     :message #(str/starts-with? % "Missing required parameter")}}
            (:body (mcp-request (jsonrpc-request "resources/read" {}))))))
  (testing "resources/read with a blank :uri reports the missing parameter (not 'Resource not found')"
    (is (=? {:error {:code    -32602
                     :message #(str/starts-with? % "Missing required parameter")}}
            (:body (mcp-request (jsonrpc-request "resources/read" {:uri ""})))))))

(deftest embedding-session-is-stable-across-connections-test
  (testing "two cold resources/read calls render the same iframe — the embedding session keys off the
            user, so a client that reconnects does not get a fresh one"
    (let [read-html (fn [] (-> (mcp-request (jsonrpc-request "resources/read"
                                                             {:uri "ui://metabase/visualize-query.html"}))
                               (get-in [:body :result :contents])
                               first
                               :text))
          html      (read-html)]
      (is (some? html))
      (is (= html (read-html))))))

(def ^:private scoped-test-uri "test://mcp/api-test/scoped")

(defn- with-scoped-test-resource! [f]
  (let [registry @#'mcp.resources/registry
        snapshot @registry]
    (try
      (mcp.resources/register-resource!
       {:uri         scoped-test-uri
        :name        "Scoped Test Resource"
        :description "Requires the agent:search scope."
        :scope       "agent:search"
        :mimeType    "text/plain"
        :render-fn   (constantly "secret body")})
      (f)
      (finally
        (reset! registry snapshot)))))

(defn- dispatch-request [msg token-scopes]
  (#'mcp.api/dispatch-request msg nil token-scopes nil))

(deftest ui-resource-read-not-found-test
  (testing "resources/read returns -32602 \"Resource not found\" when caller lacks the required scope"
    (with-scoped-test-resource!
      (fn []
        (is (=? {:jsonrpc "2.0"
                 :id      1
                 :error   {:code    -32602
                           :message "Resource not found"}}
                (dispatch-request (jsonrpc-request "resources/read" {:uri scoped-test-uri})
                                  #{"agent:other"}))))))
  (testing "resources/read for a scoped resource succeeds when the caller has a matching scope"
    (with-scoped-test-resource!
      (fn []
        (is (=? {:result {:contents [{:uri  scoped-test-uri
                                      :text "secret body"}]}}
                (dispatch-request (jsonrpc-request "resources/read" {:uri scoped-test-uri})
                                  #{"agent:search"})))))))

(deftest resources-list-scope-filtering-test
  (testing "resources/list omits scoped resources the caller cannot access"
    (with-scoped-test-resource!
      (fn []
        (let [uris (set (map :uri (get-in (dispatch-request (jsonrpc-request "resources/list")
                                                            #{"agent:other"})
                                          [:result :resources])))]
          (is (contains? uris construct-query-uri)
              "public construct-query reference is still listed")
          (is (not (contains? uris scoped-test-uri))
              "scoped resource must not leak via resources/list")))))
  (testing "resources/list includes scoped resources for callers with matching scope"
    (with-scoped-test-resource!
      (fn []
        (let [uris (set (map :uri (get-in (dispatch-request (jsonrpc-request "resources/list")
                                                            #{"agent:search"})
                                          [:result :resources])))]
          (is (contains? uris scoped-test-uri)))))))

(deftest resources-read-scope-denied-test
  (testing "resources/read returns -32602 for unknown URI"
    (is (=? {:error {:code    -32602
                     :message "Resource not found"}}
            (:body (mcp-request (jsonrpc-request "resources/read"
                                                 {:uri "ui://metabase/nonexistent.html"})))))))

(deftest check-resource-access-test
  (testing "returns :ok for a known URI with matching scope"
    (is (= :ok (mcp.resources/check-resource-access "ui://metabase/visualize-query.html" #{"agent:viz:mcp-ui:query"}))))
  (testing "returns :ok with wildcard scope"
    (is (= :ok (mcp.resources/check-resource-access "ui://metabase/visualize-query.html" #{"agent:*"}))))
  (testing "returns :scope-denied for a known URI with non-matching scope"
    (is (= :scope-denied (mcp.resources/check-resource-access "ui://metabase/visualize-query.html" #{"agent:search"}))))
  (testing "returns :scope-denied for a known URI with empty scopes"
    (is (= :scope-denied (mcp.resources/check-resource-access "ui://metabase/visualize-query.html" #{}))))
  (testing "returns :not-found for an unknown URI"
    (is (= :not-found (mcp.resources/check-resource-access "ui://metabase/nonexistent.html" #{"agent:*"})))))

;;; --------------------------------------------- Scope Filtering ---------------------------------------------------

(deftest tools-list-scope-filtering-test
  (testing "tools/list with unrestricted scopes returns all tools"
    (is (= all-tool-names (set (map :name (mcp.tools/list-tools #{::scope/unrestricted}))))))
  (testing "tools/list with specific scope only returns matching tools"
    (let [tool-names (set (map :name (mcp.tools/list-tools #{"agent:discover:read"})))]
      (is (contains? tool-names "search"))
      (is (not (contains? tool-names "update_question")))
      (is (not (contains? tool-names "construct_query")))))
  (testing "tools/list with wildcard scope matches all agent and UI tools"
    (is (= all-tool-names (set (map :name (mcp.tools/list-tools #{"agent:*"}))))))
  (testing "tools/list with nil scopes returns all tools"
    (is (= all-tool-names (set (map :name (mcp.tools/list-tools nil))))))
  (testing "tools/list with empty scopes does not return all tools"
    (is (empty? (mcp.tools/list-tools #{}))
        "Empty scopes should not grant access to scoped tools")))

(deftest tools-call-scope-enforcement-test
  (mt/with-temp [:model/Card {card-id :id} {:name          "Scope Test Card"
                                            :dataset_query (orders-count-query)
                                            :display       :table}]
    (testing "tool call is rejected when token scopes don't include the required scope"
      (let [result (mt/with-current-user (mt/user->id :crowberto)
                     (mcp.tools/call-tool #{"agent:search"} "update_question"
                                          {:id card-id :name "Renamed"}))]
        (is (=? {:isError true} result))
        (is (str/includes? (-> result :content first :text) "Insufficient scope")
            "Scope enforcement error from defendpoint middleware")))
    (testing "tool call with matching scope is not rejected by scope enforcement"
      (is (not (:isError (mt/with-current-user (mt/user->id :crowberto)
                           (mcp.tools/call-tool #{"agent:question:update"} "update_question"
                                                {:id card-id :name "Renamed Again"}))))))
    (testing "tool call with empty scopes is rejected for scoped tools"
      (let [result (mt/with-current-user (mt/user->id :crowberto)
                     (mcp.tools/call-tool #{} "update_question" {:id card-id :name "Nope"}))]
        (is (=? {:isError true} result))
        (is (str/includes? (-> result :content first :text) "Insufficient scope")
            "Scope enforcement error from defendpoint middleware"))))
  (testing "scope failures take precedence over missing client extensions"
    (let [result  (mt/with-current-user (mt/user->id :crowberto)
                    (mcp.tools/call-tool #{} "visualize_query" {:query "card__1"} {:supports-mcp-ui? false}))
          message (-> result :content first :text)]
      (is (=? {:isError true} result))
      (is (str/includes? message "Insufficient scope"))
      (is (not (str/includes? message "requires a client that supports MCP Apps UI"))))))

(deftest agent-api-preserves-token-scopes-test
  (testing "scoped token restrictions are enforced by the Agent API layer (defense-in-depth)"
    (mt/with-temp [:model/Card {card-id :id} {:name          "Scope Probe Card"
                                              :dataset_query (orders-count-query)
                                              :display       :table}]
      (testing "restricted scopes that don't match the endpoint are rejected by Agent API"
        (is (=? {:isError true}
                (mt/with-current-user (mt/user->id :crowberto)
                  ;; Bypass the MCP scope check by calling invoke-agent-api directly
                  ;; with scopes that don't match the endpoint's required scope (agent:question:update)
                  (#'mcp.tools/invoke-agent-api :put (str "/v1/question/" card-id) #{"agent:search"}
                                                {:name "Probe"})))
            "Agent API should reject when token scopes don't include the required scope"))
      (testing "matching scopes are accepted by Agent API"
        (is (not (:isError (mt/with-current-user (mt/user->id :crowberto)
                             (#'mcp.tools/invoke-agent-api :put (str "/v1/question/" card-id)
                                                           #{"agent:question:update"} {:name "Probe"}))))))
      (testing "unrestricted scopes are accepted by Agent API"
        (is (not (:isError (mt/with-current-user (mt/user->id :crowberto)
                             (#'mcp.tools/invoke-agent-api :put (str "/v1/question/" card-id)
                                                           #{::scope/unrestricted} {:name "Probe"})))))))))

(deftest mcp-does-not-depend-on-external-agent-api-setting-test
  (testing "MCP tool calls still work when the external Agent API is disabled"
    (mt/with-temporary-setting-values [agent-api.settings/agent-api-enabled? false]
      (is (not (:isError (mt/with-current-user (mt/user->id :crowberto)
                           (mcp.tools/call-tool #{::scope/unrestricted} "read_resource"
                                                {:uris ["metabase://databases"]}))))))))

;;; ------------------------------------------------- Throttling ---------------------------------------------------

(deftest mcp-throttle-returns-429-test
  (testing "MCP endpoint returns 429 with JSON-RPC error when rate-limited"
    (with-redefs [mcp.api/mcp-throttler (throttle/make-throttler :user-id :attempts-threshold 1)]
      ;; First request succeeds (consumes the single attempt)
      (is (= 200 (:status (mcp-request (jsonrpc-request "ping")))))
      ;; Second request should be throttled
      (is (=? {:status  429
               :headers {"Retry-After" string?}
               :body    {:jsonrpc "2.0"
                         :error   {:code    -32000
                                   :message #(str/starts-with? % "Too many attempts!")}}}
              (mcp-request (jsonrpc-request "ping")))))))
