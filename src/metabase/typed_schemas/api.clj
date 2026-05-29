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
  (assoc-some
   {:name          name
    :displayName   (or display_name name)
    :baseType      base_type
    :effectiveType (or effective_type base_type)
    :semanticType  semantic_type
    :jsType        (js-type column)}
   :description description
   :unit unit))

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

(defn- select-cards
  [card-type]
  (->> (t2/select :model/Card
                  {:where    [:and
                              [:= :type (name card-type)]
                              [:= :archived false]
                              (collection/visible-collection-filter-clause :collection_id)]
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
  {:kind        "question"
   :key         (generated-key name id)
   :id          id
   :entityId    portable_entity_id
   :name        name
   :description description
   :display     display
   :verified    (boolean verified)
   :columns     (mapv column-schema result-columns)
   :parameters  []})

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
        column       (if (:sources dimension)
                       (persisted-dimension->column dimension)
                       dimension)]
    (assoc (column-schema column)
           :key (generated-key (:name column) dimension-id)
           :id (str dimension-id)
           :fieldId (when (integer? field-id) field-id)
           :operators [])))

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
   :baseType      nil
   :effectiveType nil
   :semanticType  nil
   :jsType        "unknown"})

(defn- metric-schema
  [{:keys [id name description verified portable_entity_id base_table_portable_fk] :as details}
   card]
  (let [result-column (or (some-> (metric-result-column card) column-schema)
                          (fallback-metric-column details))
        dimensions    (or (seq (metric-dimensions details))
                          (:queryable-dimensions details))]
    {:kind        "metric"
     :key         (generated-key name id)
     :id          id
     :entityId    portable_entity_id
     :name        name
     :description description
     :verified    (boolean verified)
     :sourceTable (source-table-schema base_table_portable_fk)
     :columns     [result-column]
     :dimensions  (mapv dimension-schema dimensions)}))

(defn- typed-schema
  []
  (let [questions (for [card (select-cards :question)
                        :let [details (question-details card)]
                        :when details]
                    (question-schema details))
        metrics   (for [card (select-cards :metric)
                        :let [details (metric-details card)]
                        :when details]
                    (metric-schema details card))]
    (array-map
     :schemaVersion 1
     :generatedAt   (str (Instant/now))
     :metabase      {:instanceUrl (system/site-url)}
     :questions     (keyed-map questions)
     :metrics       (keyed-map metrics)
     :segments      {}
     :measures      {})))

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
  [_route-params _query-params _body _request respond _raise]
  (respond {:status  200
            :headers javascript-response-headers
            :body    (render-javascript (typed-schema))}))

(api.macros/defendpoint :get "/v1/typescript" :- :any
  "Generate a TypeScript semantic schema module."
  [_route-params _query-params _body _request respond _raise]
  (respond {:status  200
            :headers typescript-response-headers
            :body    (render-typescript (typed-schema))}))

(api.macros/defendpoint :get "/v1/json" :- :any
  "Generate a JSON semantic schema."
  []
  (typed-schema))

(def ^{:arglists '([request respond raise])} routes
  "`/api/typed-schemas/` routes."
  (api.macros/ns-handler *ns*))
