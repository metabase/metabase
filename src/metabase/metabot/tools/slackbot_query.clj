(ns metabase.metabot.tools.slackbot-query
  "Slackbot-specific notebook query tool.
  Like construct-notebook-query-tool but emits adhoc_viz data parts
  instead of creating charts. Does not save or navigate."
  (:require
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.construct :as construct]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private slackbot-query-schema
  [:map {:closed true}
   [:reasoning :string]
   [:query construct/construct-query-schema]
   [:title {:optional true} [:maybe :string]]
   [:display {:optional true
              :description "Visualization type for displaying the query results in Slack. Required in practice whenever the user asks for a chart or graph, and it must match any requested chart type. Valid values: 'table', 'bar', 'line', 'pie', 'area', 'row', 'scatter', 'funnel'. Use requested chart types like 'line', 'bar', 'area', 'pie', 'scatter', 'funnel', 'row', or 'table' when they fit the query. Omitting this field falls back to Metabase's default table display, so do not omit it for chart or graph requests. Only omit it when you intentionally want a plain table and the user did not request a chart type."}
    [:maybe [:enum "table" "bar" "line" "pie" "area" "row" "scatter" "funnel"]]]])

(mu/defn ^{:tool-name "construct-notebook-query"
           :scope     scope/agent-notebook-create}
  slackbot-construct-notebook-query-tool
  "Construct a notebook query from a metric, model, or table. The query results will be rendered as a visualization in Slack."
  [{:keys [_reasoning query title display]} :- slackbot-query-schema]
  (try
    (let [query-result (construct/execute-query query)
          structured   (or (:structured-output query-result) (:structured_output query-result))]
      (if (and structured (:query-id structured) (:query structured))
        (let [metabase-link (streaming/query->question-url (:query structured))
              adhoc-viz-value (cond-> {:query (:query structured)
                                       :link  metabase-link}
                                title   (assoc :title title)
                                display (assoc :display display))]
          {:structured-output structured
           :instructions (str "Query created. The visualization will be posted as a separate "
                              "follow-up message in the thread with the query results. "
                              "Use future tense when referring to results — they haven't "
                              "appeared yet when the user sees your text.")
           :data-parts [(streaming/adhoc-viz-part adhoc-viz-value)]})
        query-result))
    (catch Exception e
      (log/error e "Failed to construct slackbot notebook query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to construct notebook query: " (or (ex-message e) "Unknown error"))}))))
