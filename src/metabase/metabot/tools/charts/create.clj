(ns metabase.metabot.tools.charts.create
  "Tool for creating charts from queries."
  (:require
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.tools.charts.fit :as fit]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- format-chart-for-llm
  "Format chart data as XML for LLM consumption."
  [{:keys [chart-id query-id chart-type]}]
  (str "<chart id=\"" chart-id "\">\n"
       "<query-id>" query-id "</query-id>\n"
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
  - :query-id - ID of the source query
  - :reactions - Navigation action to show the chart

  Throws [[recoverable.common/unknown-query-id!]] for a query ID that `queries-state` doesn't hold, and
  [[fit/incompatible-chart-type!]] for a chart type that can't show the query's columns."
  [{:keys [query-id chart-type queries-state]}]
  (log/info "Creating chart" {:query-id query-id
                              :chart-type chart-type
                              :available-queries (keys queries-state)})

  ;; Look up query from state - try both string and original key
  (let [query (or (get queries-state query-id)
                  (get queries-state (str query-id)))]
    (when-not query
      (recoverable.common/unknown-query-id! {:query-id  query-id
                                             :available (sort (keys queries-state))}))
    (fit/check-chart-type! chart-type query)
    ;; Create the chart and generate navigation URL
    (let [chart-id (str (random-uuid))
          results-url (links/query-and-viz-link query chart-type)
          chart-data {:chart-id chart-id
                      :query-id query-id
                      :chart-type chart-type}]
      (log/info "Created chart" {:chart-id chart-id
                                 :chart-type chart-type})
      {:chart-id chart-id
       :chart-content (format-chart-for-llm chart-data)
       :chart-link (format-chart-link chart-id)
       :chart-type chart-type
       :query-id query-id
       :query query
       :results-url results-url
       :instructions (str "Chart created successfully. The user is now viewing the chart.\n"
                          "Reference the chart using: [Chart](" (format-chart-link chart-id) ") "
                          "where 'Chart' is a meaningful description.")})))
