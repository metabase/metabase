(ns metabase-enterprise.mcp.api
  "MCP (Model Context Protocol) Streamable HTTP transport handler.
   Exposes Metabase's agent tools via JSON-RPC 2.0 over a single `/api/mcp` endpoint."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [compojure.response :as compojure.response]
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase.api.common :as api]
   [metabase.api.open-api :as open-api]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
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

(defn- sweep-expired-sessions!
  "Remove all sessions whose TTL has elapsed. Called on session creation to
   prevent abandoned sessions from accumulating in memory."
  []
  (swap! sessions (fn [m]
                    (into {} (remove (fn [[_ {:keys [timer]}]]
                                       (>= (u/since-ms timer) session-ttl-ms)))
                          m))))

(defn- create-session!
  [user-id]
  (sweep-expired-sessions!)
  (let [session-id (str (UUID/randomUUID))]
    (swap! sessions assoc session-id {:timer        (u/start-timer)
                                      :user-id      user-id
                                      :initialized? false})
    session-id))

(defn- delete-session! [session-id]
  (swap! sessions dissoc session-id))

(defn- session-for-user
  "Return session state when the session exists, is unexpired, and belongs to
   `user-id`; otherwise return nil."
  [session-id user-id]
  (when-let [session (get @sessions session-id)]
    (if (>= (u/since-ms (:timer session)) session-ttl-ms)
      (do (delete-session! session-id) nil)
      (when (= user-id (:user-id session))
        session))))

(defn- session-initialized? [session-id]
  (get-in @sessions [session-id :initialized?]))

(defn- mark-session-initialized! [session-id]
  (swap! sessions assoc-in [session-id :initialized?] true))

;;; -------------------------------------------------- Auth --------------------------------------------------------

(defn- resolve-user-id
  "Return the user ID for the current MCP request from the authenticated session
   or API key. Returns nil when no authentication is present."
  []
  api/*current-user-id*)

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
    :capabilities    {:tools {}}
    :serverInfo      server-info}))

(defn- handle-tools-list [id _params]
  (jsonrpc-response id {:tools (mcp.tools/list-tools)}))

(defn- handle-tools-call [id params token-scopes]
  (let [tool-name (:name params)
        arguments (or (:arguments params) {})]
    (jsonrpc-response id (mcp.tools/call-tool token-scopes tool-name arguments))))

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
  [msg session-id token-scopes]
  (let [id     (:id msg)
        method (:method msg)
        params (:params msg)]
    (try
      (case method
        "notifications/initialized" (do (mark-session-initialized! session-id) nil)
        "tools/list"                (when-initialized id session-id (handle-tools-list id params))
        "tools/call"                (when-initialized id session-id (handle-tools-call id params token-scopes))
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
  "Return an HTTP error response when the session is invalid, or nil if valid.
   Returns 400 for a missing session header, 404 for an invalid/expired session (MCP spec)."
  [session-id user-id]
  (cond
    (str/blank? session-id)
    (json-response 400 (jsonrpc-error nil -32600 "Missing Mcp-Session-Id header"))

    (nil? (session-for-user session-id user-id))
    (json-response 404 (jsonrpc-error nil -32600 "Session not found or expired"))))

;;; -------------------------------------------------- Handlers ---------------------------------------------------

(defn- handle-post
  "Handle a POST request containing one or more JSON-RPC messages."
  [user-id request]
  (let [body        (:body request)
        session-id  (get-in request [:headers "mcp-session-id"])
        batch?      (sequential? body)
        session-err (delay (session-error-response session-id user-id))]
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
  [user-id request respond raise]
  (let [session-id (get-in request [:headers "mcp-session-id"])
        session-err (session-error-response session-id user-id)]
    (cond
      (some? session-err)
      (respond session-err)

      (not (session-initialized? session-id))
      (respond (json-response 400 (jsonrpc-error nil -32600 "Session not initialized")))

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
  (let [session-id (get-in request [:headers "mcp-session-id"])
        session-err (session-error-response session-id user-id)]
    (or session-err
        (do (delete-session! session-id)
            {:status 200 :headers {"Content-Type" "application/json"} :body ""}))))

;;; ---------------------------------------------------- Handler ---------------------------------------------------

(def ^{:arglists '([request respond raise])} handler
  "Ring async handler for the MCP endpoint.
   Uses JSON-RPC 2.0 over HTTP rather than REST, so the OpenAPI spec is empty."
  (open-api/handler-with-open-api-spec
   (fn [request respond raise]
     (let [user-id      (resolve-user-id)
           origin-error (validate-origin request)]
       (cond
         (nil? user-id)
         (respond (json-response 401 (jsonrpc-error nil -32603 "Authentication required")))

         (some? origin-error)
         (respond origin-error)

         :else
         (request/with-current-user user-id
           (try
             (case (:request-method request)
               :post   (respond (handle-post user-id request))
               :get    (handle-get user-id request respond raise)
               :delete (respond (handle-delete user-id request))
               (respond (json-response 405 (jsonrpc-error nil -32600 "Method not allowed"))))
             (catch Throwable e
               (raise e)))))))
   (constantly nil)))
