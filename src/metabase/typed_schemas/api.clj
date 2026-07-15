(ns metabase.typed-schemas.api
  "/api/typed-schemas endpoints."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.api.common :as common]
   [metabase.typed-schemas.api.render :as render]
   [metabase.typed-schemas.api.schema :as schema]
   [metabase.typed-schemas.api.schema.common :as schema.common]
   [metabase.typed-schemas.api.schema.model :as schema.model]
   [metabase.typed-schemas.api.schema.question :as schema.question]
   [metabase.typed-schemas.api.schema.table :as schema.table]
   [metabase.typed-schemas.api.scope :as scope]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private typescript-response-headers
  {"Content-Type"                 "text/typescript; charset=utf-8"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-store"})

(defn- metric-result-column
  [card]
  (schema.common/aggregation-result-column (:database_id card) (:dataset_query card)))

(defn- metric-details
  [card]
  (-> (entity-details/get-metric-details {:metric-id                       (:id card)
                                          :with-default-temporal-breakout? true
                                          :with-field-values?              false
                                          :with-queryable-dimensions?      true
                                          :with-segments?                  false})
      :structured-output))

(defn- persisted-dimension->column
  [dimension]
  (let [field-id (some-> dimension :sources first :field-id)]
    {:name           (:name dimension)
     :display_name   (:display-name dimension)
     :base_type      (some-> (:effective-type dimension) u/qualified-name)
     :effective_type (some-> (:effective-type dimension) u/qualified-name)
     :semantic_type  (some-> (:semantic-type dimension) u/qualified-name)
     :field_id       field-id}))

(defn- dimension-table-id
  [{:keys [field_id] :as dimension}]
  (let [field-id (or field_id (some-> dimension :sources first :field-id))]
    (or (:table_id dimension)
        (:table-id dimension)
        (schema.table/table-by-field-id field-id))))

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

(defn- metric-schemas
  ([database-ids]
   (metric-schemas database-ids nil))
  ([database-ids collection-ids]
   (for [card (schema.common/select-schema-cards :metric database-ids collection-ids)
         :let [details (metric-details card)]
         :when details]
     (metric-schema details card))))

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
        library-table-ids     (->> (schema.table/select-library-tables library-scope) (map :id) set)
        table-ids             (set/union library-table-ids mapped-table-ids)
        tables                (schema.table/table-schemas (schema.table/select-tables nil table-ids))]
    (schema/base-schema [] models tables metrics)))

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
                                     (schema.model/model-schemas database-ids)

                                     include-models?
                                     (schema.model/model-schemas nil)

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
                                  (schema.question/question-schemas nil question-collection-ids)
                                  [])
            library-schema      (some-> library-scope
                                        (typed-schema-for-library-scope models))]
        (schema/base-schema questions
                            models
                            (-> library-schema :tables vals)
                            (-> library-schema :metrics vals)))

      questions-only
      (schema/base-schema (schema.question/question-schemas database-ids) models [] [])

      :else
      (let [questions (schema.question/question-schemas database-ids)
            metrics   (metric-schemas database-ids)
            tables    (schema.table/table-schemas (schema.table/select-tables database-ids))]
        (schema/base-schema questions models tables metrics)))))

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
