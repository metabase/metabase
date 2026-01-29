(ns metabase.llm.api
  "API endpoints for LLM-powered SQL generation (OSS)."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.llm.anthropic :as llm.anthropic]
   [metabase.llm.context :as llm.context]
   [metabase.llm.costs :as llm.costs]
   [metabase.llm.settings :as llm.settings]
   [metabase.llm.streaming :as llm.streaming]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as sr]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [stencil.core :as stencil]
   [throttle.core :as throttle]
   [toucan2.core :as t2])
  (:import
   (java.io OutputStream)
   (java.nio.charset StandardCharsets)
   (java.time LocalDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Rate Limiting -----------------------------------------------

(def ^:private sql-gen-throttlers
  "Throttlers for SQL generation endpoints.
   - :user-id limits requests per user (default 20/minute)
   - :ip-address limits requests per IP (default 100/minute)"
  {:user-id    (throttle/make-throttler :user-id
                                        :attempts-threshold (llm.settings/llm-rate-limit-per-user)
                                        :attempt-ttl-ms 60000)
   :ip-address (throttle/make-throttler :ip-address
                                        :attempts-threshold (llm.settings/llm-rate-limit-per-ip)
                                        :attempt-ttl-ms 60000)})

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

;;; ------------------------------------------ Token Usage Tracking ------------------------------------------

(defn- track-token-usage!
  "Track token usage for LLM API calls via Snowplow."
  [{:keys [model prompt completion duration-ms user-id source tag]}]
  (let [request-id      (-> (random-uuid)
                            str
                            ;; strip dashes and lower-case to mimic the ai-service uuid.hex formatting
                            (str/replace "-" "")
                            u/lower-case-en)
        hashed-token    (some-> (not-empty (premium-features/premium-embedding-token))
                                buddy-hash/sha256
                                codecs/bytes->hex)
        token-or-uuid   (or hashed-token
                            (str "oss__" (analytics.settings/analytics-uuid)))
        estimated-costs (llm.costs/estimate {:model      model
                                             :prompt     prompt
                                             :completion completion})]
    (snowplow/track-event! :snowplow/token_usage
                           {:hashed-metabase-license-token token-or-uuid
                            :request-id                    request-id
                            :model-id                      model
                            :total-tokens                  (+ prompt completion)
                            :prompt-tokens                 prompt
                            :completion-tokens             completion
                            :estimated-costs-usd           estimated-costs
                            :user-id                       user-id
                            :duration-ms                   duration-ms
                            :source                        source
                            :tag                           tag}
                           user-id)))

(defn- track-sqlgen-event!
  "Track SQL generation usage via Snowplow simple_event."
  [{:keys [duration-ms result engine]}]
  (snowplow/track-event! :snowplow/simple_event
                         {:event "metabot_oss_sqlgen_used"
                          :duration_ms duration-ms
                          :result result
                          :event_detail (some-> engine name)}
                         api/*current-user-id*))

;;; ------------------------------------------ Extract Tables Endpoint ------------------------------------------

(def ^:private table-with-columns-schema
  "Schema for table metadata with columns returned by /extract-tables."
  [:map
   [:id pos-int?]
   [:name :string]
   [:schema {:optional true} [:maybe :string]]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:columns [:sequential
              [:map
               [:id pos-int?]
               [:name :string]
               [:database_type {:optional true} [:maybe :string]]
               [:description {:optional true} [:maybe :string]]
               [:semantic_type {:optional true} [:maybe :string]]
               [:fk_target {:optional true}
                [:map
                 [:table_name :string]
                 [:field_name :string]]]]]]])

(api.macros/defendpoint :post "/extract-tables"
  :- [:map [:tables [:sequential table-with-columns-schema]]]
  "Parse SQL and return referenced tables with their columns.

   Uses Macaw to parse the SQL, resolves table names to IDs,
   and returns permission-filtered tables with column metadata.

   This is a lightweight endpoint that does not trigger fingerprinting
   or field value fetching."
  [_route-params
   _query-params
   body :- [:map
            [:database_id pos-int?]
            [:sql :string]]]
  (let [{:keys [database_id sql]} body
        table-ids (llm.context/extract-tables-from-sql database_id sql)
        tables    (llm.context/get-tables-with-columns database_id table-ids)]
    {:tables (or tables [])}))

;;; ------------------------------------------ Generate SQL Endpoint ------------------------------------------

(api.macros/defendpoint :post "/generate-sql"
  :- [:map
      [:sql :string]
      [:referenced_entities [:sequential
                             [:map
                              [:model :string]
                              [:id pos-int?]
                              [:name :string]
                              [:schema {:optional true} [:maybe :string]]
                              [:display_name {:optional true} [:maybe :string]]
                              [:description {:optional true} [:maybe :string]]
                              [:columns [:sequential
                                         [:map
                                          [:id pos-int?]
                                          [:name :string]
                                          [:database_type {:optional true} [:maybe :string]]
                                          [:description {:optional true} [:maybe :string]]
                                          [:semantic_type {:optional true} [:maybe :string]]
                                          [:fk_target {:optional true}
                                           [:map
                                            [:table_name :string]
                                            [:field_name :string]]]]]]]]]]
  "Generate SQL from a natural language prompt.

   Requires:
   - LLM to be configured (Anthropic API key set in admin settings)
   - At least one table reference (explicit @mention or implicit from source_sql)
   - A database_id parameter

   Returns generated SQL and the list of tables used for context."
  [_route-params
   _query-params
   body :- [:map
            [:prompt :string]
            [:database_id pos-int?]
            [:source_sql {:optional true} :string]
            [:referenced_entities {:optional true}
             [:sequential [:map
                           [:model :string]
                           [:id pos-int?]]]]]
   request]
  (when-not (llm.settings/llm-enabled?)
    (throw (ex-info (tru "LLM SQL generation is not configured. Please set an Anthropic API key in admin settings.")
                    {:status-code 403})))
  (throttle/with-throttling [(sql-gen-throttlers :ip-address) (request/ip-address request)
                             (sql-gen-throttlers :user-id)    api/*current-user-id*]
    (let [{:keys [prompt database_id source_sql referenced_entities]} body
          ;; 2. Extract table IDs from all sources and merge them
          frontend-table-ids (when (seq referenced_entities)
                               (->> referenced_entities
                                    (filter #(= "table" (:model %)))
                                    (map :id)
                                    set))
          explicit-table-ids (llm.context/parse-table-mentions prompt)
          implicit-table-ids (when source_sql
                               (llm.context/extract-tables-from-sql database_id source_sql))
          table-ids          (set/union (or frontend-table-ids #{})
                                        (or explicit-table-ids #{})
                                        (or implicit-table-ids #{}))]
      (when (empty? table-ids)
        (throw (ex-info (tru "No tables found. Use @mentions or provide source SQL with table references.")
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
                                                         :dialect-instructions dialect-instructions
                                                         :source-sql           source_sql})
              timestamp            (current-timestamp)
              start-timer          (u/start-timer)]
          (when (debug-logging-enabled?)
            (log-to-file! (str timestamp "_prompt.txt") system-prompt))
          (try
            (let [{:keys [result usage duration-ms]} (llm.anthropic/chat-completion
                                                      {:system   system-prompt
                                                       :messages [{:role "user" :content prompt}]})]
              (when (debug-logging-enabled?)
                (log-to-file! (str timestamp "_response.txt") (pr-str result)))
              (track-token-usage! (assoc usage
                                         :duration-ms duration-ms
                                         :user-id api/*current-user-id*
                                         ;; for some reason, :source convention is snake_case and :tag is (mostly) kebab
                                         :source "oss_metabot"
                                         :tag "oss-sqlgen"))
              (track-sqlgen-event! {:duration-ms (u/since-ms start-timer)
                                    :result "success"
                                    :engine engine})
              (let [sql                 (parse-sql-response result)
                    tables-with-columns (llm.context/get-tables-with-columns database_id table-ids)
                    referenced-entities (mapv #(assoc % :model "table") tables-with-columns)]
                {:sql                 sql
                 :referenced_entities referenced-entities}))
            (catch Exception e
              (track-sqlgen-event! {:duration-ms (u/since-ms start-timer)
                                    :result "failure"
                                    :engine engine})
              (throw e))))))))

;;; ------------------------------------------ Streaming Endpoint ------------------------------------------

(defn- write-sse!
  "Write an SSE line to the output stream."
  [^OutputStream os ^String line]
  (.write os (.getBytes line StandardCharsets/UTF_8))
  (.flush os))

(defn- validate-and-prepare-context
  "Validate request and prepare context for SQL generation.
   Returns {:system-prompt :table-ids} or throws appropriate error."
  [{:keys [prompt database_id source_sql referenced_entities]}]
  (when-not (llm.settings/llm-enabled?)
    (throw (ex-info (tru "LLM SQL generation is not configured. Please set an Anthropic API key in admin settings.")
                    {:status-code 403})))
  (let [frontend-table-ids (when (seq referenced_entities)
                             (->> referenced_entities
                                  (filter #(= "table" (:model %)))
                                  (map :id)
                                  set))
        explicit-table-ids (llm.context/parse-table-mentions prompt)
        implicit-table-ids (when source_sql
                             (llm.context/extract-tables-from-sql database_id source_sql))
        table-ids          (set/union (or frontend-table-ids #{})
                                      (or explicit-table-ids #{})
                                      (or implicit-table-ids #{}))]
    (when (empty? table-ids)
      (throw (ex-info (tru "No tables found. Use @mentions or provide source SQL with table references.")
                      {:status-code 400})))
    (let [schema-ddl (llm.context/build-schema-context database_id table-ids)]
      (when-not schema-ddl
        (throw (ex-info (tru "No accessible tables found. Check table permissions.")
                        {:status-code 400})))
      (let [engine               (database-engine database_id)
            dialect-instructions (load-dialect-instructions engine)
            system-prompt        (build-system-prompt {:dialect              (database-dialect database_id)
                                                       :schema-ddl           schema-ddl
                                                       :dialect-instructions dialect-instructions
                                                       :source-sql           source_sql})]
        {:system-prompt system-prompt
         :table-ids     table-ids}))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/generate-sql-streaming"
  "Generate SQL from a natural language prompt with streaming response.

   Requires:
   - LLM to be configured (Anthropic API key set in admin settings)
   - At least one table reference (explicit @mention or implicit from source_sql)
   - A database_id parameter

   Returns SSE stream with:
   - 2:{sql: '...', referenced_entities: [...]} - Final result data part
   - d:{...} - Finish message"
  [_route-params
   _query-params
   body :- [:map
            [:prompt :string]
            [:database_id pos-int?]
            [:source_sql {:optional true} :string]
            [:referenced_entities {:optional true}
             [:sequential [:map
                           [:model :string]
                           [:id pos-int?]]]]]
   request]
  (throttle/with-throttling [(sql-gen-throttlers :ip-address) (request/ip-address request)
                             (sql-gen-throttlers :user-id)    api/*current-user-id*]
    (let [{:keys [prompt database_id]}      body
          {:keys [system-prompt table-ids]} (validate-and-prepare-context body)
          timestamp                         (current-timestamp)]

      (when (debug-logging-enabled?)
        (log-to-file! (str timestamp "_prompt.txt") system-prompt))

      (sr/streaming-response {:content-type "text/event-stream; charset=utf-8"} [os canceled-chan]
        (let [start-time (u/start-timer)
              llm-chan   (llm.anthropic/chat-completion-stream {:system   system-prompt
                                                                :messages [{:role "user" :content prompt}]})
              text-acc   (StringBuilder.)
              usage-acc  (volatile! {})]
          (loop []
            (let [[chunk port] (a/alts!! [llm-chan canceled-chan] :priority true)]
              (cond
                (= port canceled-chan)
                nil

                (nil? chunk)
                (let [json-str            (str text-acc)
                      final-sql           (parse-sql-response json-str)
                      tables-with-columns (llm.context/get-tables-with-columns database_id table-ids)
                      referenced-entities (mapv #(assoc % :model "table") tables-with-columns)]
                  (when (debug-logging-enabled?)
                    (log-to-file! (str timestamp "_response.txt") json-str))
                  (doseq [[model-id {:keys [prompt completion]}] @usage-acc]
                    ;; There should only be one model in the usage-acc, but doseq in case that ever changes.
                    (track-token-usage! {:model       model-id
                                         :prompt      prompt
                                         :completion  completion
                                         :duration-ms (u/since-ms start-time)
                                         :user-id     api/*current-user-id*
                                         :source      "oss_metabot"
                                         :tag         "oss-sqlgen-streaming"}))
                  (track-sqlgen-event! {:duration-ms (u/since-ms start-time)
                                        :result "success"
                                        :engine (database-engine database_id)})
                  (write-sse! os (llm.streaming/format-sse-line
                                  :data
                                  {:sql                 final-sql
                                   :referenced_entities referenced-entities}))
                  (write-sse! os (llm.streaming/format-sse-line
                                  :finish-message
                                  (llm.streaming/format-finish-message "stop"))))

                (= (:type chunk) :error)
                (do
                  (log/error "Error chunk received" {:error (:error chunk)})
                  (track-sqlgen-event! {:duration-ms (u/since-ms start-time)
                                        :result "failure"
                                        :engine (database-engine database_id)})
                  (write-sse! os (llm.streaming/format-sse-line :error {:message (:error chunk)})))

                (= (:type chunk) :usage)
                (let [{:keys [usage id]} chunk
                      model-id (or id "unknown-model")]
                    ;; Accumulate usage - merge prompt/completion tokens as they arrive
                  (vswap! usage-acc update model-id
                          (fn [current]
                            (merge current
                                   (when (:promptTokens usage)
                                     {:prompt (:promptTokens usage)})
                                   (when (:completionTokens usage)
                                     {:completion (:completionTokens usage)}))))
                  (recur))

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
                  (recur))))))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/llm` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
