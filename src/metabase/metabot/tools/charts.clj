(ns metabase.metabot.tools.charts
  "Chart tool wrappers."
  (:require
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.charts.create :as create-chart-tools]
   [metabase.metabot.tools.charts.edit :as edit-chart-tools]
   [metabase.metabot.tools.charts.select :as select-chart-tools]
   [metabase.metabot.tools.query-results :as query-results]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- format-chart-output
  [{:keys [chart-id] :as structured}]
  (let [chart-xml (llm-shape/chart->xml structured)]
    (str "<result>\n" chart-xml "\n</result>\n"
         "<instructions>\n" (instructions/chart-created-instructions chart-id) "\n</instructions>")))

(def ^:private chart-type-enum
  [:enum "table" "bar" "line" "pie" "sunburst" "area" "combo"
   "row" "pivot" "scatter" "waterfall" "sankey" "scalar"
   "smartscalar" "gauge" "progress" "funnel" "object" "map"])

(def ^:private create-chart-schema
  [:map {:closed true}
   [:data_source [:map {:closed true}
                  [:query_id :string]]]
   [:viz_settings [:map {:closed true}
                   [:chart_type chart-type-enum]
                   [:name {:optional true
                           :description "A concise, user-facing name for the generated chart."}
                    [:maybe :string]]]]])

(defn- chart->adhoc-viz-part
  [{:keys [query chart-url chart-name chart-type]}]
  (streaming/adhoc-viz-part {:query query
                             :link chart-url
                             :title chart-name
                             :display (name chart-type)}))

(mu/defn ^{:tool-name "create_chart"
           :scope     scope/agent-viz-create}
  create-chart-tool
  "Create a chart from a query.

  Provide a query_id in data_source and a chart_type in viz_settings."
  [{:keys [data_source viz_settings]} :- create-chart-schema]
  (try
    (let [result     (create-chart-tools/create-chart
                      {:query-id      (get data_source :query_id)
                       :chart-type    (keyword (get viz_settings :chart_type))
                       :title         (get viz_settings :name)
                       :queries-state (shared/current-queries-state)})
          structured (assoc result :result-type :chart)]
      {:output            (format-chart-output structured)
       :structured-output structured
       :data-parts        [(chart->adhoc-viz-part result)]})
    (catch Exception e
      (log/error e "Error creating chart")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to create chart: " (or (ex-message e) "Unknown error"))}))))

(def ^:private edit-chart-schema
  [:map {:closed true}
   [:chart_id :string]
   [:new_viz_settings [:map {:closed true}
                       [:chart_type chart-type-enum]
                       [:name {:optional true
                               :description "A concise, user-facing name for the edited chart."}
                        [:maybe :string]]]]])

(mu/defn ^{:tool-name "edit_chart"
           :scope     scope/agent-viz-edit}
  edit-chart-tool
  "Edit an existing chart's visualization type.

  Provide a new chart_type in new_viz_settings."
  [{:keys [chart_id new_viz_settings]} :- edit-chart-schema]
  (try
    (let [new-viz (keyword (get new_viz_settings :chart_type))
          chart (get (shared/current-charts-state) chart_id)
          queries (:queries chart)
          query (first queries)

          {:keys [new-chart-data result]}
          (edit-chart-tools/edit-chart
           {:chart-id chart_id
            :new-chart-type new-viz
            :new-chart-name (get new_viz_settings :name)
            :charts-state (shared/current-charts-state)})

          structured (assoc result :result-type :chart)]
      ;; Add the new chart to memory so it can be referenced in the conversation going forward.
      (when (and (:chart_id new-chart-data) shared/*memory-atom*)
        (swap! shared/*memory-atom* assoc-in [:state :charts (:chart_id new-chart-data)]
               new-chart-data))
      {:output (format-chart-output structured)
       :structured-output structured
       :data-parts [(streaming/adhoc-viz-part
                     {:query query
                      :link (links/pseudo-card->link
                             {:dataset_query query
                              :name (:chart-name result)
                              :display new-viz
                              :displayIsLocked true})
                      :title (:chart-name result)
                      :display (name new-viz)})]})
    (catch Exception e
      (log/error e "Error editing chart")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to edit chart: " (or (ex-message e) "Unknown error"))}))))

(def ^:private select-chart-points-schema
  [:map {:closed true}
   [:reasoning {:optional true} :string]
   [:chart_id {:optional true} [:maybe :string]]
   [:query_id {:optional true} [:maybe :string]]
   [:filter [:sequential :any]]
   [:label {:optional true} [:maybe :string]]])

(mu/defn ^{:tool-name "select_chart_points"
           :scope     scope/agent-query-execute}
  select-chart-points-tool
  "Select a subset of an existing chart's data points with a filter, returning a single highlightable
  data-selection link that references all matching points."
  [{:keys [chart_id query_id filter label]} :- select-chart-points-schema]
  (try
    (let [query   (select-chart-tools/resolve-selection-query
                   (shared/current-charts-state) (shared/current-queries-state) chart_id query_id)
          summary (query-results/execute-query-full query)]
      (if (= :failed (:status summary))
        {:output (str "Failed to select chart points: " (or (:error summary) "query execution failed"))}
        (let [targets (select-chart-tools/select-targets summary filter)]
          (if (empty? targets)
            {:output (str "No chart points matched the selection filter. Adjust the filter and try "
                          "again, or reference individual points with their metabase://data-point URLs.")}
            (select-chart-tools/format-selection-result
             {:selection-id (str (random-uuid))
              :targets      targets
              :label        label})))))
    (catch Exception e
      (log/error e "Error selecting chart points")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to select chart points: " (or (ex-message e) "Unknown error"))}))))
