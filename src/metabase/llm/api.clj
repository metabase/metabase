(ns metabase.llm.api
  "API endpoints for LLM-powered SQL generation (OSS)."
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.llm.anthropic :as llm.anthropic]
   [metabase.llm.context :as llm.context]
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

(defn- debug-logging-enabled?
  "Check if debug file logging is enabled via MB_OSS_SQLBOT_DEBUG_LOGGING env var.
   Disabled by default."
  []
  (= "true" (System/getenv "MB_OSS_SQLBOT_DEBUG_LOGGING")))

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
  "Map of database engine keywords to dialect instruction file names (without extension).
   Multiple engine keywords may map to the same dialect file when they share SQL syntax."
  {;; PostgreSQL family
   :postgres      "postgresql"
   :postgresql    "postgresql"
   ;; MySQL family
   :mysql         "mysql"
   :mariadb       "mysql"
   ;; Cloud warehouses
   :bigquery-cloud-sdk "bigquery"
   :bigquery      "bigquery"
   :snowflake     "snowflake"
   :redshift      "redshift"
   ;; Presto/Trino family
   :athena        "athena"
   :presto        "athena"
   :presto-jdbc   "athena"
   :trino         "athena"
   :starburst     "athena"
   ;; Analytics engines
   :clickhouse    "clickhouse"
   :druid         "druid"
   :druid-jdbc    "druid"
   :vertica       "vertica"
   ;; Spark family
   :databricks    "databricks"
   :sparksql      "databricks"
   :spark         "databricks"
   ;; Enterprise databases
   :oracle        "oracle"
   :sqlserver     "sqlserver"
   ;; Embedded/lightweight
   :h2            "h2"
   :sqlite        "sqlite"})

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
  "Build the system prompt for SQL generation with dialect, schema, and optional dialect instructions.
   When source-sql is provided, includes the existing query for context."
  [{:keys [dialect schema-ddl dialect-instructions source-sql]}]
  (stencil/render-file sql-generation-prompt-template
                       (cond-> {:dialect              dialect
                                :schema               schema-ddl
                                :current_time         (current-datetime-str)
                                :dialect_instructions dialect-instructions}
                         source-sql (assoc :source_sql source-sql))))

;;; ------------------------------------------ Response Formatting ------------------------------------------

(defn- parse-sql-response
  "Parse the structured JSON response and extract the SQL.
   Handles both map (from non-streaming) and string (from streaming accumulator) responses."
  [response]
  (cond
    (map? response)    (:sql response)
    (string? response) (try
                         (:sql (json/decode+kw response))
                         (catch Exception _
                           response))
    :else              response))

(defn- make-code-edit-part
  "Create an AI SDK v5 data part for a code edit suggestion."
  [buffer-id sql]
  {:type    "code_edit"
   :version 1
   :value   {:buffer_id buffer-id
             :mode      "rewrite"
             :value     sql}})

(defn- make-context-part
  "Create an AI SDK v5 context data part for sync responses."
  [{:keys [system-prompt dialect table-ids]}]
  {:type    "context"
   :version 1
   :value   {:system_prompt system-prompt
             :dialect       dialect
             :table_ids     (vec table-ids)}})

(def ^:private column-schema
  "Schema for column metadata in API responses."
  [:map
   [:id pos-int?]
   [:name :string]
   [:database_type {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:semantic_type {:optional true} [:maybe :string]]
   [:fk_target {:optional true}
    [:maybe [:map
             [:table_name :string]
             [:field_name :string]]]]
   [:context {:optional true} [:maybe :string]]])

(def ^:private table-with-columns-schema
  "Schema for table metadata with columns in API responses."
  [:map
   [:id pos-int?]
   [:name :string]
   [:schema {:optional true} [:maybe :string]]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:columns {:optional true} [:sequential column-schema]]])

(api.macros/defendpoint :post "/extract-tables"
  :- [:map [:tables [:sequential table-with-columns-schema]]]
  "Extract table references from SQL and return metadata for UI display.

   Parses the SQL to identify referenced tables and returns metadata
   including id, name, schema, display_name, and columns for each table.
   Column metadata includes database type, description, semantic type,
   and FK target information.

   Only returns tables the current user has permission to access."
  [_route-params
   _query-params
   body :- [:map
            [:database_id pos-int?]
            [:sql :string]]]
  (let [{:keys [database_id sql]} body
        table-ids (llm.context/extract-tables-from-sql database_id sql)
        tables    (llm.context/get-tables-with-columns database_id table-ids)]
    {:tables (or tables [])}))

(api.macros/defendpoint :get "/table/:table-id/columns-with-context"
  :- table-with-columns-schema
  "Fetch columns for a single table with enhanced context strings.

   Returns table metadata including columns with a :context field containing
   the enhanced metadata string used in LLM DDL (ranges, sample values,
   FK references, semantic types, etc.).

   This endpoint triggers on-demand fingerprinting and field value fetching
   to generate rich context strings. Use this when you need column metadata
   for display in the UI (e.g., when a user @mentions a table).

   Only returns data if the current user has permission to access the table."
  [{:keys [table-id]} :- [:map [:table-id pos-int?]]
   {:keys [database_id]} :- [:map [:database_id pos-int?]]
   _body]
  (let [result (llm.context/get-table-columns-with-context database_id table-id)]
    (if result
      result
      (throw (ex-info (tru "Table not found or not accessible.")
                      {:status-code 404})))))

(defn- convert-column-filters
  "Convert column_filters from API format {table-id -> [col-ids]} to internal format {table-id -> #{col-ids}}.
   Returns nil if input is nil or empty."
  [column-filters]
  (when (seq column-filters)
    (reduce-kv (fn [m k v]
                 (assoc m k (set v)))
               {}
               column-filters)))

(defn- convert-column-contexts
  "Convert column_contexts from API format {table-id -> {col-id -> context}} to flat format {col-id -> context}.
   Returns nil if input is nil or empty."
  [column-contexts]
  (when (seq column-contexts)
    (reduce-kv (fn [m _table-id col-map]
                 (merge m col-map))
               {}
               column-contexts)))

(api.macros/defendpoint :post "/generate-sql"
  :- [:map
      [:parts [:sequential [:map
                            [:type :string]
                            [:version pos-int?]
                            [:value :map]]]]]
  "Generate SQL from a natural language prompt.

   Requires:
   - LLM to be configured (Anthropic API key set in admin settings)
   - At least one table reference (explicit @mention, implicit from source_sql, or table_ids)
   - A database_id parameter

   When table_ids is provided, it is used as the authoritative source of tables
   for schema context, bypassing mention parsing and SQL extraction.

   When column_filters is provided, only the specified columns are included in the
   schema context for each table. Format: {table_id: [column_id, ...]}.
   Tables not in column_filters include all columns.

   When column_contexts is provided, user-edited context strings override the
   auto-generated ones. Format: {table_id: {column_id: \"context string\", ...}}.

   Returns AI SDK v5 data part format for frontend compatibility.
   If include_context is true, includes a context part with the system prompt."
  [_route-params
   _query-params
   body :- [:map
            [:prompt :string]
            [:database_id pos-int?]
            [:source_sql {:optional true} :string]
            [:buffer_id {:optional true} :string]
            [:include_context {:optional true} :boolean]
            [:table_ids {:optional true} [:sequential pos-int?]]
            [:column_filters {:optional true} [:map-of pos-int? [:sequential pos-int?]]]
            [:column_contexts {:optional true} [:map-of pos-int? [:map-of pos-int? :string]]]
            [:table_contexts {:optional true} [:map-of pos-int? :string]]]]
  ;; 1. Validate LLM is configured
  (when-not (llm.settings/llm-enabled?)
    (throw (ex-info (tru "LLM SQL generation is not configured. Please set an Anthropic API key in admin settings.")
                    {:status-code 403})))

  (let [{:keys [prompt database_id source_sql buffer_id include_context table_ids column_filters column_contexts table_contexts]} body
        buffer-id (or buffer_id "qb")
        ;; 2. Determine table IDs - use explicit table_ids if provided, otherwise parse from prompt/SQL
        table-ids (if (seq table_ids)
                    ;; Authoritative: frontend explicitly passed table IDs
                    (set table_ids)
                    ;; Fallback: parse from prompt mentions and source SQL
                    (let [explicit-table-ids (llm.context/parse-table-mentions prompt)
                          implicit-table-ids (when source_sql
                                               (llm.context/extract-tables-from-sql database_id source_sql))]
                      (set/union (or explicit-table-ids #{})
                                 (or implicit-table-ids #{}))))
        ;; 3. Convert column filters and contexts to internal format
        column-filters (convert-column-filters column_filters)
        column-contexts (convert-column-contexts column_contexts)
        ;; table_contexts is already in the right format: {table-id -> description}
        table-contexts (when (seq table_contexts) table_contexts)]

    ;; 4. Validate at least one table is referenced
    (when (empty? table-ids)
      (throw (ex-info (tru "No tables found. Use @mentions or provide source SQL with table references.")
                      {:status-code 400})))

    ;; 5. Fetch schema context for mentioned tables (with optional column filtering and custom contexts)
    (let [schema-ddl (llm.context/build-schema-context database_id table-ids
                                                       :column-filters column-filters
                                                       :column-contexts column-contexts
                                                       :table-contexts table-contexts)]
      (when-not schema-ddl
        (throw (ex-info (tru "No accessible tables found. Check table permissions.")
                        {:status-code 400})))

      ;; 6. Get database dialect, instructions, and build system prompt
      (let [engine              (database-engine database_id)
            dialect             (database-dialect database_id)
            dialect-instructions (load-dialect-instructions engine)
            system-prompt       (build-system-prompt {:dialect              dialect
                                                      :schema-ddl           schema-ddl
                                                      :dialect-instructions dialect-instructions
                                                      :source-sql           source_sql})
            timestamp           (current-timestamp)]

        ;; 7. Log the system prompt (if debug logging enabled)
        (when (debug-logging-enabled?)
          (log-to-file! (str timestamp "_prompt.txt") system-prompt))

        ;; 8. Call LLM (returns map with :sql and :explanation from tool response)
        (let [response (llm.anthropic/chat-completion
                        {:system   system-prompt
                         :messages [{:role "user" :content prompt}]})]

          ;; 9. Log the response (if debug logging enabled)
          (when (debug-logging-enabled?)
            (log-to-file! (str timestamp "_response.txt") (pr-str response)))

          ;; 10. Parse and return AI SDK formatted result
          (let [sql   (parse-sql-response response)
                parts (cond-> [(make-code-edit-part buffer-id sql)]
                        include_context
                        (conj (make-context-part {:system-prompt system-prompt
                                                  :dialect       dialect
                                                  :table-ids     table-ids})))]
            {:parts parts}))))))

;;; ------------------------------------------ Streaming Endpoint ------------------------------------------

(defn- write-sse!
  "Write an SSE line to the output stream."
  [^OutputStream os ^String line]
  (.write os (.getBytes line StandardCharsets/UTF_8))
  (.flush os))

(defn- validate-and-prepare-context
  "Validate request and prepare context for SQL generation.
   Returns {:dialect :system-prompt :buffer-id :table-ids} or throws appropriate error."
  [{:keys [prompt database_id source_sql buffer_id table_ids column_filters column_contexts table_contexts]}]
  (when-not (llm.settings/llm-enabled?)
    (throw (ex-info (tru "LLM SQL generation is not configured. Please set an Anthropic API key in admin settings.")
                    {:status-code 403})))
  (let [table-ids (if (seq table_ids)
                    ;; Authoritative: frontend explicitly passed table IDs
                    (set table_ids)
                    ;; Fallback: parse from prompt mentions and source SQL
                    (let [explicit-table-ids (llm.context/parse-table-mentions prompt)
                          implicit-table-ids (when source_sql
                                               (llm.context/extract-tables-from-sql database_id source_sql))]
                      (set/union (or explicit-table-ids #{})
                                 (or implicit-table-ids #{}))))
        column-filters (convert-column-filters column_filters)
        column-contexts (convert-column-contexts column_contexts)
        table-contexts (when (seq table_contexts) table_contexts)]
    (when (empty? table-ids)
      (throw (ex-info (tru "No tables found. Use @mentions or provide source SQL with table references.")
                      {:status-code 400})))
    (let [schema-ddl (llm.context/build-schema-context database_id table-ids
                                                       :column-filters column-filters
                                                       :column-contexts column-contexts
                                                       :table-contexts table-contexts)]
      (when-not schema-ddl
        (throw (ex-info (tru "No accessible tables found. Check table permissions.")
                        {:status-code 400})))
      (let [engine               (database-engine database_id)
            dialect              (database-dialect database_id)
            dialect-instructions (load-dialect-instructions engine)
            system-prompt        (build-system-prompt {:dialect              dialect
                                                       :schema-ddl           schema-ddl
                                                       :dialect-instructions dialect-instructions
                                                       :source-sql           source_sql})]
        {:dialect       dialect
         :system-prompt system-prompt
         :buffer-id     (or buffer_id "qb")
         :table-ids     table-ids}))))

(api.macros/defendpoint :post "/generate-sql-streaming"
  :- :any ; SSE streaming response
  "Generate SQL from a natural language prompt with streaming response.

   Requires:
   - LLM to be configured (Anthropic API key set in admin settings)
   - At least one table reference (explicit @mention, implicit from source_sql, or table_ids)
   - A database_id parameter

   When table_ids is provided, it is used as the authoritative source of tables
   for schema context, bypassing mention parsing and SQL extraction.

   When column_filters is provided, only the specified columns are included in the
   schema context for each table. Format: {table_id: [column_id, ...]}.
   Tables not in column_filters include all columns.

   When column_contexts is provided, user-edited context strings override the
   auto-generated ones. Format: {table_id: {column_id: \"context string\", ...}}.

   Returns SSE stream in AI SDK v5 format:
   - 0:\"text\" - Text delta chunks as SQL is generated
   - 2:{...}   - Final code_edit data part with complete SQL
   - 2:{...}   - Context data part (if include_context is true)
   - d:{...}   - Finish message"
  [_route-params
   _query-params
   body :- [:map
            [:prompt :string]
            [:database_id pos-int?]
            [:source_sql {:optional true} :string]
            [:buffer_id {:optional true} :string]
            [:include_context {:optional true} :boolean]
            [:table_ids {:optional true} [:sequential pos-int?]]
            [:column_filters {:optional true} [:map-of pos-int? [:sequential pos-int?]]]
            [:column_contexts {:optional true} [:map-of pos-int? [:map-of pos-int? :string]]]
            [:table_contexts {:optional true} [:map-of pos-int? :string]]]]
  (let [{:keys [prompt include_context]} body
        {:keys [system-prompt buffer-id dialect table-ids]} (validate-and-prepare-context body)
        timestamp (current-timestamp)]

    (when (debug-logging-enabled?)
      (log-to-file! (str timestamp "_prompt.txt") system-prompt))

    (sr/streaming-response {:content-type "text/event-stream; charset=utf-8"} [os canceled-chan]
      (let [llm-chan (llm.anthropic/chat-completion-stream
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
                (when (debug-logging-enabled?)
                  (log-to-file! (str timestamp "_response.txt") json-str))
                (write-sse! os (llm.streaming/format-sse-line
                                :data
                                (llm.streaming/format-code-edit-part buffer-id final-sql)))
                (when include_context
                  (write-sse! os (llm.streaming/format-sse-line
                                  :data
                                  (llm.streaming/format-context-part
                                   {:system-prompt system-prompt
                                    :dialect       dialect
                                    :table-ids     table-ids}))))
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
                ;; With tool_use, the streamed content is JSON like {"sql": "..."}
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
