(ns metabase.llm.api
  "API endpoints for LLM-powered SQL generation (OSS)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.llm.context :as llm.context]
   [metabase.llm.openai :as llm.openai]
   [metabase.llm.settings :as llm.settings]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2])
  (:import
   (java.time LocalDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Logging ------------------------------------------------

(def ^:private log-dir "logs/oss-sqlgen")

(def ^:private timestamp-formatter
  (DateTimeFormatter/ofPattern "yyyyMMdd_HHmmss_SSS"))

(defn- current-timestamp
  "Generate a timestamp string for log filenames."
  []
  (.format (LocalDateTime/now) timestamp-formatter))

(defn- ensure-log-dir!
  "Ensure the log directory exists."
  []
  (.mkdirs (io/file log-dir)))

(defn- log-to-file!
  "Write content to a log file. Returns the filename written."
  [filename content]
  (ensure-log-dir!)
  (let [filepath (str log-dir "/" filename)]
    (spit filepath content)
    filepath))

;;; -------------------------------------------- Database Dialect --------------------------------------------

(def ^:private engine->dialect
  "Map of database engine keywords to human-readable dialect names."
  {:postgres   "PostgreSQL"
   :mysql      "MySQL"
   :h2         "H2"
   :sqlserver  "SQL Server"
   :oracle     "Oracle"
   :bigquery   "BigQuery"
   :snowflake  "Snowflake"
   :redshift   "Amazon Redshift"
   :sqlite     "SQLite"
   :presto     "Presto"
   :sparksql   "Spark SQL"
   :clickhouse "ClickHouse"
   :vertica    "Vertica"
   :mongo      "MongoDB"})

(defn- database-dialect
  "Get the SQL dialect name for a database."
  [database-id]
  (when database-id
    (let [engine (t2/select-one-fn :engine :model/Database :id database-id)]
      (or (get engine->dialect engine)
          (some-> engine name str/capitalize)
          "SQL"))))

;;; -------------------------------------------- System Prompt --------------------------------------------

(defn- build-system-prompt
  "Build the system prompt for SQL generation with dialect and schema context."
  [dialect schema-ddl]
  (str "You are a SQL query generator for a " dialect " database.

Your task is to convert natural language questions into valid SQL queries.

## Available Tables

" schema-ddl "

## Instructions

1. Generate ONLY the SQL query, no explanations or markdown formatting
2. Use only the tables and columns shown above
3. Use " dialect " syntax specifically
4. If the request is ambiguous, make reasonable assumptions
5. If the request is impossible with the available schema, respond with: ERROR: <brief explanation>

## Output Format

Return only the raw SQL query, nothing else."))

;;; ------------------------------------------ Response Formatting ------------------------------------------

(defn- make-code-edit-part
  "Create an AI SDK v5 data part for a code edit suggestion."
  [buffer-id sql]
  {:type    "code_edit"
   :version 1
   :value   {:buffer_id buffer-id
             :mode      "rewrite"
             :value     sql}})

(api.macros/defendpoint :post "/generate-sql"
  "Generate SQL from a natural language prompt.

   Requires:
   - LLM to be configured (OpenAI API key set in admin settings)
   - At least one table mention in the prompt using [Name](metabase://table/ID) format
   - A database_id parameter

   Returns AI SDK v5 data part format for frontend compatibility."
  [_route-params
   _query-params
   body :- [:map
            [:prompt :string]
            [:database_id pos-int?]
            [:buffer_id {:optional true} :string]]]
  :- [:map
      [:parts [:sequential [:map
                            [:type :string]
                            [:version pos-int?]
                            [:value :map]]]]]
  ;; 1. Validate LLM is configured
  (when-not (llm.settings/llm-enabled?)
    (throw (ex-info (tru "LLM SQL generation is not configured. Please set an OpenAI API key in admin settings.")
                    {:status-code 403})))

  (let [{:keys [prompt database_id buffer_id]} body
        buffer-id (or buffer_id "qb")
        ;; 2. Parse table mentions from prompt
        table-ids (llm.context/parse-table-mentions prompt)]

    ;; 3. Validate at least one table is mentioned
    (when (empty? table-ids)
      (throw (ex-info (tru "No tables mentioned in prompt. Use @mentions to specify tables.")
                      {:status-code 400})))

    ;; 4. Fetch schema context for mentioned tables
    (let [schema-ddl (llm.context/build-schema-context database_id table-ids)]
      (when-not schema-ddl
        (throw (ex-info (tru "No accessible tables found. Check table permissions.")
                        {:status-code 400})))

      ;; 5. Get database dialect and build system prompt
      (let [dialect       (database-dialect database_id)
            system-prompt (build-system-prompt dialect schema-ddl)
            timestamp     (current-timestamp)]

        ;; 6. Log the system prompt
        (log-to-file! (str timestamp "_prompt.txt") system-prompt)

        ;; 7. Call LLM
        (let [sql (llm.openai/chat-completion
                   {:system   system-prompt
                    :messages [{:role "user" :content prompt}]})]

          ;; 8. Log the response
          (log-to-file! (str timestamp "_response.txt") sql)

          ;; 9. Return AI SDK formatted result
          {:parts [(make-code-edit-part buffer-id sql)]})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/llm` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
