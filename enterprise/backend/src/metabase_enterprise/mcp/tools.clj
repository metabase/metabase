(ns metabase-enterprise.mcp.tools
  "MCP tool dispatch. Loads tool definitions from tools-manifest.json and delegates
   tool calls to existing agent API / metabot functions."
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.agent-api.api :as agent-api]
   [metabase.api.common :as api]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [metabase.util.json :as json]))

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

;;; ------------------------------------------------- Tool Dispatch -------------------------------------------------

(defn- text-content
  "Wrap a value as MCP text content."
  [v]
  {:content [{:type "text" :text (if (string? v) v (json/encode v))}]})

(defn- error-content
  "Wrap an error message as MCP error content."
  [message]
  {:content [{:type "text" :text message}] :isError true})

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
      (if (= 200 (:status response))
        (text-content (:body response))
        (error-content (or (some-> response :body :message)
                           (some-> response :body :error)
                           (str "Agent API error: " (:status response))))))))

(defn- call-search [arguments]
  (invoke-agent-api :post "/v1/search"
                    {:term_queries     (or (:term_queries arguments) [])
                     :semantic_queries (or (:semantic_queries arguments) [])}))

(defn- call-get-table [arguments]
  (invoke-agent-api :get (str "/v1/table/" (:table_id arguments))))

(defn- call-get-metric [arguments]
  (invoke-agent-api :get (str "/v1/metric/" (:metric_id arguments))))

(defn- call-get-field-values [arguments]
  (let [{:keys [entity_type entity_id field_id]} arguments]
    (invoke-agent-api :get (str "/v1/" entity_type "/" entity_id "/field/" field_id "/values"))))

(defn- call-construct-query [arguments]
  (invoke-agent-api :post "/v1/construct-query" arguments))

(defn- call-execute-query [arguments]
  (let [query (-> (:query arguments)
                  u/decode-base64
                  json/decode+kw)
        info  {:executed-by api/*current-user-id*
               :context     :agent}
        result (qp/process-query
                (-> query
                    (update-in [:middleware :js-int-to-string?] (fnil identity true))
                    qp/userland-query-with-default-constraints
                    (update :info merge info)))]
    (text-content result)))

(def ^:private tool-handlers
  {"search"           call-search
   "get_table"        call-get-table
   "get_metric"       call-get-metric
   "get_field_values" call-get-field-values
   "construct_query"  call-construct-query
   "execute_query"    call-execute-query})

(defn call-tool
  "Dispatch an MCP `tools/call` request to the appropriate handler.
   Returns MCP content on success, or error content on failure."
  [tool-name arguments]
  (if-let [handler (get tool-handlers tool-name)]
    (try
      (handler arguments)
      (catch Exception e
        (error-content (or (ex-message e) "Internal error"))))
    (error-content (str "Unknown tool: " tool-name))))
