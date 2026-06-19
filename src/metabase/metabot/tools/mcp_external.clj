(ns metabase.metabot.tools.mcp-external
  "POC: pull tools from an external MCP server (e.g. Notion's hosted MCP) and
  expose them as Metabot agent tools.

  Implements the minimum slice of MCP's Streamable HTTP transport: JSON-RPC
  `initialize`, `tools/list`, `tools/call` over a single POST endpoint. The
  server may answer either as plain JSON or as an SSE stream (text/event-stream);
  we handle both.

  Config via env vars (POC-grade, no settings UI):
    MB_MCP_EXTERNAL_URL    - MCP endpoint, e.g. https://mcp.notion.com/mcp
    MB_MCP_EXTERNAL_TOKEN  - bearer token (Notion OAuth access token / integration secret)

  ponytail: hand-rolled 3-method client, no MCP SDK. add a real client + OAuth
  flow when this graduates past POC. Notion's hosted MCP expects OAuth; a static
  token here proves the wiring and swaps for a real token via env, not code."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- config []
  {:url   (System/getenv "MB_MCP_EXTERNAL_URL")
   :token (System/getenv "MB_MCP_EXTERNAL_TOKEN")})

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

(defn- mcp-tool->tool-def
  "Turn one MCP tool descriptor into a Metabot tool-def map.

  Metabot's Claude adapter normally derives the wire schema from a Malli
  `:schema`; MCP hands us JSON Schema directly, so we stash it under
  `:input_schema` and teach `tool->claude` to prefer it (see claude.clj)."
  [cfg {:keys [name description inputSchema]}]
  {:tool-name    name
   :doc          description
   :schema       nil
   :input_schema (or inputSchema {:type "object" :properties {}})
   :fn           (fn [args]
                   (try
                     (let [result  (rpc! cfg "tools/call" {:name name :arguments (or args {})})
                           ;; MCP returns {:content [{:type "text" :text "..."} ...]}
                           text    (->> (:content result)
                                        (keep :text)
                                        (str/join "\n"))]
                       {:output (if (str/blank? text) (json/encode result) text)})
                     (catch Exception e
                       (log/error e "External MCP tool call failed" {:tool name})
                       {:output (str "MCP tool error: " (.getMessage e))})))})

(defn external-mcp-tools
  "Connect to the configured external MCP server and return a
  `{tool-name -> tool-def-map}` map ready to merge into the agent's tool
  registry. Returns `{}` (and logs) if unconfigured or unreachable, so a broken
  MCP server can never take down the agent loop."
  []
  (let [{:keys [url] :as cfg} (config)]
    (if (str/blank? url)
      {}
      (try
        (rpc! cfg "initialize" {:protocolVersion "2025-06-18"
                                :capabilities    {}
                                :clientInfo      {:name "metabase-metabot" :version "poc"}})
        (let [tools (:tools (rpc! cfg "tools/list" {}))]
          (log/info "Loaded external MCP tools" {:url url :count (count tools)})
          (into {} (map (juxt :name #(mcp-tool->tool-def cfg %))) tools))
        (catch Exception e
          (log/error e "Failed to load external MCP tools" {:url url})
          {})))))
