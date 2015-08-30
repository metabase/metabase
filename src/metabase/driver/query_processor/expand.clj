(ns metabase.driver.query-processor.expand
  "Converts a Query Dict as recieved by the API into an *expanded* one that contains extra information that will be needed to
   construct the appropriate native Query, and perform various post-processing steps such as Field ordering."
  (:require [clojure.core.match :refer [match]]
            (clojure [set :as set]
                     [string :as s]
                     [walk :as walk])
            [medley.core :as m]
            [korma.core :as k]
            [swiss.arrows :refer [-<>]]
            [metabase.db :refer [sel]]
            [metabase.driver.interface :as driver]
            [metabase.driver.query-processor.interface :refer :all]
            [metabase.util :as u])
  (:import (clojure.lang Keyword)))

(declare parse-aggregation
         parse-breakout
         parse-fields
         parse-filter
         parse-order-by
         ph)


;; ## -------------------- Expansion - Impl --------------------



(def ^:private ^:dynamic *original-query-dict*
  "The entire original Query dict being expanded."
  nil)

(defn- assert-driver-supports [^Keyword feature]
  {:pre [(:driver *original-query-dict*)]}
  (driver/assert-driver-supports (:driver *original-query-dict*) feature))

(defn- non-empty-clause? [clause]
  (and clause
       (or (not (sequential? clause))
           (and (seq clause)
                (not (every? nil? clause))))))

(defn expand "Expand a QUERY-DICT."
  [query-dict]
  (when query-dict
    (binding [*original-query-dict* query-dict]
      ;; TODO - we should parse the Page clause so we can validate it
      ;; And convert to a limit / offset clauses
      (update query-dict :query #(-<> (assoc %
                                             :aggregation (parse-aggregation (:aggregation %))
                                             :breakout    (parse-breakout    (:breakout %))
                                             :fields      (parse-fields      (:fields %))
                                             :filter      (parse-filter      (:filter %))
                                             :order_by    (parse-order-by    (:order_by %)))
                                      (set/rename-keys <> {:order_by     :order-by
                                                           :source_table :source-table})
                                      (m/filter-vals non-empty-clause? <>))))))


;; ## -------------------- Field + Value --------------------

(defn- unexpanded-Field?
  "Is this a valid value for a `Field` ID in an unexpanded query? (i.e. an integer or `fk->` form)."
  ;; ["aggregation" 0] "back-reference" form not included here since its specific to the order_by clause
  [field]
  (match field
    (field-id :guard integer?)                                             true
    ["fk->" (fk-field-id :guard integer?) (dest-field-id :guard integer?)] true
    _                                                                      false))

(defn- parse-value
  "Convert the `value` of a `Value` to a date or timestamp if needed.
   The original `YYYY-MM-DD` string date is retained under the key `:original-value`."
  [{:keys [value base-type special-type] :as qp-value}]
  (assoc qp-value
         :original-value value
         ;; Since Value *doesn't* revert to YYYY-MM-DD when collapsing make sure we're not parsing it twice
         :value (or (when (and (string? value)
                               (or (contains? #{:DateField :DateTimeField} base-type)
                                   (contains? #{:timestamp_seconds :timestamp_milliseconds} special-type)))
                      (u/parse-iso8601 value))
                    value)))

(defn- ph
  "Create a new placeholder object for a Field ID or value that can be resolved later."
  ([field-id]
   (map->FieldPlaceholder
    (match field-id
      (_ :guard integer?)
      {:field-id field-id}

      ["fk->" (fk-field-id :guard integer?) (dest-field-id :guard integer?)]
      (do (assert-driver-supports :foreign-keys)
          (map->FieldPlaceholder {:field-id dest-field-id, :fk-field-id fk-field-id}))

      _ (throw (Exception. (str "Invalid field: " field-id))))))
  ([field-id value]
   (->ValuePlaceholder (:field-id (ph field-id)) value)))



;; # ======================================== CLAUSE DEFINITIONS ========================================

(defmacro defparser
  "Convenience for writing a parser function, i.e. one that pattern-matches against a lone argument."
  [fn-name & match-forms]
  `(defn ~(vary-meta fn-name assoc :private true) [form#]
     (when (non-empty-clause? form#)
       (match form#
         ~@match-forms
         form# (throw (Exception. (format ~(format "%s failed: invalid clause: %%s" fn-name) form#)))))))

;; ## -------------------- Aggregation --------------------

(defparser parse-aggregation
  ["rows"]                                         (->Aggregation :rows nil)
  ["count"]                                        (->Aggregation :count nil)
  ["avg" (field-id :guard unexpanded-Field?)]      (->Aggregation :avg (ph field-id))
  ["count" (field-id :guard unexpanded-Field?)]    (->Aggregation :count (ph field-id))
  ["distinct" (field-id :guard unexpanded-Field?)] (->Aggregation :distinct (ph field-id))
  ["stddev" (field-id :guard unexpanded-Field?)]   (do (assert-driver-supports :standard-deviation-aggregations)
                                                       (->Aggregation :stddev (ph field-id)))
  ["sum" (field-id :guard unexpanded-Field?)]      (->Aggregation :sum (ph field-id))
  ["cum_sum" (field-id :guard unexpanded-Field?)]  (->Aggregation :cumulative-sum (ph field-id)))


;; ## -------------------- Breakout --------------------

;; Breakout + Fields clauses are just regular vectors of Fields

(defparser parse-breakout
  field-ids (mapv ph field-ids))


;; ## -------------------- Fields --------------------

(defparser parse-fields
  field-ids (mapv ph field-ids))


;; ## -------------------- Filter --------------------

(defn- orderable-Value?
  "Is V an unexpanded value that can be compared with operators such as `<` and `>`?
   i.e. This is true of numbers and dates, but not of other strings or booleans."
  [v]
  (match v
    (_ :guard number?)         true
    (_ :guard u/date-string?)  true
    _                          false))

(defn- Value?
  "Is V a valid unexpanded `Value`?"
  [v]
  (or (string? v)
      (= v true)
      (= v false)
      (orderable-Value? v)))

(defparser parse-filter-subclause
   ["INSIDE" (lat-field :guard unexpanded-Field?) (lon-field :guard unexpanded-Field?) (lat-max :guard number?) (lon-min :guard number?) (lat-min :guard number?) (lon-max :guard number?)]
  (map->Filter:Inside {:filter-type :inside
                       :lat         {:field (ph lat-field)
                                     :min   (ph lat-field lat-min)
                                     :max   (ph lat-field lat-max)}
                       :lon         {:field (ph lon-field)
                                     :min   (ph lon-field lon-min)
                                     :max   (ph lon-field lon-max)}})

  ["BETWEEN" (field-id :guard unexpanded-Field?) (min :guard orderable-Value?) (max :guard orderable-Value?)]
  (map->Filter:Between {:filter-type :between
                        :field       (ph field-id)
                        :min-val     (ph field-id min)
                        :max-val     (ph field-id max)})

  ;; Single-value != and =
  [(filter-type :guard (partial contains? #{"!=" "="})) (field-id :guard unexpanded-Field?) (val :guard Value?)]
  (map->Filter:Field+Value {:filter-type (keyword filter-type)
                            :field       (ph field-id)
                            :value       (ph field-id val)})

  ;; <, >, <=, >= - like single-value != and =, but value must be orderable
  [(filter-type :guard (partial contains? #{"<" ">" "<=" ">="})) (field-id :guard unexpanded-Field?) (val :guard orderable-Value?)]
  (map->Filter:Field+Value {:filter-type (keyword filter-type)
                            :field       (ph field-id)
                            :value       (ph field-id val)})

  ;; = with more than one value -- Convert to OR and series of = clauses
  ["=" (field-id :guard unexpanded-Field?) & (values :guard #(and (seq %) (every? Value? %)))]
  (map->Filter {:compound-type :or
                :subclauses    (vec (for [value values]
                                      (map->Filter:Field+Value {:filter-type :=
                                                                :field       (ph field-id)
                                                                :value       (ph field-id value)})))})

  ;; != with more than one value -- Convert to AND and series of != clauses
  ["!=" (field-id :guard unexpanded-Field?) & (values :guard #(and (seq %) (every? Value? %)))]
  (map->Filter {:compound-type :and
                :subclauses    (vec (for [value values]
                                      (map->Filter:Field+Value {:filter-type :!=
                                                                :field       (ph field-id)
                                                                :value       (ph field-id value)})))})

  [(filter-type :guard (partial contains? #{"STARTS_WITH" "CONTAINS" "ENDS_WITH"})) (field-id :guard unexpanded-Field?) (val :guard string?)]
  (map->Filter:Field+Value {:filter-type (case filter-type
                                           "STARTS_WITH" :starts-with
                                           "CONTAINS"    :contains
                                           "ENDS_WITH"   :ends-with)
                            :field       (ph field-id)
                            :value       (ph field-id val)})

  [(filter-type :guard string?) (field-id :guard unexpanded-Field?)]
  (map->Filter:Field {:filter-type (case filter-type
                                     "NOT_NULL" :not-null
                                     "IS_NULL"  :is-null)
                      :field       (ph field-id)}))

(defparser parse-filter
  ["AND" & subclauses] (map->Filter {:compound-type :and
                                     :subclauses    (mapv parse-filter subclauses)})
  ["OR" & subclauses]  (map->Filter {:compound-type :or
                                     :subclauses    (mapv parse-filter subclauses)})
  subclause            (parse-filter-subclause subclause))


;; ## -------------------- Order-By --------------------

(defn- parse-order-by-direction [direction]
  (case direction
    "ascending"  :ascending
    "descending" :descending))

(defparser parse-order-by-subclause
  [["aggregation" index] direction]               (let [{{:keys [aggregation]} :query} *original-query-dict*]
                                                    (assert aggregation "Query does not contain an aggregation clause.")
                                                    (->OrderBySubclause (->OrderByAggregateField :aggregation index (parse-aggregation aggregation))
                                                                        (parse-order-by-direction direction)))
  [(field-id :guard unexpanded-Field?) direction] (->OrderBySubclause (ph field-id)
                                                                      (parse-order-by-direction direction)))
(defparser parse-order-by
  subclauses (mapv parse-order-by-subclause subclauses))
