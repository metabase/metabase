(ns metabase-enterprise.metabot-v3.agent.tools.charts
  "Chart tool wrappers."
  (:require
   [metabase-enterprise.metabot-v3.agent.tools.shared :as shared]
   [metabase-enterprise.metabot-v3.tools.create-chart :as create-chart-tools]
   [metabase-enterprise.metabot-v3.tools.edit-chart :as edit-chart-tools]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

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
  (create-chart-tools/create-chart-tool
   {:query-id (get data_source :query_id)
    :chart-type (keyword (get viz_settings :chart_type))
    :queries-state (shared/current-queries-state)}))

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
  (edit-chart-tools/edit-chart-tool
   {:chart-id chart_id
    :new-chart-type (keyword (get new_viz_settings :chart_type))
    :charts-state (shared/current-charts-state)}))
