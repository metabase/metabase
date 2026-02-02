(ns metabase.llm.api
  "API endpoints for LLM-powered SQL generation (OSS)."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.driver :as driver]
   [metabase.llm.anthropic :as llm.anthropic]
   [metabase.llm.context :as llm.context]
   [metabase.llm.costs :as llm.costs]
   [metabase.llm.settings :as llm.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [stencil.core :as stencil]
   [throttle.core :as throttle]
   [toucan2.core :as t2])
  (:import
   (java.time LocalDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

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

(defn- database-engine
  "Get the engine keyword for a database."
  [database-id]
  (when database-id
    (t2/select-one-fn :engine :model/Database :id database-id)))

(def ^:private load-dialect-instructions
  "Load dialect-specific instructions from resources, if available.
   Returns nil if no instructions file exists for the given engine.
   Memoized since dialect files are static resources."
  (memoize
   (fn [engine]
     (when engine
       (when-let [resource-path (driver/llm-sql-dialect-resource engine)]
         (when-let [resource (io/resource resource-path)]
           (slurp resource)))))))

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
                            (str "oss__" (analytics/analytics-uuid)))
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
                            :duration-ms                   (some-> duration-ms long)
                            :source                        source
                            :tag                           tag}
                           user-id)))

(defn- track-sqlgen-event!
  "Track SQL generation usage via Snowplow simple_event."
  [{:keys [duration-ms result engine]}]
  (snowplow/track-event! :snowplow/simple_event
                         {:event        "metabot_oss_sqlgen_used"
                          :event_detail (some-> engine name)
                          :duration_ms  (some-> duration-ms long)
                          :result       result}
                         api/*current-user-id*))

(api.macros/defendpoint :get "/list-models"
  :- [:map [:models [:sequential [:map
                                  [:id :string]
                                  [:display_name :string]]]]]
  "List available LLM models from the configured provider.

   Requires LLM to be configured (Anthropic API key set in admin settings)."
  [_route-params
   _query-params]
  (when-not (llm.settings/llm-anthropic-api-key)
    (throw (ex-info (tru "LLM is not configured. Please set an Anthropic API key in admin settings.")
                    {:status-code 403})))
  (llm.anthropic/list-models))

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
  (when-not (llm.settings/llm-anthropic-api-key)
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
        (throw (ex-info (if (and source_sql (empty? implicit-table-ids))
                          (tru "Failed to parse SQL. Use @mentions to provide table references.")
                          (tru "No tables found. Use @mentions or provide source SQL with table references."))
                        {:status-code 400})))
      (let [{:keys [ddl tables]} (llm.context/build-schema-context database_id table-ids)]
        (when-not ddl
          (throw (ex-info (tru "No accessible tables found. Check table permissions.")
                          {:status-code 400})))
        (let [engine               (database-engine database_id)
              dialect              (if engine (driver/display-name engine) "SQL")
              dialect-instructions (load-dialect-instructions engine)
              system-prompt        (build-system-prompt {:dialect              dialect
                                                         :schema-ddl           ddl
                                                         :dialect-instructions dialect-instructions
                                                         :source-sql           source_sql})
              start-timer          (u/start-timer)]
          (try
            (let [{:keys [result usage duration-ms]} (llm.anthropic/chat-completion
                                                      {:system   system-prompt
                                                       :messages [{:role "user" :content prompt}]})]
              (track-token-usage! (assoc usage
                                         :duration-ms duration-ms
                                         :user-id api/*current-user-id*
                                         ;; for some reason, :source convention is snake_case and :tag is (mostly) kebab
                                         :source "oss_metabot"
                                         :tag "oss-sqlgen"))
              (track-sqlgen-event! {:duration-ms (u/since-ms start-timer)
                                    :result "success"
                                    :engine engine})
              (let [sql                 (:sql result)
                    referenced-entities (mapv #(assoc % :model "table") tables)]
                {:sql                 sql
                 :referenced_entities referenced-entities}))
            (catch Exception e
              (track-sqlgen-event! {:duration-ms (u/since-ms start-timer)
                                    :result "failure"
                                    :engine engine})
              (throw e))))))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/llm` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
