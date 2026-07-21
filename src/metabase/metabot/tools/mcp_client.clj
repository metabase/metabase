(ns metabase.metabot.tools.mcp-client
  "In-process MCP client for the Metabot agent loop. Drives Metabase's own MCP server
  (`metabase.mcp.api/handler`) over real JSON-RPC by calling the Ring handler directly with the
  current user bound — riding its cookie-session auth branch, skipping only the socket and OAuth.
  `mcp-self-tool-defs` bridges the resulting tools into agent-loop tool-defs (`self.core/ToolEntry`)."
  (:require
   [clojure.string :as str]
   [metabase.mcp.api :as mcp.api]
   [metabase.request.core :as request]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(def ^:private endpoint "/api/metabase-mcp")

(defn- rpc!
  "POST one JSON-RPC `message` to the in-process MCP handler as `user-id`, optionally carrying
  `session-id`. Returns `{:status :body :session-id}`, `:session-id` being the `Mcp-Session-Id`
  header (present on `initialize`). No `Origin` header, so we stay on the non-browser path."
  [user-id session-id message]
  (let [req (cond-> {:request-method :post
                     :uri            endpoint
                     :headers        {}
                     :remote-addr    "127.0.0.1"
                     :body           message}
              session-id (assoc-in [:headers "mcp-session-id"] session-id))
        p   (promise)]
    ;; Bind the user so the handler's session-auth branch fires even on a tool-executor virtual thread.
    (request/with-current-user user-id
      (mcp.api/handler req #(deliver p %) #(deliver p %)))
    (let [resp (deref p 30000 ::timeout)]
      (cond
        (= resp ::timeout)         (throw (ex-info "MCP request timed out" {:message message}))
        (instance? Throwable resp) (throw resp)
        :else
        (let [{:keys [status body headers]} resp]
          {:status     status
           :body       (when (and (string? body) (seq body)) (json/decode+kw body))
           :session-id (get headers "Mcp-Session-Id")})))))

(defn- rpc-result
  "Return the JSON-RPC `:result`, throwing on a JSON-RPC `:error`."
  [{:keys [body]}]
  (if-let [{:keys [code message]} (:error body)]
    (throw (ex-info (str "MCP error: " message) {:code code}))
    (:result body)))

(defn initialize!
  "Run the MCP `initialize` handshake as `user-id`; return a client `{:user-id :session-id}`."
  [user-id]
  (let [{:keys [session-id]} (rpc! user-id nil
                                   {:jsonrpc "2.0" :id 1 :method "initialize"
                                    :params  {:protocolVersion "2025-03-26"
                                              :capabilities    {}
                                              :clientInfo      {:name "metabot" :version "0.1.0"}}})]
    (when-not session-id
      (throw (ex-info "MCP initialize returned no session id" {:user-id user-id})))
    (rpc! user-id session-id {:jsonrpc "2.0" :method "notifications/initialized"})
    {:user-id user-id :session-id session-id}))

(defn list-tools!
  "Return the MCP `tools/list` tool definitions for `client`."
  [{:keys [user-id session-id]}]
  (:tools (rpc-result (rpc! user-id session-id
                            {:jsonrpc "2.0" :id 2 :method "tools/list" :params {}}))))

(defn call-tool!
  "Invoke MCP `tools/call` for `client`; return the MCP content map `{:content ... :structuredContent ...}`."
  [{:keys [user-id session-id]} tool-name arguments]
  (rpc-result (rpc! user-id session-id
                    {:jsonrpc "2.0" :id 3 :method "tools/call"
                     :params  {:name tool-name :arguments (or arguments {})}})))

;;; ------------------------------------------- Bridge to agent-loop tools -------------------------------------------

(defn- mcp-content->output [content]
  (or (some-> content :content first :text) ""))

(defn- mcp-tool->tool-def
  "Turn one `tools/list` entry into an agent-loop tool-def. The LLM sees the `mcp_`-prefixed name;
  dispatch uses the real MCP `name`. `:input-schema` passes the manifest JSON Schema through `tool->claude`."
  [client {:keys [name description inputSchema]}]
  {:tool-name    (str "mcp_" name)
   :doc          description
   :input-schema inputSchema
   :schema       nil
   :fn           (fn [args] {:output (mcp-content->output (call-tool! client name args))})})

(defn tools-briefing
  "System-prompt block announcing the bridged MCP tools (they don't ride the skills manifest, so
  without this the model has them in its tools array but isn't told what it can do). Returns nil when
  `tools` has no MCP entries."
  [tools]
  (when-let [entries (->> (vals tools)
                          (filter #(str/starts-with? (or (:tool-name %) "") "mcp_"))
                          (sort-by :tool-name)
                          seq)]
    (str "# Direct Metabase tools\n\n"
         "You can also work directly with Metabase content — running SQL and queries, and creating "
         "or updating questions, dashboards, metrics, and collections — via these tools:\n\n"
         (str/join "\n" (for [{:keys [tool-name doc]} entries]
                          (str "- `" tool-name "`: " (some-> doc str/trim (str/split #"\n") first)))))))

(defn mcp-self-tool-defs
  "Every MCP `tools/list` tool as agent-loop tool-defs keyed by prefixed tool-name, over a client for
  `user-id`. (UI tools are already excluded — we don't advertise the MCP-Apps capability.) Best-effort:
  any failure logs and yields no tools rather than breaking the agent loop."
  [user-id]
  (try
    (let [client (initialize! user-id)]
      (into {}
            (map (fn [tool]
                   (let [tool-def (mcp-tool->tool-def client tool)]
                     [(:tool-name tool-def) tool-def])))
            (list-tools! client)))
    (catch Throwable e
      (log/warn e "Failed to load MCP self-tools; continuing without them")
      {})))
