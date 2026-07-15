(ns metabase.mcp.transport
  "MCP (Model Context Protocol) Streamable HTTP transport, shared by every MCP tool surface.

   Owns everything transport-level: JSON-RPC 2.0 framing (single messages and batches), the
   `initialize` handshake and session issuance, origin validation (DNS-rebinding protection),
   cookie/bearer auth resolution, per-user throttling, SSE responses and the GET keepalive
   stream, and OAuth discovery hints on 401s.

   A surface (v1 at `/api/metabase-mcp`, v2 at `/api/metabase-mcp/v2`) supplies only what
   differs — its method dispatch and its endpoint paths — via [[make-handler]]."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [compojure.response :as compojure.response]
   [metabase.ai-tracing.core :as ait]
   [metabase.api.common :as api]
   [metabase.api.macros.scope :as scope]
   [metabase.api.open-api :as open-api]
   [metabase.mcp.core :as mcp]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.usage :as mcp.usage]
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

(def ^:private protocol-version "2025-03-26")

(defn jsonrpc-response
  "Wrap `result` as a JSON-RPC 2.0 success response for request `id`."
  [id result]
  {:jsonrpc "2.0" :id id :result result})

(defn jsonrpc-error
  "Build a JSON-RPC 2.0 error response for request `id`."
  [id code message]
  {:jsonrpc "2.0" :id id :error {:code code :message message}})

(defn handle-initialize
  "Handle the MCP `initialize` method: log the connecting client and return the handshake result.
   `capabilities` is per-surface — a surface must only advertise the methods it dispatches."
  [id params capabilities]
  (when-let [client-info (:clientInfo params)]
    (log/infof "MCP client connected: %s %s" (:name client-info) (:version client-info)))
  (jsonrpc-response
   id
   {:protocolVersion protocol-version
    :capabilities    capabilities
    :serverInfo      server-info}))

(defn- mcp-app-ui-capability?
  "Return true if initialize params advertise support for MCP Apps HTML resources."
  [params]
  ;; `json/decode+kw` preserves the slash in the JSON extension key `"io.modelcontextprotocol/ui"` as the
  ;; namespaced keyword `:io.modelcontextprotocol/ui`.
  (contains?
   (set (get-in params [:capabilities :extensions :io.modelcontextprotocol/ui :mimeTypes]))
   "text/html;profile=mcp-app"))

(defn- eval-session-override
  "An eval-session id the harness supplies via the `x-eval-session-id` header so it can name (and
  later fetch) the trace itself — the MCP analogue of metabot's `eval_session_id`. opencode negotiates
  the `Mcp-Session-Id` internally, so without this the harness can't know which `<uuid>.jsonl` to read.

  Validates through [[ait/checked-session-id]] — the mint-time boundary, and the single source of truth
  for the safe-id contract — and maps its throw on an unsafe/over-long id to nil, so a bad header falls
  back to the Mcp-Session-Id correlator rather than 500ing ahead of [[dispatch-request]]'s try/catch. The
  `when-let` guards the absent-header case, so we never reach `checked-session-id`'s nil -> fresh-uuid
  branch (which would invent a trace file the harness never named)."
  [request]
  (when-let [id (get-in request [:headers "x-eval-session-id"])]
    (try (ait/checked-session-id id) (catch Exception _ nil))))

(defn- dispatch-request
  "Dispatch a single JSON-RPC request through the surface's `dispatch-method-fn`.
   Returns a response map or nil for notifications."
  [dispatch-method-fn {:keys [id method params] :as _msg} session-id token-scopes request-context eval-session-id]
  ;; Eval tracing (inert unless MB_AI_EVAL_CAPTURE): establish a session and open a per-request root
  ;; span; tool/resource/agent-api spans nest under it automatically. Key on the harness-supplied
  ;; `eval-session-id` when given (so it owns the trace file name), else the MCP session's UUID
  ;; correlator so an entire conversation's requests append to one `<uuid>.jsonl`. We key on the UUID
  ;; prefix (not the full `<uuid>.<base64>` id): it's stable across the conversation AND always
  ;; filesystem/URL-safe, whereas the full id can carry a base64 payload that `require-valid-session`
  ;; accepts but `safe-session-id-re` rejects (e.g. `=` padding) — passing that to `with-eval-session`
  ;; would throw out here, ahead of the try/catch.
  ;;
  ;; When BOTH are absent (a stateless / pre-initialize request with no header), this is nil and
  ;; `with-eval-session` mints a fresh uuid — so such requests get their own `<uuid>.jsonl` rather than
  ;; grouping. That's fine for the eval flow, which always supplies `eval-session-id`; the ungrouped
  ;; files are reaped by the appender's IdlePurgePolicy.
  (ait/with-eval-session (or eval-session-id (some-> session-id (str/split #"\.") first))
    (ait/eval-span (str "mcp." method) {:mcp/method     method
                                        :mcp/request-id id
                                        :mcp/params     params
                                        :mcp/user-id    api/*current-user-id*
                                        :mcp/scopes     token-scopes}
                   (let [response (try
                                    (dispatch-method-fn id method params session-id token-scopes request-context)
                                    (catch Throwable e
                                      (log/error e "Error dispatching JSON-RPC method" method)
                                      (jsonrpc-error id -32603 (or (ex-message e) "Internal error"))))]
                     ;; record the materialized JSON-RPC result/error (the request's output)
                     (ait/record! {:mcp/response response})
                     response))))

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

(defn json-response
  "Build a Ring response with a JSON-encoded `body`."
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
   Uses [[mw.security/try-parse-url]] (the silent variant) — `Origin`/`Host` are client-controlled, so malformed inputs
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

(defn- require-valid-session
  "Validate the Mcp-Session-Id header value. Checks UUID format and, when a
   `core_session` has been materialized, verifies it belongs to `user-id`."
  [user-id session-id]
  (cond
    (str/blank? session-id)
    {:error (json-response 400 (jsonrpc-error nil -32600 "Missing Mcp-Session-Id header"))}

    (not (mcp.session/valid-id? session-id))
    {:error (json-response 404 (jsonrpc-error nil -32600 "Invalid or expired session"))}

    (not (mcp.session/owned-by-user? session-id user-id))
    {:error (json-response 404 (jsonrpc-error nil -32600 "Invalid or expired session"))}

    :else
    {:session-id session-id}))

;;; -------------------------------------------------- Handlers ---------------------------------------------------

(defn- handle-post
  "Handle a POST request containing one or more JSON-RPC messages."
  [{:keys [dispatch-method-fn capabilities]} user-id request]
  (let [body            (:body request)
        session-id      (get-in request [:headers "mcp-session-id"])
        eval-session-id (eval-session-override request)
        batch?          (sequential? body)]
    (cond
      (nil? body)
      (json-response 400 (jsonrpc-error nil -32700 "Parse error: empty body"))

      (and (not (map? body)) (not batch?))
      (json-response 400 (jsonrpc-error nil -32600 "Invalid request: expected object or array"))

      ;; JSON-RPC 2.0: empty batch is invalid
      (and batch? (empty? body))
      (json-response 400 (jsonrpc-error nil -32600 "Invalid request: empty batch"))

      ;; MCP spec: "The initialize request MUST NOT be part of a JSON-RPC batch"
      (and batch? (some #(= "initialize" (:method %)) body))
      (json-response 400 (jsonrpc-error nil -32600 "initialize must not be batched"))

      ;; Initialize: create session and return response with session header
      (and (not batch?) (= "initialize" (:method body)))
      (let [params           (:params body)
            supports-mcp-ui? (mcp-app-ui-capability? params)
            session-id       (mcp.session/create! user-id {:supports-mcp-ui?
                                                           supports-mcp-ui?})
            init-response (handle-initialize (:id body) params capabilities)]
        ;; Record the session row (EE-only, best-effort). Identity + PII are captured once
        ;; here, from the on-thread request, and never overwritten.
        (mcp.usage/record-mcp-session!
         {:session-id     session-id
          :user-id        user-id
          :tenant-id      (some-> api/*current-user* deref :tenant_id)
          :client-info    (:clientInfo params)
          :user-agent     (get-in request [:headers "user-agent"])
          :ip-address     (request/ip-address request)})
        (if (accepts-sse? request)
          (sse-response [init-response] {"Mcp-Session-Id" session-id})
          (json-response 200 init-response {"Mcp-Session-Id" session-id})))

      ;; All other requests require a valid session
      :else
      (let [{:keys [error]} (require-valid-session user-id session-id)]
        (if error
          error
          (let [messages        (if batch? body [body])
                ;; Captured on-thread from the request so each tool-call row can denormalize IP/UA
                ;; (gated PII) alongside client identity — the view no longer joins the session.
                request-context {:user-agent (get-in request [:headers "user-agent"])
                                 :ip-address (request/ip-address request)}
                dispatch-msg    (fn [msg]
                                  (dispatch-request dispatch-method-fn msg session-id (:token-scopes request)
                                                    request-context eval-session-id))
                responses       (into [] (keep dispatch-msg) messages)]
            (cond
              (empty? responses)
              {:status 202 :headers {} :body ""}

              (accepts-sse? request)
              (sse-response responses)

              (and (not batch?) (= 1 (count responses)))
              (json-response 200 (first responses))

              :else
              (json-response 200 responses))))))))

(def ^:private tools-list-changed-notification
  {:jsonrpc "2.0" :method "notifications/tools/list_changed"})

(defn- handle-get
  "Handle a GET request for SSE stream (keepalive for server-initiated notifications).
   Polls the tool manifest hash on each keepalive tick — if the visible tool set has
   changed since the previous tick, emits an MCP `notifications/tools/list_changed`
   message so the client knows to refetch `tools/list`. Stateless: each connection
   tracks its own last-seen hash; no shared registry."
  [tools-hash-fn user-id request respond raise]
  (let [session-id (get-in request [:headers "mcp-session-id"])
        token-scopes (:token-scopes request)
        {:keys [error]} (require-valid-session user-id session-id)]
    (cond
      (some? error)
      (respond error)

      :else
      (let [resp (streaming-response/streaming-response
                  {:content-type "text/event-stream"
                   :headers      {"Cache-Control" "no-cache"}
                   :status       200}
                  [os canceled-chan]
                   (let [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
                     (loop [last-hash (tools-hash-fn token-scopes)]
                       (when-not (a/poll! canceled-chan)
                         (.write writer ": keepalive\n\n")
                         (.flush writer)
                         (Thread/sleep 30000)
                         (let [current-hash (tools-hash-fn token-scopes)]
                           (when (not= current-hash last-hash)
                             (.write writer ^String (sse-body [tools-list-changed-notification]))
                             (.flush writer))
                           (recur current-hash))))))]
        (compojure.response/send* resp request respond raise)))))

(defn- handle-delete
  "Handle a DELETE request to tear down a session."
  [user-id request]
  (let [session-id-header (get-in request [:headers "mcp-session-id"])
        {:keys [session-id error]} (require-valid-session user-id session-id-header)]
    (or error
        (do (mcp.session/delete! session-id user-id)
            ;; Stamp ended_at on the session row (EE-only, best-effort).
            (mcp.usage/record-mcp-session-end! session-id)
            {:status 200 :headers {"Content-Type" "application/json"} :body ""}))))

;;; -------------------------------------------------- Throttling --------------------------------------------------

;; MCP is auth-gated (session cookie or bearer token), so the risk is lower than the
;; unauthenticated OAuth endpoints. The threshold is generous to accommodate users running
;; multiple concurrent agents (e.g. 5 agents × 200 req/min). throttle/check counts every
;; request (not just failures) which is correct here — we want to cap total throughput
;; regardless of success to prevent resource exhaustion from a compromised token.
;; One throttler covers every MCP surface, so the cap bounds a user's total MCP throughput.
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

(defn- www-authenticate-discovery
  "Build the `WWW-Authenticate` header advertising OAuth discovery for the path the client hit.
   A client connecting via an alias is pointed at that same alias as the protected resource;
   any other path falls back to `default-path` (the surface's canonical URL)."
  [endpoint-paths default-path request]
  ;; Routing matches on the first path segment, so a trailing slash (e.g. `/api/metabase-mcp/`) still
  ;; reaches the handler — strip it so the alias is recognized rather than falling back to canonical.
  (let [uri  (str/replace (:uri request) #"/+$" "")
        path (if (contains? endpoint-paths uri) uri default-path)]
    (str "Bearer realm=\"mcp\" resource_metadata=\"" (system/site-url) "/.well-known/oauth-protected-resource" path "\"")))

(defn make-handler
  "Build a Ring async handler for one MCP surface. Uses JSON-RPC 2.0 over HTTP rather than REST,
   so the OpenAPI spec is empty.

   Options:
   - `:dispatch-method-fn` — `(fn [id method params session-id token-scopes request-context])`
     returning a JSON-RPC response map, or nil for notifications. `initialize` is handled by the
     transport itself and never reaches this fn.
   - `:capabilities` — the server capabilities the `initialize` handshake advertises. Must match
     what `:dispatch-method-fn` actually serves (e.g. advertise `:resources` only when the
     surface dispatches `resources/*`).
   - `:tools-hash-fn` — `(fn [token-scopes])` returning a stable hash of the visible tool set,
     polled by the GET/SSE keepalive to emit `notifications/tools/list_changed`.
   - `:endpoint-paths` — the URL paths (relative to site-url) this surface is served at.
   - `:default-path` — the canonical path advertised when the request URI matches no entry in
     `:endpoint-paths`."
  [{:keys [tools-hash-fn endpoint-paths default-path] :as opts}]
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
                           (respond (handle-post opts user-id request))

                           (= :get (:request-method request))
                           (handle-get tools-hash-fn user-id request respond raise)

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
                                   {"WWW-Authenticate" (www-authenticate-discovery endpoint-paths default-path request)}))))))
   (constantly nil)))
