(ns metabase.metabot.tools.slackbot-query
  "Slackbot-specific notebook query tool.
  Like construct-notebook-query-tool but emits adhoc_viz data parts
  instead of creating charts. Does not save or navigate.

  Per `repr-plan.md` step 14, this tool now consumes the same MBQL 5 representations YAML
  format as the main `construct_notebook_query` tool (and shares its prompt). The legacy
  sexp-in-array `program` shape is gone from the slackbot path; the only remaining caller of
  the sexp pipeline is the HTTP `/v2/construct-query` endpoint in `agent_api/api.clj`, which
  migrates in step 15."
  (:require
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.construct :as construct]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private slackbot-query-schema
  "Slackbot variant of `construct_notebook_query`. Same self-describing YAML query as the main
  tool (`:query` is a YAML string in the canonical MBQL 5 representations format), plus
  `:title` and `:display` for the Slack visualization wrapper.

  Per `repr-plan.md` step 13, the YAML carries the database identity in its top-level
  `database:` field, so the schema deliberately omits `:source_entity` and
  `:referenced_entities`."
  [:map {:closed true}
   [:reasoning :string]
   [:query :string]
   [:title {:optional true} [:maybe :string]]
   [:display {:optional true
              :description "Visualization type for displaying the query results in Slack. Required in practice whenever the user asks for a chart or graph, and it must match any requested chart type. Valid values: 'table', 'bar', 'line', 'pie', 'area', 'row', 'scatter', 'funnel'. Use requested chart types like 'line', 'bar', 'area', 'pie', 'scatter', 'funnel', 'row', or 'table' when they fit the query. Omitting this field falls back to Metabase's default table display, so do not omit it for chart or graph requests. Only omit it when you intentionally want a plain table and the user did not request a chart type."}
    [:maybe [:enum "table" "bar" "line" "pie" "area" "row" "scatter" "funnel"]]]])

(mu/defn ^{:tool-name "construct_notebook_query"
           :scope     scope/agent-notebook-create}
  slackbot-construct-notebook-query-tool
  "Construct a notebook query from a metric, model, or table. The query results will be
  rendered as a visualization in Slack.

  See `resources/metabot/prompts/tools/construct_notebook_query.md` for the YAML format the
  `:query` argument must follow — the prompt is shared with the main `construct_notebook_query`
  tool."
  [{:keys [_reasoning query title display]} :- slackbot-query-schema]
  (try
    (let [query-result (construct/execute-representations-query query)
          structured   (or (:structured-output query-result) (:structured_output query-result))]
      (if (and structured (:query-id structured) (:query structured))
        (let [metabase-link (streaming/query->question-url (:query structured) display)
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
