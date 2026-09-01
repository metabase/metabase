(ns metabase.mcp.transport
  "MCP (Model Context Protocol) Streamable HTTP transport.

  Owns everything transport-level: JSON-RPC 2.0 framing (single messages and batches), the `initialize` handshake and
  session issuance, origin validation (DNS-rebinding protection), cookie/bearer auth resolution, per-user throttling,
  SSE responses and the GET keepalive stream, and OAuth discovery hints on 401s."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [compojure.response :as compojure.response]
   [metabase.ai-tracing.core :as ait]
   [metabase.api.common :as api]
   [metabase.api.macros.scope :as scope]
   [metabase.api.open-api :as open-api]
   [metabase.mcp.core :as mcp]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.usage :as mcp.usage]
   [metabase.mcp.v2.common :as v2.common]
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
   (java.io BufferedWriter OutputStreamWriter Writer)
   (java.nio.charset StandardCharsets)
   (java.util.concurrent ExecutorService Executors)))

(set! *warn-on-reflection* true)

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

(defn- handle-initialize
  "Handle the MCP `initialize` method: log the connecting client and return the handshake result.

  - `capabilities` is per-surface — a surface must only advertise the methods it dispatches.
  - `instructions` rides the result as the MCP `instructions` field."
  [id params capabilities instructions]
  (when-let [client-info (:clientInfo params)]
    (log/infof "MCP client connected: %s %s" (:name client-info) (:version client-info)))
  (jsonrpc-response
   id
   (cond-> {:protocolVersion protocol-version
            :capabilities    capabilities
            :serverInfo      server-info}
     instructions (assoc :instructions instructions))))

(defn- mcp-app-ui-capability?
  "Return true if initialize params advertise support for MCP Apps HTML resources."
  [params]
  ;; The wire key is the JSON string `"io.modelcontextprotocol/ui"`; keywordizing preserves the slash, so the lookup
  ;; below is a namespaced keyword rather than the dotted `:io.modelcontextprotocol.ui` it might look like a typo for.
  (contains?
   (set (get-in params [:capabilities :extensions :io.modelcontextprotocol/ui :mimeTypes]))
   "text/html;profile=mcp-app"))

(defn- eval-session-override
  "An eval-session id the harness supplies via the `x-eval-session-id` header so it can name (and later fetch) the trace
  itself — the MCP analogue of metabot's `eval_session_id`. opencode negotiates the `Mcp-Session-Id` internally, so
  without this the harness can't know which `<uuid>.jsonl` to read.

  Validates through [[ait/checked-session-id]] — the mint-time boundary, and the single source of truth for the
  safe-id contract — and maps its throw on an unsafe/over-long id to nil, so a bad header falls back to the
  Mcp-Session-Id correlator rather than 500ing ahead of [[dispatch-request]]'s try/catch. The `when-let` guards the
  absent-header case, so we never reach `checked-session-id`'s nil -> fresh-uuid branch (which would invent a trace
  file the harness never named)."
  [request]
  (when-let [id (get-in request [:headers "x-eval-session-id"])]
    (try (ait/checked-session-id id) (catch Exception _ nil))))

(defn- redact-ui-credentials
  "Strip minted MCP Apps UI credentials from a JSON-RPC response before it is recorded into an eval
  trace. A `resources/read` of a UI shell embeds the freshly minted credential in the rendered HTML
  (`uiCredential: \"…\"` via [[metabase.mcp.ui-resource/embed-render-fn]]); recording it verbatim
  parks a live bearer authenticator in the trace file (and the superuser-readable ai-tracing API),
  where it outlives its 5-minute window in backups and log shipping. v1 stripped its credential
  channel before tracing the same way (`mcp.resources/redact-ui-credential`)."
  [response]
  (letfn [(redact-text [s]
            (cond-> s
              (string? s) (str/replace #"uiCredential: \"[^\"]*\"" "uiCredential: \"[redacted]\"")))]
    (cond-> response
      (sequential? (get-in response [:result :contents]))
      (update-in [:result :contents] (partial mapv #(update % :text redact-text))))))

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
                                      ;; The sanitizer, not the raw message: handlers that answer with a
                                      ;; JSON-RPC error (resources/read render-fns, tools/list) don't pass
                                      ;; through `->mcp-error-content`, and a thrown Error (not Exception)
                                      ;; skips even the tool-call sanitizer — either way an unvetted message
                                      ;; may embed SQL, schema, or connection detail.
                                      (jsonrpc-error id -32603 (v2.common/caller-safe-error-message e))))]
                     ;; record the materialized JSON-RPC result/error (the request's output)
                     (ait/record! {:mcp/response (redact-ui-credentials response)})
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

(defn- json-response
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

(defn- normalize-authority
  "Extract `[domain port]` from a URL or Host-style header value, lowercasing the domain and leaving `port` as the
  string the header carried (nil when it carried none). Bracketed IPv6 forms (`[::1]:3000`) are handled correctly.
  Returns nil for unparsable input.
  Uses [[mw.security/try-parse-url]] (the silent variant) — `Origin`/`Host` are client-controlled, so malformed inputs
  are expected and shouldn't spam the error logs."
  [url]
  (when-let [{:keys [domain port]} (some-> url str mw.security/try-parse-url)]
    [(u/lower-case-en domain) port]))

(defn- same-origin-host?
  "Is `origin` the same origin as the host the request was addressed to?

  Compares domain AND port: an origin is a (scheme, domain, port) triple, so matching on the domain alone treats
  every other app on the same hostname as same-origin. On a developer machine that is the whole threat model —
  `localhost:9999` and `localhost:3000` are different origins, and a page on the former must not drive this server
  with the user's cookies.

  Two deliberate loosenesses:

  - The ports are compared only when BOTH headers carry one. A reverse proxy can rewrite `Host` to add or drop a
    port the browser's `Origin` does not carry, and a 403 on a legitimate deployment is worse than the residual
    here: exploiting it requires occupying the scheme's DEFAULT port locally, which the dev servers this guard
    is aimed at do not use.
  - Scheme is not compared at all, because `Host` does not carry one. The request's own `:scheme` is not a
    substitute — behind a TLS-terminating proxy it reads `:http` while the browser's `Origin` says `https` (cf.
    #75110). Closing that would mean matching `Origin` against `site-url`'s origin rather than against `Host`,
    which is a stronger check but a larger behavioral change than this guard warrants."
  [origin host]
  (let [[origin-domain origin-port] (normalize-authority origin)
        [host-domain host-port]     (normalize-authority host)]
    (and (some? origin-domain)
         (= origin-domain host-domain)
         (or (nil? origin-port)
             (nil? host-port)
             (= origin-port host-port)))))

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
  [{:keys [dispatch-method-fn capabilities instructions]} user-id request]
  (let [body            (walk/keywordize-keys (:body request))
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
            init-response (handle-initialize (:id body) params capabilities instructions)]
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
                ;; Each element of a batch is a request in its own right (JSON-RPC 2.0 §6), so classify each one on
                ;; its own shape rather than trusting the container: a JSON object with a string `method` dispatches;
                ;; anything else — a non-object element, or an object with a missing/non-string `method` — is an
                ;; Invalid Request. Without this, a non-object element destructures to `method` nil and dispatches to
                ;; nil, which `keep` silently drops (a malformed message vanishing rather than being answered), and
                ;; an object missing `method` reaches dispatch as method-not-found. The `-32600` carries a null id:
                ;; §5 requires it when the request can't be parsed, even if a malformed object happens to carry one.
                ;; A `notifications/initialized` notification and an unknown method with no id dispatch to nil and
                ;; stay out of the response array; a known method with no id still executes and — contra JSON-RPC
                ;; §4.1, which says a notification gets no reply — answers with `"id": null`.
                handle-msg      (fn [msg]
                                  (if (and (map? msg) (string? (:method msg)))
                                    (dispatch-request dispatch-method-fn msg session-id (:token-scopes request)
                                                      request-context eval-session-id)
                                    (jsonrpc-error nil -32600 "Invalid request")))
                responses       (into [] (keep handle-msg) messages)]
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

(def ^:private keepalive-interval-ms
  "How often the GET stream emits an SSE comment. Clients drop an idle stream without periodic traffic, so this
  cadence is a protocol obligation and not tunable downward for the sake of cancellation latency."
  30000)

(defonce ^:private ^ExecutorService keepalive-executor
  ;; A keepalive stream blocks for the life of the client's connection, not the life of a query. Running it on the
  ;; shared streaming-response pool — a fixed pool of `mb-jetty-maxthreads`/50 threads that also serves query
  ;; downloads — lets a handful of idle MCP sessions occupy every thread and stall exports instance-wide. Virtual
  ;; threads have no such ceiling and cost nothing while parked.
  (Executors/newThreadPerTaskExecutor (.. (Thread/ofVirtual) (name "mcp-keepalive-" 0) factory)))

(defn- keepalive-loop!
  "Emit SSE keepalive comments on `writer` every `interval-ms` until `canceled-chan` reports the client is gone.
  Re-reads the tool manifest hash on each tick and emits `notifications/tools/list_changed` when it differs from the
  previous tick, so the client knows to refetch `tools/list`. Returns nil once canceled."
  [^Writer writer tools-hash-fn token-scopes canceled-chan interval-ms]
  (loop [last-hash (tools-hash-fn token-scopes)]
    (.write writer ": keepalive\n\n")
    (.flush writer)
    ;; Park on the cancellation channel instead of sleeping through the interval: the cancel loop notices a
    ;; disconnected client within a second, and waiting on it releases this thread then rather than at the next tick.
    (let [[_ port] (a/alts!! [canceled-chan (a/timeout interval-ms)])]
      (when-not (= port canceled-chan)
        (let [current-hash (tools-hash-fn token-scopes)]
          (when (not= current-hash last-hash)
            (.write writer ^String (sse-body [tools-list-changed-notification]))
            (.flush writer))
          (recur current-hash))))))

(def ^:private max-concurrent-keepalive-streams
  "How many GET keepalive streams one user may hold open at once.

  Running the loop on virtual threads (see [[keepalive-executor]]) removed the only ceiling these streams had:
  the fixed streaming pool refused work past its size, whereas a virtual thread costs nothing to park. A stream
  is held for as long as the client keeps it and costs a single throttle attempt to open, so nothing else bounds
  how many one credential can accumulate — and every one of them holds a connection.

  The cap is per-user rather than global so a single caller cannot crowd everyone else off the surface. It is set
  well above real use: a client opens one stream per MCP session, and the throttle's own sizing assumes a handful
  of concurrent agents."
  25)

(defonce ^:private keepalive-stream-counts
  (atom {}))

(defn- acquire-keepalive-slot!
  "Reserve a keepalive slot for `user-id`, returning true when reserved and false when they are already at
  [[max-concurrent-keepalive-streams]]. A refusal costs the caller nothing."
  [user-id]
  (let [[old new] (swap-vals! keepalive-stream-counts
                              (fn [counts]
                                (cond-> counts
                                  (< (get counts user-id 0) max-concurrent-keepalive-streams)
                                  (update user-id (fnil inc 0)))))]
    (not= (get old user-id 0) (get new user-id 0))))

(defn- release-keepalive-slot!
  "Return one of `user-id`'s keepalive slots. A user back at zero is dropped from the map rather than left as an
  entry, so the map tracks live streams and not every user the process has ever served. Releasing more than was
  acquired cannot drive the count negative — that would hand the user free slots on top of the cap."
  [user-id]
  (swap! keepalive-stream-counts
         (fn [counts]
           (let [remaining (dec (get counts user-id 0))]
             (if (pos? remaining)
               (assoc counts user-id remaining)
               (dissoc counts user-id)))))
  nil)

(defn- keepalive-stream-body!
  "Run [[keepalive-loop!]] and call `release!` however the loop ends — normally, on client disconnect, or by
  throwing. A slot leaked on disconnect would retire the cap one connection at a time."
  [release! writer tools-hash-fn token-scopes canceled-chan interval-ms]
  (try
    (keepalive-loop! writer tools-hash-fn token-scopes canceled-chan interval-ms)
    (finally
      (release!))))

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

      (not (acquire-keepalive-slot! user-id))
      (respond (json-response 429 (jsonrpc-error nil -32000
                                                 (str "Too many concurrent MCP event streams open for this user "
                                                      "(limit " max-concurrent-keepalive-streams
                                                      "). Close an existing stream before opening another."))))

      :else
      ;; The slot is returned by `keepalive-stream-body!` once the stream ends. `release!` also covers the case
      ;; where `send*` throws before the body is ever submitted, and is idempotent so the two paths cannot
      ;; double-release and hand the user a free slot.
      (let [released? (atom false)
            release!  #(when (compare-and-set! released? false true)
                         (release-keepalive-slot! user-id))
            resp      (streaming-response/streaming-response
                       {:content-type "text/event-stream"
                        :headers      {"Cache-Control" "no-cache"}
                        :status       200
                        :executor     keepalive-executor}
                       [os canceled-chan]
                        (keepalive-stream-body! release!
                                                (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))
                                                tools-hash-fn token-scopes canceled-chan keepalive-interval-ms))]
        (try
          (compojure.response/send* resp request respond raise)
          (catch Throwable e
            (release!)
            (throw e)))))))

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
;; multiple concurrent agents (e.g. 5 agents × 200 req/min). throttle/check records every
;; attempt (not just failures) which is correct here — we want to cap total throughput
;; regardless of success to prevent resource exhaustion from a compromised token.
;; One throttler covers every surface built on THIS transport. During the v1 migration that is v2 only —
;; v1 carries its own copy of this namespace and its own throttler, so a user's total MCP throughput is
;; currently two caps, not one. That collapses to a single cap when v1's transport is deleted.
;; The cap counts JSON-RPC *messages*, not HTTP requests: a POST can carry a batch, so charging
;; one attempt per request would let a 1000-message batch cost a single attempt and defeat the cap
;; (see [[check-throttle]]/[[jsonrpc-message-count]]).
(def ^:private one-minute-ms (* 60 1000))

(def ^:private mcp-throttler
  (throttle/make-throttler :user-id :attempts-threshold 1000 :attempt-ttl-ms one-minute-ms))

(defn- jsonrpc-message-count
  "How many throttle attempts a request costs: the number of JSON-RPC messages it carries. A batch (array body) costs
  one per element; any other request — a single message, or a malformed/empty body still worth one unit of work —
  costs one. The body has already been parsed to Clojure data by the JSON middleware, so this reads it directly."
  [request]
  (let [body (:body request)]
    (if (sequential? body)
      (max 1 (count body))
      1)))

(defn- check-throttle
  "Charge `n` throttle attempts for `user-id` (one per JSON-RPC message in the request). Returns a 429 JSON-RPC
  response if the cap is hit partway through, nil otherwise. Checking N up front means a batch is refused before any
  of its messages run; `throttle/check` throws before recording the attempt, so a batch that trips on element k has
  charged only the k-1 attempts before it."
  [user-id n]
  (try
    (dotimes [_ n]
      (throttle/check mcp-throttler user-id))
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
   any other path falls back to `default-path` (the surface's canonical URL).

   `default-ask-scopes`, when non-empty, is emitted as the challenge's `scope` parameter."
  [endpoint-paths default-path default-ask-scopes request]
  ;; Routing matches on the first path segment, so a trailing slash (e.g. `/api/metabase-mcp/`) still
  ;; reaches the handler — strip it so the alias is recognized rather than falling back to canonical.
  (let [uri  (str/replace (:uri request) #"/+$" "")
        path (if (contains? endpoint-paths uri) uri default-path)]
    ;; Comma-separated per RFC 7235's `#auth-param`. Both MCP SDKs currently pull each parameter
    ;; with an unanchored per-field regex and would accept spaces, but every spec and vendor example
    ;; uses commas and the stricter parsers proposed upstream would not.
    (str "Bearer realm=\"mcp\", resource_metadata=\"" (system/site-url) "/.well-known/oauth-protected-resource" path "\""
         ;; A client that reads this prefers it over the resource metadata's `scopes_supported`,
         ;; which is what lets a surface ask for less than it accepts: the wider set stays
         ;; advertised and requestable, this is only what an uninstructed client asks for.
         (when (seq default-ask-scopes)
           (str ", scope=\"" (str/join " " default-ask-scopes) "\"")))))

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
   - `:instructions` — optional string returned as the `initialize` result's `instructions`
     field, surfaced to the model by clients that support it.
   - `:tools-hash-fn` — `(fn [token-scopes])` returning a stable hash of the visible tool set,
     polled by the GET/SSE keepalive to emit `notifications/tools/list_changed`.
   - `:endpoint-paths` — the URL paths (relative to site-url) the 401 `WWW-Authenticate`
     challenge matches the request URI against. NOT necessarily all served by this surface:
     during the migration the set includes v1's paths — see [[metabase.mcp.paths/endpoint-paths]].
   - `:default-path` — the canonical path advertised when the request URI matches no entry in
     `:endpoint-paths`.
   - `:default-ask-scopes` — optional scopes emitted as the `scope` parameter of the 401
     `WWW-Authenticate` challenge, i.e. what a client that has not been told otherwise asks for.
     Omit to let clients ask for everything the resource metadata advertises."
  [{:keys [tools-hash-fn endpoint-paths default-path default-ask-scopes] :as opts}]
  (open-api/handler-with-open-api-spec
   (fn [request respond raise]
     (let [origin-error (validate-origin request)
           bearer-token (oauth-server/extract-bearer-token request)
           session-auth api/*current-user-id*
           token-scopes (:token-scopes request)]
       (letfn [(dispatch [user-id token-scopes]
                 (request/with-current-user user-id
                   ;; Charge the throttle per JSON-RPC message, not per HTTP request, so a batch can't smuggle many
                   ;; messages past the per-minute cap on one attempt. GET/DELETE carry no batch and cost one.
                   (if-let [throttle-err (check-throttle user-id (jsonrpc-message-count request))]
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

           ;; Respect the scope set attached to an authenticated request. Sessions without one
           ;; retain unrestricted access.
           session-auth
           ;; An OAuth bearer request lands here too — the session middleware resolves the token and
           ;; attaches `:token-scopes`, so this branch is not "cookie sessions only".
           (dispatch session-auth (or token-scopes #{::scope/unrestricted}))

           ;; A bearer token that reaches here did NOT authenticate upstream: the session middleware
           ;; ([[metabase.server.middleware.session/current-user-info-for-oauth-token]]) resolves every *valid* bearer
           ;; token — including checking `user.is_active` and running the granted scopes through the
           ;; `oauth-token->token-scopes` trust hinge — and sets `*current-user-id*`, so an active user's token is
           ;; served by the `session-auth` branch above. Landing here therefore means the token is unknown, expired,
           ;; revoked, or names a DEACTIVATED user. We must not re-resolve and dispatch it: doing so bypassed the
           ;; active-user check (a disabled user's token still authenticated) and the scope trust hinge (raw token
           ;; scopes dispatched verbatim). Return the RFC 6750 `invalid_token` 401 and dispatch nothing.
           bearer-token
           (respond (json-response 401 (jsonrpc-error nil -32603 "Invalid bearer token")
                                   {"WWW-Authenticate" "Bearer error=\"invalid_token\""}))

           ;; No auth at all — return 401 with discovery
           :else
           (respond (json-response 401 (jsonrpc-error nil -32603 "Authentication required")
                                   {"WWW-Authenticate" (www-authenticate-discovery endpoint-paths default-path
                                                                                   default-ask-scopes request)}))))))
   (constantly nil)))
