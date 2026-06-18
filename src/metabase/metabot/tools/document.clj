(ns metabase.metabot.tools.document
  "Document-generation specific tool wrappers."
  (:require
   [metabase.metabot.scope :as scope]
   [metabase.metabot.table-utils :as table-utils]
   [metabase.metabot.tools.construct :as construct-tools]
   [metabase.metabot.tools.entity-usage :as entity-usage]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.sql.common :as metabot.tools.sql.common]
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

(defn- schema-collect-entity-usage
  "Build `:entity-usage` for `document_schema_collect`: the resolved database as
  input (or empty on the no-/multi-database error branches)."
  [database-id]
  {:input  (if (some? database-id)
             [{:type "database" :id database-id}]
             [])
   :output []})

(mu/defn ^{:tool-name "document_schema_collect"
           :tool-type :inspection
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
        (entity-usage/entity-usage-on-result
         {:output "You must `@` mention a database to use when not querying an existing model"}
         (schema-collect-entity-usage nil))

        (< 1 (count database-ids))
        (entity-usage/entity-usage-on-result
         {:output "You can only `@` mention one database when generating SQL"}
         (schema-collect-entity-usage nil))

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
           :structured-output {:database_id  database-id
                               :sql_engine   (:engine db)
                               :entity-usage (schema-collect-entity-usage database-id)}})))
    (catch Exception e
      (log/error e "Error collecting document schema")
      (entity-usage/entity-usage-on-result
       {:output (str "Failed to collect schema: " (or (ex-message e) "Unknown error"))}
       (schema-collect-entity-usage nil)))))

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

(defn- sql-chart-entity-usage
  "Like `entity-usage-for-sql`: database + `{{#N}}` card refs (2-arity), plus
  pre-resolved table refs on the valid branch (3-arity)."
  ([database-id sql]
   (sql-chart-entity-usage database-id sql nil))
  ([database-id sql table-refs]
   {:input  (-> [{:type "database" :id database-id}]
                (into (metabot.tools.sql.common/card-refs-in-sql sql))
                (into table-refs))
    :output []}))

(mu/defn ^{:tool-name "document_construct_sql_chart"
           :tool-type :authoring
           :scope     scope/agent-document-create}
  document-construct-sql-chart-tool
  "Construct SQL-backed chart draft payload for document insertion."
  [{:keys [database_id name description analysis approach sql viz_settings]} :- sql-chart-schema]
  (let [entity-usage (sql-chart-entity-usage database_id sql)]
    (try
      (let [{:keys [validation-result action-result]}
            (create-sql-query-tools/create-sql-query {:database-id database_id
                                                      :sql sql})
            {:keys [valid? dialect error-message]} validation-result
            {:keys [query-id query]} action-result
            chart-type (get viz_settings :chart_type)
            attach-eu  (fn [r] (entity-usage/entity-usage-on-result r entity-usage))]
        (cond
          (not valid?)
          (entity-usage/stamp-artifact-valid
           (attach-eu (sql-validation-error-result dialect error-message)) false)

          (not (map? query))
          (entity-usage/stamp-artifact-valid
           (attach-eu {:output "Failed to construct SQL chart draft."}) false)

          :else
          (if-let [query-error (check-query query)]
            (entity-usage/stamp-artifact-valid
             (attach-eu (query-processing-error-result query-error)) false)
            (let [entity-usage (sql-chart-entity-usage
                                database_id sql
                                (metabot.tools.sql.common/native-physical-table-refs database_id sql))
                  structured {:tool          "document_construct_sql_chart"
                              :name          name
                              :description   description
                              :analysis      analysis
                              :approach      approach
                              :dataset_query query
                              :display       chart-type
                              :chart_type    chart-type
                              :query_id      query-id
                              :query         query
                              :result-type   :chart-draft
                              :entity-usage  entity-usage}]
              (entity-usage/stamp-artifact-valid
               {:output "Draft chart payload generated from SQL query."
                :structured-output structured
                :final-response? true}
               true)))))
      (catch Exception e
        (if (:agent-error? (ex-data e))
          ;; Agent error: relay the message and stamp the artifact invalid (not the :error channel).
          (-> (entity-usage/entity-usage-on-result {:output (ex-message e)} entity-usage)
              (entity-usage/stamp-artifact-valid false))
          (do
            (log/error e "Error constructing SQL chart draft")
            (-> (entity-usage/entity-usage-on-result
                 {:output (str "Failed to construct SQL chart draft: " (or (ex-message e) "Unknown error"))}
                 entity-usage)
                (entity-usage/stamp-artifact-valid false))))))))

(def ^:private model-chart-schema
  "Schema for `document_construct_model_chart`. Mirrors `construct_notebook_query`'s
  representations format: `:query` is a YAML string in MBQL 5 representations format.

  Per `repr-plan.md` step 13, `:source_entity` is no longer part of the contract — the YAML
  query is self-describing (carries `database:` at the top level and full portable FK paths
  everywhere else)."
  [:map {:closed true}
   [:name :string]
   [:description :string]
   [:query :string]
   [:viz_settings [:map {:closed true}
                   [:chart_type chart-type-enum]]]])

(mu/defn ^{:tool-name "document_construct_model_chart"
           :tool-type :authoring
           :scope     scope/agent-document-create}
  document-construct-model-chart-tool
  "Construct notebook/model-backed chart draft payload for document insertion."
  [{:keys [name description query viz_settings]} :- model-chart-schema]
  (try
    (let [chart-type (get viz_settings :chart_type)
          result     (construct-tools/construct-notebook-query-tool
                      {:query query
                       :visualization {:chart_type chart-type}})
          structured (or (:structured-output result) (:structured_output result))
          query-id   (:query-id structured)
          dataset-query (:query structured)
          entity-usage  (get structured :entity-usage construct-tools/empty-entity-usage)]
      (if (map? dataset-query)
        (entity-usage/stamp-artifact-valid
         {:output "Draft chart payload generated from model/notebook query."
          :structured-output {:tool          "document_construct_model_chart"
                              :name          name
                              :description   description
                              :dataset_query dataset-query
                              :display       chart-type
                              :chart_type    chart-type
                              :query_id      query-id
                              :query         dataset-query
                              :result-type   :chart-draft
                              :entity-usage  entity-usage}
          :final-response? true}
         true)
        ;; Preserve construct_notebook_query's error messaging. A nil dataset-query means the
        ;; inner call returned an agent-input error (not a throw) — an authoring miss.
        (-> (entity-usage/entity-usage-on-result
             (or result {:output "Failed to construct model chart draft."})
             entity-usage)
            (entity-usage/stamp-artifact-valid false))))
    (catch Exception e
      (if (:agent-error? (ex-data e))
        ;; Agent error: relay the message and stamp the artifact invalid (not the :error channel).
        (-> (entity-usage/entity-usage-on-result {:output (ex-message e)} construct-tools/empty-entity-usage)
            (entity-usage/stamp-artifact-valid false))
        (do
          (log/error e "Error constructing model chart draft")
          (-> (entity-usage/entity-usage-on-result
               {:output (str "Failed to construct model chart draft: " (or (ex-message e) "Unknown error"))}
               construct-tools/empty-entity-usage)
              (entity-usage/stamp-artifact-valid false)))))))
