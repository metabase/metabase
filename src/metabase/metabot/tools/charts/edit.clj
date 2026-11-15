(ns metabase.metabot.tools.charts.edit
  "Tool for editing chart visualization settings."
  (:require
   [metabase.metabot.tools.charts.fit :as fit]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.util.log :as log]))

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
  - query: (optional) the current query stored under the chart's :query_id. It replaces the chart's own copy, which
    is stale once that query has been edited, and fills it in when the chart has none

  Returns a map with result and new-chart-data.

  `new-chart-data`: format that could be stored directly in memory or state's :charts key.

  `result`:
  - :chart-id - New unique ID for the edited chart
  - :chart-content - XML representation of the chart
  - :chart-link - Metabase link to the chart
  - :chart-type - Type of chart created

  Throws [[recoverable.common/unknown-chart-id!]] for a chart ID that `charts-state` doesn't hold, and
  [[fit/incompatible-chart-type!]] for a chart type that can't show the columns of the chart's query."
  [{:keys [chart-id new-chart-type charts-state query]}]
  (log/info "Editing chart" {:chart-id chart-id :new-chart-type new-chart-type})

  (let [chart-data (get charts-state (str chart-id))]
    (when-not chart-data
      (recoverable.common/unknown-chart-id! {:chart-id  chart-id
                                             :available (sort (keys charts-state))}))
    (let [;; The result below carries `:query-id` and `:query`, and the end-of-response memory update stores that
          ;; `:query` under that ID. So it must be the query as it stands now, not the copy the chart took when it was
          ;; made: after an SQL edit, that copy would undo the edit.
          chart-data     (cond-> chart-data
                           query (update :queries #(into [query] (rest %))))
          new-chart-data (-> chart-data
                             (assoc :chart_id (str (random-uuid)))
                             (assoc :visualization_settings {:chart_type new-chart-type}))]
      (fit/check-chart-type! new-chart-type (first (:queries chart-data)))
      {:new-chart-data new-chart-data
       :result {:chart-id (:chart_id new-chart-data)
                ;; Carry the source chart's query-id/query through. `extract-charts` only
                ;; captures a tool's chart into `:charts` state when the structured
                ;; output has BOTH `:chart-id` and `:query-id` (see commit 6d5721c5853),
                ;; and it then rebuilds `:queries` from `:query` alone — omitting `:query`
                ;; here would make it overwrite the chart's real queries with `[nil]`.
                :query-id (:query_id new-chart-data)
                :query (first (:queries new-chart-data))
                :chart-content (format-chart-for-llm new-chart-data)
                :chart-link (format-chart-link (:chart_id new-chart-data))
                :chart-type new-chart-type
                :instructions (str "Chart has been created successfully.\n\n"
                                   "Next steps to present the chart to the user:\n"
                                   "- Always provide a direct link using: [Chart]("
                                   (format-chart-link (:chart_id new-chart-data))
                                   ") "
                                   "where Chart is a meaningful link text\n"
                                   "- If creating multiple charts, present all chart links")}})))
