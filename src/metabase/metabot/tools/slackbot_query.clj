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

(def ^:private tool-description
  "What the model is told this tool is. The `:query` contract is the main tool's; only what happens
  to the result differs."
  (str
   "Construct a notebook query from a metric, model, or table. The query results will be\n"
   "rendered as a visualization in Slack.\n"
   "\n"
   "See `resources/metabot/prompts/tools/construct_notebook_query.md` for the JSON format the\n"
   "`:query` argument must follow — the prompt is shared with the main `construct_notebook_query`\n"
   "tool."))

(def ^:private instruction-text
  "Slack posts the visualization as its own follow-up message, so the model has to write as though
  the results are not on screen yet."
  (str "Use future tense when referring to results — they haven't appeared yet when the user sees "
       "your text."))

(defrecord SlackbotConstructNotebookQueryTool []
  tools/Tool
  (declaration [_]
    {:name        "construct_notebook_query"
     :description tool-description
     :scope       scope/agent-notebook-create
     :args        slackbot-query-schema})

  (handle [_ {:keys [query title display]} _ctx]
    (let [structured (:structured-output (tools/with-pipeline-errors
                                           (construct/execute-representations-query query)))
          viz        (cond-> {:query (:query structured)
                              :link  (streaming/query->question-url (:query structured) display)}
                       title   (assoc :title title)
                       display (assoc :display display))]
      ;; Before, this returned `:instructions` and no `:output`, so the adapters fell back to
      ;; printing the whole result map — the model was shown the EDN of the resolved query as well
      ;; as the sentence. `:output` is the only thing the model reads now.
      {:output            (str "<result>\n"
                               "Query created. The visualization will be posted as a separate "
                               "follow-up message in the thread with the query results.\n"
                               "</result>\n"
                               "<instructions>\n" instruction-text "\n</instructions>")
       :structured-output structured
       :data-parts        [(streaming/adhoc-viz-part viz)]})))

(def slackbot-construct-notebook-query-tool
  "`construct_notebook_query` for the Slackbot profile: same pipeline, no saved chart, and the
  visualization leaves as an adhoc-viz data part."
  (->SlackbotConstructNotebookQueryTool))
