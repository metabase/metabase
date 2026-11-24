(ns metabase.warehouse-schema.transforms
  "Column transforms and value checks the Table, Field and user settings models share."
  (:require
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.lib.core :as lib]
   [metabase.types.core :as types]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]))

(set! *warn-on-reflection* true)

(defn- throw-invalid-value
  "Throws a 400 for `value` of `column`, with `message` under `:errors` and any `extra-data` merged in."
  ([column value message]
   (throw-invalid-value column value message nil))
  ([column value message extra-data]
   (throw (ex-info message (merge {:status-code 400
                                   :errors      {column message}
                                   :value       value}
                                  extra-data)))))

(defn- descends-from-any?
  "Whether `k` descends from one of `ancestor-types`, in `hierarchy` or else in the global hierarchy."
  [hierarchy k ancestor-types]
  (some #(if hierarchy (isa? hierarchy k %) (isa? k %)) ancestor-types))

(defn- not-a-descendant-message
  "The message for a value `k` of `column` of `model` outside `ancestor-types`."
  [model column k ancestor-types]
  (case model
    :model/Field (tru "Invalid value for Field column {0}: {1} is not a descendant of any of these types: {2}"
                      (pr-str column) (pr-str k) (pr-str ancestor-types))
    :model/Table (tru "Invalid value for Table column {0}: {1} is not a descendant of any of these types: {2}"
                      (pr-str column) (pr-str k) (pr-str ancestor-types))))

(defn hierarchy-keyword
  "A transform for the `column` of `model` holding a keyword that descends from one of `ancestor-types`.

  `hierarchy` defaults to the global hierarchy. Writing any other value throws a 400; reading one logs and returns
  `fallback-type`."
  [model column & {:keys [hierarchy ancestor-types fallback-type]}]
  {:in  (fn [k]
          (when-let [k (some-> k keyword)]
            (when-not (descends-from-any? hierarchy k ancestor-types)
              (throw-invalid-value column k (not-a-descendant-message model column k ancestor-types)
                                   {:allowed-ancestors ancestor-types}))
            (u/qualified-name k)))
   :out (fn [s]
          (when (seq s)
            (let [k (keyword s)]
              (if (descends-from-any? hierarchy k ancestor-types)
                k
                (do
                  (log/warnf "Invalid %s %s %s: falling back to %s" (name model) column k fallback-type)
                  fallback-type)))))})

(defn- enum-keyword
  "A transform for `column` holding one of the keywords `values`; a bad stored value reads as nil."
  [column values]
  (let [allowed (set values)]
    {:in  (fn [v]
            (when-let [k (some-> v keyword)]
              (when-not (allowed k)
                (throw-invalid-value column v (tru "Invalid value for {0}: {1}. Must be one of {2}"
                                                   (pr-str column) (pr-str v) (str/join ", " (map name values)))))
              (u/qualified-name k)))
     :out (fn [s]
            (when (seq s)
              (let [k (keyword s)]
                (if (allowed k)
                  k
                  (do (log/warnf "Invalid %s %s: reading it as nil" column (pr-str s))
                      nil)))))}))

(defn- schema-message
  "The message for `value` of `column` failing `schema`."
  [column schema value]
  (tru "Invalid value for {0}: {1}" (pr-str column) (pr-str (me/humanize (mr/explain schema value)))))

(defn- decoded-json
  "The JSON `s` decoded with keyword keys, or `::unreadable` (with a warning) when it does not parse."
  [column s]
  (try
    (json/decode+kw s)
    (catch Throwable e
      (log/warnf e "Unreadable %s: reading it as nil" column)
      ::unreadable)))

(defn- json-with-schema
  "A transform for `column` holding JSON of `schema`, with keyword keys; a bad stored value reads as nil."
  [column schema]
  {:in  (fn [v]
          (when (some? v)
            (let [v (lib/normalize schema v)]
              (when-not (mr/validate schema v)
                (throw-invalid-value column v (schema-message column schema v)))
              (json/encode v))))
   :out (fn [s]
          (when (string? s)
            (let [v (decoded-json column s)]
              (cond
                (= v ::unreadable)     nil
                (mr/validate schema v) v
                :else                  (do (log/warnf "Invalid %s %s: reading it as nil" column (pr-str s))
                                           nil)))))})

(defn- facets-out
  "The facets stored as the JSON `s`, without any facet with an unknown key or a type its key does not allow."
  [s]
  (when (string? s)
    (let [facets (decoded-json :facets s)]
      (if (map? facets)
        (into {}
              (keep (fn [[k v]]
                      (let [t (some-> v keyword)]
                        (if (mr/validate ::warehouse-schema.schema/facets {k t})
                          [k t]
                          (do (log/warnf "Invalid facet %s %s: dropping it" k (pr-str v))
                              nil)))))
              facets)
        (do (when-not (= facets ::unreadable)
              (log/warnf "Invalid facets %s: reading them as nil" (pr-str s)))
            nil)))))

(def ^:private transform-facets
  (assoc (json-with-schema :facets ::warehouse-schema.schema/facets) :out facets-out))

(def table-transforms
  "The transforms of the structural metadata columns of Tables and their user settings."
  {:table_role         (hierarchy-keyword :model/Table :table_role
                                          :hierarchy      types/table-role-hierarchy
                                          :ancestor-types [:role/*]
                                          :fallback-type  nil)
   :period_granularity (enum-keyword :period_granularity types/table-period-granularities)
   :mutability         (enum-keyword :mutability types/table-mutabilities)
   :load_strategy      (enum-keyword :load_strategy types/table-load-strategies)
   :history_definition (json-with-schema :history_definition ::warehouse-schema.schema/history-definition)
   :eav_definition     (json-with-schema :eav_definition ::warehouse-schema.schema/eav-definition)})

(def field-transforms
  "The transforms of the structural metadata columns of Fields and their user settings."
  {:facets transform-facets})

(defn- check-values
  "Throws a 400 for the first non-nil value in `row` that fails the schema `column->schema` gives its column."
  [column->schema row]
  (doseq [[column schema] column->schema
          :let [v (get row column)]
          :when (and (some? v) (not (mr/validate schema v)))]
    (throw-invalid-value column v (schema-message column schema v))))

(def ^{:arglists '([row])} check-table-values
  "Throws a 400 when `row`, a Table or its user settings, holds an out-of-range `scd_type`."
  (partial check-values {:scd_type ::warehouse-schema.schema/scd-type}))

(def ^{:arglists '([row])} check-field-values
  "Throws a 400 when `row`, a Field or its user settings, holds an out-of-range `attribute_scd_type`."
  (partial check-values {:attribute_scd_type ::warehouse-schema.schema/attribute-scd-type}))
