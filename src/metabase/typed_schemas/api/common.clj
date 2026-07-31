(ns metabase.typed-schemas.api.common
  "Shared helpers for typed-schema generation."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
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

(defn keyed-map
  "Returns a sorted map keyed by each entity key, disambiguating duplicate keys."
  [entities]
  (let [entities         (vec entities)
        base-key->count  (frequencies (map :key entities))
        candidate-keys   (mapv (partial keyed-map-candidate-key base-key->count) entities)
        candidate->count (frequencies candidate-keys)]
    (into (sorted-map)
          (map (fn [[entity candidate-key]]
                 (let [key (cond-> candidate-key
                             (duplicate-key? candidate->count candidate-key) (str (:id entity)))]
                   [key (-> entity
                            (dissoc :keyDisambiguator)
                            (assoc :key key))])))
          (map vector entities candidate-keys))))

(defn keyed-model-map
  "Returns a sorted model map keyed by model key, exposing only action namespaces."
  [models]
  (reduce-kv (fn [model-map model-key model]
               (assoc model-map model-key (select-keys model [:actions])))
             (sorted-map)
             (keyed-map models)))
