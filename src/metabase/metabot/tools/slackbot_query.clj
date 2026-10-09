(ns metabase.metabot.tools.slackbot-query
  "Slackbot-specific notebook query tool.
  Like construct-notebook-query-tool but emits adhoc_viz data parts
  instead of creating charts. Does not save or navigate.

  This tool consumes the same MBQL 5 portable representations format (JSON, validated against
  `::lib.schema/external-query`) as the main `construct_notebook_query` tool and shares its
  prompt."
  (:require
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.core :as tools]))

(set! *warn-on-reflection* true)

(def ^:private slackbot-query-schema
  "Slackbot variant of `construct_notebook_query`. Same self-describing JSON query as the main
  tool (`:query` is a `::lib.schema/external-query` map), plus `:title` and `:display` for the
  Slack visualization wrapper.

  The query body carries the database identity via its first stage's `source-table:` /
  `source-card:`, so the schema deliberately omits `:source_entity` and `:referenced_entities`."
  [:map {:closed true}
   [:reasoning :string]
   [:query construct/LLMExternalQuery]
   [:title {:optional true} [:maybe :string]]
   [:display {:optional true
              :description "Visualization type for displaying the query results in Slack. Required in practice whenever the user asks for a chart or graph, and it must match any requested chart type. Valid values: 'table', 'bar', 'line', 'pie', 'area', 'row', 'scatter', 'funnel'. Use requested chart types like 'line', 'bar', 'area', 'pie', 'scatter', 'funnel', 'row', or 'table' when they fit the query. Omitting this field falls back to Metabase's default table display, so do not omit it for chart or graph requests. Only omit it when you intentionally want a plain table and the user did not request a chart type."}
    [:maybe [:enum "table" "bar" "line" "pie" "area" "row" "scatter" "funnel"]]]])

(defrecord SlackbotConstructNotebookQueryTool []
  tools/Tool
  (declaration [_]
    {:name        "construct_notebook_query"
     :description (str "Construct a notebook query from a metric, model, or table. The query results will be "
                       "rendered as a visualization in Slack.")
     :scope       scope/agent-notebook-create
     :args        slackbot-query-schema})
  (handle [_ {:keys [query title display]} _ctx]
    (let [{structured :structured-output} (tools/with-pipeline-errors
                                            (construct/execute-representations-query query))
          adhoc-viz-value                 (cond-> {:query (:query structured)
                                                   :link  (streaming/query->question-url (:query structured) display)}
                                            title   (assoc :title title)
                                            display (assoc :display display))]
      {:output            (str "Query created. The visualization will be posted as a separate "
                               "follow-up message in the thread with the query results. "
                               "Use future tense when referring to results — they haven't "
                               "appeared yet when the user sees your text.")
       :structured-output structured
       :data-parts        [(streaming/adhoc-viz-part adhoc-viz-value)]})))

(def slackbot-construct-notebook-query-tool
  "The Slackbot variant of the `construct_notebook_query` tool."
  (->SlackbotConstructNotebookQueryTool))
