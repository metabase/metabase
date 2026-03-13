(ns metabase-enterprise.mcp.api
  "MCP (Model Context Protocol) Streamable HTTP transport handler.
   Exposes Metabase's agent tools via JSON-RPC 2.0 over a single `/api/mcp` endpoint."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [compojure.response :as compojure.response]
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase-enterprise.oauth-server.core :as oauth-server]
   [metabase.api.common :as api]
   [metabase.api.macros.scope :as scope]
   [metabase.api.open-api :as open-api]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [oidc-provider.protocol :as proto])
  (:import
   (java.io BufferedWriter OutputStreamWriter)
   (java.nio.charset StandardCharsets)
   (java.util UUID)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Sessions ----------------------------------------------------

(defonce ^:private sessions
  (atom {}))

(def ^:private session-ttl-ms
  "Sessions expire after 1 hour."
  (* 60 60 1000))

(defn- sweep-expired-sessions!
  "Remove all sessions whose TTL has elapsed. Called on session creation to
   prevent abandoned sessions from accumulating in memory."
  []
  (swap! sessions (fn [m]
                    (into {} (remove (fn [[_ {:keys [timer]}]]
                                       (>= (u/since-ms timer) session-ttl-ms)))
                          m))))

(defn- create-session!
  ([]
   (create-session! nil nil))
  ([user-id token-scopes]
   (sweep-expired-sessions!)
   (let [session-id (str (UUID/randomUUID))]
     (swap! sessions assoc session-id (cond-> {:timer (u/start-timer) :initialized? false}
                                        user-id      (assoc :user-id user-id)
                                        token-scopes (assoc :token-scopes token-scopes)))
     session-id)))

(defn- delete-session! [session-id]
  (swap! sessions dissoc session-id))

(defn- valid-session? [session-id]
  (when-let [session (get @sessions session-id)]
    (if (< (u/since-ms (:timer session)) session-ttl-ms)
      true
      (do (delete-session! session-id) false))))

(defn- session-initialized? [session-id]
  (get-in @sessions [session-id :initialized?]))

(defn- mark-session-initialized! [session-id]
  (swap! sessions assoc-in [session-id :initialized?] true))

(defn- session-token-scopes [session-id]
  (get-in @sessions [session-id :token-scopes]))

(defn- session-user-id [session-id]
  (get-in @sessions [session-id :user-id]))

;;; -------------------------------------------------- Auth --------------------------------------------------------

(defn- extract-bearer-token
  "Extract the bearer token from the Authorization header."
  [request]
  (when-let [auth (get-in request [:headers "authorization"])]
    (when (str/starts-with? (str/lower-case auth) "bearer ")
      (str/trim (subs auth 7)))))

(defn- validate-bearer-token
  "Look up and validate an OAuth bearer token. Returns `{:user-id <int> :scopes <set>}` on success, nil on failure."
  [token-string]
  (when-let [provider (oauth-server/get-provider)]
    (when-let [token-data (proto/get-access-token (:token-store provider) token-string)]
      (let [expiry (:expiry token-data)]
        (when (or (nil? expiry)
                  (.isAfter (java.time.Instant/ofEpochSecond expiry) (java.time.Instant/now)))
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

(defn- handle-initialize [id _params]
  (jsonrpc-response
   id
   {:protocolVersion protocol-version
    :capabilities    {:tools {}}
    :serverInfo      server-info}))

(defn- handle-tools-list [id _params]
  (jsonrpc-response id {:tools (mcp.tools/list-tools)}))

(defn- handle-tools-call [id params]
  (let [tool-name (:name params)
        arguments (or (:arguments params) {})]
    (jsonrpc-response id (mcp.tools/call-tool tool-name arguments))))

(defn- handle-ping [id _params]
  (jsonrpc-response id {}))

(defmacro ^:private when-initialized
  "Return a JSON-RPC error if the session is not yet initialized, otherwise evaluate `body`."
  [id session-id & body]
  `(if (session-initialized? ~session-id)
     (do ~@body)
     (jsonrpc-error ~id -32600 "Session not initialized: send notifications/initialized first")))

(defn- dispatch-request
  "Dispatch a single JSON-RPC request. Returns a response map or nil for notifications."
  [msg session-id]
  (let [id     (:id msg)
        method (:method msg)
        params (:params msg)]
    (try
      (case method
        "notifications/initialized" (do (mark-session-initialized! session-id) nil)
        "tools/list"                (when-initialized id session-id (handle-tools-list id params))
        "tools/call"                (when-initialized id session-id (handle-tools-call id params))
        "ping"                      (when-initialized id session-id (handle-ping id params))
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
  [messages]
  {:status  200
   :headers {"Content-Type"  "text/event-stream"
             "Cache-Control" "no-cache"}
   :body    (sse-body messages)})

(defn- handle-post
  "Handle a POST request containing one or more JSON-RPC messages."
  [request]
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
      (let [session-id (create-session!)]
        (json-response 200 (handle-initialize (:id body) (:params body))
                       {"Mcp-Session-Id" session-id}))

      ;; All other requests require a valid session
      (not (valid-session? session-id))
      (json-response 400 (jsonrpc-error nil -32600 "Invalid or missing Mcp-Session-Id"))

      :else
      (let [messages       (if batch? body [body])
            ;; For initialize requests, create a new session
            initializing?  (some #(= "initialize" (:method %)) messages)
            session-id     (if initializing?
                             (create-session! api/*current-user-id* mcp.tools/*token-scopes*)
                             session-id)]
        ;; Validate session for non-initialize requests
        (if (and (not initializing?) (not (valid-session? session-id)))
          (json-response 400 (jsonrpc-error nil -32600 "Invalid or missing Mcp-Session-Id"))
          (let [results       (mapv #(dispatch-request % session-id) messages)
                ;; Collect extra headers from initialize responses
                extra-headers (reduce (fn [h r] (merge h (when (map? r) (:headers r)))) {} results)
                ;; Unwrap {response, headers} maps, keep plain responses and nils
                responses     (mapv (fn [r]
                                      (if (and (map? r) (:response r))
                                        (:response r)
                                        r))
                                    results)
                ;; Filter out nil (notification) responses
                responses     (filterv some? responses)]
            (cond
              ;; All notifications — return 202
              (empty? responses)
              {:status 202 :headers (merge {"Content-Type" "application/json"} extra-headers) :body ""}

              (accepts-sse? request)
              (sse-response responses)

              (and (not batch?) (= 1 (count responses)))
              (json-response 200 (first responses))

              :else
              (json-response 200 responses))))))))

(defn- handle-get
  "Handle a GET request for SSE stream (keepalive for server-initiated notifications)."
  [request respond raise]
  (let [session-id (get-in request [:headers "mcp-session-id"])]
    (if (and (valid-session? session-id)
             (session-initialized? session-id))
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
        (compojure.response/send* resp request respond raise))
      (respond (json-response 400 (jsonrpc-error nil -32600 "Invalid or missing Mcp-Session-Id"))))))

(defn- handle-delete
  "Handle a DELETE request to tear down a session."
  [request]
  (let [session-id (get-in request [:headers "mcp-session-id"])]
    (if (valid-session? session-id)
      (do (delete-session! session-id)
          {:status 200 :headers {"Content-Type" "application/json"} :body ""})
      (json-response 400 (jsonrpc-error nil -32600 "Invalid or missing Mcp-Session-Id")))))

;;; ---------------------------------------------------- Handler ---------------------------------------------------

(defn- www-authenticate-discovery []
  (str "Bearer realm=\"mcp\" resource_metadata=\"" (system/site-url) "/.well-known/oauth-protected-resource/api/mcp\""))

(def ^{:arglists '([request respond raise])} handler
  "Ring async handler for the MCP endpoint.
   Uses JSON-RPC 2.0 over HTTP rather than REST, so the OpenAPI spec is empty."
  (open-api/handler-with-open-api-spec
   (fn [request respond raise]
     (let [bearer-token    (extract-bearer-token request)
           session-auth    (:metabase-user-id request)
           mcp-session-id  (get-in request [:headers "mcp-session-id"])
           ;; For non-initialize requests with a valid MCP session, inherit stored auth
           stored-user-id  (when (and (not bearer-token) (not session-auth) mcp-session-id)
                             (session-user-id mcp-session-id))
           stored-scopes   (when stored-user-id
                             (session-token-scopes mcp-session-id))]
       (letfn [(dispatch [user-id scopes]
                 (request/with-current-user user-id
                   (try
                     (binding [mcp.tools/*token-scopes* scopes]
                       (case (:request-method request)
                         :post   (respond (handle-post request))
                         :get    (handle-get request respond raise)
                         :delete (respond (handle-delete request))
                         (respond {:status  405
                                   :headers {"Content-Type" "application/json"}
                                   :body    (json/encode {:error "Method not allowed"})})))
                     (catch Throwable e
                       (raise e)))))]
         (cond
           ;; Session auth (browser/cookie) — unrestricted scopes
           session-auth
           (dispatch session-auth #{::scope/unrestricted})

           ;; Bearer token auth — validate and extract scopes
           bearer-token
           (if-let [{:keys [user-id scopes]} (validate-bearer-token bearer-token)]
             (dispatch user-id scopes)
             ;; Invalid/expired bearer token
             (respond {:status  401
                       :headers {"Content-Type"     "application/json"
                                 "WWW-Authenticate" "Bearer error=\"invalid_token\""}
                       :body    (json/encode {:error "invalid_token"})}))

           ;; Stored session auth (bearer token was sent on initialize)
           stored-user-id
           (dispatch stored-user-id (or stored-scopes #{}))

           ;; No auth at all — return 401 with discovery
           :else
           (respond {:status  401
                     :headers {"WWW-Authenticate" (www-authenticate-discovery)}})))))
   (constantly nil)))
