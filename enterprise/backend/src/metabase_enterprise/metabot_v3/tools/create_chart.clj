(ns metabase-enterprise.metabot-v3.tools.create-chart
  "Tool for creating charts from queries."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private valid-chart-types
  "Valid chart types supported by Metabase."
  #{:table :bar :line :pie :sunburst :area :combo :row :pivot
    :scatter :waterfall :sankey :scalar :smartscalar :gauge
    :progress :funnel :object :map})

(defn- query->url-hash
  "Convert an MLv2/MBQL query to a base64-encoded URL hash."
  [query]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (let [dataset-query (if (and (map? query) (:lib/type query))
                        (lib/->legacy-MBQL query)
                        query)]
    (-> {:dataset_query dataset-query}
        json/encode
        (.getBytes "UTF-8")
        codecs/bytes->b64-str)))

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
  - :reactions - Navigation action to show the chart"
  [{:keys [query-id chart-type queries-state]}]
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

    ;; Create the chart and generate navigation URL
    (let [chart-id (str (random-uuid))
          results-url (str "/question#" (query->url-hash query))
          chart-data {:chart-id chart-id
                      :query-id query-id
                      :chart-type chart-type}]

      (log/info "Created chart" {:chart-id chart-id
                                 :chart-type chart-type
                                 :results-url results-url})

      {:chart-id chart-id
       :chart-content (format-chart-for-llm chart-data)
       :chart-link (format-chart-link chart-id)
       :chart-type chart-type
       :query-id query-id
       :instructions (str "Chart created successfully. The user is now viewing the chart.\n"
                          "Reference the chart using: [Chart](" (format-chart-link chart-id) ") "
                          "where 'Chart' is a meaningful description.")
       :reactions [{:type :metabot.reaction/redirect :url results-url}]})))
