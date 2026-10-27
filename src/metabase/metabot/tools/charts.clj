(ns metabase.metabot.tools.charts
  "The `create_chart` and `edit_chart` tools."
  (:require
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.charts.create :as create-chart-tools]
   [metabase.metabot.tools.charts.edit :as edit-chart-tools]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]))

(set! *warn-on-reflection* true)

(defn- format-chart-output
  [{:keys [chart-id] :as structured}]
  (let [chart-xml (llm-shape/chart->xml structured)]
    (str "<result>\n" chart-xml "\n</result>\n"
         "<instructions>\n" (instructions/chart-created-instructions chart-id) "\n</instructions>")))

(def ^:private chart-type-enum
  (into [:enum] shared/chart-types))

(def ^:private create-chart-schema
  [:map {:closed true}
   [:data_source [:map {:closed true}
                  [:query_id :string]]]
   [:viz_settings [:map {:closed true}
                   [:chart_type chart-type-enum]]]
   [:title :string]
   [:description :string]])

(defrecord CreateChartTool []
  tools/Tool
  (declaration [_]
    {:name        "create_chart"
     :description (str "Create a chart from a query.\n\n"
                       "Provide a query_id in data_source, a chart_type in viz_settings, and a short, "
                       "human-friendly `title` shown above the chart. Also provide a concise one- or two-sentence "
                       "`description` explaining what the chart shows (the metric, the grouping, and any notable "
                       "filter); it is used as the saved question's description.")
     :scope       scope/agent-viz-create
     :args        create-chart-schema})

  (handle [_ {:keys [data_source viz_settings title description]} _ctx]
    (let [result     (create-chart-tools/create-chart
                      {:query-id      (get data_source :query_id)
                       :chart-type    (keyword (get viz_settings :chart_type))
                       :queries-state (shared/current-queries-state)})
          structured (assoc (dissoc result :results-url) :result-type :chart)]
      {:output            (format-chart-output structured)
       :structured-output structured
       :data-parts        [(streaming/viz-part
                            {:entity-id   (:chart-id result)
                             :query-id    (:query-id result)
                             :query       (links/->frontend-query (:query result))
                             :display     (:chart-type result)
                             :title       title
                             :description description})]})))

(def create-chart-tool
  "`create_chart`: chart a query that this conversation holds."
  (->CreateChartTool))

(def ^:private edit-chart-schema
  [:map {:closed true}
   [:chart_id :string]
   [:new_viz_settings [:map {:closed true}
                       [:chart_type chart-type-enum]]]
   [:title :string]
   [:description :string]])

(defrecord EditChartTool []
  tools/Tool
  (declaration [_]
    {:name        "edit_chart"
     :description (str "Edit an existing chart's visualization type.\n\n"
                       "Provide a new chart_type in new_viz_settings and a short, human-friendly `title` shown above "
                       "the chart. Also provide a concise `description` of what the chart shows; it is used as the "
                       "saved question's description.")
     :scope       scope/agent-viz-edit
     :args        edit-chart-schema})

  (handle [_ {:keys [chart_id new_viz_settings title description]} _ctx]
    (let [new-viz (keyword (get new_viz_settings :chart_type))
          chart (get (shared/current-charts-state) chart_id)
          query (or (first (:queries chart))
                    (get (shared/current-queries-state) (:query_id chart)))

          {:keys [new-chart-data result]}
          (edit-chart-tools/edit-chart
           {:chart-id chart_id
            :new-chart-type new-viz
            :charts-state (shared/current-charts-state)
            :query query})

          structured (assoc result :result-type :chart)]
      ;; Add the new chart to memory so it can be referenced in the conversation going forward.
      (when (and (:chart_id new-chart-data) shared/*memory-atom*)
        (swap! shared/*memory-atom* memory/set-chart (:chart_id new-chart-data) new-chart-data))
      {:output            (format-chart-output structured)
       :structured-output structured
       :data-parts [(streaming/viz-part
                     {:entity-id   (or (:chart_id new-chart-data) chart_id)
                      :query-id    (or (:query_id new-chart-data) (str (random-uuid)))
                      :query       (links/->frontend-query query)
                      :display     new-viz
                      :title       title
                      :description description})]})))

(def edit-chart-tool
  "`edit_chart`: give a chart from this conversation a new chart type, as a new chart."
  (->EditChartTool))
