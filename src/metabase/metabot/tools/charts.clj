(ns metabase.metabot.tools.charts
  "Chart tool wrappers."
  (:require
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.charts.create :as create-chart-tools]
   [metabase.metabot.tools.charts.edit :as edit-chart-tools]
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
                   [:chart_type chart-type-enum]]]
   [:title :string]])

(mu/defn ^{:tool-name "create_chart"
           :scope     scope/agent-viz-create}
  create-chart-tool
  "Create a chart from a query.

  Provide a query_id in data_source, a chart_type in viz_settings, and a short,
  human-friendly `title` shown above the chart."
  [{:keys [data_source viz_settings title]} :- create-chart-schema]
  (try
    (let [result     (create-chart-tools/create-chart
                      {:query-id      (get data_source :query_id)
                       :chart-type    (keyword (get viz_settings :chart_type))
                       :queries-state (shared/current-queries-state)})
          structured (assoc (dissoc result :results-url) :result-type :chart)]
      {:output            (format-chart-output structured)
       :structured-output structured
       :data-parts        [(streaming/viz-part
                            {:inline?   (shared/inline-viz-capable?)
                             :entity-id (:chart-id result)
                             :query-id  (:query-id result)
                             :query     (links/->legacy-mbql (:query result))
                             :display   (:chart-type result)
                             :title     title
                             :link      (:results-url result)})]})
    (catch Exception e
      (log/error e "Error creating chart")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to create chart: " (or (ex-message e) "Unknown error"))}))))

(def ^:private edit-chart-schema
  [:map {:closed true}
   [:chart_id :string]
   [:new_viz_settings [:map {:closed true}
                       [:chart_type chart-type-enum]]]
   [:title :string]])

(mu/defn ^{:tool-name "edit_chart"
           :scope     scope/agent-viz-edit}
  edit-chart-tool
  "Edit an existing chart's visualization type.

  Provide a new chart_type in new_viz_settings and a short, human-friendly `title`
  shown above the chart."
  [{:keys [chart_id new_viz_settings title]} :- edit-chart-schema]
  (try
    (let [new-viz (keyword (get new_viz_settings :chart_type))
          chart (get (shared/current-charts-state) chart_id)
          query (or (first (:queries chart))
                    (get (shared/current-queries-state) (:query_id chart)))

          {:keys [new-chart-data result]}
          (edit-chart-tools/edit-chart
           {:chart-id chart_id
            :new-chart-type new-viz
            :charts-state (shared/current-charts-state)})

          structured (assoc result :result-type :chart)]
      ;; Add the new chart to memory so it can be referenced in the conversation going forward.
      (when (and (:chart_id new-chart-data) shared/*memory-atom*)
        (swap! shared/*memory-atom* assoc-in [:state :charts (:chart_id new-chart-data)]
               new-chart-data))
      {:output            (format-chart-output structured)
       :structured-output structured
       :data-parts        [(streaming/viz-part
                            {:inline?   (shared/inline-viz-capable?)
                             :entity-id (or (:chart_id new-chart-data) chart_id)
                             :query-id  (or (:query_id chart) (str (random-uuid)))
                             :query     (links/->legacy-mbql query)
                             :display   new-viz
                             :title     title
                             :link      (links/pseudo-card->link
                                         {:dataset_query query
                                          :display new-viz
                                          :displayIsLocked true})})]})
    (catch Exception e
      (log/error e "Error editing chart")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to edit chart: " (or (ex-message e) "Unknown error"))}))))
