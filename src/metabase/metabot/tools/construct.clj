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
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-representations :as llm-rep]
   [metabase.metabot.tools.util :as tools.u]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Schema ------------------------------------------------

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
   [:chart_type :string]])

(def ^:private construct-notebook-query-args-schema
  [:map {:closed true}
   [:reasoning {:optional true} :string]
   [:program construct-program-schema]
   [:visualization {:optional true} construct-visualization-schema]])

;;; ---------------------------------------- Source resolution ----------------------------------------

(defn- resolve-source-database-id
  "Resolve the database ID for a program source."
  [{:keys [type id]}]
  (case type
    "table"            (:db_id (tools.u/get-table id :db_id))
    ("card" "dataset") (:database_id (tools.u/get-card id))
    "metric"           (:database_id (tools.u/get-card id))
    (throw (ex-info (str "Unsupported source type: " type)
                    {:agent-error? true :status-code 400}))))

(defn- build-evaluation-context
  "Build the EvaluationContext for agent-lib from a program source."
  [source metadata-provider]
  (let [{:keys [type id]} source
        model-str (case type
                    "table"            "table"
                    ("card" "dataset") "card"
                    "metric"           "metric"
                    type)
        ;; Get surrounding tables for join context
        surrounding-tables (when (= type "table")
                             (let [table-query (lib/query metadata-provider (lib.metadata/table metadata-provider id))]
                               (->> (lib/visible-columns table-query)
                                    (keep :table-id)
                                    distinct
                                    (remove #{id})
                                    (mapv (fn [tid] {:id tid})))))
        ;; Source metadata for the runtime 'source binding
        source-metadata (case type
                          "table"            (lib.metadata/table metadata-provider id)
                          ("card" "dataset") (lib.metadata/card metadata-provider id)
                          "metric"           (lib.metadata/card metadata-provider id)
                          nil)]
    {:source-entity       {:model model-str :id id}
     :referenced-entities []
     :surrounding-tables  (or surrounding-tables [])
     :source-metadata     source-metadata}))

;;; ---------------------------------------- Result columns ----------------------------------------

(defn- result-columns-for-query
  "Generate result columns from a pMBQL query for LLM consumption."
  [pmbql-query metadata-provider]
  (let [query (lib/query metadata-provider pmbql-query)
        cols  (lib/returned-columns query)]
    (mapv #(tools.u/->result-column query %) cols)))

;;; ---------------------------------------- Query execution ----------------------------------------

(defn execute-program
  "Execute a structured program via agent-lib.
  Returns the raw result map with :structured-output.
  Shared between construct-notebook-query-tool and slackbot-construct-notebook-query-tool."
  [program]
  (let [source      (:source program)
        database-id (resolve-source-database-id source)
        mp          (lib-be/application-database-metadata-provider database-id)
        context     (build-evaluation-context source mp)
        pmbql-query (agent-lib/evaluate-program program mp context)
        query-id    (u/generate-nano-id)]
    {:structured-output {:query-id       query-id
                         :query          pmbql-query
                         :result-columns (result-columns-for-query pmbql-query mp)}
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

;;; ---------------------------------------- Main tool ----------------------------------------

(mu/defn ^{:tool-name "construct_notebook_query"
           :scope     scope/agent-notebook-create}
  construct-notebook-query-tool
  "Construct and visualize a notebook query from a metric, model, or table."
  [{:keys [_reasoning program visualization]} :- construct-notebook-query-args-schema]
  (try
    (let [;; LLM sometimes nests visualization inside program — pull it out
          effective-viz            (or visualization (:visualization program))
          normalized-visualization (some-> effective-viz (update-keys (comp keyword u/->kebab-case-en name)))
          chart-type              (or (chart-type->keyword (:chart-type normalized-visualization))
                                     :table)
          query-result            (execute-program (dissoc program :visualization))
          structured              (or (:structured-output query-result) (:structured_output query-result))]
      (if (and structured (:query-id structured) (:query structured))
        (let [chart-result (create-chart-tools/create-chart
                            {:query-id      (:query-id structured)
                             :chart-type    chart-type
                             :queries-state {(:query-id structured) (:query structured)}})
              navigate-url (get-in chart-result [:reactions 0 :url])
              full-structured (assoc structured
                                     :result-type   :query
                                     :chart-id      (:chart-id chart-result)
                                     :chart-type    (:chart-type chart-result)
                                     :chart-link    (:chart-link chart-result)
                                     :chart-content (:chart-content chart-result))
              instruction-text
              (let [link (te/link "Chart" "metabase://chart/" (:chart-id chart-result))]
                (te/lines
                 "Your query and chart have been created successfully."
                 ""
                 "Next steps to present the chart to the user:"
                 (str "- Always provide a direct link using: `" link "` where Chart is a meaningful link text")
                 "- If creating multiple charts, present all chart links"))
              chart-xml (structured->chart-xml structured (:chart-id chart-result) chart-type)]
          {:output (str "<result>\n" chart-xml "\n</result>\n"
                        "<instructions>\n" instruction-text "\n</instructions>")
           :data-parts        (when navigate-url
                                [(streaming/navigate-to-part navigate-url)])
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
