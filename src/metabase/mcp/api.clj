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
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Auth --------------------------------------------------------

(defn- validate-bearer-token
  "Look up and validate an OAuth bearer token. Returns `{:user-id <int> :scopes <set>}` on success, nil on failure.
   Delegates to the shared resolver so MCP and the core session middleware agree on token validity and scopes."
  [token-string]
  (oauth-server/resolve-access-token token-string))

;;; ------------------------------------------------- JSON-RPC 2.0 --------------------------------------------------

(def ^:private server-info
  {:name    "metabase"
   :version "0.1.0"})

(def ^:private server-capabilities
  {:tools {:listChanged true} :resources {}})

(def ^:private protocol-version
  "The protocol this server implements: stateless core, `server/discover`, cacheable results."
  "2026-07-28")

(def ^:private supported-protocol-versions
  "Versions an `initialize` may negotiate down to. A client asking for one of these gets it echoed
   back, because the stateless core is a superset of what they need — they simply keep sending the
   handshake and the session header, and the server keeps ignoring them. Anything else negotiates up
   to [[protocol-version]], which the spec allows and which the client may then refuse."
  #{"2026-07-28" "2025-06-18" "2025-03-26"})

(defn- jsonrpc-response [id result]
  {:jsonrpc "2.0" :id id :result result})

(defn- jsonrpc-error [id code message]
  {:jsonrpc "2.0" :id id :error {:code code :message message}})

;;; -------------------------------------------------- Caching -----------------------------------------------------

(def ^:private listing-cache
  "Cache policy for `tools/list` and `resources/list`. The listing is settled by the caller's granted
   scopes and advertised capabilities, so it is reusable for the life of a connection but not across
   connections — hence the `session` scope. A short TTL bounds how long a client keeps offering a tool
   an admin has since revoked, without costing the prompt-cache hit that motivates the metadata."
  {:ttl-ms (* 5 60 1000)
   :scope  "session"})

(defn- cacheable
  "Attach `CacheableResult` metadata to a JSON-RPC result: `ttlMs` (how long a client may reuse it)
   and `cacheScope` (who may reuse it — `\"global\"` for identical-for-everyone content, `\"session\"`
   for per-connection). A nil policy leaves the result unmarked, which means \"do not cache\"."
  [result {:keys [ttl-ms scope]}]
  (cond-> result
    (and ttl-ms scope) (assoc :ttlMs ttl-ms :cacheScope scope)))

;;; ------------------------------------------------ Capabilities ---------------------------------------------------

(defn- mcp-app-ui-capabilities?
  "Whether a client `capabilities` map advertises support for MCP Apps HTML resources."
  [capabilities]
  ;; `json/decode+kw` preserves the slash in the JSON extension key `"io.modelcontextprotocol/ui"` as the
  ;; namespaced keyword `:io.modelcontextprotocol/ui`.
  (contains?
   (set (get-in capabilities [:extensions :io.modelcontextprotocol/ui :mimeTypes]))
   "text/html;profile=mcp-app"))

(defn- supports-mcp-ui?
  "Whether the calling client can render MCP Apps, and so should be offered the UI tools.

   Read from the request's own `_meta` capabilities when it carries them. A pre-RC client advertises
   capabilities only once, at `initialize`, so for those we fall back to the hint riding in the
   `Mcp-Session-Id` it echoes back. A client that says nothing either way is not a UI host."
  [params session-id]
  (if-let [capabilities (get-in params [:_meta :io.modelcontextprotocol/capabilities])]
    (mcp-app-ui-capabilities? capabilities)
    (true? (mcp.session/supports-mcp-ui? session-id))))

;;; -------------------------------------------------- Methods -----------------------------------------------------

(def ^:private discover-result
  {:protocolVersion protocol-version
   :capabilities    server-capabilities
   :serverInfo      server-info})

(defn- handle-discover
  "`server/discover` — the stateless replacement for connect-time negotiation. Answers what the
   server is and what it supports, without establishing anything."
  [id _params]
  (jsonrpc-response id discover-result))

(defn- handle-initialize
  "Back-compat handshake for clients that predate the stateless core. Reports what `server/discover`
   reports, but at a protocol version both sides know."
  [id params]
  (when-let [client-info (:clientInfo params)]
    (log/infof "MCP client connected: %s %s" (:name client-info) (:version client-info)))
  (let [requested (:protocolVersion params)]
    (jsonrpc-response
     id
     (assoc discover-result
            :protocolVersion (if (contains? supported-protocol-versions requested)
                               requested
                               protocol-version)))))

(defn- handle-tools-list [id params session-id token-scopes]
  (jsonrpc-response
   id
   (cacheable {:tools (mcp.tools/list-tools token-scopes
                                            {:supports-mcp-ui? (supports-mcp-ui? params session-id)})}
              listing-cache)))

(defn- handle-tools-call [id params session-id token-scopes request-context]
  (let [tool-name   (:name params)
        arguments   (or (:arguments params) {})
        ;; RC clients carry their identity per-call in `_meta`; the recorder falls back to the
        ;; session's stored identity when it's absent. (`json/decode+kw` preserves the slash in
        ;; the extension key, so it's the namespaced keyword `:io.modelcontextprotocol/clientInfo`.)
        client-info (get-in params [:_meta :io.modelcontextprotocol/clientInfo])]
    (jsonrpc-response id (mcp.tools/call-tool token-scopes
                                              tool-name
                                              arguments
                                              {:supports-mcp-ui? (supports-mcp-ui? params session-id)
                                               :client-info      client-info
                                               :session-id       session-id
                                               :request-context  request-context}))))

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

(defn- handle-ping [id _params]
  (jsonrpc-response id {}))

(defn- dispatch-request
  "Dispatch a single JSON-RPC request. Returns a response map or nil for notifications."
  [{:keys [id method params] :as _msg} session-id token-scopes request-context]
  (try
    (case method
      "notifications/initialized" nil
      "server/discover"           (handle-discover id params)
      "tools/list"                (handle-tools-list id params session-id token-scopes)
      "tools/call"                (handle-tools-call id params session-id token-scopes request-context)
      "resources/list"            (handle-resources-list id params token-scopes)
      "resources/read"            (handle-resources-read id params token-scopes)
      "ping"                      (handle-ping id params)
      (if id
        (jsonrpc-error id -32601 (str "Method not found: " method))
        nil))
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

(defn- routing-header-conflict
  "The RC lets a client repeat the JSON-RPC method — and, for `tools/call`, the tool name — in the
   `Mcp-Method` and `Mcp-Name` headers, so a gateway can route a request without parsing its body.
   They are a routing hint, never the source of truth. If a header disagrees with the body, an
   intermediary has routed on one thing and we would be executing another; that is request smuggling,
   so we refuse rather than pick a winner. Returns an error message, or nil when there is no conflict."
  [headers {:keys [method params]}]
  (let [header-method (get headers "mcp-method")
        header-name   (get headers "mcp-name")]
    (cond
      (and header-method (not= header-method method))
      (format "Mcp-Method header (%s) does not match the request method (%s)" header-method method)

      (and header-name
           (= "tools/call" method)
           (not= header-name (:name params)))
      (format "Mcp-Name header (%s) does not match the tool being called (%s)"
              header-name (:name params)))))

;;; -------------------------------------------------- Handlers ---------------------------------------------------

(defn- request-context
  "IP and User-Agent, read on the request thread so a tool-call row can denormalize them (gated PII)."
  [request]
  {:user-agent (get-in request [:headers "user-agent"])
   :ip-address (request/ip-address request)})

(defn- handle-legacy-initialize
  "Answer a pre-RC `initialize`, minting the `Mcp-Session-Id` that client will echo back.

   The id is not established state: it carries the client's MCP Apps capability so later `tools/list`
   calls can honor it, because a pre-RC client advertises capabilities exactly once and never again.
   RC clients repeat theirs in every request's `_meta` and never see this header. Nothing is looked up
   by it — see the ns docstring.

   Also opens the EE analytics row. Pre-RC clients are the only ones with no per-call client identity
   in `_meta`, so this row is what attributes their tool calls."
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
        session-id (get-in request [:headers "mcp-session-id"])]
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
        (json-response 400 (jsonrpc-error (:id body) -32600 conflict))
        (if (= "initialize" (:method body))
          (handle-legacy-initialize user-id request)
          (let [response (dispatch-request body session-id (:token-scopes request)
                                           (request-context request))]
            (cond
              (nil? response)        {:status 202 :headers {} :body ""}
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
        resp (streaming-response/streaming-response
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
  (mcp.usage/record-mcp-session-end! {:session-id (get-in request [:headers "mcp-session-id"])
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
           (if-let [{:keys [user-id scopes]} (validate-bearer-token bearer-token)]
             (dispatch user-id scopes)
             (respond (json-response 401 (jsonrpc-error nil -32603 "Invalid bearer token")
                                     {"WWW-Authenticate" "Bearer error=\"invalid_token\""})))

           ;; No auth at all — return 401 with discovery
           :else
           (respond (json-response 401 (jsonrpc-error nil -32603 "Authentication required")
                                   {"WWW-Authenticate" (www-authenticate-discovery request)}))))))
   (constantly nil)))
