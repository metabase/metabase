(ns metabase.query-processor.middleware.parameters.mbql
  "Code for handling parameter substitution in MBQL queries."
  (:require [clojure.string :as str]
            [metabase.models
             [field :refer [Field]]
             [params :as params]]
            [metabase.query-processor.middleware.parameters.dates :as date-params]
            [toucan.db :as db]))

(defn- parse-param-value-for-type
  "Convert PARAM-VALUE to a type appropriate for PARAM-TYPE.
  The frontend always passes parameters in as strings, which is what we want in most cases; for numbers, instead
  convert the parameters to integers or floating-point numbers."
  [param-type param-value field-id]
  (cond
    ;; for `id` type params look up the base-type of the Field and see if it's a number or not. If it *is* a number
    ;; then recursively call this function and parse the param value as a number as appropriate.
    (and (= (keyword param-type) :id)
         (isa? (db/select-one-field :base_type Field :id field-id) :type/Number))
    (recur :number param-value field-id)

    ;; no conversion needed if PARAM-TYPE isn't :number or PARAM-VALUE isn't a string
    (or (not= (keyword param-type) :number)
        (not (string? param-value)))
    param-value

    ;; if PARAM-VALUE contains a period then convert to a Double
    (re-find #"\." param-value)
    (Double/parseDouble param-value)

    ;; otherwise convert to a Long
    :else
    (Long/parseLong param-value)))

(defn- build-filter-clause [{param-type :type, param-value :value, [_ field :as target] :target, :as param}]
  (cond
    ;; multipe values. Recursively handle them all and glue them all together with an OR clause
    (sequential? param-value)
    (cons :or (for [value param-value]
                (build-filter-clause {:type param-type, :value value, :target target})))

    ;; single value, date range. Generate appropriate MBQL clause based on date string
    (str/starts-with? param-type "date")
    (date-params/date-string->filter (parse-param-value-for-type param-type param-value (params/field-form->id field))
                                     field)

    ;; single-value, non-date param. Generate MBQL [= <field> <value>] clause
    :else
    [:= field (parse-param-value-for-type param-type param-value (params/field-form->id field))]))

(defn- merge-filter-clauses [base addtl]
  (cond
    (and (seq base)
         (seq addtl)) ["AND" base addtl]
    (seq base)        base
    (seq addtl)       addtl
    :else             []))

(defn expand
  "Expand parameters for MBQL queries in QUERY-DICT (replacing Dashboard or Card-supplied params with the appropriate
  values in the queries themselves)."
  [query-dict [{:keys [target value], :as param} & rest]]
  (cond
    (not param)
    query-dict

    (or (not target)
        (not value))
    (recur query-dict rest)

    :else
    (let [filter-subclause (build-filter-clause param)
          query            (assoc-in query-dict [:query :filter] (merge-filter-clauses
                                                                  (get-in query-dict [:query :filter])
                                                                  filter-subclause))]
      (recur query rest))))
