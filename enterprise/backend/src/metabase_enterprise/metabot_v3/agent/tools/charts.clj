(ns metabase-enterprise.metabot-v3.agent.tools.charts
  "Chart tool wrappers."
  (:require
   [metabase-enterprise.metabot-v3.agent.tools.shared :as shared]
   [metabase-enterprise.metabot-v3.tools.create-chart :as create-chart-tools]
   [metabase-enterprise.metabot-v3.tools.edit-chart :as edit-chart-tools]
   [metabase-enterprise.metabot-v3.tools.instructions :as instructions]
   [metabase-enterprise.metabot-v3.tools.llm-representations :as llm-rep]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- format-chart-output
  [{:keys [chart-id] :as structured}]
  (let [chart-xml (llm-rep/chart->xml structured)]
    (str "<result>\n" chart-xml "\n</result>\n"
         "<instructions>\n" (instructions/chart-created-instructions chart-id) "\n</instructions>")))

(mu/defn ^{:tool-name "create_chart"} create-chart-tool
  "Create a chart from a query.

  Provide a query_id in data_source and a chart_type in viz_settings."
  [{:keys [data_source viz_settings]}
   :- [:map {:closed true}
       [:data_source [:map {:closed true}
                      [:query_id :string]]]
       [:viz_settings [:map {:closed true}
                       [:chart_type [:enum "table" "bar" "line" "pie" "sunburst" "area" "combo"
                                     "row" "pivot" "scatter" "waterfall" "sankey" "scalar"
                                     "smartscalar" "gauge" "progress" "funnel" "object" "map"]]]]]]
  (try
    (let [result (create-chart-tools/create-chart
                  {:query-id (get data_source :query_id)
                   :chart-type (keyword (get viz_settings :chart_type))
                   :queries-state (shared/current-queries-state)})
          reactions (:reactions result)]
      (let [structured (assoc (dissoc result :reactions) :result-type :chart)]
        (cond-> {:output (format-chart-output structured)
                 :structured-output structured}
          (seq reactions) (assoc :reactions reactions))))
    (catch Exception e
      (log/error e "Error creating chart")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to create chart: " (or (ex-message e) "Unknown error"))}))))

(mu/defn ^{:tool-name "edit_chart"} edit-chart-tool
  "Edit an existing chart's visualization type.

  Provide a new chart_type in new_viz_settings."
  [{:keys [chart_id new_viz_settings]}
   :- [:map {:closed true}
       [:chart_id :string]
       [:new_viz_settings [:map {:closed true}
                           [:chart_type [:enum "table" "bar" "line" "pie" "sunburst" "area" "combo"
                                         "row" "pivot" "scatter" "waterfall" "sankey" "scalar"
                                         "smartscalar" "gauge" "progress" "funnel" "object" "map"]]]]]]
  (try
    (let [result (edit-chart-tools/edit-chart
                  {:chart-id chart_id
                   :new-chart-type (keyword (get new_viz_settings :chart_type))
                   :charts-state (shared/current-charts-state)})
          structured (assoc result :result-type :chart)]
      {:output (format-chart-output structured)
       :structured-output structured})
    (catch Exception e
      (log/error e "Error editing chart")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to edit chart: " (or (ex-message e) "Unknown error"))}))))
