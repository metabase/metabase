(ns metabase.typed-schemas.api
  "/api/typed-schemas endpoints."
  (:require
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def ^:private javascript-response-headers
  {"Content-Type"                 "text/javascript; charset=utf-8"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-store"})

(def ^:private typescript-response-headers
  (assoc javascript-response-headers "Content-Type" "text/typescript; charset=utf-8"))

(def ^:private js-identifier-key-pattern
  #"\"([A-Za-z_$][A-Za-z0-9_$]*)\"\s*:")

(defn- js-type
  [{:keys [type base_type effective_type] :as _column}]
  (case type
    :number   "number"
    :boolean  "boolean"
    :string   "string"
    :date     "Date"
    :datetime "Date"
    :time     "Date"
    (let [schema-type (or effective_type base_type)]
      (cond
        (some-> schema-type (str/includes? "Boolean")) "boolean"
        (some-> schema-type (str/includes? "Number"))  "number"
        (some-> schema-type (str/includes? "Integer")) "number"
        (some-> schema-type (str/includes? "Float"))   "number"
        (some-> schema-type (str/includes? "Decimal")) "number"
        (some-> schema-type (str/includes? "Date"))    "Date"
        (some-> schema-type (str/includes? "Time"))    "Date"
        (some-> schema-type (str/includes? "Text"))    "string"
        (some-> schema-type (str/includes? "UUID"))    "string"
        :else                                          "unknown"))))

(defn- assoc-some
  [m & kvs]
  (reduce (fn [m [k v]]
            (cond-> m
              (some? v) (assoc k v)))
          m
          (partition 2 kvs)))

(defn- column-schema
  [{:keys [name display_name base_type effective_type semantic_type description unit] :as column}]
  (let [effective-type (or effective_type base_type)]
    (assoc-some
     {:name        name
      :displayName (or display_name name)
      :jsType      (js-type column)}
     :baseType base_type
     :effectiveType (when (not= effective-type base_type) effective-type)
     :semanticType semantic_type
     :description description
     :unit unit)))

(defn- generated-key
  [entity-name id]
  (let [k (some-> entity-name u/->camelCaseEn)]
    (if (str/blank? k)
      (str "entity" id)
      k)))

(defn- keyed-map
  [entities]
  (reduce (fn [m entity]
            (let [base-key (:key entity)
                  key      (if (contains? m base-key)
                             (str base-key (:id entity))
                             base-key)]
              (assoc m key (assoc entity :key key))))
          (sorted-map)
          entities))

(defn- query-database-name
  [query-params]
  (some-> (or (:database query-params)
              (get query-params "database")
              (:database-name query-params)
              (get query-params "database-name"))
          str/trim
          not-empty))

(defn- database-ids-for-name
  [database-name]
  (when database-name
    (->> (t2/select :model/Database :name database-name)
         (filter mi/can-read?)
         (map :id)
         set)))

(defn- database-id-filter-clause
  [database-ids column]
  (when database-ids
    (if (seq database-ids)
      [:in column database-ids]
      [:= column -1])))

(defn- select-cards
  [card-type database-ids]
  (->> (t2/select :model/Card
                  {:where    (cond-> [:and
                                      [:= :type (name card-type)]
                                      [:= :archived false]
                                      (collection/visible-collection-filter-clause :collection_id)]
                               database-ids (conj (database-id-filter-clause database-ids :database_id)))
                   :order-by [[:name :asc] [:id :asc]]})
       (filter mi/can-read?)))

(defn- question-details
  [card]
  (-> (entity-details/get-report-details {:report-id             (:id card)
                                          :with-field-values?    false
                                          :with-related-tables?  false
                                          :with-metrics?         false
                                          :with-measures?        false
                                          :with-segments?        false})
      :structured-output))

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
  (assoc-some
   {:kind    "question"
    :key     (generated-key name id)
    :id      id
    :name    name
    :display display
    :columns (mapv column-schema result-columns)}
   :entityId portable_entity_id
   :description description
   :verified (when verified true)))

(defn- persisted-dimension->column
  [dimension]
  (let [field-id (some-> dimension :sources first :field-id)]
    {:name           (:name dimension)
     :display_name   (:display-name dimension)
     :base_type      (some-> (:effective-type dimension) u/qualified-name)
     :effective_type (some-> (:effective-type dimension) u/qualified-name)
     :semantic_type  (some-> (:semantic-type dimension) u/qualified-name)
     :field_id       field-id}))

(defn- dimension-schema
  [{:keys [field_id] :as dimension}]
  (let [dimension-id (or (:id dimension) field_id)
        field-id     (or field_id (some-> dimension :sources first :field-id))
        table-id     (or (:table_id dimension) (:table-id dimension))
        column       (if (:sources dimension)
                       (persisted-dimension->column dimension)
                       dimension)]
    (assoc-some
     (assoc (column-schema column)
            :key (generated-key (:name column) dimension-id)
            :id (str dimension-id))
     :tableId (when (integer? table-id) table-id)
     :fieldId (when (integer? field-id) field-id))))

(defn- field-schema
  [{:keys [id field_id] :as field}]
  (let [field-id (or id field_id)]
    (assoc-some
     (assoc (column-schema field)
            :key (generated-key (:name field) field-id)
            :id field-id)
     :fieldId (when (integer? field-id) field-id)
     :defaultTemporalBucket (:unit field))))

(defn- metric-dimensions
  [{:keys [id]}]
  (metrics/sync-dimensions! :metadata/metric id)
  (-> (t2/select-one [:model/Card :dimensions] :id id)
      :dimensions))

(defn- source-table-schema
  [[database-name schema-name table-name]]
  (when (and database-name table-name)
    {:databaseName database-name
     :schemaName   schema-name
     :tableName    table-name}))

(defn- fallback-metric-column
  [{:keys [name]}]
  {:name          name
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
  (let [result-column (or (some-> (metric-result-column card) column-schema)
                          (fallback-metric-column details))
        dimensions    (or (seq (metric-dimensions details))
                          (:queryable-dimensions details))
        dimension-schemas (mapv dimension-schema dimensions)
        mapped-table-ids  (->> dimension-schemas
                               (keep :tableId)
                               distinct
                               sort
                               vec)]
    (assoc-some
     {:kind       "metric"
      :key        (generated-key name id)
      :id         id
      :name       name
      :columns    [result-column]}
     :entityId portable_entity_id
     :description description
     :verified (when verified true)
     :sourceTable (source-table-schema base_table_portable_fk)
     :mappedTableIds (not-empty mapped-table-ids)
     :dimensions (not-empty (keyed-map dimension-schemas)))))

(defn- select-tables
  [database-ids]
  (->> (t2/select :model/Table
                  {:where    (cond-> [:and [:= :active true]]
                               database-ids (conj (database-id-filter-clause database-ids :db_id)))
                   :order-by [[:name :asc] [:id :asc]]})
       (filter mi/can-read?)))

(defn- segment-schema
  [table-id {:keys [id name description display-name portable-entity-id portable_entity_id]}]
  (assoc-some
   {:kind    "segment"
    :key     (generated-key (or display-name name) id)
    :id      id
    :tableId table-id
    :name    name}
   :entityId (or portable_entity_id portable-entity-id)
   :description description))

(defn- measure-schema
  [table-id database-id {:keys [id name description display-name portable-entity-id portable_entity_id]}]
  (assoc-some
   {:kind    "measure"
    :key     (generated-key (or display-name name) id)
    :id      id
    :tableId table-id
    :name    name
    :columns [(or (some-> (measure-result-column database-id id) column-schema)
                  (fallback-metric-column {:name (or display-name name)}))]}
   :entityId (or portable_entity_id portable-entity-id)
   :description description))

(defn- table-schema
  [{:keys [id name description display_name database_id database_name database_schema portable_entity_id fields segments measures]}]
  (let [segments-map (keyed-map (map #(segment-schema id %) segments))
        measures-map (keyed-map (map #(measure-schema id database_id %) measures))]
    (assoc-some
     {:kind         "table"
      :key          (generated-key (or display_name name) id)
      :id           id
      :name         (or display_name name)
      :databaseId   database_id
      :databaseName database_name
      :tableName    name
      :fields       (keyed-map (map field-schema fields))}
     :entityId portable_entity_id
     :description description
     :schemaName database_schema
     :segments (not-empty segments-map)
     :measures (not-empty measures-map))))

(defn- typed-schema
  [query-params]
  (let [database-ids (database-ids-for-name (query-database-name query-params))
        questions    (for [card (select-cards :question database-ids)
                           :let [details (question-details card)]
                           :when details]
                       (question-schema details))
        metrics      (for [card (select-cards :metric database-ids)
                           :let [details (metric-details card)]
                           :when details]
                       (metric-schema details card))
        tables       (for [table (select-tables database-ids)
                           :let [details (entity-details/get-table-details
                                          {:entity-type          :table
                                           :entity-id            (:id table)
                                           :with-fields?         true
                                           :with-field-values?   false
                                           :with-related-tables? false
                                           :with-metrics?        false
                                           :with-measures?       true
                                           :with-segments?       true})
                                 details (:structured-output details)]
                           :when details]
                       (table-schema details))]
    (array-map
     :schemaVersion 2
     :generatedAt   (str (Instant/now))
     :metabase      {:instanceUrl (system/site-url)}
     :questions     (keyed-map questions)
     :tables        (keyed-map tables)
     :metrics       (keyed-map metrics))))

(defn- unquote-js-property-names
  [s]
  (str/replace s js-identifier-key-pattern "$1:"))

(defn- encode-pretty
  [schema]
  (json/encode schema {:pretty true}))

(defn- render-javascript
  [schema]
  (str "export default " (unquote-js-property-names (encode-pretty schema)) ";\n"))

(defn- render-typescript
  [schema]
  (str "export default " (unquote-js-property-names (encode-pretty schema)) " as const;\n"))

(api.macros/defendpoint :get "/v1/javascript" :- :any
  "Generate a JavaScript semantic schema module."
  [_route-params query-params _body _request respond _raise]
  (respond {:status  200
            :headers javascript-response-headers
            :body    (render-javascript (typed-schema query-params))}))

(api.macros/defendpoint :get "/v1/typescript" :- :any
  "Generate a TypeScript semantic schema module."
  [_route-params query-params _body _request respond _raise]
  (respond {:status  200
            :headers typescript-response-headers
            :body    (render-typescript (typed-schema query-params))}))

(api.macros/defendpoint :get "/v1/json" :- :any
  "Generate a JSON semantic schema."
  [_route-params query-params]
  (typed-schema query-params))

(def ^{:arglists '([request respond raise])} routes
  "`/api/typed-schemas/` routes."
  (api.macros/ns-handler *ns*))
