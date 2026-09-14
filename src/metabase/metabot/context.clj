(ns metabase.metabot.context
  (:require
   [clojure.java.io :as io]
   [medley.core :as m]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.api.common :as api]
   [metabase.collections.schema :as collections.schema]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.curation :as curation]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.table-utils :as table-utils]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema])
  (:import
   (java.time OffsetDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

;; This is quick and dirty. Feel free to make it more full fledged or throw it away.
(defn log
  "Log a payload. Direction should be `:llm.log/fe->be` or similar. This should not be shipping in this form. This is
  not a rolling log, or logging to the console. This pretty prints to the file `llm-payloads`. It is explicitly useful
  for dev work and not production.

  Examples calls are ;; using doto
    (doto (request message context history)
      (metabot.context/log :llm.log/be->fe))
    ;; or just regularly
    (metabot.context/log _body :llm.log/fe->be)"
  [payload direction]
  (when config/is-dev?
    (let [directions {:llm.log/fe->be "\"FE -----------------> BE\""
                      :llm.log/be->llm "\"BE -----------------> LLM\""
                      :llm.log/llm->be "\"LLM -----------------> BE\""
                      :llm.log/be->fe "\"BE -----------------> FE\""}]
      (with-open [^java.io.BufferedWriter w (io/writer "llm-payloads" :append true)]
        (io/copy (directions direction (name direction)) w)
        (.newLine w)
        (let [payload' (json/encode payload {:pretty true})]
          (io/copy payload' w))
        (.newLine w)
        (.newLine w)))))

(def item-types-qc
  "Item types types storing query and chart configs."
  #{"adhoc"
    "question"
    "metric"
    "model"})

(def item-types
  "Allowed values for the `:type` key of `:user_is_viewing` item."
  (into item-types-qc
        #{"document"
          "dashboard"
          "transform"
          "code_editor"}))

(def ^:private item-type-schema
  "Schema for the `:type` key of `:user_is_viewing` item."
  (into [:enum] item-types))

(def ^:private DraftLegacyInnerQuery
  "The `:query` (inner MBQL 4 query) of a legacy dataset-query whose outer map has no `:database` yet -- a brand-new
  structured query, e.g. `STRUCTURED_QUERY_TEMPLATE` on the frontend."
  [:map {:closed true}
   [:source-table {:optional true} [:maybe [:or :int :string]]]])

(def ^:private DraftNativeQuery
  "The `:native` map of a legacy dataset-query whose outer map has no `:database` yet -- a brand-new native query,
  e.g. `NATIVE_QUERY_TEMPLATE` on the frontend."
  [:map {:closed true}
   [:query {:optional true} [:maybe :string]]
   [:template-tags {:optional true} [:maybe [:ref ::lib.schema.template-tag/template-tag-map]]]
   [:collection {:optional true} [:maybe :string]]])

(def ^:private DraftQuerySchema
  "A viewing-context/transform-source query with no `:database` yet: a brand-new adhoc question or transform
  before the user picked a data source. `::lib-be.schema/maybe-legacy-query` requires `:database`, so this covers
  the gap (`STRUCTURED_QUERY_TEMPLATE`/`NATIVE_QUERY_TEMPLATE` on the frontend, or an in-progress MBQL 5 draft)."
  [:map {:closed true}
   [:database {:optional true} nil?]
   [:type {:optional true} [:maybe [:or :string :keyword]]]
   [:native {:optional true} [:maybe DraftNativeQuery]]
   [:query {:optional true} [:maybe DraftLegacyInnerQuery]]
   [:lib/type {:optional true} [:maybe [:or :string :keyword]]]
   [:stages {:optional true} [:maybe [:sequential [:schema [:ref ::lib.schema/stage]]]]]
   [:parameters {:optional true} [:maybe [:sequential ::parameters.schema/parameter]]]])

(def ^:private ItemQuerySchema
  "Schema for the `:query` of a viewing context item: whatever query the client currently has open, in any MBQL
  version, or a databaseless draft (see [[DraftQuerySchema]]).

  Decoding converts a legacy query to MBQL 5 and validates it, so every consumer gets the shape `lib/query` expects."
  [:multi {:dispatch (fn [q] (boolean (and (map? q) (some? (:database q)))))}
   [true ::lib-be.schema/maybe-legacy-query]
   [false DraftQuerySchema]])

(def ^:private MetabotColumnTypeSchema
  "Schema for `MetabotColumnInfo`'s `:type`."
  (into [:enum] #{"number" "string" "date" "datetime" "time" "boolean" "null"}))

(def ^:private ColumnInfoSchema
  "A chart column's name and inferred type, as sent for chart analysis."
  [:map {:closed true}
   [:name :string]
   [:type {:optional true} [:maybe MetabotColumnTypeSchema]]])

(def ^:private RowValueSchema
  "One cell value in a chart series, matching the frontend's `RowValue`. The `object` arm is never read by this
  code -- it's forwarded to the interestingness stats/repr code as-is -- so it's opaque rather than typed."
  [:maybe [:or :string number? :boolean ms/OpaqueJSONObject]])

(def ^:private SeriesConfigSchema
  "One series of a chart, pre-materialized by the frontend for `analyze_chart`."
  [:map {:closed true}
   [:x ColumnInfoSchema]
   [:y {:optional true} [:maybe ColumnInfoSchema]]
   [:x_values {:optional true} [:maybe [:sequential RowValueSchema]]]
   [:y_values {:optional true} [:maybe [:sequential RowValueSchema]]]
   [:display_name :string]
   [:chart_type [:or :string :keyword]]
   [:stacked {:optional true} [:maybe :boolean]]])

(def ^:private ChartTimelineEventSchema
  "One timeline event overlaid on a chart, pre-materialized by the frontend."
  [:map {:closed true}
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:timestamp :string]])

(def ^:private ChartDataSchema
  "One pre-materialized table of raw chart data (columns + rows)."
  [:map {:closed true}
   [:columns [:sequential ColumnInfoSchema]]
   [:rows [:sequential [:sequential [:or :string number?]]]]])

(def ^:private ChartConfigSchema
  "A `chart_configs` entry: a chart's title, pre-materialized series data, and the query that produced it."
  [:map {:closed true}
   [:title {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:data {:optional true} [:maybe [:sequential ChartDataSchema]]]
   [:series {:optional true} [:maybe (ms/string-keyed-map SeriesConfigSchema)]]
   [:timeline_events {:optional true} [:maybe [:sequential ChartTimelineEventSchema]]]
   [:query {:optional true} ItemQuerySchema]
   [:display_type {:optional true} [:maybe [:or :string :keyword]]]])

(def ^:private CodeEditorBufferSourceSchema
  "The `:source` of a code-editor buffer: the editor's language and the database it targets."
  [:map {:closed true}
   [:language [:= "sql"]]
   [:database_id [:maybe :int]]])

(def ^:private CodeEditorCursorSchema
  [:map {:closed true}
   [:line :int]
   [:column :int]])

(def ^:private CodeEditorBufferSelectionSchema
  [:map {:closed true}
   [:text :string]
   [:start CodeEditorCursorSchema]
   [:end CodeEditorCursorSchema]])

(def ^:private CodeEditorBufferSchema
  "One open buffer in the code editor viewing context."
  [:map {:closed true}
   [:id :string]
   [:source CodeEditorBufferSourceSchema]
   [:cursor CodeEditorCursorSchema]
   [:selection {:optional true} [:maybe CodeEditorBufferSelectionSchema]]])

(def ^:private CodeEditorContextSchema
  "The top-level `:code_editor` key of [[::context]] (as distinct from a `type: code_editor` viewing-context item)."
  [:map {:closed true}
   [:type [:= "code_editor"]]
   [:buffers [:sequential CodeEditorBufferSchema]]])

(def ^:private TransformSourceTableSchema
  "One entry of a Python transform's `source-tables`."
  [:map {:closed true}
   [:alias :string]
   [:table_id {:optional true} [:maybe :int]]
   [:schema {:optional true} [:maybe :string]]
   [:database_id {:optional true} [:maybe :int]]])

(def ^:private TransformSourceSchema
  "A transform's `:source`. Everything but `:type` is optional so a draft transform -- no database chosen, no
  source tables picked -- validates just like a saved one."
  [:multi {:dispatch (comp keyword :type)}
   [:query
    [:map {:closed true}
     [:type [:or [:= :query] [:= "query"]]]
     [:query {:optional true} [:maybe [:or :string ItemQuerySchema]]]
     [:source-incremental-strategy {:optional true} [:maybe ::transforms.schema/source-incremental-strategy]]]]
   [:python
    [:map {:closed true}
     [:type [:or [:= :python] [:= "python"]]]
     [:body {:optional true} [:maybe :string]]
     [:source-database {:optional true} [:maybe :int]]
     [:source-tables {:optional true} [:maybe [:sequential TransformSourceTableSchema]]]
     [:source-incremental-strategy {:optional true} [:maybe ::transforms.schema/source-incremental-strategy]]]]])

(def ^:private TransformTargetSchema
  "A transform's `:target`. Everything but `:type` is optional so an unsaved/suggested transform -- which may omit
  `:database` or the incremental strategy -- validates just like a saved one."
  [:multi {:dispatch (comp keyword :type)}
   [:table
    [:map {:closed true}
     [:type [:or [:= :table] [:= "table"]]]
     [:name {:optional true} [:maybe :string]]
     [:schema {:optional true} [:maybe :string]]
     [:database {:optional true} [:maybe :int]]]]
   [:table-incremental
    [:map {:closed true}
     [:type [:or [:= :table-incremental] [:= "table-incremental"]]]
     [:name {:optional true} [:maybe :string]]
     [:schema {:optional true} [:maybe :string]]
     [:database {:optional true} [:maybe :int]]
     [:target-incremental-strategy {:optional true} [:maybe ::transforms.schema/target-incremental-strategy]]]]])

(def ^:private TransformCreatorSchema
  "The `:creator` hydrated onto a transform, mirroring the transforms REST API's own response shape."
  [:map {:closed true}
   [:id :int]
   [:email :string]
   [:first_name {:optional true} [:maybe :string]]
   [:last_name {:optional true} [:maybe :string]]
   [:common_name {:optional true} [:maybe :string]]
   [:last_login {:optional true} [:maybe :string]]
   [:is_qbnewb {:optional true} [:maybe :boolean]]
   [:is_superuser {:optional true} [:maybe :boolean]]
   [:is_data_analyst {:optional true} [:maybe :boolean]]
   [:tenant_id {:optional true} [:maybe :int]]
   [:date_joined {:optional true} [:maybe :string]]])

(def ^:private TransformOwnerSchema
  "The `:owner` hydrated onto a transform, mirroring the transforms REST API's own response shape."
  [:map {:closed true}
   [:id {:optional true} [:maybe :int]]
   [:email {:optional true} [:maybe :string]]
   [:first_name {:optional true} [:maybe :string]]
   [:last_name {:optional true} [:maybe :string]]
   [:common_name {:optional true} [:maybe :string]]])

(def ^:private TransformLastRunSchema
  "The `:last_run` hydrated onto a transform, mirroring the transforms REST API's own response shape."
  [:map {:closed true}
   [:id {:optional true} [:maybe :int]]
   [:transform_id {:optional true} [:maybe :int]]
   [:run_method {:optional true} [:maybe [:or :string :keyword]]]
   [:status {:optional true} [:maybe [:or :string :keyword]]]
   [:is_active {:optional true} [:maybe :boolean]]
   [:start_time {:optional true} [:maybe :string]]
   [:end_time {:optional true} [:maybe :string]]
   [:message {:optional true} [:maybe :string]]
   [:user_id {:optional true} [:maybe :int]]
   [:transform_name {:optional true} [:maybe :string]]
   [:transform_entity_id {:optional true} [:maybe :string]]
   [:job_run_id {:optional true} [:maybe :int]]
   [:dag_run_id {:optional true} [:maybe :int]]
   [:checkpoint_filter_field_id {:optional true} [:maybe :int]]
   [:checkpoint_lo_value {:optional true} [:maybe :string]]
   [:checkpoint_hi_value {:optional true} [:maybe :string]]
   [:metered_as {:optional true} [:maybe :string]]])

(def ^:private TransformTableDependencySchema
  "One entry of a transform's `:table_dependencies`."
  [:or ::driver/native-query-deps.table-dep ::driver/native-query-deps.transform-dep])

(def ^:private item-entries
  "The keys of a viewing context item this code reads. The rest of the item is the shape of one of
  `MetabotEntityInfo`'s variants (card/dashboard/adhoc/document/transform) or `MetabotCodeEditorContext`, so
  everything the frontend can send is named here rather than forwarded opaquely."
  [[:id              {:optional true} [:maybe [:or :int :string]]]
   [:name            {:optional true} [:maybe :string]]
   [:description     {:optional true} [:maybe :string]]
   [:database_schema {:optional true} [:maybe :string]]
   [:sql_engine      {:optional true} [:maybe :string]]
   [:error           {:optional true} [:maybe :string]]
   [:source_type     {:optional true} [:maybe [:or :string :keyword]]]
   [:source          {:optional true} [:maybe TransformSourceSchema]]
   [:target          {:optional true} [:maybe TransformTargetSchema]]
   [:used_tables     {:optional true} [:maybe [:sequential [:map {:closed true}
                                                            [:id              {:optional true} [:maybe :int]]
                                                            [:type            {:optional true} [:maybe [:or :keyword :string]]]
                                                            [:name            {:optional true} [:maybe :string]]
                                                            [:database_schema {:optional true} [:maybe :string]]
                                                            [:description     {:optional true} [:maybe :string]]]]]]
   [:buffers         {:optional true} [:maybe [:sequential CodeEditorBufferSchema]]]
   [:query           {:optional true} ItemQuerySchema]
   [:chart_configs   {:optional true} [:maybe [:vector ChartConfigSchema]]]
   ;; Transform fields (`MetabotTransformInfo` = `Transform | SuggestedTransform | DraftTransform`), mirroring the
   ;; transforms REST API's own response shape. All optional: a draft/suggested/unsaved transform may carry only a
   ;; handful of these.
   [:collection_id   {:optional true} [:maybe :int]]
   [:created_at      {:optional true} [:maybe :string]]
   [:updated_at      {:optional true} [:maybe :string]]
   [:source_readable {:optional true} [:maybe :boolean]]
   [:can_read        {:optional true} [:maybe :boolean]]
   [:can_write       {:optional true} [:maybe :boolean]]
   [:can_execute     {:optional true} [:maybe :boolean]]
   [:source_database_id {:optional true} [:maybe :int]]
   [:deleted         {:optional true} [:maybe :boolean]]
   [:creator_id      {:optional true} [:maybe :int]]
   [:owner_user_id   {:optional true} [:maybe :int]]
   [:owner_email     {:optional true} [:maybe :string]]
   [:owner           {:optional true} [:maybe TransformOwnerSchema]]
   [:last_checkpoint_value {:optional true} [:maybe :string]]
   [:dependency      {:optional true} [:maybe :boolean]]
   [:scheduled       {:optional true} [:maybe :boolean]]
   [:collection      {:optional true} [:maybe ::collections.schema/collection]]
   [:tag_ids         {:optional true} [:maybe [:sequential :int]]]
   [:table           {:optional true} [:maybe ::warehouse-schema.schema/table]]
   [:last_run        {:optional true} [:maybe TransformLastRunSchema]]
   [:creator         {:optional true} [:maybe TransformCreatorSchema]]
   ;; Driver index-method metadata, keyed by index-kind. Never read by this code -- forwarded as the frontend
   ;; sent it -- and the driver's own schema for it isn't closed-schema-clean, so it's opaque rather than typed.
   [:requestable_indexes {:optional true} [:maybe ms/OpaqueJSONObject]]
   [:target_db_id    {:optional true} [:maybe :int]]
   [:target_table_id {:optional true} [:maybe :int]]
   [:run_trigger     {:optional true} [:maybe [:or :string :keyword]]]
   [:entity_id       {:optional true} [:maybe :string]]
   [:table_dependencies {:optional true} [:maybe [:sequential TransformTableDependencySchema]]]])

(def DefaultItemSchema
  "Default schema of viewing context item."
  (into [:map {:closed true} [:type item-type-schema]] item-entries))

(def QcItemSchema
  "Schema viewing context item with query and charts."
  (into [:map {:closed true}
         [:type (into [:enum] item-types-qc)]]
        item-entries))

(def ViewingItemSchema
  "Schema of user is viewing item."
  [:or QcItemSchema DefaultItemSchema])

(mr/def ::recently-viewed-item
  "One of the user's recent views, trimmed to what the model gets told about it."
  [:map {:closed true}
   [:id          {:optional true} [:maybe [:or :int :string]]]
   [:name        {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:type        {:optional true} [:maybe :string]]])

(mr/def ::research-plan-ref
  "A named reference to a research-plan metric/dimension/timeline: what the frontend echoes back in
  `ResearchPlanContext`."
  [:map {:closed true}
   [:id [:or :int :string]]
   [:name :string]])

(mr/def ::research-plan-group
  [:map {:closed true}
   [:block_id :string]
   [:metric ::research-plan-ref]
   [:dimensions [:sequential ::research-plan-ref]]])

(mr/def ::research-plan
  "The in-progress Research plan the frontend serializes into `:research_plan` each turn (`ResearchPlanContext`)."
  [:map {:closed true}
   [:name :string]
   [:groups [:sequential ::research-plan-group]]
   [:timelines [:sequential ::research-plan-ref]]])

(mr/def ::context
  "The context a Metabot request carries. Besides what the client sends, [[create-context]] adds the user's recent
  views, the current time and the caller's capabilities before the agent reads it."
  [:map {:closed true}
   [:user_is_viewing            {:optional true} [:vector ViewingItemSchema]]
   [:user_recently_viewed       {:optional true} [:maybe [:sequential ::recently-viewed-item]]]
   [:current_time_with_timezone {:optional true} [:maybe :string]]
   [:current_user_time          {:optional true} [:maybe :string]]
   [:first_day_of_week          {:optional true} [:maybe :string]]
   [:capabilities               {:optional true} [:maybe [:or [:set :string] [:sequential :string]]]]
   [:slack_channel_id           {:optional true} [:maybe :string]]
   [:default_database_id        {:optional true} [:maybe :int]]
   [:code_editor                {:optional true} [:maybe CodeEditorContextSchema]]
   [:research_plan              {:optional true} [:maybe ::research-plan]]])

(defn- query-for-sql-parsing
  "Given an item in context, return the query if it is a native query or SQL transform that can have table usage parsed
  from it, otherwise nil."
  [item]
  (when-let [query (case (:type item)
                     "transform" (-> item :source :query)
                     "adhoc" (-> item :query)
                     (-> item :query))]
    ;; Draft transforms might not have a database yet. Check this before attempting to normalize the query.
    (when (:database query)
      (when-let [normalized-query (lib-be/normalize-query query)]
        (when (lib/native-only-query? normalized-query)
          normalized-query)))))

(defn- table-stub
  "Reference to a table used by a viewing-context item.

  Excludes columns. [[metabase.metabot.agent.user-context/format-entity]] only reads `:type` and `:id` and calculates
  column details via [[metabase.metabot.tools.entity-details/get-table-details]], so fetching columns here is wasted
  work. On large, highly-connected schemas it can contribute to heap exhaustion (metabase#76493).
  `:name`/`:database_schema`/`:description` are kept for the `format-simple-entity` fallback"
  [{:keys [id name schema description]}]
  {:id id
   :type :table
   :name name
   :database_schema schema
   :description description})

(defn- database-tables-for-context
  "Get database tables formatted for metabot context. Only includes tables used in the query.
  Removes duplicate tables by id while preserving first occurrence order."
  [{:keys [query]}]
  (try
    (if query
      (into []
            (comp (m/distinct-by :id)
                  (map table-stub))
            (table-utils/used-tables query))
      [])
    (catch Exception e
      (log/errorf "Error getting database tables for context: %s" (ex-message e))
      [])))

(defn- python-transform-db-and-table-ids
  "Returns a map with :database-id and :table-ids, or nil if not a Python transform."
  [item]
  (when (and (= (:type item) "transform")
             (= (get-in item [:source :type]) "python"))
    (when-let [source-database (get-in item [:source :source-database])]
      (when-let [source-tables (not-empty (get-in item [:source :source-tables]))]
        {:database-id source-database
         :table-ids (map :table_id source-tables)}))))

(defn- python-transform-tables-for-context
  "Get tables for Python transform formatted for metabot context."
  [{:keys [database-id table-ids]}]
  (try
    (when (and database-id (seq table-ids))
      (not-empty (mapv table-stub (table-utils/used-tables-from-ids database-id table-ids))))
    (catch Exception e
      (log/errorf "Error getting Python transform tables for context: %s" (ex-message e))
      [])))

(defn- mbql-source-table-ids
  "Given a context item with an MBQL query, return [database-id [table-id ...]] if it has source-table references, or
  nil otherwise. Handles both MBQL 4 (legacy) and MBQL 5 formats."
  [item]
  (when (= "adhoc" (:type item))
    (let [query       (:query item)
          database-id (:database query)
          normalized  (try (lib-be/normalize-query query) (catch Exception _ nil))
          table-ids   (->> (:stages normalized)
                           (keep :source-table)
                           (filter pos-int?)
                           distinct
                           vec)]
      (when (seq table-ids)
        [database-id table-ids]))))

(defn- mbql-source-tables-for-context
  "Get source tables for an MBQL query, formatted for metabot context.

  Uses a direct table lookup without native-query permission checks. The user is already
  viewing these tables in the notebook editor, so they have at least query-builder access.
  The standard `used-tables-from-ids` requires `:query-builder-and-native` permissions
  which is too restrictive for MBQL viewing context enrichment."
  [[database-id table-ids]]
  (try
    (let [raw-tables    (metabot.db/visible-table-summaries database-id table-ids)
          queryable-ids (metabot.perms/queryable-table-ids (map :id raw-tables))]
      (into []
            (comp (filter (comp queryable-ids :id))
                  (m/distinct-by :id)
                  (map table-stub))
            raw-tables))
    (catch Exception e
      (log/errorf "Error getting MBQL source tables for context: %s" (ex-message e))
      nil)))

(defn- enhance-context-with-schema
  "Enhance context by adding table schema information for native queries, MBQL queries, SQL transforms, and Python transforms."
  [context]
  (if-let [user-viewing (get context :user_is_viewing)]
    (let [enhanced-viewing
          (mapv (fn [item]
                  (or
                   ;; Handle native queries and SQL transforms
                   (when-let [query (query-for-sql-parsing item)]
                     (when-let [tables (seq (database-tables-for-context {:query query}))]
                       (assoc item :used_tables tables)))
                   ;; Handle MBQL/notebook queries
                   (when-let [db-and-table-ids (mbql-source-table-ids item)]
                     (when-let [tables (seq (mbql-source-tables-for-context db-and-table-ids))]
                       (assoc item :used_tables tables)))
                   ;; Handle Python transforms
                   (when-let [db-and-table-ids (python-transform-db-and-table-ids item)]
                     (when-let [tables (seq (python-transform-tables-for-context db-and-table-ids))]
                       (assoc item :used_tables tables)))
                   ;; Unknown item: return unchanged
                   item))
                user-viewing)]
      (assoc context :user_is_viewing enhanced-viewing))
    context))

(defn- annotate-transform-source-types
  "Annotate transforms in context with source types if not already present (e.g. for draft transforms not yet saved)"
  [context]
  (if-let [user-viewing (get context :user_is_viewing)]
    (let [annotated-viewing
          (mapv (fn [item]
                  (try
                    (if (and (= (:type item) "transform")
                             (not (:source_type item)))
                      (let [transform (transforms-base.u/normalize-transform item)]
                        (assoc transform
                               :source_type (transforms-base.u/transform-source-type (:source transform))))
                      item)
                    (catch Exception e
                      (log/errorf "Error annotating transform source type for metabot context: %s" (ex-message e))
                      item)))
                user-viewing)]
      (assoc context :user_is_viewing annotated-viewing))
    context))

(defn- get-metabot
  "Look up the metabot row for the given UUID/entity-id, mirroring the resolution used by `metabase.metabot.tools.search`."
  [metabot-id]
  (when metabot-id
    (metabot.db/metabot-by-entity-id (get-in metabot.config/metabot-config
                                             [metabot-id :entity-id]
                                             metabot-id))))

(defn- filter-recents-to-curated
  "Keep only recents that are curated (verified, official-collection, library/published, or authoritative).
  Delegates to metabot.curation/curated-ids, the source-of-truth check, so recent-view filtering can't drift
  from the canonical rule and doesn't depend on the search index."
  [recents]
  (let [curated (curation/curated-ids (map (juxt (comp name :model) :id) recents))]
    (filter (fn [{:keys [model id]}] (contains? curated [(name model) id])) recents)))

(def ^:private profiles-excluding-recent-views
  "Profiles for which recent views are never injected.

  The nlq profile discovers data through the curated library tool rather than general instance search, so arbitrary
  recently-viewed items (which may not be curated) would undermine that guarantee. (A :nlq request served the
  general-search fallback keeps the external profile-id :nlq, so this is reached via :nlq; :nlq-fallback is listed for
  a direct request.)  The slackbot and document-generate-content profiles historically did not include recent views,
  so we preserve that behavior."
  #{:nlq :nlq-fallback :slackbot :document-generate-content})

(defn- add-recent-views
  "Add user's recent views to the context since these have a higher likelihood of being relevant to a user's query.
  Includes the 5 most recent items across cards, datasets, metrics, dashboards, and tables.
  (Excludes collections and documents for now, which aren't searchable by Metabot.)

  When `metabot-id` is provided and the metabot has `use_verified_content` enabled, filters recents down
  to curated content (verified, official-collection, library/published, or authoritative) before taking
  the top 5, matching how search filters answer sources.

  Skips recents entirely for profiles in [[profiles-excluding-recent-views]]."
  [context {:keys [metabot-id profile-id] :as _opts}]
  (try
    ;; When disabled (or excluded for this profile), strip any preexisting :user_recently_viewed so recent
    ;; views never reach the prompt, even for a caller-supplied context that already carries the key.
    (if (or (not (metabot.settings/metabot-recent-views-enabled?))
            (contains? profiles-excluding-recent-views profile-id))
      (dissoc context :user_recently_viewed)
      (assoc context :user_recently_viewed
             (let [recents (:recents (activity-feed/get-recents api/*current-user-id*
                                                                [:views :selections]
                                                                {:models [:card :dataset :metric :dashboard :table]}))
                   recents (cond->> recents
                             (:use_verified_content (get-metabot metabot-id))
                             filter-recents-to-curated)]
               (mapv (fn [item]
                       (let [item-type
                             (case (:model item)
                               :card "question"
                               :dataset "model"
                               (name (:model item)))]
                         (-> item
                             (select-keys [:id :name :description])
                             (assoc :type item-type))))
                     (take 5 recents)))))
    (catch Exception e
      (log/errorf "Error adding recent views to metabot context: %s" (ex-message e))
      context)))

(defn- set-user-time
  [context {:keys [date-format] :or {date-format DateTimeFormatter/ISO_INSTANT}}]
  (let [offset-time (or (some-> context :current_time_with_timezone OffsetDateTime/parse)
                        (OffsetDateTime/now))]
    (-> context
        (dissoc :current_time_with_timezone)
        (assoc :current_user_time (.format ^DateTimeFormatter date-format offset-time)))))

(mu/defn create-context :- ::context
  "Create a tool context."
  ([context :- ::context]
   (create-context context nil))
  ([context :- ::context
    opts    :- [:maybe [:map-of :keyword :any]]]
   (metabot.perms/with-cache
     (-> context
         enhance-context-with-schema
         annotate-transform-source-types
         (add-recent-views (or opts {}))
         (set-user-time opts)))))
