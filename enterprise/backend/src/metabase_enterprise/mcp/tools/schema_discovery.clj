(ns metabase-enterprise.mcp.tools.schema-discovery
  "MCP tools for discovering database schema: search, table details."
  (:require
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase-enterprise.metabot-v3.tools.entity-details :as entity-details]
   [metabase-enterprise.metabot-v3.tools.search :as metabot-search]
   [metabase.util.json :as json]))

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "search"
                           :description  "Search for tables and metrics in the Metabase semantic layer. Returns names, IDs, and descriptions."
                           :annotations  {"readOnlyHint" true}
                           :input-schema {:type       "object"
                                          :properties {"query" {:type "string" :description "Search term"}}
                                          :required   ["query"]}
                           :handler      (fn [{:strs [query]}]
                                           (let [result (metabot-search/search-tool {:term-queries [query]})]
                                             {:content [{:type "text"
                                                         :text (json/encode (:structured_output result))}]}))})

(defn- slim-field
  "Keep only the fields an agent needs to write SQL."
  [field]
  (select-keys field [:name :display_name :type :database_type :semantic_type :description]))

(defn- slim-table-details
  "Strip field_values, trim related_tables to just names, and drop metrics to save tokens."
  [details]
  (-> details
      (update :fields #(mapv slim-field %))
      (update :related_tables
              (fn [tables]
                (mapv #(-> (select-keys % [:id :name :display_name :related_by])
                           (update :fields (fnil (fn [fs] (mapv slim-field fs)) [])))
                      (or tables []))))
      (dissoc :metrics :measures :segments)))

(mcp.tools/register-tool! mcp.tools/global-registry
                          {:name         "get_table_details"
                           :description  "Get columns, types, and metadata for a specific table. Use the table ID from search results."
                           :annotations  {"readOnlyHint" true}
                           :input-schema {:type       "object"
                                          :properties {"table_id" {:type "integer" :description "Metabase table ID"}}
                                          :required   ["table_id"]}
                           :handler      (fn [{:strs [table_id]}]
                                           (let [result (entity-details/get-table-details
                                                         {:table-id          table_id
                                                          :with-field-values? false
                                                          :with-metrics?      false})]
                                             {:content [{:type "text"
                                                         :text (json/encode (slim-table-details (:structured-output result)))}]}))})
