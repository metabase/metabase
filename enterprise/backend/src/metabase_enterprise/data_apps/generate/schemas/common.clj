(ns metabase-enterprise.data-apps.generate.schemas.common
  "Shared helpers for generating a data app's schema."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.audit-app.core :as audit]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.core :as metabot]
   [metabase.premium-features.core :as premium-features]
   [metabase.types.core]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(comment metabase.types.core/keep-me)

;; Action parameters in generated schemas use these primitive types.
(def ^:private primitive-type->js-type
  {:number   "number"
   :boolean  "boolean"
   :string   "string"
   :date     "Date"
   :datetime "Date"
   :time     "Date"})

(defn- type-keyword
  [schema-type]
  (cond
    (keyword? schema-type) schema-type
    (string? schema-type)  (let [schema-type (str/replace schema-type #"^:" "")]
                             (if (str/includes? schema-type "/")
                               (keyword schema-type)
                               (keyword "type" schema-type)))))

;; Result columns and fields use Metabase base/effective types. For example,
;; `:type/Integer` maps to "number", and `:type/UUID` maps to "string".
(defn- schema-type->js-type
  [schema-type]
  (let [schema-type (type-keyword schema-type)]
    (cond
      (nil? schema-type)                     "unknown"
      (isa? schema-type :type/Boolean)       "boolean"
      (isa? schema-type :type/Number)        "number"
      (isa? schema-type :type/Temporal)      "Date"
      (isa? schema-type :type/Text)          "string"
      (isa? schema-type :type/TextLike)      "string"
      :else                                  "unknown")))

(defn- js-type
  [{:keys [type base_type effective_type] :as _column}]
  (or (get primitive-type->js-type type)
      (schema-type->js-type (or effective_type base_type))))

(defn column-schema
  "Returns the typed-schema representation for a result column or field-like map."
  [{:keys [name display_name base_type effective_type semantic_type description unit] :as column}]
  (let [effective-type (or effective_type base_type)]
    (m/assoc-some
     {:type        "column"
      :name        name
      :displayName (or display_name name)
      :jsType      (js-type column)}
     :baseType base_type
     :effectiveType (when (not= effective-type base_type) effective-type)
     :semanticType semantic_type
     :description description
     :unit unit)))

(defn generated-key
  "Returns a stable JavaScript object key for an entity name and id."
  [entity-name id]
  (let [generated-key (some-> entity-name u/->camelCaseEn)]
    (if (str/blank? generated-key)
      (str "entity" id)
      generated-key)))

(defn pascal-case
  "Capitalizes the first character of string without changing the rest."
  [string]
  (when-not (str/blank? string)
    (str (u/upper-case-en (subs string 0 1))
         (subs string 1))))

(defn- duplicate-key?
  [key->count key]
  (> (get key->count key 0) 1))

(defn- keyed-map-candidate-key
  [key->count {:keys [key id]
               key-disambiguator :keyDisambiguator
               table-id :tableId}]
  (cond-> key
    (duplicate-key? key->count key) (str (or key-disambiguator table-id id))))

(defn- unique-keys
  "Returns `ks` with every key that is still shared by several `entities` suffixed with its entity id until all are
  unique, so no entity overwrites another."
  [entities ks]
  (let [key->count (frequencies ks)]
    (if (every? #(= 1 %) (vals key->count))
      ks
      (recur entities (mapv (fn [entity k]
                              (cond-> k (duplicate-key? key->count k) (str "_" (:id entity))))
                            entities ks)))))

(defn keyed-map
  "Returns a sorted map keyed by each entity key, disambiguating duplicate keys."
  [entities]
  (let [entities         (vec entities)
        base-key->count  (frequencies (map :key entities))
        candidate-keys   (mapv (partial keyed-map-candidate-key base-key->count) entities)
        candidate->count (frequencies candidate-keys)
        ks               (unique-keys entities
                                      (mapv (fn [entity candidate-key]
                                              (cond-> candidate-key
                                                (duplicate-key? candidate->count candidate-key) (str (:id entity))))
                                            entities candidate-keys))]
    (into (sorted-map)
          (map (fn [entity key]
                 [key (-> entity
                          (dissoc :keyDisambiguator)
                          (assoc :key key))])
               entities ks))))

(defn without-unavailable-cards
  "`cards` without any backed by a routing destination database, and, while the audit feature is off, without the
  audit database's and the audit collection's: the card details lookup refuses one in the audit collection, and one
  on the audit database would be listed without its table."
  [cards]
  (let [destination-ids (data-apps.db/destination-database-ids (into #{} (keep :database_id) cards))
        audit-off?      (not (premium-features/enable-audit-app?))]
    (cond->> cards
      (seq destination-ids) (remove #(contains? destination-ids (:database_id %)))
      audit-off?            (remove #(or (= audit/audit-db-id (:database_id %))
                                         (some-> (:collection_id %) audit/is-collection-id-audit?))))))

(defn aggregation-result-column-with-metadata-provider
  "Returns an aggregation result column using an existing metadata provider."
  [metadata-provider query-definition]
  (try
    (let [query              (lib/query metadata-provider query-definition)
          aggregation-column (m/find-first #(= (:lib/source %) :source/aggregations)
                                           (lib/returned-columns query))]
      (when aggregation-column
        (metabot/->result-column query aggregation-column)))
    (catch Exception _
      nil)))

(defn aggregation-result-column
  "Returns the first aggregation result column for a saved query definition, for metrics and measures."
  [database-id query-definition]
  (try
    (aggregation-result-column-with-metadata-provider
     (lib-be/application-database-metadata-provider database-id)
     query-definition)
    (catch Exception _
      nil)))
