(ns metabase.metabot.tools.document
  "Document-generation specific tool wrappers."
  (:require
   [metabase.metabot.scope :as scope]
   [metabase.metabot.table-utils :as table-utils]
   [metabase.metabot.tools.construct :as construct-tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.sql.create :as create-sql-query-tools]
   [metabase.query-processor.core :as qp]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.warehouses.core :as warehouses]))

(set! *warn-on-reflection* true)

(def ^:private chart-type-enum
  [:enum "table" "bar" "line" "pie" "sunburst" "area" "combo"
   "row" "pivot" "scatter" "waterfall" "sankey" "scalar"
   "smartscalar" "gauge" "progress" "funnel" "object" "map"])

(defn- parse-reference
  [[k v]]
  (let [reference (name k)]
    (when-let [[_ reference-type reference-id] (re-matches #"([^:]+):(.+)" reference)]
      {:reference reference
       :type      reference-type
       :id        reference-id
       :name      v})))

(defn- parse-int
  [value]
  (cond
    (int? value) value
    (and (string? value) (re-matches #"\d+" value)) (Integer/parseInt value)
    :else nil))

(defn- context-references
  []
  (or (get (shared/current-context) :references) {}))

(defn- referenced-database-ids
  [references]
  (into []
        (comp (map parse-reference)
              (filter #(= "database" (:type %)))
              (map (comp parse-int :id))
              (remove nil?))
        references))

(defn- sql-chart-error-output
  [instruction-text]
  (str "<result>\n"
       "SQL chart draft generation failed.\n"
       "</result>\n"
       "<instructions>\n"
       instruction-text
       "</instructions>"))

(defn- sql-validation-error-result
  [dialect error-message]
  (let [instruction-text (instructions/sql-validation-error-instructions dialect error-message)]
    {:output       (sql-chart-error-output instruction-text)
     :instructions instruction-text}))

(defn- query-processing-error-result
  [error-message]
  (let [instruction-text (str "The SQL query could not be processed by Metabase.\n"
                              "\n"
                              "Error details:\n"
                              error-message "\n"
                              "\n"
                              "Please fix the query and call `document_construct_sql_chart` again with corrected SQL.\n")]
    {:output       (sql-chart-error-output instruction-text)
     :instructions instruction-text}))

(defn- check-query
  "If the query is valid, return nil. If not, return the error message."
  [query]
  (try
    (qp/process-query query)
    nil
    (catch Exception e
      (ex-message e))))

(mu/defn ^{:tool-name "document_schema_collect"
           :scope     scope/agent-document-read}
  document-schema-collect-tool
  "Collects the schema of a database in order to construct a SQL query.

  **Usage:**
- Use this tool when the user is explicitly requesting to use SQL
- Use this tool when an existing model or metric does not answer the user's question.
- Do NOT use this tool if there is a model or metric that can answer the user's question
  unless the user is requesting SQL."
  [_args :- [:map {:closed true}]]
  (try
    (let [refs         (context-references)
          database-ids (referenced-database-ids refs)]
      (cond
        (empty? database-ids)
        {:output "You must `@` mention a database to use when not querying an existing model"}

        (< 1 (count database-ids))
        {:output "You can only `@` mention one database when generating SQL"}

        :else
        (let [database-id (first database-ids)
              db          (warehouses/get-database database-id)
              schema-ddl  (table-utils/schema-full database-id)
              output      (str "<result>\n"
                               "The database the user selected has this schema:\n"
                               "<database_schema>\n"
                               schema-ddl
                               "\n</database_schema>\n"
                               "</result>\n"
                               "<instructions>\n"
                               "NEXT: construct a SQL query based on the user's instructions and this schema.\n"
                               "THEN: call `document_construct_sql_chart` with SQL and chart settings.\n"
                               "SQL engine: " (:engine db) ".\n"
                               "</instructions>")]
          {:output output
           :structured-output {:database_id database-id
                               :sql_engine  (:engine db)}})))
    (catch Exception e
      (log/error e "Error collecting document schema")
      {:output (str "Failed to collect schema: " (or (ex-message e) "Unknown error"))})))

(def ^:private sql-chart-schema
  [:map {:closed true}
   [:database_id :int]
   [:name :string]
   [:description :string]
   [:analysis :string]
   [:approach :string]
   [:sql :string]
   [:viz_settings [:map {:closed true}
                   [:chart_type chart-type-enum]]]])

(mu/defn ^{:tool-name "document_construct_sql_chart"
           :scope     scope/agent-document-create}
  document-construct-sql-chart-tool
  "Construct SQL-backed chart draft payload for document insertion."
  [{:keys [database_id name description analysis approach sql viz_settings]} :- sql-chart-schema]
  (try
    (let [{:keys [validation-result action-result]}
          (create-sql-query-tools/create-sql-query {:database-id database_id
                                                    :sql sql})
          {:keys [valid? dialect error-message]} validation-result
          {:keys [query-id query]} action-result
          chart-type (get viz_settings :chart_type)]
      (cond
        (not valid?)
        (sql-validation-error-result dialect error-message)

        (not (map? query))
        {:output "Failed to construct SQL chart draft."}

        :else
        (if-let [query-error (check-query query)]
          (query-processing-error-result query-error)
          (let [structured {:tool          "document_construct_sql_chart"
                            :name          name
                            :description   description
                            :analysis      analysis
                            :approach      approach
                            :dataset_query query
                            :display       chart-type
                            :chart_type    chart-type
                            :query_id      query-id
                            :query         query
                            :result-type   :chart-draft}]
            {:output "Draft chart payload generated from SQL query."
             :structured-output structured
             :final-response? true}))))
    (catch Exception e
      (log/error e "Error constructing SQL chart draft")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to construct SQL chart draft: " (or (ex-message e) "Unknown error"))}))))

(def ^:private model-chart-schema
  [:map {:closed true}
   [:name :string]
   [:description :string]
   [:source_entity [:map [:type :string] [:id :int]]]
   [:program :map]
   [:viz_settings [:map {:closed true}
                   [:chart_type chart-type-enum]]]])

(mu/defn ^{:tool-name "document_construct_model_chart"
           :scope     scope/agent-document-create}
  document-construct-model-chart-tool
  "Construct notebook/model-backed chart draft payload for document insertion."
  [{:keys [name description source_entity program viz_settings]} :- model-chart-schema]
  (try
    (let [chart-type (get viz_settings :chart_type)
          result     (construct-tools/construct-notebook-query-tool
                      {:source_entity source_entity
                       :program program
                       :visualization {:chart_type chart-type}})
          structured (or (:structured-output result) (:structured_output result))
          query-id   (:query-id structured)
          dataset-query (:query structured)]
      (if (map? dataset-query)
        {:output "Draft chart payload generated from model/notebook query."
         :structured-output {:tool          "document_construct_model_chart"
                             :name          name
                             :description   description
                             :dataset_query dataset-query
                             :display       chart-type
                             :chart_type    chart-type
                             :query_id      query-id
                             :query         dataset-query
                             :result-type   :chart-draft}
         :final-response? true}
        ;; Preserve tool error messaging from construct_notebook_query path.
        (or result
            {:output "Failed to construct model chart draft."})))
    (catch Exception e
      (log/error e "Error constructing model chart draft")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to construct model chart draft: " (or (ex-message e) "Unknown error"))}))))
