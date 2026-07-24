(ns metabase.mcp.api
  "The v1 MCP tool surface, served at `/api/metabase-mcp` (and the legacy `/api/mcp` alias).
   Transport machinery (JSON-RPC framing, auth, origin checks, sessions, throttling) lives in
   [[metabase.mcp.transport]]; this namespace supplies the v1 method dispatch — tools driven by
   the agent-api defendpoint manifest, plus MCP resources."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.mcp.resources :as mcp.resources]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.mcp.transport :as transport]
   [metabase.mcp.validation :as mcp.validation]))

(set! *warn-on-reflection* true)

(defn- handle-tools-list [id _params session-id token-scopes]
  (let [supports-mcp-ui? (mcp.session/supports-mcp-ui? session-id)]
    (transport/jsonrpc-response id {:tools (mcp.tools/list-tools token-scopes {:supports-mcp-ui?
                                                                               supports-mcp-ui?})})))

(defn- handle-tools-call [id params session-id token-scopes request-context]
  (let [tool-name        (:name params)
        arguments        (or (:arguments params) {})
        ;; RC clients carry their identity per-call in `_meta`; the recorder falls back to the
        ;; session's stored identity when it's absent. (`json/decode+kw` preserves the slash in
        ;; the extension key, so it's the namespaced keyword `:io.modelcontextprotocol/clientInfo`.)
        client-info      (get-in params [:_meta :io.modelcontextprotocol/clientInfo])
        supports-mcp-ui? (mcp.session/supports-mcp-ui? session-id)]
    (transport/jsonrpc-response id (mcp.tools/call-tool token-scopes
                                                        session-id
                                                        tool-name
                                                        arguments
                                                        {:supports-mcp-ui? supports-mcp-ui?
                                                         :client-info      client-info
                                                         :request-context  request-context}))))

(defn- handle-resources-list [id _params token-scopes]
  (transport/jsonrpc-response id (mcp.resources/list-resources token-scopes)))

(defn- handle-resources-read [id params session-id token-scopes]
  (let [uri (:uri params)]
    (if (or (not (string? uri)) (str/blank? uri))
      (transport/jsonrpc-error id -32602 "Missing required parameter: uri")
      (let [user-id     api/*current-user-id*
            session-key (when user-id (mcp.session/get-or-create-session-key! session-id user-id))
            options     {:session-key session-key
                         :session-id  session-id}
            result      (mcp.resources/read-resource uri token-scopes options)]
        (case (:status result)
          (:not-found :scope-denied) (transport/jsonrpc-error id -32602 "Resource not found")
          :ok                        (transport/jsonrpc-response id {:contents (:contents result)})
          (transport/jsonrpc-error id -32603 (str "Unexpected resource status: " (:status result))))))))

(defn- handle-ping [id _params]
  (transport/jsonrpc-response id {}))

(defn- dispatch-method
  "Route a single JSON-RPC `method` to its v1 handler, returning a response map or nil (notifications).
  A handler that throws is turned into a JSON-RPC internal error by the transport."
  [id method params session-id token-scopes request-context]
  (case method
    "notifications/initialized" nil
    "tools/list"                (handle-tools-list id params session-id token-scopes)
    "tools/call"                (handle-tools-call id params session-id token-scopes request-context)
    "resources/list"            (handle-resources-list id params token-scopes)
    "resources/read"            (handle-resources-read id params session-id token-scopes)
    "ping"                      (handle-ping id params)
    (if id
      (transport/jsonrpc-error id -32601 (str "Method not found: " method))
      nil)))

;; Source of truth for the route aliases — keep in sync with the route-map in
;; [[metabase.api-routes.routes]] and resource-metadata endpoints in [[metabase.oauth-server.api.metadata]].
(def ^:private endpoint-paths
  "URL paths that serve the v1 MCP endpoint, relative to site-url.
   `/api/metabase-mcp` is canonical (the advertised URL); `/api/mcp` is a legacy alias kept for
   back-compat with existing clients."
  #{"/api/metabase-mcp" "/api/mcp"})

(def +mcp-enabled
  "Wrap routes so they may only be accessed when the MCP server is enabled."
  mcp.validation/+mcp-enabled)

(def ^{:arglists '([request respond raise])} handler
  "Ring async handler for the v1 MCP endpoint."
  (transport/make-handler
   {:dispatch-method-fn dispatch-method
    :capabilities       {:tools {:listChanged true} :resources {}}
    :tools-hash-fn      mcp.tools/tools-hash
    :endpoint-paths     endpoint-paths
    :default-path       "/api/metabase-mcp"}))
