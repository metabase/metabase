(ns metabase.llm.api
  "API endpoints for LLM-powered SQL generation (OSS)."
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.llm.context :as llm.context]
   [metabase.llm.openai :as llm.openai]
   [metabase.llm.settings :as llm.settings]
   [metabase.llm.streaming :as llm.streaming]
   [metabase.server.streaming-response :as sr]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [stencil.core :as stencil]
   [toucan2.core :as t2])
  (:import
   (java.io OutputStream)
   (java.nio.charset StandardCharsets)
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

(def ^:private engine->dialect-file
  "Map of database engine keywords to dialect instruction file names (without extension)."
  {:postgres   "postgresql"
   :mysql      "mysql"
   :h2         "h2"
   :sqlserver  "sqlserver"
   :oracle     "oracle"
   :bigquery   "bigquery"
   :snowflake  "snowflake"
   :redshift   "redshift"
   :sqlite     "sqlite"
   :clickhouse "clickhouse"
   :vertica    "vertica"
   :athena     "athena"
   :databricks "databricks"
   :druid      "druid"})

(defn- database-engine
  "Get the engine keyword for a database."
  [database-id]
  (when database-id
    (t2/select-one-fn :engine :model/Database :id database-id)))

(defn- database-dialect
  "Get the SQL dialect name for a database."
  [database-id]
  (let [engine (database-engine database-id)]
    (or (get engine->dialect engine)
        (some-> engine name str/capitalize)
        "SQL")))

(defn- load-dialect-instructions
  "Load dialect-specific instructions from resources, if available.
   Returns nil if no instructions file exists for the given engine."
  [engine]
  (when-let [dialect-file (get engine->dialect-file engine)]
    (let [resource-path (str "llm/prompts/dialects/" dialect-file ".md")]
      (when-let [resource (io/resource resource-path)]
        (slurp resource)))))

;;; -------------------------------------------- System Prompt --------------------------------------------

(def ^:private sql-generation-prompt-template "llm/prompts/sql-generation-system.mustache")

(def ^:private datetime-formatter
  (DateTimeFormatter/ofPattern "yyyy-MM-dd HH:mm:ss"))

(defn- current-datetime-str
  "Get current date/time as a formatted string for prompt context."
  []
  (.format (LocalDateTime/now) datetime-formatter))

(defn- build-system-prompt
  "Build the system prompt for SQL generation with dialect, schema, and optional dialect instructions."
  [{:keys [dialect schema-ddl dialect-instructions]}]
  (stencil/render-file sql-generation-prompt-template
                       {:dialect              dialect
                        :schema               schema-ddl
                        :current_time         (current-datetime-str)
                        :dialect_instructions dialect-instructions}))

;;; ------------------------------------------ Response Formatting ------------------------------------------

(defn- parse-sql-response
  "Parse the structured JSON response from OpenAI and extract the SQL.
   Falls back to the raw string if JSON parsing fails."
  [json-str]
  (try
    (:sql (json/decode+kw json-str))
    (catch Exception _
      json-str)))

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

      ;; 5. Get database dialect, instructions, and build system prompt
      (let [engine              (database-engine database_id)
            dialect             (database-dialect database_id)
            dialect-instructions (load-dialect-instructions engine)
            system-prompt       (build-system-prompt {:dialect              dialect
                                                      :schema-ddl           schema-ddl
                                                      :dialect-instructions dialect-instructions})
            timestamp           (current-timestamp)]

        ;; 6. Log the system prompt
        (log-to-file! (str timestamp "_prompt.txt") system-prompt)

        ;; 7. Call LLM (returns raw JSON content)
        (let [json-response (llm.openai/chat-completion
                             {:system   system-prompt
                              :messages [{:role "user" :content prompt}]})]

          ;; 8. Log the full JSON response
          (log-to-file! (str timestamp "_response.txt") json-response)

          ;; 9. Parse and return AI SDK formatted result
          (let [sql (parse-sql-response json-response)]
            {:parts [(make-code-edit-part buffer-id sql)]}))))))

;;; ------------------------------------------ Streaming Endpoint ------------------------------------------

(defn- write-sse!
  "Write an SSE line to the output stream."
  [^OutputStream os ^String line]
  (.write os (.getBytes line StandardCharsets/UTF_8))
  (.flush os))

(defn- validate-and-prepare-context
  "Validate request and prepare context for SQL generation.
   Returns {:dialect :system-prompt :buffer-id} or throws appropriate error."
  [{:keys [prompt database_id buffer_id]}]
  (when-not (llm.settings/llm-enabled?)
    (throw (ex-info (tru "LLM SQL generation is not configured. Please set an OpenAI API key in admin settings.")
                    {:status-code 403})))
  (let [table-ids (llm.context/parse-table-mentions prompt)]
    (when (empty? table-ids)
      (throw (ex-info (tru "No tables mentioned in prompt. Use @mentions to specify tables.")
                      {:status-code 400})))
    (let [schema-ddl (llm.context/build-schema-context database_id table-ids)]
      (when-not schema-ddl
        (throw (ex-info (tru "No accessible tables found. Check table permissions.")
                        {:status-code 400})))
      (let [engine               (database-engine database_id)
            dialect              (database-dialect database_id)
            dialect-instructions (load-dialect-instructions engine)
            system-prompt        (build-system-prompt {:dialect              dialect
                                                       :schema-ddl           schema-ddl
                                                       :dialect-instructions dialect-instructions})]
        {:dialect       dialect
         :system-prompt system-prompt
         :buffer-id     (or buffer_id "qb")}))))

(api.macros/defendpoint :post "/generate-sql-streaming"
  "Generate SQL from a natural language prompt with streaming response.

   Requires:
   - LLM to be configured (OpenAI API key set in admin settings)
   - At least one table mention in the prompt using [Name](metabase://table/ID) format
   - A database_id parameter

   Returns SSE stream in AI SDK v5 format:
   - 0:\"text\" - Text delta chunks as SQL is generated
   - 2:{...}   - Final code_edit data part with complete SQL
   - d:{...}   - Finish message"
  [_route-params
   _query-params
   body :- [:map
            [:prompt :string]
            [:database_id pos-int?]
            [:buffer_id {:optional true} :string]]]
  (let [{:keys [prompt]} body
        {:keys [system-prompt buffer-id]} (validate-and-prepare-context body)
        timestamp (current-timestamp)]

    (log-to-file! (str timestamp "_prompt.txt") system-prompt)

    (sr/streaming-response {:content-type "text/event-stream; charset=utf-8"} [os canceled-chan]
      (let [llm-chan (llm.openai/chat-completion-stream
                      {:system   system-prompt
                       :messages [{:role "user" :content prompt}]})
            text-acc (StringBuilder.)]
        (loop []
          (let [[chunk port] (a/alts!! [llm-chan canceled-chan] :priority true)]
            (cond
              (= port canceled-chan)
              nil

              (nil? chunk)
              (let [json-str  (str text-acc)
                    final-sql (parse-sql-response json-str)]
                (log-to-file! (str timestamp "_response.txt") json-str)
                (write-sse! os (llm.streaming/format-sse-line
                                :data
                                (llm.streaming/format-code-edit-part buffer-id final-sql)))
                (write-sse! os (llm.streaming/format-sse-line
                                :finish-message
                                (llm.streaming/format-finish-message "stop"))))

              (= (:type chunk) :error)
              (do
                (log/error "Error chunk received" {:error (:error chunk)})
                (write-sse! os (llm.streaming/format-sse-line :error {:message (:error chunk)})))

              (= (:type chunk) :text-delta)
              (do
                ;; Accumulate JSON silently - don't stream raw JSON to frontend.
                ;; With structured outputs, the streamed content is JSON like {"sql": "..."}
                ;; which isn't useful to display. We extract the SQL at the end.
                (.append text-acc (:delta chunk))
                (recur))

              :else
              (do
                (log/warn "Unknown chunk type" {:chunk chunk})
                (recur)))))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/llm` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
