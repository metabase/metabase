(ns metabase-enterprise.mcp.tools
  "MCP tool dispatch. Loads tool definitions from tools-manifest.json and delegates
   tool calls to existing agent API / metabot functions."
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.agent-api.api :as agent-api]
   [metabase.api.common :as api]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (java.io ByteArrayOutputStream)
   (metabase.server.streaming_response StreamingResponse)))

(set! *warn-on-reflection* true)

(def ^:private manifest
  (delay (-> (io/resource "mcp/tools-manifest.json") slurp json/decode+kw)))

(defn list-tools
  "Return the tool definitions suitable for MCP `tools/list` responses."
  []
  (mapv (fn [tool]
          {:name        (:name tool)
           :description (:description tool)
           :inputSchema (:inputSchema tool)})
        (:tools @manifest)))

(def ^:private tool-index
  "Lookup from tool name to its full manifest definition."
  (delay (into {} (map (juxt :name identity)) (:tools @manifest))))

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
   then parse the JSON output and return it as MCP text content."
  [^StreamingResponse response]
  (let [baos (ByteArrayOutputStream.)
        canceled-chan (a/promise-chan)]
    (.f response baos canceled-chan)
    (text-content (json/decode+kw (.toString baos "UTF-8")))))

(defn- invoke-agent-api
  "Invoke an Agent API endpoint with a synthetic Ring request.
   Returns MCP content (text-content on success, error-content on failure)."
  [method path & [body]]
  (let [result (promise)]
    (agent-api/routes
     (cond-> {:request-method   method
              :uri              path
              :metabase-user-id api/*current-user-id*}
       body (assoc :body body))
     (fn [response] (deliver result response))
     (fn [error] (deliver result {:status 500 :body {:message (ex-message error)}})))
    (let [response (deref result 30000 {:status 504 :body {:message "Timeout"}})]
      (cond
        (instance? StreamingResponse response)
        (capture-streaming-response response)

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
                            (str/replace p placeholder (str (get arguments (keyword k)))))
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
   and calls `invoke-agent-api`."
  [tool-def arguments]
  (let [{:keys [method path]} (:endpoint tool-def)
        method                (keyword (u/lower-case-en method))
        [resolved-path
         remaining-args]      (interpolate-path path arguments)
        api-path              (strip-api-prefix resolved-path)]
    (if (= :post method)
      (invoke-agent-api method api-path remaining-args)
      (invoke-agent-api method api-path))))

(defn- execute-query
  "Handler for execute_query — delegates to the Agent API's `/v1/execute` endpoint.
   The endpoint returns a StreamingResponse which `invoke-agent-api` captures
   in-process via `capture-streaming-response`."
  [arguments]
  (invoke-agent-api :post "/v1/execute" {:query (:query arguments)}))

(defn call-tool
  "Dispatch an MCP `tools/call` request to the appropriate handler.
   Returns MCP content on success, or error content on failure."
  [tool-name arguments]
  (if-let [tool-def (get @tool-index tool-name)]
    (try
      (if (:streaming tool-def)
        ;; TODO (Chris 2026-03-26) Stop cheating :-)
        (execute-query arguments)
        (dispatch-via-agent-api tool-def arguments))
      (catch Exception e
        (error-content (or (ex-message e) "Internal error"))))
    (error-content (str "Unknown tool: " tool-name))))
