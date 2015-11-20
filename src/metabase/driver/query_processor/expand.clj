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
            [metabase.driver :as driver]
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
  (when-not (contains? (driver/features (:driver *original-query-dict*)) feature)
    (throw (Exception. (format "%s is not supported by this driver." (name feature))))))

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

(defn- unexpanded-Field? [field-id]
  (match field-id
    (_ :guard integer?)                                                                  true
    ["fk->" (_ :guard integer?) (_ :guard integer?)]                                     true
    ["datetime_field" (_ :guard unexpanded-Field?) "as" (_ :guard datetime-field-unit?)] true
    :else                                                                                false))

(defn- parse-field [field-id]
  (map->FieldPlaceholder
   (match field-id
     (_ :guard integer?)
     {:field-id field-id}

     ["fk->" (fk-field-id :guard integer?) (dest-field-id :guard integer?)]
     (do (assert-driver-supports :foreign-keys)
         (map->FieldPlaceholder {:field-id dest-field-id, :fk-field-id fk-field-id}))

     ["datetime_field" id "as" (unit :guard datetime-field-unit?)]
     (assoc (ph id)
            :datetime-unit (keyword unit))

     _ (throw (Exception. (str "Invalid field: " field-id))))))

(defn- parse-value [field-id value]
  (map->ValuePlaceholder {:field-placeholder (ph field-id)
                          :value             value}))

(defn- ph
  "Create a new placeholder object for a Field ID or value that can be resolved later."
  ([field-id]       (parse-field field-id))
  ([field-id value] (parse-value field-id value)))


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
    (_ :guard number?)                                                                 true
    (_ :guard u/date-string?)                                                          true
    ["relative_datetime" "current"]                                                    true
    ["relative_datetime" (_ :guard integer?) (_ :guard relative-datetime-value-unit?)] true
    _                                                                                  false))

(defn- Value?
  "Is V a valid unexpanded `Value`?"
  [v]
  (or (string? v)
      (= v true)
      (= v false)
      (orderable-Value? v)))

;; [TIME_INTERVAL ...] filters are just syntactic sugar for more complicated datetime filter subclauses.
;; This function parses the args to the TIME_INTERVAL and returns the appropriate subclause.
;; This clause is then recursively parsed below by parse-filter-subclause.
;;
;; A valid input looks like [TIME_INTERVAL <field> (current|last|next|<int>) <unit>] .
;;
;; "current", "last", and "next" are the same as supplying the integers 0, -1, and 1, respectively.
;; For these values, we want to generate a clause like [= [datetime_field <field> as <unit>] [datetime <int> <unit>]].
;;
;; For ints > 1 or < -1, we want to generate a range (i.e., a BETWEEN filter clause). These should *exclude* the current moment in time.
;;
;; e.g. [TIME_INTERVAL <field> -30 "day"] refers to the past 30 days, excluding today; i.e. the range of -31 days ago to -1 day ago.
;; Thus values of n < -1 translate to clauses like [BETWEEN [datetime_field <field> as day] [datetime -31 day] [datetime -1 day]].
(defparser parse-time-interval-filter-subclause
  ;; For "current"/"last"/"next" replace with the appropriate int and recurse
  [field "current" unit] (parse-time-interval-filter-subclause [field  0 unit])
  [field "last"    unit] (parse-time-interval-filter-subclause [field -1 unit])
  [field "next"    unit] (parse-time-interval-filter-subclause [field  1 unit])

  ;; For values of -1 <= n <= 1, generate the appropriate [= ...] clause
  [field  0 unit] ["=" ["datetime_field" field "as" unit] ["relative_datetime" "current"]]
  [field -1 unit] ["=" ["datetime_field" field "as" unit] ["relative_datetime" -1 unit]]
  [field  1 unit] ["=" ["datetime_field" field "as" unit] ["relative_datetime"  1 unit]]

  ;; For other int values of n generate the appropriate [BETWEEN ...] clause
  [field (n :guard #(< % -1)) unit] ["BETWEEN" ["datetime_field" field "as" unit] ["relative_datetime" (dec n) unit] ["relative_datetime"      -1 unit]]
  [field (n :guard #(> %  1)) unit] ["BETWEEN" ["datetime_field" field "as" unit] ["relative_datetime"       1 unit] ["relative_datetime" (inc n) unit]])

(defparser parse-filter-subclause
  ["TIME_INTERVAL" (field-id :guard unexpanded-Field?) (n :guard #(or (integer? %) (contains? #{"current" "last" "next"} %))) (unit :guard relative-datetime-value-unit?)]
  (parse-filter-subclause (parse-time-interval-filter-subclause [field-id n (name unit)]))

  ["TIME_INTERVAL" & args]
  (throw (Exception. (format "Invalid TIME_INTERVAL clause: %s" args)))

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
