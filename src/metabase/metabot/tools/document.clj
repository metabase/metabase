(ns metabase.metabot.tools.document
  "Document-generation specific tool wrappers."
  (:require
   [metabase.metabot.scope :as scope]
   [metabase.metabot.table-utils :as table-utils]
   [metabase.metabot.tools.construct :as construct-tools]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.sql.common :as sql.common]
   [metabase.metabot.tools.sql.create :as create-sql-query-tools]
   [metabase.query-processor.core :as qp]
   [metabase.util.i18n :refer [tru]]
   [metabase.warehouses.core :as warehouses]))

(set! *warn-on-reflection* true)

(def ^:private chart-type-enum
  (into [:enum] shared/chart-types))

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

(defn- referenced-database-ids
  [references]
  (into []
        (comp (map parse-reference)
              (filter #(= "database" (:type %)))
              (map (comp parse-int :id))
              (remove nil?))
        references))

(defn- mentioned-database-id
  "Return the ID of the one database that the user `@`-mentioned, from the references in `ctx`.
  Throw an unrecoverable error, which ends the turn, when the user mentioned no database or more than one."
  [ctx]
  (let [references   (get-in (some-> (:memory-atom ctx) deref) [:context :references])
        database-ids (referenced-database-ids references)]
    (cond
      (empty? database-ids)
      (tools/unrecoverable! ::no-database-mentioned
                            {:user-message (tru "Mention a database with @ to create this chart with SQL.")})

      (next database-ids)
      (tools/unrecoverable! ::several-databases-mentioned
                            {:user-message (tru "Mention only one database with @ to create this chart with SQL.")
                             :data         {:database-ids database-ids}})

      :else
      (first database-ids))))

(defn- mentioned-database
  "Return the database with `database-id`. Throw an unrecoverable error, which ends the turn, when the database doesn't
  exist or the current user can't read it."
  [database-id]
  (try
    (warehouses/get-database database-id)
    (catch clojure.lang.ExceptionInfo e
      (if (contains? tools/refusal-status-codes (:status-code (ex-data e)))
        (tools/unrecoverable!
         ::database-unavailable
         {:user-message (tru "The database you mentioned wasn''t found, or you don''t have access to it.")
          :data         {:database-id database-id}
          :cause        e})
        (throw e)))))

(def ^:private schema-collect-description
  "Collects the schema of a database in order to construct a SQL query.

  **Usage:**
- Use this tool when the user is explicitly requesting to use SQL
- Use this tool when an existing model or metric does not answer the user's question.
- Do NOT use this tool if there is a model or metric that can answer the user's question
  unless the user is requesting SQL.")

(defrecord DocumentSchemaCollectTool []
  tools/Tool
  (declaration [_]
    {:name                 "document_schema_collect"
     :description          schema-collect-description
     :scope                scope/agent-document-read
     :metabot/capabilities #{:permission-write-sql-queries}
     :args                 [:map {:closed true}]})
  (handle [_ _args ctx]
    (let [database-id (mentioned-database-id ctx)
          db          (mentioned-database database-id)
          schema-ddl  (table-utils/schema-full database-id)]
      {:output            (str "<result>\n"
                               "The database the user selected has this schema:\n"
                               "<database_schema>\n"
                               schema-ddl
                               "\n</database_schema>\n"
                               "</result>\n"
                               "<instructions>\n"
                               "NEXT: construct a SQL query based on the user's instructions and this schema.\n"
                               "THEN: call `document_construct_sql_chart` with SQL and chart settings, passing "
                               "database_id=" database-id " (the id of the database above).\n"
                               "SQL engine: " (:engine db) ".\n"
                               "</instructions>")
       :structured-output {:database_id database-id
                           :sql_engine  (:engine db)}})))

(def document-schema-collect-tool
  "The `document_schema_collect` tool."
  (->DocumentSchemaCollectTool))

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

(defn- check-query!
  "Validate one row of `query`, throwing [[sql.common/query-failed!]] if it fails."
  [query]
  (try
    (qp/process-query (assoc query :constraints {:max-results 1 :max-results-bare-rows 1}))
    (catch Exception e
      (sql.common/query-failed! {:error-message (ex-message e)}))))

(defrecord DocumentConstructSqlChartTool []
  tools/Tool
  (declaration [_]
    {:name                 "document_construct_sql_chart"
     :description          "Construct SQL-backed chart draft payload for document insertion."
     :scope                scope/agent-document-create
     :metabot/capabilities #{:permission-write-sql-queries}
     :args                 sql-chart-schema})
  (handle [_ {:keys [database_id name description analysis approach sql viz_settings]} _ctx]
    (let [{:keys [validation-result action-result]}
          (create-sql-query-tools/create-sql-query {:database-id database_id
                                                    :sql sql})
          {:keys [valid? dialect error-message]} validation-result
          {:keys [query-id query]} action-result
          chart-type (get viz_settings :chart_type)]
      (when-not valid?
        (sql.common/sql-syntax-error! {:dialect dialect :error-message error-message}))
      (check-query! query)
      {:output            "Draft chart payload generated from SQL query."
       :structured-output {:tool          "document_construct_sql_chart"
                           :name          name
                           :description   description
                           :analysis      analysis
                           :approach      approach
                           :dataset_query query
                           :display       chart-type
                           :chart_type    chart-type
                           :query_id      query-id
                           :query         query
                           :result-type   :chart-draft}})))

(def document-construct-sql-chart-tool
  "The `document_construct_sql_chart` tool."
  (->DocumentConstructSqlChartTool))

(def ^:private model-chart-schema
  [:map {:closed true}
   [:name :string]
   [:description :string]
   [:query construct-tools/LLMQueryArgument]
   [:viz_settings [:map {:closed true}
                   [:chart_type chart-type-enum]]]])

(defrecord DocumentConstructModelChartTool []
  tools/Tool
  (declaration [_]
    {:name        "document_construct_model_chart"
     :description "Construct notebook/model-backed chart draft payload for document insertion."
     :scope       scope/agent-document-create
     :args        model-chart-schema})
  (handle [_ {:keys [name description query viz_settings]} ctx]
    (let [chart-type (get viz_settings :chart_type)
          {query-id :query-id dataset-query :query}
          (:structured-output (tools/call construct-tools/construct-notebook-query-tool
                                          {:query         query
                                           :title         name
                                           :description   description
                                           :visualization {:chart_type chart-type}}
                                          ctx))]
      {:output            "Draft chart payload generated from model/notebook query."
       :structured-output {:tool          "document_construct_model_chart"
                           :name          name
                           :description   description
                           :dataset_query dataset-query
                           :display       chart-type
                           :chart_type    chart-type
                           :query_id      query-id
                           :query         dataset-query
                           :result-type   :chart-draft}})))

(def document-construct-model-chart-tool
  "The `document_construct_model_chart` tool."
  (->DocumentConstructModelChartTool))
