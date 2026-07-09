(ns metabase.typed-schemas.api.common
  "Shared helpers for typed-schema generation."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

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
  (let [k (some-> entity-name u/->camelCaseEn)]
    (if (str/blank? k)
      (str "entity" id)
      k)))

(defn pascal-case
  "Capitalizes the first character of `s` without changing the rest."
  [s]
  (when-not (str/blank? s)
    (str (u/upper-case-en (subs s 0 1))
         (subs s 1))))

(defn keyed-map
  "Returns a sorted map keyed by each entity key, disambiguating duplicate keys."
  [entities]
  (let [entities          (vec entities)
        base-key->count   (frequencies (map :key entities))
        duplicate-key?    (fn [base-key]
                            (> (get base-key->count base-key 0) 1))
        candidate-key     (fn [entity]
                            (let [base-key (:key entity)]
                              (if-not (duplicate-key? base-key)
                                base-key
                                (str base-key (or (:keyDisambiguator entity)
                                                  (:tableId entity)
                                                  (:id entity))))))
        candidate->count  (frequencies (map candidate-key entities))
        disambiguated-key (fn [entity]
                            (let [candidate (candidate-key entity)]
                              (if (= 1 (get candidate->count candidate))
                                candidate
                                (str candidate (:id entity)))))]
    (reduce (fn [m entity]
              (let [key (disambiguated-key entity)]
                (assoc m key (-> entity
                                 (dissoc :keyDisambiguator)
                                 (assoc :key key)))))
            (sorted-map)
            entities)))

(defn keyed-model-map
  "Returns a sorted model map keyed by model key, exposing only action namespaces."
  [models]
  (reduce-kv (fn [m k model]
               (assoc m k (select-keys model [:actions])))
             (sorted-map)
             (keyed-map models)))
