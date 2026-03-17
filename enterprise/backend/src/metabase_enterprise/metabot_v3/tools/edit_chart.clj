(ns metabase-enterprise.metabot-v3.tools.edit-chart
  "Tool for editing chart visualization settings."
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

(defn edit-chart
  "Edit an existing chart's visualization settings.

  Parameters:
  - chart-id: ID of the chart to edit
  - new-chart-type: New chart type to use
  - charts-state: Map of chart-id to chart data from agent state

  Returns a map with:
  - :chart-id - New unique ID for the edited chart
  - :chart-content - XML representation of the chart
  - :chart-link - Metabase link to the chart
  - :chart-type - Type of chart created
  - :query-id - ID of the source query"
  [{:keys [chart-id new-chart-type charts-state]}]
  (log/info "Editing chart" {:chart-id chart-id :new-chart-type new-chart-type})

  ;; Validate chart type
  (when-not (contains? valid-chart-types new-chart-type)
    (throw (ex-info (str "Invalid chart type: " (name new-chart-type)
                         ". Valid types are: " (pr-str valid-chart-types))
                    {:agent-error? true
                     :chart-type new-chart-type})))

  ;; Look up chart from state
  (let [chart-data (get charts-state (str chart-id))]
    (when-not chart-data
      (throw (ex-info "Sorry, I have issues accessing the chart data. Is there anything else I can help you with?"
                      {:agent-error? true
                       :chart-id chart-id})))

    (when-not (:query-id chart-data)
      (throw (ex-info "Sorry, I have issues accessing the chart data. Is there anything else I can help you with?"
                      {:agent-error? true
                       :chart-id chart-id})))

    ;; Create the new chart with updated settings
    (let [new-chart-id (str (random-uuid))
          query-id (:query-id chart-data)
          query-content (or (:query-content chart-data) "")
          new-chart-data {:chart-id new-chart-id
                          :query-id query-id
                          :chart-type new-chart-type
                          :query-content query-content}]

      (log/info "Edited chart" {:old-chart-id chart-id
                                :new-chart-id new-chart-id
                                :new-chart-type new-chart-type})

      {:chart-id new-chart-id
       :chart-content (format-chart-for-llm new-chart-data)
       :chart-link (format-chart-link new-chart-id)
       :chart-type new-chart-type
       :query-id query-id
       :instructions (str "Chart has been created successfully.\n\n"
                          "Next steps to present the chart to the user:\n"
                          "- Always provide a direct link using: `[Chart](" (format-chart-link new-chart-id) ")` "
                          "where Chart is a meaningful link text\n"
                          "- If creating multiple charts, present all chart links")})))
