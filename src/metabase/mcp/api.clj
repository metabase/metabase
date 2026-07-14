(ns metabase.mcp.api
  "MCP (Model Context Protocol) Streamable HTTP transport handler.
   Exposes Metabase's agent tools via JSON-RPC 2.0 over each of the MCP endpoints.

   The transport targets the 2026-07-28 stateless core: there is no `initialize` handshake to
   complete and no `Mcp-Session-Id` to carry, so every request is self-contained and any request
   may arrive cold. A client declares its capabilities in each request's `_meta`, discovers the
   server with `server/discover`, and everything the server needs to serve the call — the user,
   their granted scopes, their query handles — hangs off the authenticated identity.

   Clients that speak an older protocol still work: `initialize` is accepted, negotiates a protocol
   version both sides know, and hands back an `Mcp-Session-Id` carrying the capabilities that
   client will only ever advertise once. The server stores nothing behind it."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [compojure.response :as compojure.response]
   [metabase.api.common :as api]
   [metabase.api.macros.scope :as scope]
   [metabase.api.open-api :as open-api]
   [metabase.mcp.core :as mcp]
   [metabase.mcp.instructions :as mcp.instructions]
   [metabase.mcp.prompts :as mcp.prompts]
   [metabase.mcp.resources :as mcp.resources]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.mcp.usage :as mcp.usage]
   [metabase.mcp.validation :as mcp.validation]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.request.core :as request]
   [metabase.server.middleware.security :as mw.security]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [throttle.core :as throttle])
  (:import
   (java.io BufferedWriter OutputStreamWriter)
   (java.nio.charset StandardCharsets)
   (java.util Base64)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- JSON-RPC 2.0 --------------------------------------------------

(def ^:private server-info
  {:name    "metabase"
   :version "0.1.0"})

(def ^:private server-capabilities
  {:tools {:listChanged true} :resources {} :prompts {:listChanged false}})

(def ^:private supported-protocol-versions
  "Every protocol revision this server answers, newest first, as `server/discover` advertises them and
   as an `UnsupportedProtocolVersion` refusal lists them. The stateless core is the native one; the
   older three are the handshake era, served by accepting `initialize` and handing back an
   `Mcp-Session-Id` the server never stores."
  ["2026-07-28" "2025-11-25" "2025-06-18" "2025-03-26"])

(def ^:private protocol-version
  "The revision the server implements natively: stateless core, `server/discover`, cacheable results."
  (first supported-protocol-versions))

(defn- supported-protocol-version? [version]
  (boolean (some #{version} supported-protocol-versions)))

;;; JSON-RPC reserves -32000..-32099 for server errors, and MCP partitions that range: -32020..-32099
;;; belongs to the specification, and a server may only emit a code from it with the meaning the spec
;;; gives that code.
(def ^:private error-code-header-mismatch
  "An HTTP header does not match the body field it mirrors, or a required one is missing."
  -32020)

(def ^:private error-code-missing-client-capability
  "The request needs a client capability the request did not declare. `data.requiredCapabilities`
   names what the server needs, so the client can reconnect advertising it."
  -32021)

(def ^:private error-code-unsupported-protocol-version
  "The request declares a revision this server does not implement. `data.supported` lets the client
   pick one it can speak and retry."
  -32022)

(defn- jsonrpc-response
  "A JSON-RPC result. Every result carries `resultType`, which tells the client how to read the rest of
   it: `complete` is the whole answer, and it is the only kind this server produces — nothing here asks
   the client for more input mid-request."
  [id result]
  {:jsonrpc "2.0" :id id :result (assoc result :resultType "complete")})

(defn- jsonrpc-error
  ([id code message]
   (jsonrpc-error id code message nil))
  ([id code message data]
   {:jsonrpc "2.0"
    :id      id
    :error   (cond-> {:code code :message message}
               data (assoc :data data))}))

(def ^:private error-code->http-status
  "Refusals the protocol binds to an HTTP status, so a client can tell them apart from a legacy server's
   4xx without parsing the body. Every other error rides in a 200 with the error in the body."
  {error-code-header-mismatch              400
   error-code-missing-client-capability    400
   error-code-unsupported-protocol-version 400})

(defn- response-status
  "The HTTP status a dispatched JSON-RPC response must be delivered with."
  [response]
  (get error-code->http-status (get-in response [:error :code]) 200))

;;; -------------------------------------------------- Caching -----------------------------------------------------

(def ^:private listing-cache
  "Cache policy for the `tools/list`, `resources/list` and `prompts/list` results. A listing is settled
   by the caller's granted scopes and advertised capabilities, so it is `private`: reusable for the
   caller, never served to another authorization context by a shared gateway. A short TTL bounds how
   long a client keeps offering a tool an admin has since revoked, without costing the prompt-cache hit
   that motivates the metadata."
  {:ttl-ms (* 5 60 1000)
   :scope  "private"})

(def ^:private discover-cache
  "Cache policy for `server/discover`. What the server is and what it supports is the same answer for
   every caller, so a shared gateway may hold one copy for all of them."
  {:ttl-ms (* 60 60 1000)
   :scope  "public"})

(defn- cacheable
  "Attach the `CacheableResult` fields to a JSON-RPC result: `ttlMs`, how many milliseconds the client
   may consider it fresh, and `cacheScope`, who may reuse it — `\"public\"` for content identical for
   every caller, `\"private\"` for content settled by the caller's identity, which must never cross an
   authorization context."
  [result {:keys [ttl-ms scope]}]
  (cond-> result
    (and ttl-ms scope) (assoc :ttlMs ttl-ms :cacheScope scope)))

;;; ------------------------------------------------ Capabilities ---------------------------------------------------

(def ^:private mcp-app-mime-type
  "The MIME type an MCP Apps host declares it can render, and the one the UI resources are served as."
  "text/html;profile=mcp-app")

(def ^:private mcp-app-ui-capability
  "The client capability a UI tool needs in order to be callable: the MCP Apps extension, advertising
   the HTML profile the iframe is served as. Returned as `data.requiredCapabilities` when a client that
   never advertised it calls one of those tools anyway."
  {:extensions {:io.modelcontextprotocol/ui {:mimeTypes [mcp-app-mime-type]}}})

(defn- mcp-app-ui-capabilities?
  "Whether a client `capabilities` map advertises support for MCP Apps HTML resources."
  [capabilities]
  ;; `json/decode+kw` preserves the slash in the JSON extension key `"io.modelcontextprotocol/ui"` as the
  ;; namespaced keyword `:io.modelcontextprotocol/ui`.
  (contains?
   (set (get-in capabilities [:extensions :io.modelcontextprotocol/ui :mimeTypes]))
   mcp-app-mime-type))

(defn- supports-mcp-ui?
  "Whether the calling client can render MCP Apps, and so should be offered the UI tools.

   Read from the request's own `_meta` capabilities when it carries them. A handshake-era client
   advertises capabilities only once, at `initialize`, so for those we fall back to the hint riding in
   the `Mcp-Session-Id` it echoes back. A client that says nothing either way is not a UI host."
  [params session-id]
  (if-let [capabilities (get-in params [:_meta :io.modelcontextprotocol/clientCapabilities])]
    (mcp-app-ui-capabilities? capabilities)
    (true? (mcp.session/supports-mcp-ui? session-id))))

(defn- ui-tool?
  "Whether `tool-name` names a tool whose answer is an MCP Apps resource, and which therefore cannot be
   served to a client that can't render one."
  [tool-name]
  (boolean (some #(= tool-name (:name %)) (mcp.resources/list-ui-tools))))

;;; -------------------------------------------------- Methods -----------------------------------------------------

(defn- discover-result
  "What the server is, which revisions it speaks, what it supports, and what it is for. The
   `instructions` are the guidance layer's first tier: they ride in the client's prompt prefix, so they
   say what no tool description can — the canonical workflow, the read/write split, and which skill to
   load before a multi-step job."
  []
  {:supportedVersions supported-protocol-versions
   :capabilities      server-capabilities
   :serverInfo        server-info
   :instructions      (mcp.instructions/instructions)})

(defn- handle-discover
  "`server/discover` — the stateless replacement for connect-time negotiation. Answers what the
   server is and what it supports, without establishing anything, so a client can pick a protocol
   revision before it sends anything else."
  [id _params]
  (jsonrpc-response id (cacheable (discover-result) discover-cache)))

(defn- handle-initialize
  "The handshake, for clients that predate the stateless core. Reports what `server/discover` reports,
   but as the single `protocolVersion` those clients expect, negotiated to a revision both sides know."
  [id params]
  (when-let [client-info (:clientInfo params)]
    (log/infof "MCP client connected: %s %s" (:name client-info) (:version client-info)))
  (let [requested (:protocolVersion params)]
    (jsonrpc-response
     id
     (-> (discover-result)
         (dissoc :supportedVersions)
         (assoc :protocolVersion (if (supported-protocol-version? requested)
                                   requested
                                   protocol-version))))))

(defn- handle-tools-list [id params session-id token-scopes]
  (jsonrpc-response
   id
   (cacheable {:tools (mcp.tools/list-tools token-scopes
                                            {:supports-mcp-ui? (supports-mcp-ui? params session-id)})}
              listing-cache)))

(defn- handle-tools-call [id params session-id token-scopes request-context]
  (let [tool-name    (:name params)
        arguments    (or (:arguments params) {})
        supports-ui? (supports-mcp-ui? params session-id)
        ;; A stateless client carries its identity per-call in `_meta`; the recorder falls back to the
        ;; session's stored identity when it's absent. (`json/decode+kw` preserves the slash in
        ;; the extension key, so it's the namespaced keyword `:io.modelcontextprotocol/clientInfo`.)
        client-info  (get-in params [:_meta :io.modelcontextprotocol/clientInfo])]
    (if (and (ui-tool? tool-name) (not supports-ui?))
      ;; A tool whose only answer is an iframe is unanswerable for a client that cannot render one.
      ;; That is a capability the client never declared, not a failure of the tool, so it is refused at
      ;; the protocol layer — and the refusal names the capability, so the client can reconnect with it.
      (jsonrpc-error id error-code-missing-client-capability
                     (str tool-name " renders an MCP Apps resource, which this client did not advertise "
                          "support for.")
                     {:requiredCapabilities mcp-app-ui-capability})
      (jsonrpc-response id (mcp.tools/call-tool token-scopes
                                                tool-name
                                                arguments
                                                {:supports-mcp-ui? supports-ui?
                                                 :client-info      client-info
                                                 :session-id       session-id
                                                 :request-context  request-context})))))

(defn- handle-resources-list [id _params token-scopes]
  (jsonrpc-response id (cacheable (mcp.resources/list-resources token-scopes) listing-cache)))

(defn- handle-resources-read [id params token-scopes]
  (let [uri (:uri params)]
    (if (or (not (string? uri)) (str/blank? uri))
      (jsonrpc-error id -32602 "Missing required parameter: uri")
      (let [user-id     api/*current-user-id*
            session-key (when user-id (mcp.session/get-or-create-session-key! user-id))
            result      (mcp.resources/read-resource uri token-scopes {:session-key session-key})]
        (case (:status result)
          (:not-found :scope-denied) (jsonrpc-error id -32602 "Resource not found")
          :ok                        (jsonrpc-response id (cacheable {:contents (:contents result)}
                                                                     (:cache result))))))))

(defn- handle-prompts-list [id _params token-scopes]
  (jsonrpc-response id (cacheable (mcp.prompts/list-prompts token-scopes) listing-cache)))

(defn- handle-prompts-get [id params token-scopes]
  (let [prompt-name (:name params)]
    (if (or (not (string? prompt-name)) (str/blank? prompt-name))
      (jsonrpc-error id -32602 "Missing required parameter: name")
      ;; A prompt that isn't there and one whose arguments don't cover its template are both the
      ;; client's error to fix, so both go back as invalid-params, naming what to fix.
      (let [result (mcp.prompts/get-prompt prompt-name (:arguments params) token-scopes)]
        (case (:status result)
          :not-found        (jsonrpc-error id -32602 (str "Prompt not found: " prompt-name))
          :missing-argument (jsonrpc-error id -32602 (str "Missing required argument: "
                                                          (:argument result)))
          :ok               (jsonrpc-response id (dissoc result :status)))))))

(defn- handle-ping [id _params]
  (jsonrpc-response id {}))

(defn- unsupported-protocol-version-error
  "The refusal for a request that declares a revision this server does not implement, listing the ones it
   does so the client can pick one and retry.

   A request that declares no version at all is served anyway: only a stateless client carries its version
   in `_meta`, and a handshake-era client agreed on one at `initialize` instead."
  [id params]
  (let [requested (get-in params [:_meta :io.modelcontextprotocol/protocolVersion])]
    (when (and id requested (not (supported-protocol-version? requested)))
      (jsonrpc-error id error-code-unsupported-protocol-version
                     (str "Unsupported protocol version: " requested)
                     {:supported supported-protocol-versions
                      :requested requested}))))

(defn- dispatch-request
  "Dispatch a single JSON-RPC request. Returns a response map or nil for notifications."
  [{:keys [id method params] :as _msg} session-id token-scopes request-context]
  (try
    (or
     (unsupported-protocol-version-error id params)
     (case method
       "notifications/initialized" nil
       "server/discover"           (handle-discover id params)
       "tools/list"                (handle-tools-list id params session-id token-scopes)
       "tools/call"                (handle-tools-call id params session-id token-scopes request-context)
       "resources/list"            (handle-resources-list id params token-scopes)
       "resources/read"            (handle-resources-read id params token-scopes)
       "prompts/list"              (handle-prompts-list id params token-scopes)
       "prompts/get"               (handle-prompts-get id params token-scopes)
       "ping"                      (handle-ping id params)
       (if id
         (jsonrpc-error id -32601 (str "Method not found: " method))
         nil)))
    (catch Throwable e
      (log/error e "Error dispatching JSON-RPC method" method)
      (jsonrpc-error id -32603 (or (ex-message e) "Internal error")))))

;;; ----------------------------------------------------- SSE ------------------------------------------------------

(defn- accepts-sse?
  "Return true if the request's Accept header includes text/event-stream."
  [request]
  (some-> (get-in request [:headers "accept"])
          (str/includes? "text/event-stream")))

(defn- sse-body
  "Format a sequence of JSON-RPC messages as SSE event text."
  [messages]
  (str/join (for [message messages]
              (str "event: message\ndata: " (json/encode message) "\n\n"))))

;;; -------------------------------------------------- Responses ---------------------------------------------------

(defn- json-response
  ([status body]
   (json-response status body nil))
  ([status body extra-headers]
   {:status  status
    :headers (merge {"Content-Type" "application/json"} extra-headers)
    :body    (json/encode body)}))

(defn- sse-response
  "Return a plain Ring response with SSE-formatted body for POST requests."
  ([messages]
   (sse-response messages nil))
  ([messages extra-headers]
   {:status  200
    :headers (merge {"Content-Type"  "text/event-stream"
                     "Cache-Control" "no-cache"}
                    extra-headers)
    :body    (sse-body messages)}))

;;; ------------------------------------------------- Validation --------------------------------------------------

(defn- normalize-domain
  "Extract and lowercase the domain from a URL or Host-style header value.
   Bracketed IPv6 forms (`[::1]:3000`) and ports are handled correctly. Returns nil for unparsable input.
   Uses `try-parse-url` (the silent variant) — `Origin`/`Host` are client-controlled, so malformed inputs
   are expected and shouldn't spam the error logs."
  [url]
  (some-> url str mw.security/try-parse-url :domain u/lower-case-en))

(defn- same-origin-host? [origin host]
  (let [origin-domain (normalize-domain origin)]
    (and (some? origin-domain) (= origin-domain (normalize-domain host)))))

(defn- approved-mcp-origin? [origin]
  ;; Pre-lowercase both inputs so DNS hostname matching is case-insensitive (per RFC) and so mixed-case
  ;; schemes still match `try-parse-url`'s lowercase-only `https?|app|capacitor` regex.
  (boolean
   (or (mcp/sandbox-origin? origin)
       (when-let [approved-origins (not-empty (mcp/cors-origins))]
         (when-let [origin-url (mw.security/try-parse-url (u/lower-case-en origin))]
           (some (fn [approved-origin]
                   (and (mw.security/approved-domain? (:domain origin-url) (:domain approved-origin))
                        (mw.security/approved-protocol? (:protocol origin-url) (:protocol approved-origin))
                        (mw.security/approved-port? (:port origin-url) (:port approved-origin))))
                 (mw.security/parse-approved-origins (u/lower-case-en approved-origins))))))))

(defn- validate-origin
  "Validate the Origin header to prevent DNS rebinding attacks (MCP spec requirement).
   Returns a 403 response if Origin is present and is neither same-host nor an explicitly configured
   MCP app origin. Non-browser clients that omit the Origin header are allowed through."
  [request]
  (when-let [origin (get-in request [:headers "origin"])]
    (let [host (get-in request [:headers "host"])]
      (when-not (or (same-origin-host? origin host)
                    (approved-mcp-origin? origin))
        (json-response 403 (jsonrpc-error nil -32600 "Origin not allowed"))))))

(def ^:private mcp-name-header-source
  "The body field the `Mcp-Name` header mirrors, per method. A method absent from this map names nothing a
   gateway could route on, and carries no `Mcp-Name`."
  {"tools/call"     :name
   "prompts/get"    :name
   "resources/read" :uri})

(def ^:private base64-header-value
  "A header value the client could not send as plain ASCII: `=?base64?<base64>?=`."
  #"^=\?base64\?(.*)\?=$")

(defn- decoded-header-value
  "A mirrored header value as the body would spell it. A name or URI that is not header-safe — non-ASCII,
   padded, or shaped like the sentinel itself — arrives base64-wrapped, and is decoded here so that an
   encoded name does not read as a mismatched one. Returns `::undecodable` when the sentinel wraps
   something that is not base64, which is a malformed header rather than a mismatched one."
  [value]
  (if-let [[_ encoded] (re-matches base64-header-value value)]
    (try
      (String. (.decode (Base64/getDecoder) ^String encoded) StandardCharsets/UTF_8)
      (catch IllegalArgumentException _
        ::undecodable))
    value))

(defn- routing-header-conflict
  "A client repeats the JSON-RPC method in the `Mcp-Method` header, and the thing it is acting on — the
   tool, the prompt, the resource URI — in `Mcp-Name`, so a gateway can route a request without parsing
   its body. They mirror the body, which stays the source of truth. If a header disagrees with the body,
   an intermediary has routed on one thing and we would be executing another; that is request smuggling,
   so we refuse rather than pick a winner. Returns an error message, or nil when there is no conflict."
  [headers {:keys [method params]}]
  (let [header-method (get headers "mcp-method")
        header-name   (some-> (get headers "mcp-name") decoded-header-value)
        body-name     (some-> (mcp-name-header-source method) params)]
    (cond
      (and header-method (not= header-method method))
      (format "Mcp-Method header (%s) does not match the request method (%s)" header-method method)

      (= ::undecodable header-name)
      "Mcp-Name header is marked base64-encoded but does not decode"

      (and header-name body-name (not= header-name body-name))
      (format "Mcp-Name header (%s) does not match what %s names in the body (%s)"
              header-name method body-name))))

;;; -------------------------------------------------- Handlers ---------------------------------------------------

(defn- request-context
  "IP and User-Agent, read on the request thread so a tool-call row can denormalize them (gated PII)."
  [request]
  {:user-agent (get-in request [:headers "user-agent"])
   :ip-address (request/ip-address request)})

(defn- client-session-id
  "The `Mcp-Session-Id` a handshake-era client echoes back, or nil when the header is absent or is not an
   id this server minted. The header is client-controlled and reaches the analytics tables as a key, so a
   value that does not parse is dropped rather than stored: a client cannot write strings of its choosing
   into `mcp_tool_call_log`. Dropping it is safe — nothing is looked up by the id."
  [request]
  (let [session-id (get-in request [:headers "mcp-session-id"])]
    (when (mcp.session/session-parts session-id)
      session-id)))

(defn- handle-legacy-initialize
  "Answer an `initialize`, minting the `Mcp-Session-Id` that client will echo back.

   The id is not established state: it carries the client's MCP Apps capability so later `tools/list`
   calls can honor it, because a handshake-era client advertises capabilities exactly once and never
   again. A stateless client repeats them in every request's `_meta` and never sees this header. Nothing
   is looked up by it — see the ns docstring.

   Also opens the EE analytics row. Handshake-era clients are the only ones with no per-call client
   identity in `_meta`, so this row is what attributes their tool calls."
  [user-id request]
  (let [body       (:body request)
        params     (:params body)
        ctx        (request-context request)
        session-id (mcp.session/create! {:supports-mcp-ui? (mcp-app-ui-capabilities? (:capabilities params))})
        response   (handle-initialize (:id body) params)]
    (mcp.usage/record-mcp-session!
     {:session-id  session-id
      :user-id     user-id
      :tenant-id   (some-> api/*current-user* deref :tenant_id)
      :client-info (:clientInfo params)
      :user-agent  (:user-agent ctx)
      :ip-address  (:ip-address ctx)})
    (if (accepts-sse? request)
      (sse-response [response] {"Mcp-Session-Id" session-id})
      (json-response 200 response {"Mcp-Session-Id" session-id}))))

(defn- handle-post
  "Handle a POST request carrying one JSON-RPC message."
  [user-id request]
  (let [body       (:body request)
        session-id (client-session-id request)]
    (cond
      (nil? body)
      (json-response 400 (jsonrpc-error nil -32700 "Parse error: empty body"))

      ;; JSON-RPC batching was removed in the 2026-07-28 spec: one message per POST.
      (sequential? body)
      (json-response 400 (jsonrpc-error nil -32600
                                        "JSON-RPC batching is not supported. Send one request per POST."))

      (not (map? body))
      (json-response 400 (jsonrpc-error nil -32600 "Invalid request: expected object"))

      :else
      (if-let [conflict (routing-header-conflict (:headers request) body)]
        (json-response 400 (jsonrpc-error (:id body) error-code-header-mismatch conflict))
        (if (= "initialize" (:method body))
          (handle-legacy-initialize user-id request)
          (let [response (dispatch-request body session-id (:token-scopes request)
                                           (request-context request))
                status   (some-> response response-status)]
            (cond
              (nil? response)        {:status 202 :headers {} :body ""}
              ;; A refusal the protocol binds to a status is delivered as that status, on its own: a
              ;; client detecting the server's era reads the 400 and its body, not an SSE frame.
              (not= 200 status)      (json-response status response)
              (accepts-sse? request) (sse-response [response])
              :else                  (json-response 200 response))))))))

(def ^:private tools-list-changed-notification
  {:jsonrpc "2.0" :method "notifications/tools/list_changed"})

(defn- handle-get
  "Handle a GET request for SSE stream (keepalive for server-initiated notifications).
   Polls the tool manifest hash on each keepalive tick — if the visible tool set has
   changed since the previous tick, emits an MCP `notifications/tools/list_changed`
   message so the client knows to refetch `tools/list`. Each connection tracks its own
   last-seen hash; no shared registry, and no session to resume — `Last-Event-ID`
   resumability was removed from the spec."
  [request respond raise]
  (let [token-scopes (:token-scopes request)
        resp         (streaming-response/streaming-response
                      {:content-type "text/event-stream"
                       :headers      {"Cache-Control" "no-cache"}
                       :status       200}
                      [os canceled-chan]
                      (let [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
                        (loop [last-hash (mcp.tools/tools-hash token-scopes)]
                          (when-not (a/poll! canceled-chan)
                            (.write writer ": keepalive\n\n")
                            (.flush writer)
                            (Thread/sleep 30000)
                            (let [current-hash (mcp.tools/tools-hash token-scopes)]
                              (when (not= current-hash last-hash)
                                (.write writer ^String (sse-body [tools-list-changed-notification]))
                                (.flush writer))
                              (recur current-hash))))))]
    (compojure.response/send* resp request respond raise)))

(defn- handle-delete
  "Older clients DELETE on disconnect to tear their session down. There is no session to tear down,
   so this only closes out the analytics row the `initialize` handshake opened, and only for the
   caller's own row."
  [user-id request]
  (mcp.usage/record-mcp-session-end! {:session-id (client-session-id request)
                                      :user-id    user-id})
  {:status 200 :headers {"Content-Type" "application/json"} :body ""})

;;; -------------------------------------------------- Throttling --------------------------------------------------

;; MCP is auth-gated (session cookie or bearer token), so the risk is lower than the
;; unauthenticated OAuth endpoints. The threshold is generous to accommodate users running
;; multiple concurrent agents (e.g. 5 agents × 200 req/min). throttle/check counts every
;; request (not just failures) which is correct here — we want to cap total throughput
;; regardless of success to prevent resource exhaustion from a compromised token.
(def ^:private one-minute-ms (* 60 1000))

(def ^:private mcp-throttler
  (throttle/make-throttler :user-id :attempts-threshold 1000 :attempt-ttl-ms one-minute-ms))

(defn- check-throttle
  "Returns a 429 JSON-RPC response if rate-limited, nil otherwise."
  [user-id]
  (try
    (throttle/check mcp-throttler user-id)
    nil
    (catch clojure.lang.ExceptionInfo e
      (let [message       (ex-message e)
            retry-seconds (some->> message (re-find #"(\d+) seconds") second)]
        (cond-> (json-response 429 (jsonrpc-error nil -32000 message))
          retry-seconds (assoc-in [:headers "Retry-After"] retry-seconds))))))

;;; ---------------------------------------------------- Handler ---------------------------------------------------

;; Source of truth for the route aliases — keep in sync with the route-map in
;; [[metabase.api-routes.routes]] and resource-metadata endpoints in [[metabase.oauth-server.api.metadata]].
(def ^:private endpoint-paths
  "URL paths that serve the MCP endpoint, relative to site-url.
   `/api/metabase-mcp` is canonical (the advertised URL); `/api/mcp` is a legacy alias kept for
   back-compat with existing clients."
  #{"/api/metabase-mcp" "/api/mcp"})

(defn- www-authenticate-discovery
  "Build the `WWW-Authenticate` header advertising OAuth discovery for the path the client hit.
   A client connecting via an alias is pointed at that same alias as the protected resource."
  [request]
  ;; Routing matches on the first path segment, so a trailing slash (e.g. `/api/metabase-mcp/`) still
  ;; reaches the handler — strip it so the alias is recognized rather than falling back to canonical.
  (let [uri  (str/replace (:uri request) #"/+$" "")
        path (if (contains? endpoint-paths uri) uri "/api/metabase-mcp")]
    (str "Bearer realm=\"mcp\" resource_metadata=\"" (system/site-url) "/.well-known/oauth-protected-resource" path "\"")))

(def +mcp-enabled
  "Wrap routes so they may only be accessed when the MCP server is enabled."
  mcp.validation/+mcp-enabled)

(def ^{:arglists '([request respond raise])} handler
  "Ring async handler for the MCP endpoint.
   Uses JSON-RPC 2.0 over HTTP rather than REST, so the OpenAPI spec is empty."
  (open-api/handler-with-open-api-spec
   (fn [request respond raise]
     (let [origin-error (validate-origin request)
           bearer-token (oauth-server/extract-bearer-token request)
           session-auth api/*current-user-id*]
       (letfn [(dispatch [user-id token-scopes]
                 (request/with-current-user user-id
                   (if-let [throttle-err (check-throttle user-id)]
                     (respond throttle-err)
                     (try
                       (let [request (assoc request :token-scopes token-scopes)]
                         (cond
                           (= :post (:request-method request))
                           (respond (handle-post user-id request))

                           (= :get (:request-method request))
                           (handle-get request respond raise)

                           (= :delete (:request-method request))
                           (respond (handle-delete user-id request))

                           :else
                           (respond (json-response 405 (jsonrpc-error nil -32600 "Method not allowed")))))
                       (catch Throwable e
                         (raise e))))))]
         (cond
           (some? origin-error)
           (respond origin-error)

           ;; Session auth (browser/cookie) — unrestricted scopes
           session-auth
           (dispatch session-auth #{::scope/unrestricted})

           ;; Bearer token auth — validate and extract scopes
           bearer-token
           (if-let [{:keys [user-id scopes]} (oauth-server/resolve-access-token bearer-token)]
             (dispatch user-id scopes)
             (respond (json-response 401 (jsonrpc-error nil -32603 "Invalid bearer token")
                                     {"WWW-Authenticate" "Bearer error=\"invalid_token\""})))

           ;; No auth at all — return 401 with discovery
           :else
           (respond (json-response 401 (jsonrpc-error nil -32603 "Authentication required")
                                   {"WWW-Authenticate" (www-authenticate-discovery request)}))))))
   (constantly nil)))
