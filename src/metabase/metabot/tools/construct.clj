(ns metabase.metabot.tools.construct
  "Notebook query construction tool wrappers."
  (:require
   [metabase.agent-lib.core :as agent-lib]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.charts.create :as create-chart-tools]
   [metabase.metabot.tools.query-results :as query-results]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-representations :as llm-rep]
   [metabase.metabot.tools.util :as tools.u]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Schema ------------------------------------------------

(def ^:private source-entity-schema
  "Schema for source_entity — identifies the primary data source."
  [:map
   [:type [:enum "table" "model" "question" "metric"]]
   [:id :int]])

(def construct-program-schema
  "Schema for the program parameter of construct_notebook_query.
  Intentionally loose — agent-lib validates and repairs internally."
  [:map
   [:source [:map
             [:type :string]
             [:id {:optional true} [:maybe :int]]
             [:ref {:optional true} [:maybe :string]]]]
   [:operations [:sequential [:sequential :any]]]])

(def ^:private construct-visualization-schema
  [:map {:closed true}
   [:chart_type :string]
   [:name {:optional true
           :description "A concise, user-facing name for the generated chart."}
    [:maybe :string]]])

(def ^:private construct-notebook-query-args-schema
  [:map {:closed true}
   [:reasoning {:optional true} :string]
   [:source_entity source-entity-schema]
   [:referenced_entities {:optional true} [:maybe [:sequential source-entity-schema]]]
   [:program construct-program-schema]
   [:visualization {:optional true} construct-visualization-schema]])

(def ^:private silent-execute-notebook-query-args-schema
  [:map {:closed true}
   [:reasoning {:optional true} :string]
   [:source_entity source-entity-schema]
   [:referenced_entities {:optional true} [:maybe [:sequential source-entity-schema]]]
   [:program construct-program-schema]])

;;; ---------------------------------------- Source resolution ----------------------------------------

(defn- resolve-source-database-id
  "Resolve the database ID for a source_entity."
  [{:keys [type id]}]
  (case type
    "table"                (:db_id (tools.u/get-table id :db_id))
    ("model" "question")   (:database_id (tools.u/get-card id))
    "metric"               (:database_id (tools.u/get-card id))
    (throw (ex-info (str "Unsupported source_entity type: " type)
                    {:agent-error? true :status-code 400}))))

(defn- source-entity->model-str
  "Map source_entity type to the model string used by agent-lib evaluation context."
  [type]
  (case type
    "table"      "table"
    "model"      "dataset"
    "question"   "card"
    "metric"     "metric"
    type))

(defn program-source->source-entity
  "Convert a structured-program `:source` map (using agent-lib model strings: `table`,
  `card`, `dataset`, `metric`) into the `source-entity` shape consumed by
  [[execute-program]] (using metabot type strings: `table`, `question`, `model`,
  `metric`). Throws if the source isn't one of the four database-resolved types
  (e.g. `context` or nested `program` sources are rejected)."
  [{:keys [type id] :as source}]
  (let [entity-type (case type
                      "table"   "table"
                      "card"    "question"
                      "dataset" "model"
                      "metric"  "metric"
                      (throw (ex-info (str "Unsupported program source type: " (pr-str type))
                                      {:agent-error? true
                                       :status-code  400
                                       :source       source})))]
    {:type entity-type :id id}))

(defn- source-metadata-for
  "Resolve the lib metadata object for a source entity."
  [type id metadata-provider]
  (case type
    "table"              (lib.metadata/table metadata-provider id)
    ("model" "question") (lib.metadata/card metadata-provider id)
    "metric"             (lib.metadata/card metadata-provider id)
    nil))

(defn- surrounding-tables-for
  "Derive surrounding tables from a source query's visible columns."
  [metadata-provider source-metadata source-id]
  (try
    (let [query (lib/query metadata-provider source-metadata)]
      (->> (lib/visible-columns query)
           (keep :table-id)
           distinct
           (remove #{source-id})
           (mapv (fn [tid] {:id tid}))))
    (catch Exception _ [])))

(defn- available-measure-ids
  "Return the set of measure IDs available on a source entity, or empty set."
  [metadata-provider source-metadata]
  (try
    (->> (lib/available-measures (lib/query metadata-provider source-metadata))
         (keep :id)
         set)
    (catch Exception _ #{})))

(defn- build-evaluation-context
  "Build the EvaluationContext for agent-lib from source_entity and referenced_entities."
  [{:keys [type id]} referenced-entities metadata-provider]
  (let [model-str      (source-entity->model-str type)
        source-metadata (source-metadata-for type id metadata-provider)
        surrounding     (surrounding-tables-for metadata-provider source-metadata id)
        measure-ids     (available-measure-ids metadata-provider source-metadata)]
    {:source-entity       {:model model-str :id id}
     :referenced-entities (or (mapv (fn [{:keys [type id]}]
                                      {:model (source-entity->model-str type) :id id})
                                    referenced-entities)
                              [])
     :surrounding-tables  surrounding
     :measure-ids         measure-ids
     :source-metadata     source-metadata}))

;;; ---------------------------------------- Result columns ----------------------------------------

(defn- result-columns-for-query
  "Generate result columns from a MBQL 5 query for LLM consumption."
  [mbql5-query metadata-provider]
  (let [query (lib/query metadata-provider mbql5-query)
        cols  (lib/returned-columns query)]
    (mapv #(tools.u/->result-column query %) cols)))

;;; ---------------------------------------- Query execution ----------------------------------------

(defn execute-program
  "Execute a structured program via agent-lib.
  Returns the raw result map with :structured-output.
  Shared between construct-notebook-query-tool and slackbot-construct-notebook-query-tool."
  [source-entity referenced-entities program]
  (let [database-id (resolve-source-database-id source-entity)
        mp          (lib-be/application-database-metadata-provider database-id)
        context     (build-evaluation-context source-entity referenced-entities mp)
        mbql5-query (agent-lib/evaluate-program program mp context)
        query-id    (u/generate-nano-id)]
    {:structured-output {:query-id       query-id
                         :query          mbql5-query
                         :result-columns (result-columns-for-query mbql5-query mp)}
     :instructions      (instructions/query-created-instructions-for query-id)}))

;;; ---------------------------------------- Chart helpers ----------------------------------------

(defn- chart-type->keyword
  [chart-type]
  (cond
    (keyword? chart-type) chart-type
    (string? chart-type)  (keyword chart-type)
    :else                 chart-type))

(defn- structured->query-data
  "Convert tool structured output to a map suitable for [[llm-rep/query->xml]].
  Converts the MBQL 5 query to legacy MBQL, JSON-encodes it, and wraps result columns."
  [{:keys [query-id query result-columns]}]
  (let [legacy-query (when (and (map? query) (:lib/type query))
                       #_{:clj-kondo/ignore [:discouraged-var]}
                       (lib/->legacy-MBQL query))]
    {:query-type    "notebook"
     :query-id      query-id
     :database_id   (:database legacy-query)
     :query-content (when legacy-query (json/encode legacy-query))
     :result        (when (seq result-columns)
                      {:result_columns result-columns})}))

(defn- structured->chart-xml
  "Render the full chart XML for the construct_notebook_query tool result."
  [structured chart-id chart-type]
  (llm-rep/visualization->xml
   {:chart-id               chart-id
    :queries                [(structured->query-data structured)]
    :visualization_settings {:chart_type (if chart-type (name chart-type) "table")}}))

(defn- silent-execution-output
  [execution-output]
  (te/lines
   "<result>"
   execution-output
   "</result>"
   "<instructions>"
   "Use these query results to answer the user. Do not create or mention a chart link for this silent inspection query."
   "If the results are a representative sample, you may cite the sampled values — including the minimum and maximum — but use a follow-up aggregate query for any exact count, ranking, or total that requires the full result."
   "When mentioning a specific value from the result, use the matching metabase://data-point URL from the linked result value and choose natural link text for your answer."
   "</instructions>"))

;;; ---------------------------------------- Main tool ----------------------------------------

(mu/defn ^{:tool-name "execute_notebook_query_silently"
           :scope     scope/agent-query-execute}
  execute-notebook-query-silently-tool
  "Construct and execute a notebook query for agent-only inspection without creating a chart or visualization."
  [{:keys [_reasoning source_entity referenced_entities program]} :- silent-execute-notebook-query-args-schema]
  (try
    (let [query-result (execute-program source_entity referenced_entities (dissoc program :visualization))
          structured   (or (:structured-output query-result) (:structured_output query-result))]
      (if-let [query (:query structured)]
        (let [{:keys [output structured-output]} (query-results/format-untruncated-execution-result
                                                  (query-results/execute-query query))]
          (cond-> {:output (silent-execution-output output)
                   :instructions "Use these query results to answer the user. No chart or visualization was created."}
            structured-output (assoc :structured-output structured-output)))
        {:output "Failed to execute notebook query: no executable query was constructed."}))
    (catch Exception e
      (log/error e "Failed to silently execute notebook query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to execute notebook query: " (or (ex-message e) "Unknown error"))}))))

(mu/defn ^{:tool-name "construct_notebook_query"
           :scope     scope/agent-notebook-create}
  construct-notebook-query-tool
  "Construct and visualize a notebook query from a metric, model, or table."
  [{:keys [_reasoning source_entity referenced_entities program visualization]} :- construct-notebook-query-args-schema]
  (try
    (let [;; LLM sometimes nests visualization inside program — pull it out
          effective-viz            (or visualization (:visualization program))
          normalized-visualization (some-> effective-viz (update-keys (comp keyword u/->kebab-case-en name)))
          chart-type              (or (chart-type->keyword (:chart-type normalized-visualization))
                                      :table)
          chart-name              (:name normalized-visualization)
          query-result            (execute-program source_entity referenced_entities (dissoc program :visualization))
          structured              (or (:structured-output query-result) (:structured_output query-result))]
      (if (and structured (:query-id structured) (:query structured))
        (let [chart-result (create-chart-tools/create-chart
                            {:query-id      (:query-id structured)
                             :chart-type    chart-type
                             :title         chart-name
                             :queries-state {(:query-id structured) (:query structured)}})
              adhoc-viz-value {:query   (:query structured)
                               :link    (:chart-url chart-result)
                               :title   (:chart-name chart-result)
                               :display (name chart-type)}
              full-structured (assoc structured
                                     :result-type   :query
                                     :chart-id      (:chart-id chart-result)
                                     :chart-name    (:chart-name chart-result)
                                     :chart-type    (:chart-type chart-result)
                                     :chart-link    (:chart-link chart-result)
                                     :chart-content (:chart-content chart-result))
              instruction-text
              (let [link (te/link (:chart-name chart-result) "metabase://chart/" (:chart-id chart-result))]
                (te/lines
                 "Your query and chart have been created successfully."
                 ""
                 "Next steps to present the chart to the user:"
                 "- Use the <query_execution> block in this tool result to inspect the executed chart data"
                 "- Proactively mention one concrete observation from the data, such as a trend, outlier, or notable category"
                 (str "- " instructions/distribution-guidance)
                 "- When <query_execution> is marked sampled=\"true\", it is a representative sample of the chart's own rows (minimum, maximum, outliers, and evenly spaced trend points). Every sampled row is a real point on the user's chart, so you may cite the sampled values — including the minimum and maximum — and link them"
                 "- Only run execute_notebook_query_silently when you need an exact count, ranking, or aggregate that the sample cannot give. When you do, do it without asking permission first and do not produce a final answer until it returns"
                 "- When mentioning a specific value from the chart, use the matching metabase://data-point URL from the linked result value, and choose natural link text for your answer"
                 (str "- Always provide a direct link using: `" link "`")
                 "- If creating multiple charts, present all chart links"))
              chart-xml (structured->chart-xml structured (:chart-id chart-result) chart-type)]
          {:output (str "<result>\n" chart-xml "\n</result>\n"
                        "<instructions>\n" instruction-text "\n</instructions>")
           :data-parts        [(streaming/adhoc-viz-part adhoc-viz-value)]
           :structured-output full-structured
           :instructions      instruction-text})
        ;; query-result may already have :output (error) or only :structured-output
        (if-let [s (or (:structured-output query-result) (:structured_output query-result))]
          (let [query-xml        (llm-rep/query->xml (structured->query-data s))
                instruction-text (instructions/query-created-instructions-for (:query-id s))]
            (assoc query-result
                   :output (str "<result>\n" query-xml "\n</result>\n"
                                "<instructions>\n" instruction-text "\n</instructions>")))
          query-result)))
    (catch Exception e
      (log/error e "Failed to construct notebook query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to construct notebook query: " (or (ex-message e) "Unknown error"))}))))
