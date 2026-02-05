(ns metabase-enterprise.mcp.tools.query
  "MCP tools for running queries and previewing table data.
   Reuses the same QP execution pattern as the Agent API /v1/execute endpoint."
  (:require
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase.api.common :as api]
   [metabase.query-processor :as qp]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(def ^:private max-rows
  "Hard cap on rows returned by query tools, matching Agent API userspace constraints."
  2000)

(defn- format-query-result
  "Extract columns and rows from a QP result into a compact JSON-friendly format."
  [result]
  (if (= :completed (:status result))
    (let [cols (mapv (fn [c] {:name         (:name c)
                              :display_name (:display_name c)
                              :base_type    (some-> (:base_type c) name)})
                     (get-in result [:data :cols]))
          rows (get-in result [:data :rows])]
      {:columns   cols
       :rows      rows
       :row_count (count rows)})
    {:error (or (:error result) "Query execution failed")}))

(defn- execute-query
  "Run a query through the QP with agent context and row constraints.
   Same execution pattern as Agent API /v1/execute."
  [query row-limit]
  (qp/process-query
   (-> query
       (assoc :constraints {:max-results           row-limit
                            :max-results-bare-rows row-limit})
       (update-in [:middleware :js-int-to-string?] (fnil identity true))
       (assoc-in [:info :context] :agent))))

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "run_query"
                           :description  "Run a native SQL query against a database and return results (max 2000 rows).
                  Use this to inspect data, verify transform logic, or explore tables."
                           :annotations  {"readOnlyHint" true}
                           :input-schema {:type       "object"
                                          :properties {"database_id" {:type "integer" :description "Database ID to run the query against"}
                                                       "query"       {:type "string" :description "SQL query string"}}
                                          :required   ["database_id" "query"]}
                           :handler
                           (fn [{:strs [database_id query]}]
                             (let [result (execute-query {:database database_id
                                                          :type     :native
                                                          :native   {:query query}}
                                                         max-rows)]
                               {:content [{:type "text"
                                           :text (json/encode (format-query-result result))}]}))})

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "query_table"
                           :description  "Get rows from a table. Returns column metadata and rows (max 2000).
                  For complex queries with filters/aggregations, use run_query with SQL instead."
                           :annotations  {"readOnlyHint" true}
                           :input-schema {:type       "object"
                                          :properties {"table_id" {:type "integer" :description "Metabase table ID"}
                                                       "limit"    {:type "integer" :description "Max rows to return (default 100, max 2000)"}}
                                          :required   ["table_id"]}
                           :handler
                           (fn [{:strs [table_id limit]}]
                             (let [table (t2/select-one [:model/Table :id :db_id] table_id)]
                               (api/check-404 table)
                               (let [row-limit (min (or limit 100) max-rows)
                                     result    (execute-query {:database (:db_id table)
                                                               :type     :query
                                                               :query    {:source-table table_id}}
                                                              row-limit)]
                                 {:content [{:type "text"
                                             :text (json/encode (format-query-result result))}]})))})
