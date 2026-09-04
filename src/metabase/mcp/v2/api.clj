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
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.transport :as transport]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resources :as v2.resources]
   ;; Tool namespaces self-register via `deftool` when loaded. The core surface ships with the `learn`
   ;; hello-world tool; each later PR adds its tool's require line here alongside the tool file.
   [metabase.mcp.v2.tools.bookmark]
   [metabase.mcp.v2.tools.collection]
   [metabase.mcp.v2.tools.learn]
   [metabase.mcp.v2.tools.metric]
   [metabase.mcp.v2.tools.ui-credential]
   [metabase.mcp.validation :as mcp.validation]
   [metabase.metabot.scope :as metabot.scope]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Health check --------------------------------------------------

;; Lets a client or operator confirm the surface is reachable and its token is accepted without touching any content.
;; Gated on one scope rather than the whole surface set because the registry validates `:scope` as a single non-blank
;; string: a set — which [[metabase.mcp.scope/matches?]] would otherwise honor — throws in `register-tool!`, and
;; `registered-scopes` would collect the set itself rather than its members. So the token-acceptance half of the check
;; only covers `agent:content:read` tokens; the unscoped JSON-RPC `ping` method covers reachability for the rest.
(registry/deftool ping-v2
  "Health-check tool for the MCP surface. Returns a fixed acknowledgement. Requires the
  `agent:content:read` scope: a token granted only other scopes of this surface neither sees nor can
  call it, and should use the unscoped JSON-RPC `ping` method to confirm reachability instead."
  {:name        "ping_v2"
   :scope       metabot.scope/agent-content-read
   :annotations {:readOnlyHint true :idempotentHint true}
   :args        [:map {:closed true}
                 [:message {:optional true} [:maybe :string]]]}
  [{:keys [message]} _context]
  (let [payload {:ok true :message (or message "pong")}]
    (common/success-content payload payload)))

;;; ------------------------------------------------ Method dispatch -----------------------------------------------

(defn- handle-tools-list [id _params session-id token-scopes]
  (let [supports-mcp-ui? (mcp.session/supports-mcp-ui? session-id)]
    (transport/jsonrpc-response id {:tools (registry/list-tools token-scopes
                                                                {:supports-mcp-ui? supports-mcp-ui?})})))

(defn- handle-tools-call [id params session-id token-scopes request-context]
  (let [tool-name        (:name params)
        arguments        (or (:arguments params) {})
        ;; RC clients carry their identity per-call in `_meta`; the usage recorder falls back to
        ;; the session's stored identity when it's absent.
        client-info      (get-in params [:_meta :io.modelcontextprotocol/clientInfo])
        supports-mcp-ui? (mcp.session/supports-mcp-ui? session-id)]
    (transport/jsonrpc-response id (registry/call-tool token-scopes
                                                       session-id
                                                       tool-name
                                                       arguments
                                                       {:client-info      client-info
                                                        :supports-mcp-ui? supports-mcp-ui?
                                                        :request-context  request-context}))))

(defn- handle-resources-list [id _params token-scopes]
  (transport/jsonrpc-response id (v2.resources/list-resources token-scopes)))

(defn- handle-resources-read [id params session-id token-scopes]
  (let [uri (:uri params)]
    (if (or (not (string? uri)) (str/blank? uri))
      (transport/jsonrpc-error id -32602 "Missing required parameter: uri")
      ;; The scoped credential the iframe authenticates with. Since #81041 the browser receives it
      ;; through the `refresh_ui_credential` tool; the shell's render-fn still forces this delay for
      ;; templates that embed it (the test fallback), and the production template discards it.
      ;; Deliberately a delay: the URI has not been resolved yet, so minting eagerly would hand a live
      ;; 5-minute authenticator to data resources that ignore it, and burn one on reads that turn out
      ;; to be unknown or scope-denied. Only [[metabase.mcp.ui-resource/embed-render-fn]] forces it,
      ;; and only after the scope gate has passed.
      (let [user-id       api/*current-user-id*
            ui-credential (when user-id
                            (delay (mcp.session/issue-ui-credential session-id user-id token-scopes)))
            result        (v2.resources/read-resource uri token-scopes {:ui-credential ui-credential
                                                                        :session-id    session-id})]
        (case (:status result)
          ;; Collapsed so a scope-denied read can't be used to probe which resources exist.
          (:not-found :scope-denied) (transport/jsonrpc-error id -32602 "Resource not found")
          :ok                        (transport/jsonrpc-response id {:contents (:contents result)})
          (transport/jsonrpc-error id -32603 (str "Unexpected resource status: " (:status result))))))))

(defn- handle-ping [id _params]
  (transport/jsonrpc-response id {}))

(defn- dispatch-method
  "Route a single JSON-RPC `method` to its handler, returning a response map or nil
  (notifications). `resources/*` serves the MCP Apps iframe shells only; documentation and skill
  resources land with the skills work. `prompts/*` is still unimplemented and falls through to
  method-not-found. A handler that throws is turned into a JSON-RPC internal error by the
  transport."
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

;;; ---------------------------------------------------- Handler ---------------------------------------------------

(def +mcp-enabled
  "Wrap routes so they may only be accessed when the MCP server is enabled."
  mcp.validation/+mcp-enabled)

(def ^:private server-instructions
  "The `initialize` result's `instructions` — the only channel that reaches the model before any tool call, so it points
  at the `learn` skills once, in three lines."
  (str "This server ships task-shaped docs as skills. learn() lists the topics; learn(topic) returns one.\n"
       "Before your first complex write — native template_tags, dashboard parameter wiring, an MBQL query, "
       "visualization settings — read the matching skill unless it is already in context.\n"
       "Teaching errors embed the relevant contract, so a failed call always names its fix."))

(def ^:private default-ask-scopes
  "What an uninstructed client is asked to request for this surface: everything the surface accepts.

  A client asks once, at connect time, using this challenge — and `list-tools` filters by the scopes the resulting
  token carries. Asking for less therefore does not degrade gracefully: it hides the write tools from `tools/list`
  entirely, so the user sees a read-only Metabase with nothing telling them the rest exists or how to ask for it.
  There is no in-product path from \"connected\" to \"can write\".

  So the consent screen names the full surface and the user decides there, rather than the server deciding for them
  by omission. This is not a widening of what the surface accepts — that set is unchanged, and `mb:full` and the
  rest of the agent-API scopes remain refused (GHY-4226).

  Read from [[metabase.mcp.paths/v2-surface-scopes]] rather than listed here, because the OAuth server has to
  grant exactly this set: when the two drifted, a client that followed the challenge asked for scopes
  `validate-scope` rejected and the connect failed with \"Invalid scope\"."
  mcp.paths/v2-surface-scopes)

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
