(ns metabase.mcp.v2.api
  "The v2 MCP tool surface, served at `/api/metabase-mcp/v2`. Shares the v1 transport
   ([[metabase.mcp.transport]]) — same JSON-RPC framing, origin checks, cookie/bearer auth,
   session handling, and throttling — but `tools/list` and `tools/call` are driven by the
   [[metabase.mcp.v2.registry]] instead of the agent-api defendpoint manifest. Gated by
   `mcp-v2-enabled`, independent of the v1 `mcp-enabled?` setting."
  (:require
   [metabase.api.routes.common :as routes.common]
   [metabase.llm.settings :as llm.settings]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.transport :as transport]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.browse]
   [metabase.mcp.v2.tools.content]
   [metabase.mcp.v2.tools.query]
   [metabase.mcp.v2.tools.search]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Placeholder tool ----------------------------------------------

;; Exercises the whole surface (tools/list, tools/call, scope filtering, kill switches) until
;; real tools land in tasks 05+.
(registry/deftool ping-v2
  "Health-check tool for the v2 MCP surface. Returns a fixed acknowledgement."
  {:name        "ping_v2"
   :scope       metabot.scope/agent-search
   :annotations {:readOnlyHint true :idempotentHint true}
   :args        [:map
                 [:message {:optional true} [:maybe :string]]]}
  [{:keys [message]} _context]
  (let [payload {:ok true :message (or message "pong")}]
    (common/success-content payload payload)))

;;; ------------------------------------------------ Method dispatch -----------------------------------------------

(defn- handle-tools-list [id _params _session-id token-scopes]
  (transport/jsonrpc-response id {:tools (registry/list-tools token-scopes)}))

(defn- handle-tools-call [id params session-id token-scopes request-context]
  (let [tool-name   (:name params)
        arguments   (or (:arguments params) {})
        ;; RC clients carry their identity per-call in `_meta`; the usage recorder falls back to
        ;; the session's stored identity when it's absent.
        client-info (get-in params [:_meta :io.modelcontextprotocol/clientInfo])]
    (transport/jsonrpc-response id (registry/call-tool token-scopes
                                                       session-id
                                                       tool-name
                                                       arguments
                                                       {:client-info     client-info
                                                        :request-context request-context}))))

(defn- handle-ping [id _params]
  (transport/jsonrpc-response id {}))

(defn- dispatch-method
  "Route a single JSON-RPC `method` to its v2 handler, returning a response map or nil
  (notifications). `resources/*` and `prompts/*` land with the skills work; until then they
  fall through to method-not-found. A handler that throws is turned into a JSON-RPC internal
  error by the transport."
  [id method params session-id token-scopes request-context]
  (case method
    "notifications/initialized" nil
    "tools/list"                (handle-tools-list id params session-id token-scopes)
    "tools/call"                (handle-tools-call id params session-id token-scopes request-context)
    "ping"                      (handle-ping id params)
    (if id
      (transport/jsonrpc-error id -32601 (str "Method not found: " method))
      nil)))

;;; ---------------------------------------------------- Handler ---------------------------------------------------

(defn- enforce-mcp-v2-enabled
  [handler-fn]
  (fn [request respond raise]
    (cond
      (not (llm.settings/ai-features-enabled?))
      (raise (ex-info (tru "AI features are not enabled.") {:status-code 403}))

      (mcp.settings/mcp-v2-enabled)
      (handler-fn request respond raise)

      :else
      (raise (ex-info (tru "MCP v2 server is not enabled.") {:status-code 403})))))

(def +mcp-v2-enabled
  "Wrap routes so they may only be accessed when the v2 MCP surface is enabled."
  (routes.common/wrap-middleware-for-open-api-spec-generation enforce-mcp-v2-enabled))

(def ^{:arglists '([request respond raise])} handler
  "Ring async handler for the v2 MCP endpoint."
  (transport/make-handler
   {:dispatch-method-fn dispatch-method
    ;; No :resources/:prompts — a surface must not advertise methods it answers with
    ;; method-not-found.
    :capabilities       {:tools {:listChanged true}}
    :tools-hash-fn      registry/tools-hash
    :endpoint-paths     #{"/api/metabase-mcp/v2"}
    :default-path       "/api/metabase-mcp/v2"}))
