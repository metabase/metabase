(ns metabase.mcp.api
  "MCP (Model Context Protocol) Streamable HTTP transport handler.
   Exposes Metabase's agent tools via JSON-RPC 2.0 over a single `/api/mcp` endpoint."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [compojure.response :as compojure.response]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.macros.scope :as scope]
   [metabase.api.open-api :as open-api]
   [metabase.mcp.resources :as mcp.resources]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.mcp.validation :as mcp.validation]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.system.core :as system]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [oidc-provider.store :as oidc.store]
   [throttle.core :as throttle])
  (:import
   (java.io BufferedWriter OutputStreamWriter)
   (java.net URI)
   (java.nio.charset StandardCharsets)
   (java.util UUID)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Auth --------------------------------------------------------

(defn- validate-bearer-token
  "Look up and validate an OAuth bearer token. Returns `{:user-id <int> :scopes <set>}` on success, nil on failure."
  [token-string]
  (when-let [provider (oauth-server/get-provider)]
    (when-let [token-data (oidc.store/get-access-token (:token-store provider) token-string)]
      (let [expiry (:expiry token-data)]
        (when (or (nil? expiry)
                  (t/after? (t/instant expiry) (t/instant)))
          (let [user-id (some-> (:user-id token-data) parse-long)
                scopes  (when-let [scope-vec (:scope token-data)]
                          (into #{} scope-vec))]
            (when user-id
              {:user-id user-id
               :scopes  (or scopes #{})})))))))

;;; ------------------------------------------------- JSON-RPC 2.0 --------------------------------------------------

(def ^:private server-info
  {:name    "metabase"
   :version "0.1.0"})

(def ^:private protocol-version "2025-03-26")

(defn- jsonrpc-response [id result]
  {:jsonrpc "2.0" :id id :result result})

(defn- jsonrpc-error [id code message]
  {:jsonrpc "2.0" :id id :error {:code code :message message}})

(defn- handle-initialize [id params]
  (when-let [client-info (:clientInfo params)]
    (log/infof "MCP client connected: %s %s" (:name client-info) (:version client-info)))
  (jsonrpc-response
   id
   {:protocolVersion protocol-version
    :capabilities    {:tools {} :resources {}}
    :serverInfo      server-info}))

(defn- handle-tools-list [id _params token-scopes]
  (jsonrpc-response id {:tools (mcp.tools/list-tools token-scopes)}))

(defn- handle-tools-call [id params session-id token-scopes]
  (let [tool-name (:name params)
        arguments (or (:arguments params) {})]
    (binding [mcp.session/*current-session-id* session-id]
      (jsonrpc-response id (mcp.tools/call-tool token-scopes tool-name arguments)))))

(defn- handle-resources-list [id _params token-scopes]
  (jsonrpc-response id (mcp.resources/list-resources token-scopes)))

(defn- handle-resources-read [id params session-id token-scopes]
  (let [uri    (:uri params)
        access (mcp.resources/check-resource-access uri token-scopes)]
    (case access
      (:not-found
       :scope-denied) (jsonrpc-error id -32602 "Resource not found")
      :ok             (let [user-id     api/*current-user-id*
                            session-key (when user-id (mcp.session/get-or-create-session-key! session-id user-id))]
                        (jsonrpc-response id (mcp.resources/read-resource uri {:session-key session-key}))))))

(defn- handle-ping [id _params]
  (jsonrpc-response id {}))

(defn- dispatch-request
  "Dispatch a single JSON-RPC request. Returns a response map or nil for notifications."
  [{:keys [id method params] :as _msg} session-id token-scopes]
  (try
    (case method
      "notifications/initialized" nil
      "tools/list"                (handle-tools-list id params token-scopes)
      "tools/call"                (handle-tools-call id params session-id token-scopes)
      "resources/list"            (handle-resources-list id params token-scopes)
      "resources/read"            (handle-resources-read id params session-id token-scopes)
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
  (str/join (map #(str "event: message\ndata: " (json/encode %) "\n\n") messages)))

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

(defn- validate-origin
  "Validate the Origin header to prevent DNS rebinding attacks (MCP spec requirement).
   Returns a 403 response if Origin is present and doesn't match the request's Host header.
   Non-browser clients that omit the Origin header are allowed through."
  [request]
  (when-let [origin (get-in request [:headers "origin"])]
    (let [host (get-in request [:headers "host"])]
      (when-not (try
                  (let [origin-host (.getHost (URI. origin))
                        request-host (first (str/split (str host) #":"))]
                    (= origin-host request-host))
                  (catch Exception _ false))
        (json-response 403 (jsonrpc-error nil -32600 "Origin not allowed"))))))

(defn- valid-session-id?
  "Return true if `session-id` looks like a UUID (the format `create!` produces).
   This is a format check only — any well-formed UUID is accepted. Authentication
   is handled separately by cookie or bearer token, not by the session ID."
  [session-id]
  (and (string? session-id)
       (try (UUID/fromString session-id) true
            (catch IllegalArgumentException _ false))))

(defn- require-valid-session
  "Validate the Mcp-Session-Id header value. Checks UUID format and, when a
   `core_session` has been materialized, verifies it belongs to `user-id`."
  [user-id session-id]
  (cond
    (str/blank? session-id)
    {:error (json-response 400 (jsonrpc-error nil -32600 "Missing Mcp-Session-Id header"))}

    (not (valid-session-id? session-id))
    {:error (json-response 404 (jsonrpc-error nil -32600 "Invalid or expired session"))}

    (not (mcp.session/owned-by-user? session-id user-id))
    {:error (json-response 404 (jsonrpc-error nil -32600 "Invalid or expired session"))}

    :else
    {:session-id session-id}))

;;; -------------------------------------------------- Handlers ---------------------------------------------------

(defn- handle-post
  "Handle a POST request containing one or more JSON-RPC messages."
  [user-id request]
  (let [body       (:body request)
        session-id (get-in request [:headers "mcp-session-id"])
        batch?     (sequential? body)]
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
      (let [session-id    (mcp.session/create! user-id)
            init-response (handle-initialize (:id body) (:params body))]
        (if (accepts-sse? request)
          (sse-response [init-response] {"Mcp-Session-Id" session-id})
          (json-response 200 init-response {"Mcp-Session-Id" session-id})))

      ;; All other requests require a valid session
      :else
      (let [{:keys [error]} (require-valid-session user-id session-id)]
        (if error
          error
          (let [messages  (if batch? body [body])
                responses (into [] (keep #(dispatch-request % session-id (:token-scopes request))) messages)]
            (cond
              (empty? responses)
              {:status 202 :headers {} :body ""}

              (accepts-sse? request)
              (sse-response responses)

              (and (not batch?) (= 1 (count responses)))
              (json-response 200 (first responses))

              :else
              (json-response 200 responses))))))))

(defn- handle-get
  "Handle a GET request for SSE stream (keepalive for server-initiated notifications)."
  [user-id request respond raise]
  (let [session-id (get-in request [:headers "mcp-session-id"])
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
                     (loop []
                       (when-not (a/poll! canceled-chan)
                         (.write writer ": keepalive\n\n")
                         (.flush writer)
                         (Thread/sleep 30000)
                         (recur)))))]
        (compojure.response/send* resp request respond raise)))))

(defn- handle-delete
  "Handle a DELETE request to tear down a session."
  [user-id request]
  (let [session-id-header (get-in request [:headers "mcp-session-id"])
        {:keys [session-id error]} (require-valid-session user-id session-id-header)]
    (or error
        (do (mcp.session/delete! session-id user-id)
            {:status 200 :headers {"Content-Type" "application/json"} :body ""}))))

(defn- handle-pending-card-store
  "Handle POST /api/mcp/ui/drills — store a base64-encoded query for the upcoming render_drill_through
   tool call. The frontend calls this immediately after a drill-through action, before sending
   app.sendMessage, so the tool can retrieve the query without the LLM carrying the payload."
  [_user-id request]
  (let [session-id    (get-in request [:headers "mcp-session-id"])
        encoded-query (get (:body request) :encodedQuery)]
    (cond
      (str/blank? session-id)
      (json-response 400 {:error "Missing Mcp-Session-Id header"})

      (not (and (string? encoded-query) (not (str/blank? encoded-query))))
      (json-response 400 {:error "Missing or invalid encodedQuery"})

      :else
      (do (mcp.session/store-drill-handle! session-id encoded-query)
          {:status 204 :headers {"Content-Type" "application/json"} :body ""}))))

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

(defn- www-authenticate-discovery []
  (str "Bearer realm=\"mcp\" resource_metadata=\"" (system/site-url) "/.well-known/oauth-protected-resource/api/mcp\""))

(def +mcp-enabled
  "Wrap routes so they may only be accessed when the MCP server is enabled."
  mcp.validation/+mcp-enabled)

(def ^{:arglists '([request respond raise])} handler
  "Ring async handler for the MCP endpoint.
   Uses JSON-RPC 2.0 over HTTP rather than REST, so the OpenAPI spec is empty."
  (open-api/handler-with-open-api-spec
   (fn [request respond raise]
     (let [;; POST /ui/drills is our custom drill-store endpoint, not part of MCP protocol.
           ;; The iframe's fetch sends Origin: null (sandboxed context), which would
           ;; fail origin validation — but there's no DNS-rebinding risk here since
           ;; the request is authenticated via session token.
           drill-request?  (and (= :post (:request-method request))
                                (= "/ui/drills" (:uri request)))
           origin-error    (when-not drill-request?
                             (validate-origin request))
           bearer-token    (oauth-server/extract-bearer-token request)
           session-auth    api/*current-user-id*]
       (letfn [(dispatch [user-id token-scopes]
                 (request/with-current-user user-id
                   (if-let [throttle-err (check-throttle user-id)]
                     (respond throttle-err)
                     (try
                       (let [request (assoc request :token-scopes token-scopes)]
                         (cond
                           drill-request?
                           (respond (handle-pending-card-store user-id request))

                           (= :post (:request-method request))
                           (respond (handle-post user-id request))

                           (= :get (:request-method request))
                           (handle-get user-id request respond raise)

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
                                   {"WWW-Authenticate" (www-authenticate-discovery)}))))))
   (constantly nil)))
