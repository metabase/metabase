(ns metabase.warehouse-schema.transforms
  "Column transforms and value checks the Table, Field and user settings models share."
  (:require
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.types.core :as types]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
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

(defn- keyword-transform
  "A transform for `column` holding a keyword that `valid?` accepts. Writing a keyword or string it rejects throws a
  400; reading one logs and returns `fallback`."
  [column valid? invalid-message extra-data fallback]
  {:in  (fn [v]
          (when-let [k (some-> v keyword)]
            (when-not (valid? k)
              (throw-invalid-value column k (invalid-message k) extra-data))
            (u/qualified-name k)))
   :out (fn [s]
          (when (seq s)
            (let [k (keyword s)]
              (if (valid? k)
                k
                (do (log/warnf "Invalid %s %s: reading it as %s" column (pr-str s) (pr-str fallback))
                    fallback)))))})

(defn hierarchy-keyword
  "A transform for the `column` of `model` holding a keyword that descends from one of `ancestor-types`.

  `hierarchy` defaults to the global hierarchy. Writing any other keyword or string throws a 400; reading one logs and
  returns `fallback-type`."
  [model column & {:keys [hierarchy ancestor-types fallback-type]}]
  (keyword-transform column
                     #(descends-from-any? hierarchy % ancestor-types)
                     #(not-a-descendant-message model column % ancestor-types)
                     {:allowed-ancestors ancestor-types}
                     fallback-type))

(defn- enum-keyword
  "A transform for `column` holding one of the keywords `values`; a bad stored value reads as nil."
  [column values]
  (keyword-transform column
                     (set values)
                     #(tru "Invalid value for {0}: {1}. Must be one of {2}"
                           (pr-str column) (pr-str %) (str/join ", " (map name values)))
                     nil
                     nil))

(defn- schema-message
  "The message for `value` of `column` failing `schema`."
  [column schema value]
  (tru "Invalid value for {0}: {1}" (pr-str column) (pr-str (me/humanize (mr/explain schema value)))))

(defn- json-with-schema
  "A transform for `column` holding JSON of `schema`, through [[mi/transform-json-with-schema]]. Writing a value that
  fails `schema` throws a 400; reading one, or JSON that does not parse, logs and returns nil."
  [column schema]
  (let [{json-in :in, json-out :out} (mi/transform-json-with-schema (name column) schema)]
    {:in  (fn [v]
            (when (some? v)
              (let [v (lib/normalize schema v)]
                (when-not (mr/validate schema v)
                  (throw-invalid-value column v (schema-message column schema v)))
                (json-in v))))
     :out (fn [s]
            (let [v (json-out s)]
              (cond
                (nil? v)               nil
                (mr/validate schema v) v
                :else                  (do (log/warnf "Invalid %s %s: reading it as nil" column (pr-str s))
                                           nil))))}))

(defn- facets-out
  "The facets `json-out` reads from the stored JSON `s`, without any facet with an unknown key or a type its key does
  not allow. Facets that are not a JSON object, or that were all dropped, read as nil."
  [json-out s]
  (let [facets (json-out s)]
    (cond
      (nil? facets)       nil
      (not (map? facets)) (do (log/warnf "Invalid facets %s: reading them as nil" (pr-str s))
                              nil)
      :else               (let [kept (into {}
                                           (keep (fn [[k v]]
                                                   (let [t (some-> v keyword)]
                                                     (if (mr/validate ::warehouse-schema.schema/facets {k t})
                                                       [k t]
                                                       (do (log/warnf "Invalid facet %s %s: dropping it" k (pr-str v))
                                                           nil)))))
                                           facets)]
                            (when (or (seq kept) (empty? facets))
                              kept)))))

(def ^:private transform-facets
  (let [{json-out :out} (mi/transform-json-with-schema "facets" ::warehouse-schema.schema/facets)]
    (assoc (json-with-schema :facets ::warehouse-schema.schema/facets) :out (partial facets-out json-out))))

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
  "Throws a 400 when `row`, a Table or its user settings, holds an `scd_type` that fails its schema."
  (partial check-values {:scd_type ::warehouse-schema.schema/scd-type}))

(def ^{:arglists '([row])} check-field-values
  "Throws a 400 when `row`, a Field or its user settings, holds an `attribute_scd_type` that fails its schema."
  (partial check-values {:attribute_scd_type ::warehouse-schema.schema/attribute-scd-type}))
