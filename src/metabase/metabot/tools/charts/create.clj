(ns metabase.metabot.tools.charts.create
  "Tool for creating charts from queries."
  (:require
   [clojure.string :as str]
   [metabase.metabot.agent.links :as links]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private valid-chart-types
  "Valid chart types supported by Metabase."
  #{:table :bar :line :pie :sunburst :area :combo :row :pivot
    :scatter :waterfall :sankey :scalar :smartscalar :gauge
    :progress :funnel :object :map})

(defn- format-chart-for-llm
  "Format chart data as XML for LLM consumption."
  [{:keys [chart-id query-id chart-type chart-name]}]
  (str "<chart id=\"" chart-id "\">\n"
       (when (seq chart-name)
         (str "<name>" chart-name "</name>\n"))
       "<query-id>" query-id "</query-id>\n"
       "<visualization>{\"chart_type\": \"" (name chart-type) "\"}</visualization>\n"
       "</chart>"))

(defn- format-chart-link
  "Format a metabase:// link to the chart."
  [chart-id]
  (str "metabase://chart/" chart-id))

(defn- default-chart-name
  [chart-type]
  (if (= :table chart-type)
    "Generated table"
    (str "Generated " (name chart-type) " chart")))

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
  - :chart-url - URL for rendering the ad-hoc chart"
  [{:keys [query-id chart-type queries-state title]}]
  (log/info "Creating chart" {:query-id query-id
                              :chart-type chart-type
                              :available-queries (keys queries-state)})

  ;; Validate chart type
  (when-not (contains? valid-chart-types chart-type)
    (throw (ex-info (str "Invalid chart type: " (name chart-type)
                         ". Valid types are: " (pr-str valid-chart-types))
                    {:agent-error? true
                     :chart-type chart-type})))

  ;; Look up query from state - try both string and original key
  (let [query (or (get queries-state query-id)
                  (get queries-state (str query-id)))]
    (when-not query
      (throw (ex-info (str "Query not found with ID: " query-id
                           ". Available queries: [" (str/join ", " (keys queries-state)) "]. "
                           "Make sure you're using a query ID from a previous query_model or query_metric result.")
                      {:agent-error? true
                       :query-id query-id
                       :available-queries (keys queries-state)})))

    ;; Create the chart and generate a renderable ad-hoc question URL.
    (let [chart-id (str (random-uuid))
          chart-name (or (not-empty (some-> title str/trim))
                         (default-chart-name chart-type))
          results-url (links/query-and-viz-link query chart-type chart-name)
          chart-data {:chart-id chart-id
                      :chart-name chart-name
                      :query-id query-id
                      :chart-type chart-type}]

      (log/info "Created chart" {:chart-id chart-id
                                 :chart-type chart-type
                                 :results-url results-url})

      {:chart-id chart-id
       :chart-content (format-chart-for-llm chart-data)
       :chart-link (format-chart-link chart-id)
       :chart-name chart-name
       :chart-url results-url
       :chart-type chart-type
       :query query
       :query-id query-id
       :instructions (str "Chart created successfully. The user is now viewing the chart.\n"
                          "Use the <query_execution> block in this tool result to inspect the executed chart data, "
                          "and proactively mention one concrete observation from the data. Only mention maxima, "
                          "minima, rankings, or counts when <query_execution> is not truncated, or after running "
                          "a follow-up query that computes them against the full result. If <query_execution> says "
                          "results were omitted and the user needs an answer from the data, your next step MUST "
                          "be a follow-up tool call without asking permission first. For notebook queries, use "
                          "execute_notebook_query_silently with the needed follow-up program so no chart is created. "
                          "Do not produce a final answer until it returns.\n"
                          "When mentioning a specific value from the chart, use the matching metabase://data-point URL "
                          "from the linked result value, and choose natural link text for your answer.\n"
                          "Reference the chart using: [" chart-name "](" (format-chart-link chart-id) ").")})))
