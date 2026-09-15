(ns metabase.mcp.v2.api
  "The MCP tool surface mounted on every path in
   [[metabase.mcp.paths/endpoint-paths]]. [[metabase.mcp.transport]] supplies the JSON-RPC framing,
   origin checks, cookie/bearer auth, session handling, and throttling; `tools/list` and
   `tools/call` are driven by the [[metabase.mcp.v2.registry]]. Gated by
   [[metabase.mcp.validation/+mcp-enabled]]."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.mcp.paths :as mcp.paths]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.transport :as transport]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resources :as v2.resources]
   ;; Tool namespaces self-register via `deftool` when loaded. The core surface ships with the `learn`
   ;; hello-world tool; each later PR adds its tool's require line here alongside the tool file.
   [metabase.mcp.v2.tools.alert]
   [metabase.mcp.v2.tools.bookmark]
   [metabase.mcp.v2.tools.browse]
   [metabase.mcp.v2.tools.collection]
   [metabase.mcp.v2.tools.content]
   [metabase.mcp.v2.tools.dashboard]
   [metabase.mcp.v2.tools.definitions]
   [metabase.mcp.v2.tools.document]
   [metabase.mcp.v2.tools.duplicate]
   [metabase.mcp.v2.tools.learn]
   [metabase.mcp.v2.tools.metric]
   [metabase.mcp.v2.tools.parameters]
   [metabase.mcp.v2.tools.query]
   [metabase.mcp.v2.tools.question]
   [metabase.mcp.v2.tools.search]
   [metabase.mcp.v2.tools.subscription]
   [metabase.mcp.v2.tools.transform]
   [metabase.mcp.v2.tools.ui-credential]
   [metabase.mcp.v2.tools.visualize]
   [metabase.mcp.validation :as mcp.validation]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Method dispatch -----------------------------------------------

(defn- handle-tools-list [id _params session-id]
  (let [supports-mcp-ui? (mcp.session/supports-mcp-ui? session-id)]
    (transport/jsonrpc-response id {:tools (registry/list-tools {:supports-mcp-ui? supports-mcp-ui?})})))

(defn- step-up-scopes
  "The `scope` an `insufficient_scope` challenge asks for: the `surface-scopes` that are `required` or that
   `token-scopes` matches, in `surface-scopes` order, then `required` when it is outside the surface."
  [surface-scopes token-scopes required]
  ;; Held scopes ride along because a client may replace its grant with the challenged scope. They are matched, not
  ;; looked up, so a wildcard grant such as `agent:content:*` keeps the surface scopes it covers. Only scope strings
  ;; count: nil and the unrestricted sentinel match everything but are never challenged.
  (let [held (set (filter string? token-scopes))]
    (cond-> (filterv #(or (= required %) (mcp.scope/matches? held %)) surface-scopes)
      (not (some #{required} surface-scopes)) (conj required))))

(defn- handle-tools-call [id params session-id token-scopes request-context]
  (let [tool-name        (:name params)
        arguments        (or (:arguments params) {})
        ;; RC clients carry their identity per-call in `_meta`; the usage recorder falls back to
        ;; the session's stored identity when it's absent.
        client-info      (get-in params [:_meta :io.modelcontextprotocol/clientInfo])
        supports-mcp-ui? (mcp.session/supports-mcp-ui? session-id)
        {:keys [error result]}
        (registry/call-tool token-scopes
                            session-id
                            tool-name
                            arguments
                            {:client-info      client-info
                             :supports-mcp-ui? supports-mcp-ui?
                             :request-context  request-context})]
    (if-let [{:keys [code message insufficient-scope]} error]
      (cond-> (transport/jsonrpc-error id code message)
        insufficient-scope (transport/insufficient-scope
                            (step-up-scopes mcp.paths/v2-surface-scopes
                                            token-scopes
                                            (:required-scope insufficient-scope))
                            (:description insufficient-scope)))
      (transport/jsonrpc-response id result))))

(defn- handle-resources-list [id _params]
  (transport/jsonrpc-response id (v2.resources/list-resources)))

(defn- resource-scope-denial
  "The JSON-RPC error refusing request `id` a read of `uri` because `token-scopes` lack `required-scope`, marked with
   [[transport/insufficient-scope]]."
  [id uri token-scopes required-scope]
  (let [held (sort (filter string? token-scopes))]
    (transport/insufficient-scope
     (transport/jsonrpc-error id -32600 (str "Insufficient scope to read resource: " uri ". Requires " required-scope "; "
                                             (if (seq held)
                                               (str "your token holds " (str/join ", " held) ".")
                                               "your token holds no scopes.")))
     (step-up-scopes mcp.paths/v2-surface-scopes token-scopes required-scope)
     (str uri " requires " required-scope
          (when-let [label (registry/english-scope-label required-scope)]
            (str " (" label ")"))))))

(defn- handle-resources-read [id params session-id token-scopes]
  (let [uri (:uri params)]
    (if (or (not (string? uri)) (str/blank? uri))
      (transport/jsonrpc-error id -32602 "Missing required parameter: uri")
      ;; The scoped credential the iframe authenticates with. Since #81041 the browser receives it
      ;; through the `refresh_ui_credential` tool; the shell's render-fn still forces this delay for
      ;; templates that embed it (the test fallback), and the production template discards it.
      ;; Deliberately a delay: the URI has not been resolved yet, so minting eagerly would hand a live
      ;; 5-minute authenticator to data resources that ignore it, and burn one on reads that turn out
      ;; to be unknown or scope-denied. Only [[metabase.mcp.ui-resource/embed-render-fn]] forces it, and
      ;; [[metabase.mcp.v2.resources/read-resource]] withholds it from a token lacking the shell's scope.
      (let [user-id       api/*current-user-id*
            ui-credential (when user-id
                            (delay (mcp.session/issue-ui-credential session-id user-id token-scopes)))
            result        (v2.resources/read-resource uri token-scopes {:ui-credential ui-credential
                                                                        :session-id    session-id})]
        (case (:status result)
          :not-found    (transport/jsonrpc-error id -32602 "Resource not found")
          :scope-denied (resource-scope-denial id uri token-scopes (:required-scope result))
          :ok           (transport/jsonrpc-response id {:contents (:contents result)})
          (transport/jsonrpc-error id -32603 (str "Unexpected resource status: " (:status result))))))))

(defn- handle-ping [id _params]
  (transport/jsonrpc-response id {}))

(defn- dispatch-method
  "Route a single JSON-RPC `method` to its handler, returning a response map or nil
  (notifications). `resources/*` serves the resources in [[metabase.mcp.v2.resources]]: the MCP Apps
  iframe shells and the fields catalog. `resources/read` of a data resource needs its scope and answers
  a 403 challenge otherwise; a UI shell is served to any token, carrying a credential only when the
  token holds the shell's scope. `prompts/*` is still unimplemented and falls through to
  method-not-found. A handler that throws is turned into a JSON-RPC internal error by the
  transport."
  [id method params session-id token-scopes request-context]
  (case method
    "notifications/initialized" nil
    "tools/list"                (handle-tools-list id params session-id)
    "tools/call"                (handle-tools-call id params session-id token-scopes request-context)
    "resources/list"            (handle-resources-list id params)
    "resources/read"            (handle-resources-read id params session-id token-scopes)
    "ping"                      (handle-ping id params)
    (if id
      (transport/jsonrpc-error id -32601 (str "Method not found: " method))
      nil)))

;;; ---------------------------------------------------- Handler ---------------------------------------------------

(def +mcp-enabled
  "Wrap routes so they may only be accessed when the MCP server is enabled."
  mcp.validation/+mcp-enabled)

(def ^:private server-instructions
  "The `initialize` result's `instructions` — the only channel that reaches the model before any tool call. It points
  at the `learn` skills once, settles the routing choices a model makes before reading any tool description closely
  (structured queries are the default, raw SQL the escape hatch, `visualize_query` for charts when listed), and
  explains the scope-denial failures that clients rewrite before the model sees them."
  (str "This server ships task-shaped docs as skills. learn() lists the topics; learn(topic) returns one.\n"
       "Before your first complex write — native template_tags, dashboard parameter wiring, a multi-stage or joined "
       "query, visualization settings — read the matching skill unless it is already in context.\n"
       "Answer questions from data with execute_query (structured MBQL) by default; execute_sql is the escape hatch "
       "for what MBQL cannot express or an explicit request for SQL.\n"
       "When visualize_query is available, use it for any request to show, chart, plot, or visualize data (pass a "
       "query_handle from execute_query or execute_sql when you have one); don't draw the chart yourself.\n"
       "Teaching errors embed the relevant contract, so a failed call always names its fix.\n"
       ;; Must match what the consent screen shows: one Authorize button, no per-permission choices. Given less, the
       ;; model invents a step asking the user to tick the permission.
       "Your client may hide that error. If a Metabase tool call fails with a message about re-authorization, an "
       "expired token, \"insufficient scope\", \"Unauthorized\", or just \"tool execution failed\", the usual cause is a "
       "missing permission on this connection, not an expired login. Tell the user which tool failed and which "
       "permission it needs, using the name in the \"Requires the … permission\" sentence that starts the tool's "
       "description, which is how Metabase's consent screen names it. To grant it, the user reconnects Metabase in "
       "their client and clicks Authorize on the consent screen, e.g. in Claude Code: /mcp, select this server, "
       "Re-authenticate; in Codex: "
       "`codex mcp login <server>`, then start a new session. The consent screen has no per-permission choices, so "
       "don't ask the user to check or select anything. Don't retry the tool until the user says they have reconnected."))

(def ^:private default-ask-scopes
  "The `scope` of the 401 challenge: [[metabase.mcp.paths/v2-baseline-scopes]], which an uninstructed client requests
  on first connect.

  Every tool is listed whatever the token holds. A call needing a scope the token lacks is answered with a 403
  `insufficient_scope` naming the union of held and required scopes, and each tool declares its scope in
  `securitySchemes`, so a client steps up to the rest of the surface rather than being granted it up front. The
  surface still accepts all of [[metabase.mcp.paths/v2-surface-scopes]].

  Every scope here must be inside the OAuth server's default grant ceiling, or a client that follows the challenge
  is answered \"Invalid scope\"."
  mcp.paths/v2-baseline-scopes)

(def ^{:arglists '([request respond raise])} handler
  "Ring async handler for the MCP endpoint."
  (transport/make-handler
   {:dispatch-method-fn dispatch-method
    ;; No :prompts — a surface must not advertise methods it answers with method-not-found.
    :capabilities       {:tools {:listChanged true} :resources {}}
    :instructions       server-instructions
    :tools-hash-fn      registry/tools-hash
    :endpoint-paths     mcp.paths/endpoint-paths
    :default-path       mcp.paths/canonical-path
    :default-ask-scopes default-ask-scopes}))
