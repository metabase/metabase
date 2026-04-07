(ns metabase.mcp.tools
  "MCP tool dispatch. Generates tool definitions from defendpoint metadata and delegates
   tool calls to existing agent API endpoints."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase.agent-api.api :as agent-api]
   [metabase.api-scope.core :as api-scope]
   [metabase.api.common :as api]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.api.macros.scope :as scope]
   [metabase.config.core :as config]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (java.io ByteArrayOutputStream)
   (java.net URLEncoder)
   (metabase.server.streaming_response StreamingResponse)))

(set! *warn-on-reflection* true)

(defn- generate-manifest
  "Generate tools manifest from agent API endpoint metadata."
  []
  (tools-manifest/generate-tools-manifest
   {'metabase.agent-api.api "/api/agent"}))

(def ^:private manifest-delay
  (delay (generate-manifest)))

(defn- manifest
  "Return the tools manifest. Cached in prod, recomputed each call in dev."
  []
  (if config/is-dev?
    (generate-manifest)
    @manifest-delay))

(defn- scope-matches?
  "Does `token-scopes` grant access to a tool with the given `tool-scope`?
   - nil token-scopes → always matches (internal callers)
   - ::scope/unrestricted in token-scopes → always matches
   - nil tool-scope → only matches nil or unrestricted token-scopes
   - Delegates wildcard/exact matching to [[api-scope/scope-matches?]]"
  [token-scopes tool-scope]
  (or (nil? token-scopes)
      (contains? token-scopes ::scope/unrestricted)
      (when (and (some? tool-scope)
                 (api-scope/scope-matches? token-scopes tool-scope))
        true)))

(defn list-tools
  "Return the tool definitions suitable for MCP `tools/list` responses.
   When `token-scopes` is provided, only tools whose scope matches are included."
  [token-scopes]
  (let [{:keys [tools]} (manifest)]
    (into []
          (comp (filter #(scope-matches? token-scopes (:scope %)))
                (map (fn [tool]
                       {:name        (:name tool)
                        :description (:description tool)
                        :inputSchema (:inputSchema tool)})))
          tools)))

(defn- build-tool-index
  "Build name->tool lookup from manifest tools."
  [tools]
  (into {} (map (juxt :name identity)) tools))

(def ^:private tool-index-delay
  (delay (build-tool-index (:tools @manifest-delay))))

(defn- tool-index
  "Lookup from tool name to its full manifest definition. Cached in prod, recomputed each call in dev."
  []
  (if config/is-dev?
    (build-tool-index (:tools (manifest)))
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

(comment streaming-response/keep-me) ; ensure StreamingResponse class is loaded

(defn- capture-streaming-response
  "Execute a StreamingResponse in-process by writing to a ByteArrayOutputStream,
   then parse the JSON output and return it as MCP text content.

   This buffers the full response in memory (~120KB for 200 rows), which is fine for
   the row limits we enforce."
  [^StreamingResponse response]
  (let [baos         (ByteArrayOutputStream.)
        canceled-chan (a/promise-chan)
        f            (.f response)]
    (f baos canceled-chan)
    (text-content (json/decode+kw (.toString baos "UTF-8")))))

(defn- deliver-agent-api-response
  "Dispatch to agent API routes and deliver response to promise.
   For POST requests, `params` is sent as the request body.
   For GET/DELETE requests, `params` is sent as parsed query params.
   Materializes StreamingResponse bodies in-process before delivering."
  [result method path token-scopes params]
  (agent-api/routes
   (cond-> {:request-method   method
            :uri              path
            :metabase-user-id api/*current-user-id*
            :token-scopes     token-scopes}
     (and (seq params) (= :post method))    (assoc :body params)
     (and (seq params) (not= :post method)) (assoc :query-params params))
   (fn [{resp-body :body :as response}]
     (deliver result (if (instance? StreamingResponse resp-body)
                       (capture-streaming-response resp-body)
                       response)))
   (fn [error] (deliver result {:status 500 :body {:message (ex-message error)}}))))

(defn- invoke-agent-api
  "Invoke an Agent API endpoint with a synthetic Ring request.
   Returns MCP content (text-content on success, error-content on failure).
   For POST, `params` becomes the request body; for GET/DELETE, `params` becomes query-params.

   Propagates `token-scopes` from the original MCP request so that scope restrictions
   are preserved through the synthetic request."
  [method path token-scopes params]
  (let [result (promise)]
    (deliver-agent-api-response result method path token-scopes params)
    (let [response (deref result 30000 {:status 504 :body {:message "Timeout"}})]
      (cond
        ;; Already materialized from a StreamingResponse
        (:content response)
        response

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
    (invoke-agent-api method api-path token-scopes remaining-args)))

(defn call-tool
  "Dispatch an MCP `tools/call` request to the appropriate handler.
   `token-scopes` from the original MCP session are propagated to the synthetic
   agent-api request so that scope restrictions are enforced by the agent API's
   `defendpoint` middleware.
   Returns MCP content on success, or error content on failure."
  [token-scopes tool-name arguments]
  (if-let [tool-def (get (tool-index) tool-name)]
    (try
      (dispatch-via-agent-api tool-def arguments token-scopes)
      (catch Exception e
        (error-content (or (ex-message e) "Internal error"))))
    (error-content (str "Unknown tool: " tool-name))))
