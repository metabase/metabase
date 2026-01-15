(ns metabase-enterprise.metabot-v3.tools.create-chart
  "Tool for creating charts from queries."
  (:require
   [metabase.util.log :as log]))

(def ^:private valid-chart-types
  "Valid chart types supported by Metabase."
  #{:table :bar :line :pie :sunburst :area :combo :row :pivot
    :scatter :waterfall :sankey :scalar :smartscalar :gauge
    :progress :funnel :object :map})

(defn- format-chart-for-llm
  "Format chart data as XML for LLM consumption."
  [{:keys [chart-id query-id chart-type query-content]}]
  (str "<chart id=\"" chart-id "\">\n"
       "The chart is powered by the following query:\n"
       "<query id=\"" query-id "\">\n"
       query-content "\n"
       "</query>\n"
       "<visualization>{\"chart_type\": \"" (name chart-type) "\"}</visualization>\n"
       "</chart>"))

(defn- format-chart-link
  "Format a metabase:// link to the chart."
  [chart-id]
  (str "metabase://chart/" chart-id))

(defn create-chart
  "Create a chart from a query.

  Parameters:
  - query-id: ID of the query to visualize
  - chart-type: Type of chart to create (e.g., :bar, :line, :pie)
  - queries-state: Map of query-id to query data from agent state

  Returns a map with:
  - :chart-id - Unique ID for the chart
  - :chart-content - XML representation of the chart
  - :chart-link - Metabase link to the chart
  - :chart-type - Type of chart created
  - :query-id - ID of the source query"
  [{:keys [query-id chart-type queries-state]}]
  (log/info "Creating chart" {:query-id query-id :chart-type chart-type})

  ;; Validate chart type
  (when-not (contains? valid-chart-types chart-type)
    (throw (ex-info (str "Invalid chart type: " (name chart-type)
                         ". Valid types are: " (pr-str valid-chart-types))
                    {:agent-error? true
                     :chart-type chart-type})))

  ;; Look up query from state
  (let [query-data (get queries-state (str query-id))]
    (when-not query-data
      (throw (ex-info (str "Query not found with ID: " query-id
                           ". Please create a query first using create_sql_query.")
                      {:agent-error? true
                       :query-id query-id})))

    ;; Create the chart
    (let [chart-id (str (random-uuid))
          query-content (or (:query-content query-data)
                            (:sql query-data)
                            "")
          chart-data {:chart-id chart-id
                      :query-id query-id
                      :chart-type chart-type
                      :query-content query-content}]

      (log/info "Created chart" {:chart-id chart-id :chart-type chart-type})

      {:chart-id chart-id
       :chart-content (format-chart-for-llm chart-data)
       :chart-link (format-chart-link chart-id)
       :chart-type chart-type
       :query-id query-id
       :instructions (str "Chart has been created successfully.\n\n"
                          "Next steps to present the chart to the user:\n"
                          "- Always provide a direct link using: `[Chart](" (format-chart-link chart-id) ")` "
                          "where Chart is a meaningful link text\n"
                          "- If creating multiple charts, present all chart links")})))

(defn create-chart-tool
  "Tool handler for create_chart tool.
  Returns structured output with chart details."
  [{:keys [query-id chart-type] :as args}]
  (try
    (let [result (create-chart args)]
      {:structured-output result})
    (catch Exception e
      (log/error e "Error creating chart")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to create chart: " (or (ex-message e) "Unknown error"))}))))
