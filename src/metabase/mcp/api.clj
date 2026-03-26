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
   [metabase.mcp.tools :as mcp.tools]
   [metabase.mcp.validation :as mcp.validation]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.session.core :as session]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [oidc-provider.store :as oidc.store]
   [throttle.core :as throttle]
   [toucan2.core :as t2])
  (:import
   (java.io BufferedWriter OutputStreamWriter)
   (java.net URI)
   (java.nio.charset StandardCharsets)
   (java.util UUID)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Sessions ----------------------------------------------------

(defonce ^:private sessions
  (atom {}))

(def ^:private session-ttl-ms
  "Sessions expire after 1 hour."
  (* 60 60 1000))

(defn- delete-embedding-session!
  "Delete a Metabase session by its session key (hashed lookup)."
  [session-key]
  (t2/delete! :model/Session :key_hashed (session/hash-session-key session-key)))

(defn- cleanup-embedding-sessions!
  "Delete any Metabase embedding sessions associated with an MCP session."
  [session]
  (doseq [key (:embedding-session-keys session)]
    (try
      (delete-embedding-session! key)
      (catch Exception e
        (log/debugf "Failed to clean up embedding session: %s" (ex-message e))))))

(defn- sweep-expired-sessions!
  "Remove all sessions whose TTL has elapsed. Called on session creation to
   prevent abandoned sessions from accumulating in memory."
  []
  (let [expired? (fn [{:keys [timer]}] (>= (u/since-ms timer) session-ttl-ms))
        expired  (into {} (filter (fn [[_ session]] (expired? session))) @sessions)]
    (doseq [[_ session] expired]
      (cleanup-embedding-sessions! session))
    (swap! sessions #(apply dissoc % (keys expired)))))

(defn- create-session!
  "Generate an MCP session ID for protocol compatibility.
   The server currently treats MCP sessions as degenerate: callers must still
   send a session ID after `initialize`, but the ID is not otherwise required
   for auth, initialization state, or server-side validation."
  [user-id]
  (sweep-expired-sessions!)
  (let [session-id (str (UUID/randomUUID))]
    (swap! sessions assoc session-id {:timer        (u/start-timer)
                                      :initialized? false
                                      :user-id      user-id})
    session-id))

(defn- delete-session! [session-id]
  (when-let [session (get @sessions session-id)]
    (cleanup-embedding-sessions! session))
  (swap! sessions dissoc session-id))

(defn- session-initialized? [session-id]
  (get-in @sessions [session-id :initialized?]))

(defn- mark-session-initialized! [session-id]
  (swap! sessions assoc-in [session-id :initialized?] true))

(defmacro ^:private when-initialized
  "Execute `body` only when the MCP session has been initialized; otherwise return a JSON-RPC error."
  [id session-id & body]
  `(if (session-initialized? ~session-id)
     (do ~@body)
     (jsonrpc-error ~id -32600 "Session not initialized")))

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

(defn- handle-tools-call [id params token-scopes]
  (let [tool-name (:name params)
        arguments (or (:arguments params) {})]
    (jsonrpc-response id (mcp.tools/call-tool token-scopes tool-name arguments))))

(defn- handle-resources-list [id _params token-scopes]
  (jsonrpc-response id (mcp.resources/list-resources token-scopes)))

(defn- create-embedding-session!
  "Create a Metabase session for embedding SDK auth.
   Returns the session key (the value the SDK uses as X-Metabase-Session)."
  [user-id]
  (let [session-key (session/generate-session-key)
        session-id  (session/generate-session-id)]
    (t2/insert! :model/Session
                {:id          session-id
                 :user_id     user-id
                 :session_key session-key})
    session-key))

(defn- handle-resources-read [id params session-id token-scopes]
  (let [uri    (:uri params)
        access (mcp.resources/check-resource-access uri token-scopes)]
    (case access
      (:not-found
       :scope-denied) (jsonrpc-error id -32602 "Resource not found")
      :ok             (let [user-id     api/*current-user-id*
                            session-key (when user-id (create-embedding-session! user-id))]
                        ;; Track the embedding session key in the MCP session for cleanup
                        (when session-key
                          (swap! sessions update-in [session-id :embedding-session-keys] (fnil conj #{}) session-key))
                        (jsonrpc-response id (mcp.resources/read-resource uri {:session-key session-key}))))))

(defn- handle-ping [id _params]
  (jsonrpc-response id {}))

(defn- dispatch-request
  "Dispatch a single JSON-RPC request. Returns a response map or nil for notifications."
  [msg session-id token-scopes]
  (let [id     (:id msg)
        method (:method msg)
        params (:params msg)]
    (try
      (case method
        "notifications/initialized" (do (mark-session-initialized! session-id) nil)
        "tools/list"                (handle-tools-list id params token-scopes)
        "tools/call"                (handle-tools-call id params token-scopes)
        "resources/list"            (handle-resources-list id params token-scopes)
        "resources/read"            (when-initialized id session-id (handle-resources-read id params session-id token-scopes))
        "ping"                      (handle-ping id params)
        (if id
          (jsonrpc-error id -32601 (str "Method not found: " method))
          nil))
      (catch Throwable e
        (log/error e "Error dispatching JSON-RPC method" method)
        (jsonrpc-error id -32603 (or (ex-message e) "Internal error"))))))

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

(defn- session-error-response
  "Return an HTTP error response when the MCP session header is missing, or nil if present.
   The session ID is compatibility-only and is not validated server-side."
  [session-id]
  (when (str/blank? session-id)
    (json-response 400 (jsonrpc-error nil -32600 "Missing Mcp-Session-Id header"))))

;;; -------------------------------------------------- Handlers ---------------------------------------------------

(defn- handle-post
  "Handle a POST request containing one or more JSON-RPC messages."
  [user-id request]
  (let [body        (:body request)
        session-id  (get-in request [:headers "mcp-session-id"])
        batch?      (sequential? body)
        session-err (delay (session-error-response session-id))]
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
      (let [session-id    (create-session! user-id)
            init-response (handle-initialize (:id body) (:params body))]
        (if (accepts-sse? request)
          (sse-response [init-response] {"Mcp-Session-Id" session-id})
          (json-response 200 init-response {"Mcp-Session-Id" session-id})))

      ;; All other requests require a valid session (400 for missing header, 404 for invalid)
      (some? @session-err) @session-err

      :else
      (let [messages  (if batch? body [body])
            results   (mapv #(dispatch-request % session-id (:token-scopes request)) messages)
            responses (filterv some? results)]
        (cond
          (empty? responses)
          {:status 202 :headers {} :body ""}

          (accepts-sse? request)
          (sse-response responses)

          (and (not batch?) (= 1 (count responses)))
          (json-response 200 (first responses))

          :else
          (json-response 200 responses))))))

(defn- handle-get
  "Handle a GET request for SSE stream (keepalive for server-initiated notifications)."
  [_user-id request respond raise]
  (let [session-id (get-in request [:headers "mcp-session-id"])
        session-err (session-error-response session-id)]
    (cond
      (some? session-err)
      (respond session-err)

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
  [_user-id request]
  (let [session-id (get-in request [:headers "mcp-session-id"])
        session-err (session-error-response session-id)]
    (or session-err
        (do (delete-session! session-id)
            {:status 200 :headers {"Content-Type" "application/json"} :body ""}))))

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
     (let [origin-error    (validate-origin request)
           bearer-token    (oauth-server/extract-bearer-token request)
           session-auth    api/*current-user-id*]
       (letfn [(dispatch [user-id token-scopes]
                 (request/with-current-user user-id
                   (if-let [throttle-err (check-throttle user-id)]
                     (respond throttle-err)
                     (try
                       (let [request (assoc request :token-scopes token-scopes)]
                         (case (:request-method request)
                           :post   (respond (handle-post user-id request))
                           :get    (handle-get user-id request respond raise)
                           :delete (respond (handle-delete user-id request))
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
