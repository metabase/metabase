(ns metabase.metabot.tools.mcp-external
  "POC: expose external MCP servers (Linear, Notion, ...) to the Metabot agent
  loop — but as ONE meta-tool per server, not one tool per remote tool.

  Why a meta-tool: dumping every remote tool flat (Linear alone is 46; add
  Notion + GitHub + Slack and you're at ~250) blows up the request prefix and
  degrades the LLM's tool selection (it gets confused past ~30 tools). Instead
  each server is a single tool the LLM sees:

      linear { op: \"list_tools\" }                       -> the server's catalog
      linear { op: \"call_tool\", name: \"...\", args: {} } -> dispatch one tool

  This is CLI-style progressive disclosure: the LLM discovers a server's tools
  on demand, then calls them. N servers = N tools, regardless of how many tools
  each server exposes. Fits Metabot's frozen-at-init tool set (no loop changes).

  Transport is the minimum slice of MCP's Streamable HTTP: JSON-RPC `initialize`,
  `tools/list`, `tools/call` over one POST endpoint. Server may answer as plain
  JSON or SSE; we handle both.

  Config via env (POC-grade, no settings UI). One server:
    MB_MCP_EXTERNAL_URL    - MCP endpoint, e.g. https://mcp.linear.app/mcp
    MB_MCP_EXTERNAL_TOKEN  - bearer token
    MB_MCP_EXTERNAL_NAME   - tool name for the server (default \"linear\")

  ponytail: hand-rolled client, single-server-from-env, in-process catalog cache.
  Add a real client + OAuth + multi-server settings when this graduates."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Config
;; ---------------------------------------------------------------------------

(defn- servers
  "Configured external MCP servers as [{:name :url :token} ...]. POC reads a
  single server from env; extend to a registry/settings later."
  []
  (let [url (System/getenv "MB_MCP_EXTERNAL_URL")]
    (when-not (str/blank? url)
      [{:name  (or (System/getenv "MB_MCP_EXTERNAL_NAME") "linear")
        :url   url
        :token (System/getenv "MB_MCP_EXTERNAL_TOKEN")}])))

;; ---------------------------------------------------------------------------
;; Transport (JSON-RPC over Streamable HTTP)
;; ---------------------------------------------------------------------------

(defn- parse-body
  "MCP Streamable HTTP may reply as JSON or as SSE. Pull the JSON-RPC payload
  out of either."
  [{:keys [body headers]}]
  (let [ct (get headers "Content-Type" "")]
    (if (str/includes? ct "text/event-stream")
      ;; SSE: last `data:` line is the response we want.
      (->> (str/split-lines body)
           (keep #(when (str/starts-with? % "data:")
                    (str/trim (subs % 5))))
           last
           json/decode+kw)
      (json/decode+kw body))))

(defn- rpc!
  "Fire one JSON-RPC request at the MCP server, return the parsed `:result`.
  Throws on a JSON-RPC `:error`."
  [{:keys [url token]} method params]
  (let [resp   (http/post url
                          {:headers          (cond-> {"Content-Type" "application/json"
                                                      ;; both, per spec, so server can pick SSE
                                                      "Accept"       "application/json, text/event-stream"}
                                               token (assoc "Authorization" (str "Bearer " token)))
                           :body             (json/encode {:jsonrpc "2.0"
                                                           :id      1
                                                           :method  method
                                                           :params  params})
                           :throw-exceptions false
                           :as               :string})
        parsed (parse-body resp)]
    (when-let [err (:error parsed)]
      (throw (ex-info (str "MCP error: " (:message err)) {:method method :error err})))
    (:result parsed)))

;; ---------------------------------------------------------------------------
;; Per-server catalog cache (tools/list is stable for a session)
;; ---------------------------------------------------------------------------

(defonce ^:private catalog-cache (atom {}))

(defn- server-tools
  "MCP tool descriptors for a server, cached after the first fetch."
  [{:keys [url] :as cfg}]
  (or (@catalog-cache url)
      (let [_     (rpc! cfg "initialize" {:protocolVersion "2025-06-18"
                                          :capabilities    {}
                                          :clientInfo      {:name "metabase-metabot" :version "poc"}})
            tools (:tools (rpc! cfg "tools/list" {}))]
        (swap! catalog-cache assoc url tools)
        tools)))

;; ---------------------------------------------------------------------------
;; Meta-tool: one Metabot tool per MCP server
;; ---------------------------------------------------------------------------

(def ^:private meta-tool-params
  "Malli params schema for the per-server meta-tool. `tool->claude` reads the
  `params` out of [:=> [:cat params] out] and turns it into the wire schema."
  [:map {:closed true}
   [:op {:description "\"list_tools\" to see this server's available tools, or \"call_tool\" to invoke one."}
    [:enum "list_tools" "call_tool"]]
   [:name {:optional true
           :description "When op=call_tool: the exact tool name from list_tools."}
    [:maybe :string]]
   [:args {:optional true
           :description "When op=call_tool: a map of arguments for that tool."}
    [:maybe :map]]])

(defn- list-tools-output
  "Compact catalog the LLM reads to discover a server's tools."
  [cfg]
  (let [tools (server-tools cfg)]
    {:output (->> tools
                  (map (fn [{:keys [name description]}]
                         (str "- " name ": " (some-> description str/trim
                                                     (#(first (str/split-lines %)))))))
                  (str/join "\n"))
     :structured-output {:tools (mapv #(select-keys % [:name :description :inputSchema]) tools)}}))

(defn- call-tool-output
  "Dispatch one remote tool by name, flatten the MCP result into {:output ...}."
  [cfg tool-name args]
  (if (str/blank? tool-name)
    {:output "call_tool requires :name (call op=list_tools first to see names)."}
    (let [result (rpc! cfg "tools/call" {:name tool-name :arguments (or args {})})
          ;; MCP returns {:content [{:type "text" :text "..."} ...]}
          text   (->> (:content result) (keep :text) (str/join "\n"))]
      {:output (if (str/blank? text) (json/encode result) text)})))

(defn- server->tool-def
  "Build the single Metabot tool-def map representing one MCP server."
  [{:keys [name] :as cfg}]
  {:tool-name name
   :doc       (str "External MCP server \"" name "\". Use op=list_tools to discover its tools, "
                   "then op=call_tool with a tool name + args to invoke one. "
                   "Tools are discovered on demand — list before you call.")
   :schema    [:=> [:cat meta-tool-params] :any]
   :fn        (fn [{:keys [op name args] :as _input}]
                (try
                  (case op
                    "list_tools" (list-tools-output cfg)
                    "call_tool"  (call-tool-output cfg name args)
                    {:output (str "Unknown op " (pr-str op) "; use \"list_tools\" or \"call_tool\".")})
                  (catch Exception e
                    (log/error e "External MCP meta-tool failed" {:server (:name cfg) :op op})
                    {:output (str "MCP error: " (.getMessage e))})))})

(defn external-mcp-tools
  "Return `{tool-name -> tool-def-map}` — one meta-tool per configured MCP
  server — ready to merge into the agent's registry. Returns `{}` if none
  configured. Catalogs are fetched lazily (on first list_tools), so an
  unreachable server costs nothing at agent init and never crashes the loop."
  []
  (into {} (map (juxt :name server->tool-def)) (servers)))
