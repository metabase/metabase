(ns metabase-enterprise.mcp.tools
  "MCP tool dispatch. Generates tool definitions from defendpoint metadata and delegates
   tool calls to existing agent API endpoints."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase-enterprise.agent-api.api :as agent-api]
   [metabase.api.common :as api]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (java.io ByteArrayOutputStream)
   (java.net URLEncoder)
   (metabase.server.streaming_response StreamingResponse)))

(set! *warn-on-reflection* true)

(defn- generate-manifest []
  (tools-manifest/generate-tools-manifest
   {'metabase-enterprise.agent-api.api "/api/agent"}))

(def ^:private manifest-delay
  (delay (generate-manifest)))

(defn- manifest
  "Return the tools manifest. Cached in prod, recomputed each call in dev."
  []
  (if config/is-dev?
    (generate-manifest)
    @manifest-delay))

(defn list-tools
  "Return the tool definitions suitable for MCP `tools/list` responses."
  []
  (mapv (fn [tool]
          {:name        (:name tool)
           :description (:description tool)
           :inputSchema (:inputSchema tool)})
        (:tools (manifest))))

(defn- build-tool-index []
  (into {} (map (juxt :name identity)) (:tools (manifest))))

(def ^:private tool-index-delay
  (delay (build-tool-index)))

(defn- tool-index
  "Lookup from tool name to its full manifest definition. Cached in prod, recomputed each call in dev."
  []
  (if config/is-dev?
    (build-tool-index)
    @tool-index-delay))

;;; ------------------------------------------------- Tool Dispatch -------------------------------------------------

(defn- text-content
  "Wrap a value as MCP text content."
  [v]
  {:content [{:type "text" :text (if (string? v) v (json/encode v))}]})

(defn- error-content
  "Wrap an error message as MCP error content."
  [message]
  {:content [{:type "text" :text message}] :isError true})

(defn- capture-streaming-response
  "Execute a StreamingResponse in-process by writing to a ByteArrayOutputStream,
   then parse the JSON output and return it as MCP text content.

   NOTE: This intentionally bypasses the normal StreamingResponse lifecycle (thread pool,
   gzip, donechan delivery) because the agent-api streaming functions only write JSON to
   the output stream and don't depend on `streaming-response/*response*` or other
   infrastructure bindings. BOT-1120 tracks streaming MCP responses without buffering
   in memory, which will replace this approach."
  [^StreamingResponse response]
  (let [baos (ByteArrayOutputStream.)
        canceled-chan (a/promise-chan)
        f (.f response)]
    (f baos canceled-chan)
    (text-content (json/decode+kw (.toString baos "UTF-8")))))

(defn- invoke-agent-api
  "Invoke an Agent API endpoint with a synthetic Ring request.
   Returns MCP content (text-content on success, error-content on failure).

   Propagates `token-scopes` from the original MCP request so that scope restrictions
   are preserved through the synthetic request."
  [method path token-scopes & [body]]
  (let [result (promise)]
    (agent-api/routes
     (cond-> {:request-method   method
              :uri              path
              :metabase-user-id api/*current-user-id*
              :token-scopes     token-scopes}
       body (assoc :body body))
     (fn [response] (deliver result response))
     (fn [error] (deliver result {:status 500 :body {:message (ex-message error)}})))
    (let [response (deref result 30000 {:status 504 :body {:message "Timeout"}})]
      (cond
        (instance? StreamingResponse (:body response))
        (capture-streaming-response (:body response))

        (= 200 (:status response))
        (text-content (:body response))

        :else
        (error-content (or (some-> response :body :message)
                           (some-> response :body :error)
                           (str "Agent API error: " (:status response))))))))

(defn- interpolate-path
  "Replace `{param}` placeholders in `path` with values from `arguments`.
   Returns `[resolved-path remaining-args]` where remaining-args has path params removed."
  [path arguments]
  (let [params    (re-seq #"\{([^}]+)\}" path)
        resolved  (reduce (fn [p [placeholder k]]
                            (let [v (get arguments (keyword k))]
                              (when (nil? v)
                                (throw (ex-info (str "Missing required path parameter: " k)
                                                {:parameter k :path path})))
                              (str/replace p placeholder (URLEncoder/encode (str v) "UTF-8"))))
                          path
                          params)
        path-keys (set (map (comp keyword second) params))]
    [resolved (apply dissoc arguments path-keys)]))

(defn- strip-api-prefix
  "Strip the `/api/agent` prefix from manifest paths, since `invoke-agent-api`
   calls `agent-api/routes` directly which expects `/v1/...` paths."
  [path]
  (str/replace-first path #"^/api/agent" ""))

(defn- invoke-agent-api-with-params
  "Invoke an Agent API endpoint with query parameters for GET/DELETE requests.
   Appends `params` as a query string to `path`."
  [method path token-scopes params]
  (if (and (seq params) (not= :post method))
    (let [query-string (->> params
                            (map (fn [[k v]] (str (name k) "=" (URLEncoder/encode (str v) "UTF-8"))))
                            (str/join "&"))]
      (invoke-agent-api method (str path "?" query-string) token-scopes))
    (invoke-agent-api method path token-scopes (when (= :post method) params))))

(defn- dispatch-via-agent-api
  "Generic dispatch for tools whose responseFormat is \"json\".
   Looks up method/path from the tool definition, interpolates path params,
   and calls `invoke-agent-api`. For POST requests, remaining args are sent as the
   request body. For GET/DELETE requests, remaining args are sent as query params."
  [tool-def arguments token-scopes]
  (let [{:keys [method path]} (:endpoint tool-def)
        method                (keyword (u/lower-case-en method))
        [resolved-path
         remaining-args]      (interpolate-path path arguments)
        api-path              (strip-api-prefix resolved-path)]
    (invoke-agent-api-with-params method api-path token-scopes remaining-args)))

(defn call-tool
  "Dispatch an MCP `tools/call` request to the appropriate handler.
   `token-scopes` are propagated to the synthetic agent-api request so that
   scope restrictions from the original MCP session are preserved.
   Returns MCP content on success, or error content on failure."
  [token-scopes tool-name arguments]
  (if-let [tool-def (get (tool-index) tool-name)]
    (try
      (dispatch-via-agent-api tool-def arguments token-scopes)
      (catch Exception e
        (error-content (or (ex-message e) "Internal error"))))
    (error-content (str "Unknown tool: " tool-name))))
