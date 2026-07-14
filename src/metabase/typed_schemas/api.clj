(ns metabase.typed-schemas.api
  "/api/typed-schemas endpoints."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.system.core :as system]
   [metabase.typed-schemas.api.common :as common]
   [metabase.typed-schemas.api.render :as render]
   [metabase.typed-schemas.api.scope :as scope]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def ^:private typescript-response-headers
  {"Content-Type"                 "text/typescript; charset=utf-8"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-store"})

(defn- select-cards
  ([card-type database-ids]
   (select-cards card-type database-ids nil))
  ([card-type database-ids collection-ids]
   (->> (t2/select :model/Card
                   {:where    (cond-> [:and
                                       [:= :type (name card-type)]
                                       [:= :archived false]
                                       (collection/visible-collection-filter-clause :collection_id)]
                                database-ids (conj (scope/database-id-filter-clause database-ids :database_id))
                                collection-ids (conj (scope/id-filter-clause collection-ids :collection_id)))
                    :order-by [[:name :asc] [:id :asc]]})
        (filter mi/can-read?))))

(defn- card-type-name
  [card]
  (some-> (:type card) name))

(defn- schema-details-error-message
  [card error-message]
  (format "Failed to build schema details for %s \"%s\" (card %s): %s"
          (or (card-type-name card) "card")
          (or (:name card) "Untitled")
          (:id card)
          (or error-message "unknown error")))

(defn- schema-details-error-data
  [card m]
  (m/assoc-some
   {:card-id   (:id card)
    :card-name (:name card)
    :card-type (:type card)}
   :status-code (:status-code m)))

(defn- model-action-error-message
  ([model error-message]
   (format "Failed to build action schemas for model \"%s\" (card %s): %s"
           (or (:name model) "Untitled")
           (:id model)
           (or error-message "unknown error")))
  ([model action error-message]
   (format "Failed to build action schema for action \"%s\" (action %s, type %s) on model \"%s\" (card %s): %s"
           (or (:name action) "Untitled")
           (:id action)
           (or (some-> (:type action) name) "unknown")
           (or (:name model) "Untitled")
           (:id model)
           (or error-message "unknown error"))))

(defn- model-action-error-data
  ([model m]
   (m/assoc-some
    {:model-id   (:id model)
     :model-name (:name model)}
    :status-code (:status-code m)))
  ([model action m]
   (m/assoc-some
    (assoc (model-action-error-data model m)
           :action-id   (:id action)
           :action-name (:name action)
           :action-type (:type action))
    :status-code (:status-code m))))

(defn- raw-model-actions
  [model-id]
  (t2/select :model/Action
             :model_id model-id
             :archived false
             :type [:not= "http"]))

(defn- dropped-actions
  [raw-actions actions]
  (let [action-ids (set (map :id actions))]
    (not-empty
     (remove #(contains? action-ids (:id %)) raw-actions))))

(defn- dropped-actions-message
  [model dropped-actions]
  (format "Failed to build action schemas for model \"%s\" (card %s): selected actions were dropped while normalizing action details: %s"
          (or (:name model) "Untitled")
          (:id model)
          (str/join ", "
                    (for [action dropped-actions]
                      (format "%s (action %s, type %s)"
                              (or (:name action) "Untitled")
                              (:id action)
                              (or (some-> (:type action) name) "unknown"))))))

(defn- dropped-actions-data
  [model dropped-actions]
  (assoc (model-action-error-data model nil)
         :dropped-actions (mapv #(select-keys % [:id :name :type]) dropped-actions)))

(defn- question-details
  [card]
  (let [response (try
                   (entity-details/get-report-details {:report-id             (:id card)
                                                       :with-field-values?    false
                                                       :with-related-tables?  false
                                                       :with-metrics?         false
                                                       :with-measures?        false
                                                       :with-segments?        false})
                   (catch Exception e
                     (throw (ex-info (schema-details-error-message card (ex-message e))
                                     (assoc (schema-details-error-data card (ex-data e))
                                            :cause-message (ex-message e))
                                     e))))]
    (or (:structured-output response)
        (let [error-message (:output response)]
          (throw (ex-info (schema-details-error-message card error-message)
                          (assoc (schema-details-error-data card response)
                                 :error-message error-message
                                 :response response)))))))

(defn- metric-result-column
  [card]
  (try
    (let [mp    (lib-be/application-database-metadata-provider (:database_id card))
          query (lib/query mp (:dataset_query card))
          col   (->> (lib/returned-columns query)
                     (filter #(= (:lib/source %) :source/aggregations))
                     first)]
      (when col
        (metabot.tools.u/->result-column query col)))
    (catch Exception _
      nil)))

(defn- metric-details
  [card]
  (-> (entity-details/get-metric-details {:metric-id                       (:id card)
                                          :with-default-temporal-breakout? true
                                          :with-field-values?              false
                                          :with-queryable-dimensions?      true
                                          :with-segments?                  false})
      :structured-output))

(defn- question-schema
  [{:keys [id name description verified display result-columns portable_entity_id]}]
  (m/assoc-some
   {:type    "card"
    :key     (common/generated-key name id)
    :id      id
    :name    name
    :display display
    :columns (mapv common/column-schema result-columns)}
   :entityId portable_entity_id
   :description description
   :verified (when verified true)))

(defn- ->keyword
  "Coerces strings or keywords into a keyword for uniform type inspection."
  [v]
  (cond
    (keyword? v) v
    (string? v)  (keyword v)
    :else        nil))

(defn- param-type->js-type
  "Maps a Metabase parameter type (`:number`, `:string/=`, `:date/single`,
  `:=`, `:id`, …) to a JS-level type matching [[js-type]]'s convention.
  Returns nil for ambiguous types (`:=`, `:id`, `:category`, …) so the
  caller can fall back to other type sources like a backing template-tag."
  [param-type]
  (when-let [k (->keyword param-type)]
    (let [prefix (or (namespace k) (name k))]
      (case prefix
        ("number" "numeric") "number"
        ("text" "string")    "string"
        "date"               "Date"
        "boolean"            "boolean"
        nil))))

(defn- template-tag-name-from-target
  "Extracts the template-tag name from a parameter's `:target`.
  Target shape: `[:variable [:template-tag <name>]]` (with keywords or strings
  at any position depending on serialization)."
  [target]
  (when (sequential? target)
    (let [[op inner] target]
      (when (and (or (= op :variable) (= op "variable"))
                 (sequential? inner))
        (let [[tag-op tag-name] inner]
          (when (or (= tag-op :template-tag) (= tag-op "template-tag"))
            (cond
              (string? tag-name)  tag-name
              (keyword? tag-name) (clojure.core/name tag-name)
              :else               nil)))))))

(defn- query-action-template-tag-types
  "For a query action, builds `{template-tag-name → tag-type}` from the
  saved `dataset_query`. Empty for non-query actions and for actions
  without a native query stage."
  [{:keys [type dataset_query]}]
  (when (and (= (->keyword type) :query) dataset_query)
    (let [stage-tags (some-> dataset_query :stages first :template-tags)
          native-tags (some-> dataset_query :native :template-tags)
          tags (or stage-tags native-tags)]
      (into {}
            (for [[tag-key tag] tags]
              [(or (:name tag)
                   (cond
                     (string? tag-key)  tag-key
                     (keyword? tag-key) (clojure.core/name tag-key)
                     :else              nil))
               (:type tag)])))))

(defn- action-parameter-schema
  "Each parameter on an Action. The `:slug` is the key the bundle uses in the
  execute payload (`execute({ <slug>: value, … })`). For implicit actions the
  slug is `(slugify column-name)`; for custom (query) actions it's whatever
  the user assigned."
  [tag-types
   {:keys [id slug name display-name type target required]}]
  (let [resolved-slug (or slug
                          (some-> id clojure.core/name)
                          (some-> name u/slugify))
        resolved-type (or (param-type->js-type type)
                          (param-type->js-type
                           (get tag-types
                                (template-tag-name-from-target target)))
                          "unknown")]
    (m/assoc-some
     {:slug resolved-slug
      :displayName (or display-name name resolved-slug)
      :jsType resolved-type}
     :required (when required true))))

(defn- action-schema
  "A pre-existing Metabase action. HTTP actions are filtered upstream because
  the execute endpoint refuses to run them."
  [{:keys [id name description type kind parameters entity_id] :as action}]
  (let [tag-types (query-action-template-tag-types action)
        implicit? (= (->keyword type) :implicit)]
    (m/assoc-some
     {:kind       "action"
      :key        (common/generated-key name id)
      :id         id
      :name       name
      :type       (some-> type clojure.core/name)
      :parameters (mapv #(action-parameter-schema tag-types %) parameters)}
     :description description
     :entityId entity_id
     :implicitKind (when implicit?
                     (some-> kind ->keyword u/qualified-name)))))

(defn- model-actions
  "Fetches non-archived, non-HTTP actions for a single model and emits each
  in schema form. Returns nil when the model has no executable actions."
  [model]
  (let [raw-actions (raw-model-actions (:id model))
        actions (try
                  (actions/select-actions
                   nil
                   :model_id (:id model)
                   :archived false
                   :type [:not= "http"])
                  (catch Exception e
                    (throw (ex-info (model-action-error-message model (ex-message e))
                                    (assoc (model-action-error-data model (ex-data e))
                                           :cause-message (ex-message e))
                                    e))))
        dropped (dropped-actions raw-actions actions)]
    (when dropped
      (throw (ex-info (dropped-actions-message model dropped)
                      (dropped-actions-data model dropped))))
    (when (seq actions)
      (mapv (fn [action]
              (try
                (action-schema action)
                (catch Exception e
                  (throw (ex-info (model-action-error-message model action (ex-message e))
                                  (assoc (model-action-error-data model action (ex-data e))
                                         :cause-message (ex-message e))
                                  e)))))
            actions))))

(defn- model-schema
  "A Metabase model (curated dataset) as an action namespace. Returns nil when
  the model has no executable actions."
  [{:keys [id name] :as model}]
  (let [action-schemas (model-actions model)]
    (when (seq action-schemas)
      {:key              (common/generated-key name id)
       :keyDisambiguator id
       :actions          (common/keyed-map action-schemas)})))

(defn- persisted-dimension->column
  [dimension]
  (let [field-id (some-> dimension :sources first :field-id)]
    {:name           (:name dimension)
     :display_name   (:display-name dimension)
     :base_type      (some-> (:effective-type dimension) u/qualified-name)
     :effective_type (some-> (:effective-type dimension) u/qualified-name)
     :semantic_type  (some-> (:semantic-type dimension) u/qualified-name)
     :field_id       field-id}))

(defn- field-table-id
  [field-id]
  (when (integer? field-id)
    (t2/select-one-fn :table_id :model/Field :id field-id)))

(defn- dimension-table-id
  [{:keys [field_id] :as dimension}]
  (let [field-id (or field_id (some-> dimension :sources first :field-id))]
    (or (:table_id dimension)
        (:table-id dimension)
        (field-table-id field-id))))

(defn- dimension-schema
  ([dimension metric-id]
   (dimension-schema dimension metric-id {}))
  ([dimension metric-id table-key-by-id]
   (dimension-schema dimension metric-id table-key-by-id {}))
  ([{:keys [field_id] :as dimension}
    metric-id
    table-key-by-id
    table-source-name-by-id]
   (let [dimension-id (or (:id dimension) field_id)
         field-id     (or field_id (some-> dimension :sources first :field-id))
         table-id     (dimension-table-id dimension)
         column       (if (:sources dimension)
                        (persisted-dimension->column dimension)
                        dimension)]
     (m/assoc-some
      (assoc (common/column-schema column)
             :type "column"
             :key (common/generated-key (:name column) dimension-id)
             :id (str dimension-id))
      :sourceName (when (integer? table-id)
                    (get table-source-name-by-id table-id))
      :fieldId (when (integer? field-id) field-id)
      :tableId (when (integer? table-id) table-id)
      :sourceFieldId (when (integer? (:source-field-id dimension))
                       (:source-field-id dimension))
      :metricId metric-id
      :keyDisambiguator (when (integer? table-id)
                          (get table-key-by-id table-id))))))

(defn- field-schema
  ([field]
   (field-schema field nil))
  ([{:keys [id field_id] :as field} source-name]
   (let [field-id (or id field_id)
         table-id (or (:table_id field) (:table-id field) (field-table-id field-id))]
     (m/assoc-some
      (assoc (common/column-schema field)
             :type "column"
             :key (common/generated-key (:name field) field-id)
             :id field-id)
      :sourceName source-name
      :fieldId (when (integer? field-id) field-id)
      :tableId (when (integer? table-id) table-id)
      :defaultTemporalBucket (:unit field)))))

(defn- mapping-source-field-id
  [{:keys [target]}]
  (when (and (vector? target)
             (= :field (first target))
             (map? (second target)))
    (let [source-field-id (:source-field (second target))]
      (when (integer? source-field-id)
        source-field-id))))

(defn- enrich-dimensions-with-mappings
  [dimensions dimension-mappings]
  (let [mapping-by-dimension-id (into {} (map (juxt :dimension-id identity)) dimension-mappings)]
    (mapv (fn [{:keys [id] :as dimension}]
            (m/assoc-some dimension
                          :source-field-id (some-> (get mapping-by-dimension-id id)
                                                   mapping-source-field-id)))
          dimensions)))

(defn- metric-dimensions
  [{:keys [id]}]
  (metrics/sync-dimensions! :metadata/metric id)
  (let [{:keys [dimensions dimension_mappings]} (t2/select-one [:model/Card :dimensions :dimension_mappings] :id id)]
    (enrich-dimensions-with-mappings dimensions dimension_mappings)))

(defn- readable-table-source-rows
  [table-ids]
  (when (seq table-ids)
    (->> (t2/select [:model/Table :id :name :display_name] :id [:in table-ids])
         (filter mi/can-read?))))

(defn- table-key-disambiguators
  ([table-ids]
   (table-key-disambiguators table-ids (readable-table-source-rows table-ids)))
  ([_table-ids table-rows]
   (when (seq table-rows)
     (->> table-rows
          (map (fn [{:keys [id name display_name]}]
                 [id (common/pascal-case (common/generated-key (or display_name name) id))]))
          (into {})))))

(defn- table-source-names
  ([table-ids]
   (table-source-names table-ids (readable-table-source-rows table-ids)))
  ([_table-ids table-rows]
   (when (seq table-rows)
     (->> table-rows
          (map (juxt :id :name))
          (into {})))))

(defn- source-table-schema
  [[database-name schema-name table-name]]
  (when (and database-name table-name)
    {:databaseName database-name
     :schemaName   schema-name
     :tableName    table-name}))

(defn- source-table-id
  [card]
  (let [source-table (or (get-in card [:dataset_query :query :source-table])
                         (get-in card [:dataset_query :stages 0 :source-table]))]
    (when (integer? source-table)
      source-table)))

(defn- source-card-id
  [card]
  (or (when-let [source-card (get-in card [:dataset_query :stages 0 :source-card])]
        (when (integer? source-card)
          source-card))
      (let [source-table (or (get-in card [:dataset_query :query :source-table])
                             (get-in card [:dataset_query :stages 0 :source-table]))]
        (when (string? source-table)
          (some->> (re-matches #"card__(\d+)" source-table)
                   second
                   parse-long)))))

(defn- fallback-metric-column
  [{:keys [name]}]
  {:type          "column"
   :name          name
   :displayName   name
   :jsType        "unknown"})

(defn- measure-result-column
  [database-id measure-id]
  (try
    (when-let [definition (t2/select-one-fn :definition :model/Measure :id measure-id)]
      (let [mp    (lib-be/application-database-metadata-provider database-id)
            query (lib/query mp definition)
            col   (->> (lib/returned-columns query)
                       (filter #(= (:lib/source %) :source/aggregations))
                       first)]
        (when col
          (metabot.tools.u/->result-column query col))))
    (catch Exception _
      nil)))

(defn- metric-schema
  [{:keys [id name description verified portable_entity_id base_table_portable_fk] :as details}
   card]
  (let [result-column (or (some-> (metric-result-column card) common/column-schema)
                          (fallback-metric-column details))
        source-card-id-value (source-card-id card)
        dimensions    (cond->> (or (seq (metric-dimensions details))
                                   (:queryable-dimensions details))
                        source-card-id-value (remove (comp integer? dimension-table-id)))
        table-ids     (->> dimensions
                           (keep dimension-table-id)
                           (filter integer?)
                           distinct)
        table-rows              (readable-table-source-rows table-ids)
        table-key-by-id         (table-key-disambiguators table-ids table-rows)
        table-source-name-by-id (table-source-names table-ids table-rows)
        dimension-schemas (mapv #(dimension-schema % id table-key-by-id table-source-name-by-id)
                                dimensions)
        mapped-table-ids  (->> dimension-schemas
                               (keep :tableId)
                               distinct
                               sort
                               vec)]
    (m/assoc-some
     {:type       "metric"
      :key        (common/generated-key name id)
      :id         id
      :name       name
      :columns    [result-column]}
     :databaseId (:database_id card)
     :sourceTableId (source-table-id card)
     :sourceCardId source-card-id-value
     :entityId portable_entity_id
     :description description
     :verified (when verified true)
     :sourceTable (source-table-schema base_table_portable_fk)
     :mappedTableIds (not-empty mapped-table-ids)
     :dimensions (not-empty (common/keyed-map dimension-schemas)))))

(defn- select-tables
  ([database-ids]
   (select-tables database-ids nil))
  ([database-ids table-ids]
   (->> (t2/select :model/Table
                   {:where    (cond-> [:and [:= :active true]]
                                database-ids (conj (scope/database-id-filter-clause database-ids :db_id))
                                table-ids (conj (scope/id-filter-clause table-ids :id)))
                    :order-by [[:name :asc] [:id :asc]]})
        (filter mi/can-read?))))

(defn- select-library-tables
  [{:keys [data-collection-ids]}]
  (->> (t2/select :model/Table
                  {:where    [:and
                              [:= :active true]
                              [:= :is_published true]
                              (scope/id-filter-clause data-collection-ids :collection_id)]
                   :order-by [[:name :asc] [:id :asc]]})
       (filter mi/can-read?)))

(defn- segment-schema
  [table-id {:keys [id name description display-name portable-entity-id portable_entity_id]}]
  (m/assoc-some
   {:type    "segment"
    :key     (common/generated-key (or display-name name) id)
    :id      id
    :tableId table-id
    :name    name}
   :entityId (or portable_entity_id portable-entity-id)
   :description description))

(defn- measure-schema
  [table-id database-id {:keys [id name description display-name portable-entity-id portable_entity_id]}]
  (m/assoc-some
   {:type    "measure"
    :key     (common/generated-key (or display-name name) id)
    :id      id
    :tableId table-id
    :name    name
    :columns [(or (some-> (measure-result-column database-id id) common/column-schema)
                  (fallback-metric-column {:name (or display-name name)}))]}
   :entityId (or portable_entity_id portable-entity-id)
   :description description))

(defn- table-schema
  [{:keys [id name description display_name database_id database_name database_schema portable_entity_id fields segments measures]}]
  (let [segments-map (common/keyed-map (map #(segment-schema id %) segments))
        measures-map (common/keyed-map (map #(measure-schema id database_id %) measures))]
    (m/assoc-some
     {:type         "table"
      :key          (common/generated-key (or display_name name) id)
      :id           id
      :name         (or display_name name)
      :databaseName database_name
      :tableName    name
      :fields       (common/keyed-map (map #(field-schema % name) fields))}
     :entityId portable_entity_id
     :description description
     :schemaName database_schema
     :segments (not-empty segments-map)
     :measures (not-empty measures-map))))

(defn- table-details
  [table]
  (some-> (entity-details/get-table-details
           {:entity-type          :table
            :entity-id            (:id table)
            :with-fields?         true
            :with-field-values?   false
            :with-related-tables? false
            :with-metrics?        false
            :with-measures?       true
            :with-segments?       true})
          :structured-output))

(defn- question-schemas
  ([database-ids]
   (question-schemas database-ids nil))
  ([database-ids collection-ids]
   (for [card (select-cards :question database-ids collection-ids)
         :let [details (question-details card)]
         :when details]
     (question-schema details))))

(defn- model-schemas
  ([database-ids]
   (model-schemas database-ids nil))
  ([database-ids collection-ids]
   (for [card (select-cards :model database-ids collection-ids)
         :let [details (question-details card)
               schema  (some-> details model-schema)]
         :when schema]
     schema)))

(defn- metric-schemas
  ([database-ids]
   (metric-schemas database-ids nil))
  ([database-ids collection-ids]
   (for [card (select-cards :metric database-ids collection-ids)
         :let [details (metric-details card)]
         :when details]
     (metric-schema details card))))

(defn- table-schemas
  [tables]
  (for [table tables
        :let [details (table-details table)]
        :when details]
    (table-schema details)))

(defn- base-schema
  [questions models tables metrics]
  (array-map
   :schemaVersion 2
   :generatedAt   (str (Instant/now))
   :metabase      {:instanceUrl (system/site-url)}
   :questions     (common/keyed-map questions)
   :models        (common/keyed-model-map models)
   :tables        (common/keyed-map tables)
   :metrics       (common/keyed-map metrics)))

(defn- validate-query-params!
  [query-params]
  (let [library-value              (scope/query-library-value query-params)
        library-collection-values  (scope/query-library-collection-values query-params)
        question-collection-values (scope/query-question-collection-values query-params)
        include-library-root?      (or (scope/query-include-data-library? query-params)
                                       (scope/query-include-metric-library? query-params))
        collection-scoped?         (or library-value
                                       library-collection-values
                                       question-collection-values
                                       include-library-root?)
        database-value             (scope/query-database-value query-params)
        questions-only             (scope/truthy-query-param? (:questions query-params))]
    (api/check-400
     (not (and library-value (or library-collection-values include-library-root?)))
     "The library query parameter is mutually exclusive with library-collections, include-data-library, and include-metric-library.")
    (api/check-400
     (not (and collection-scoped? database-value))
     "Collection-scoped query parameters and database query parameters are mutually exclusive.")
    (api/check-400
     (not (and collection-scoped? questions-only))
     "Collection-scoped query parameters and the questions query parameter are mutually exclusive.")
    (api/check-400
     (not (and questions-only (nil? database-value)))
     "The questions query parameter requires a database query parameter.")))

(defn- typed-schema-for-library-scope
  [library-scope models]
  (let [{:keys [metric-collection-ids]} library-scope
        metrics               (metric-schemas nil metric-collection-ids)
        mapped-table-ids      (->> metrics (mapcat :mappedTableIds) set)
        library-table-ids     (->> (select-library-tables library-scope) (map :id) set)
        table-ids             (set/union library-table-ids mapped-table-ids)
        tables                (table-schemas (select-tables nil table-ids))]
    (base-schema [] models tables metrics)))

(defn- typed-schema
  [query-params]
  (validate-query-params! query-params)
  (let [library-value              (scope/query-library-value query-params)
        library-collection-values  (scope/query-library-collection-values query-params)
        question-collection-values (scope/query-question-collection-values query-params)
        library-scope              (scope/library-scope query-params)
        database-ids               (scope/database-ids-for-value (scope/query-database-value query-params))
        question-collection-ids    (scope/collection-scope question-collection-values)
        include-models?            (scope/query-include-models? query-params)
        models                     (cond
                                     database-ids
                                     (model-schemas database-ids)

                                     include-models?
                                     (model-schemas nil)

                                     :else
                                     [])
        questions-only             (scope/truthy-query-param? (:questions query-params))]
    (cond
      (or library-value
          library-collection-values
          library-scope
          question-collection-values
          (and include-models? (nil? database-ids)))
      (let [questions           (if question-collection-values
                                  (question-schemas nil question-collection-ids)
                                  [])
            library-schema      (some-> library-scope
                                        (typed-schema-for-library-scope models))]
        (base-schema questions
                     models
                     (-> library-schema :tables vals)
                     (-> library-schema :metrics vals)))

      questions-only
      (base-schema (question-schemas database-ids) models [] [])

      :else
      (let [questions (question-schemas database-ids)
            metrics   (metric-schemas database-ids)
            tables    (table-schemas (select-tables database-ids))]
        (base-schema questions models tables metrics)))))

(def ^:private TypedSchemaQueryParams
  [:map
   [:database {:optional true} [:maybe ms/NonBlankString]]
   [:database-name {:optional true} [:maybe ms/NonBlankString]]
   [:library {:optional true} [:maybe ms/NonBlankString]]
   [:library-collections {:optional true} [:maybe ms/NonBlankString]]
   [:collections {:optional true} [:maybe ms/NonBlankString]]
   [:question-collections {:optional true} [:maybe ms/NonBlankString]]
   [:include-data-library {:optional true} [:maybe :boolean]]
   [:include-metric-library {:optional true} [:maybe :boolean]]
   [:include-models {:optional true} [:maybe :boolean]]
   [:questions {:optional true} [:maybe :boolean]]])

(api.macros/defendpoint :get "/v1/typescript" :- :any
  "Generate a TypeScript semantic schema module."
  [_route-params
   query-params :- TypedSchemaQueryParams
   _body
   _request
   respond
   _raise]
  (respond {:status  200
            :headers typescript-response-headers
            :body    (render/render-typescript (typed-schema query-params))}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/typed-schemas/` routes."
  (api.macros/ns-handler *ns*))
