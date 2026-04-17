(ns metabase.metabot.tools.charts.edit
  "Tool for editing chart visualization settings."
  (:require
   [metabase.util.log :as log]))

(def ^:private valid-chart-types
  "Valid chart types supported by Metabase."
  #{:table :bar :line :pie :sunburst :area :combo :row :pivot
    :scatter :waterfall :sankey :scalar :smartscalar :gauge
    :progress :funnel :object :map})

(defn- format-chart-link
  "Format a metabase:// link to the chart."
  [chart-id]
  (str "metabase://chart/" chart-id))

(defn- format-chart-for-llm
  "Format chart data as XML for LLM consumption."
  [{:keys [chart_id queries] :as chart-data}]
  (apply str
         (into ["<chart id=\"" chart_id "\">\n"
                "The chart is powered by the following queries:\n"]
               (comp cat
                     (remove nil?))
               [(for [query queries]
                  (str "\n<query>\n"
                       query "\n"
                       "</query>\n"))
                [(when-some [viz (get-in chart-data [:visualization_settings :chart_type])]
                   (str "<visualization>{\"chart_type\": \"" (name viz) "\"}</visualization>\n"))
                 "\n</chart>"]])))

(defn edit-chart
  "Edit an existing chart's visualization settings.

  Parameters:
  - chart-id: ID of the chart to edit
  - new-chart-type: New chart type to use
  - charts-state: Map of chart-id to chart data from agent state

  Returns a map with result and new-chart-data.

  `new-chart-data`: format that could be stored directly in memory or state's :charts key.

  `result`:
  - :chart-id - New unique ID for the edited chart
  - :chart-content - XML representation of the chart
  - :chart-link - Metabase link to the chart
  - :chart-type - Type of chart created"
  [{:keys [chart-id new-chart-type charts-state]}]
  (log/info "Editing chart" {:chart-id chart-id :new-chart-type new-chart-type})

  ;; Validate chart type
  (when-not (contains? valid-chart-types new-chart-type)
    (throw (ex-info (str "Invalid chart type: " (name new-chart-type)
                         ". Valid types are: " (pr-str valid-chart-types))
                    {:agent-error? true
                     :chart-type new-chart-type})))

  (let [chart-data (get charts-state (str chart-id))]
    (when-not chart-data
      (throw (ex-info "Sorry, I have issues accessing the chart data. Is there anything else I can help you with?"
                      {:agent-error? true
                       :chart-id chart-id})))

    (let [new-chart-data (-> chart-data
                             (assoc :chart_id (str (random-uuid)))
                             (assoc :visualization_settings {:chart_type new-chart-type}))]

      {:new-chart-data new-chart-data
       :result {:chart-id (:chart_id new-chart-data)
                :chart-content (format-chart-for-llm new-chart-data)
                :chart-link (format-chart-link (:chart_id new-chart-data))
                :chart-type new-chart-type
                :instructions (str "Chart has been created successfully.\n\n"
                                   "Next steps to present the chart to the user:\n"
                                   "- Always provide a direct link using: `[Chart]("
                                   (format-chart-link (:chart_id new-chart-data))
                                   ")` "
                                   "where Chart is a meaningful link text\n"
                                   "- If creating multiple charts, present all chart links")}})))
