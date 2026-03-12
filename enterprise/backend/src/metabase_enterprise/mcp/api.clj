(ns metabase-enterprise.mcp.api
  "MCP (Model Context Protocol) Streamable HTTP transport handler.
   Exposes Metabase's agent tools via JSON-RPC 2.0 over a single `/api/mcp` endpoint."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [compojure.response :as compojure.response]
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase.api.common :as api]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
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

(defn- create-session! []
  (sweep-expired-sessions!)
  (let [session-id (str (UUID/randomUUID))]
    (swap! sessions assoc session-id {:timer (u/start-timer) :initialized? false})
    session-id))

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

;;; -------------------------------------------------- Auth --------------------------------------------------------

;; TODO: Remove this fallback once MCP authentication is fully implemented.
;; This is a temporary measure so that unauthenticated MCP clients (e.g. local
;; dev tools) can still function.  Once we support proper token/session auth on
;; the MCP endpoint, every request should already carry a user identity and this
;; superuser fallback should be deleted.
(defn- first-superuser-id
  "Return the ID of the first active superuser.
   Temporary fallback for when no authenticated user is present on the request."
  []
  (:id (t2/select-one :model/User :is_superuser true :is_active true {:order-by [[:id :asc]]})))

(defn- resolve-user-id
  "Return the user ID for the current MCP request. Uses the authenticated user
   from the request when available, falling back to the first active superuser
   as a temporary measure."
  []
  (or api/*current-user-id*
      (do (log/warn "MCP request has no authenticated user; falling back to first superuser (temporary)")
          (first-superuser-id))))

;;; ------------------------------------------------- JSON-RPC 2.0 --------------------------------------------------

(def ^:private server-info
  {:name    "metabase"
   :version "0.1.0"})

(def ^:private protocol-version "2025-03-26")

(defn- jsonrpc-response [id result]
  {:jsonrpc "2.0" :id id :result result})

(defn- jsonrpc-error [id code message]
  {:jsonrpc "2.0" :id id :error {:code code :message message}})

(defn- handle-initialize [id _params session-id]
  {:response (jsonrpc-response
              id
              {:protocolVersion protocol-version
               :capabilities    {:tools {}}
               :serverInfo      server-info})
   :headers  {"Mcp-Session-Id" session-id}})

(defn- handle-tools-list [id _params]
  (jsonrpc-response id {:tools (mcp.tools/list-tools)}))

(defn- handle-tools-call [id params]
  (let [tool-name (:name params)
        arguments (or (:arguments params) {})]
    (jsonrpc-response id (mcp.tools/call-tool tool-name arguments))))

(defn- handle-ping [id _params]
  (jsonrpc-response id {}))

(defn- dispatch-request
  "Dispatch a single JSON-RPC request. Returns a response map or nil for notifications."
  [msg session-id]
  (let [id     (:id msg)
        method (:method msg)
        params (:params msg)]
    (case method
      "initialize"
      (handle-initialize id params session-id)

      "notifications/initialized"
      (do (mark-session-initialized! session-id)
          nil) ; notification — no response

      ;; All other methods require the session to be initialized
      ("tools/list" "tools/call" "ping")
      (if-not (session-initialized? session-id)
        (jsonrpc-error id -32600 "Session not initialized: send notifications/initialized first")
        (case method
          "tools/list" (handle-tools-list id params)
          "tools/call" (handle-tools-call id params)
          "ping"       (handle-ping id params)))

      ;; unknown method
      (if id
        (jsonrpc-error id -32601 (str "Method not found: " method))
        nil))))

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
  [messages extra-headers]
  {:status  200
   :headers (merge {"Content-Type"  "text/event-stream"
                    "Cache-Control" "no-cache"}
                   extra-headers)
   :body    (sse-body messages)})

(defn- handle-post
  "Handle a POST request containing one or more JSON-RPC messages."
  [request]
  (let [body       (:body request)
        session-id (get-in request [:headers "mcp-session-id"])
        batch?     (sequential? body)]
    (cond
      ;; No body at all
      (nil? body)
      (json-response 400 (jsonrpc-error nil -32700 "Parse error: empty body"))

      ;; Invalid JSON-RPC (not a map or array)
      (and (not (map? body)) (not batch?))
      (json-response 400 (jsonrpc-error nil -32600 "Invalid request: expected object or array"))

      :else
      (let [messages       (if batch? body [body])
            ;; For initialize requests, create a new session
            initializing?  (some #(= "initialize" (:method %)) messages)
            session-id     (if initializing?
                             (create-session!)
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

              ;; SSE mode — return as event stream
              (accepts-sse? request)
              (sse-response responses extra-headers)

              ;; Single request — return single response
              (and (not batch?) (= 1 (count responses)))
              (json-response 200 (first responses) extra-headers)

              ;; Batch — return array
              :else
              (json-response 200 responses extra-headers))))))))

(defn- handle-get
  "Handle a GET request for SSE stream (keepalive for server-initiated notifications)."
  [request respond raise]
  (let [session-id (get-in request [:headers "mcp-session-id"])]
    (if (valid-session? session-id)
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
    (if (and session-id (valid-session? session-id))
      (do (delete-session! session-id)
          {:status 200 :headers {"Content-Type" "application/json"} :body ""})
      (json-response 400 (jsonrpc-error nil -32600 "Invalid or missing Mcp-Session-Id")))))

;;; ---------------------------------------------------- Handler ---------------------------------------------------

(defn handler
  "Ring async handler for the MCP endpoint."
  [request respond raise]
  (let [user-id (resolve-user-id)]
    (if (nil? user-id)
      (respond (json-response 500 (jsonrpc-error nil -32603 "No authenticated user and no superuser fallback available")))
      (request/with-current-user user-id
        (try
          (case (:request-method request)
            :post   (respond (handle-post request))
            :get    (handle-get request respond raise)
            :delete (respond (handle-delete request))
            (respond {:status  405
                      :headers {"Content-Type" "application/json"}
                      :body    (json/encode {:error "Method not allowed"})}))
          (catch Throwable e
            (raise e)))))))
