(ns metabase.query-processor.middleware.parameters.mbql
  "Code for handling parameter substitution in MBQL queries."
  (:require [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models
             [field :refer [Field]]
             [params :as params]]
            [metabase.query-processor.middleware.parameters.dates :as date-params]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private parse-param-value-for-type
  "Convert `param-value` to a type appropriate for `param-type`.
  The frontend always passes parameters in as strings, which is what we want in most cases; for numbers, instead
  convert the parameters to integers or floating-point numbers."
  [param-type param-value, field-id :- su/IntGreaterThanZero]
  (cond
    ;; for `id` type params look up the base-type of the Field and see if it's a number or not. If it *is* a number
    ;; then recursively call this function and parse the param value as a number as appropriate.
    (and (= param-type :id)
         (isa? (db/select-one-field :base_type Field :id field-id) :type/Number))
    (recur :number param-value field-id)

    ;; no conversion needed if PARAM-TYPE isn't :number or PARAM-VALUE isn't a string
    (or (not= param-type :number)
        (not (string? param-value)))
    param-value

    ;; if PARAM-VALUE contains a period then convert to a Double
    (re-find #"\." param-value)
    (Double/parseDouble param-value)

    ;; otherwise convert to a Long
    :else
    (Long/parseLong param-value)))

(s/defn ^:private build-filter-clause :- mbql.s/Filter
  [{param-type :type, param-value :value, [_ field :as target] :target, :as param}]
  (cond
    ;; multipe values. Recursively handle them all and glue them all together with an OR clause
    (sequential? param-value)
    (mbql.u/simplify-compound-filter
     (vec (cons :or (for [value param-value]
                      (build-filter-clause {:type param-type, :value value, :target target})))))

    ;; single value, date range. Generate appropriate MBQL clause based on date string
    (date-params/date-type? param-type)
    (date-params/date-string->filter (parse-param-value-for-type param-type param-value (params/field-form->id field))
                                     field)

    ;; single-value, non-date param. Generate MBQL [= [field-id <field>] <value>] clause
    :else
    [:=
     (params/wrap-field-id-if-needed field)
     (parse-param-value-for-type param-type param-value (params/field-form->id field))]))

(defn expand
  "Expand parameters for MBQL queries in `query` (replacing Dashboard or Card-supplied params with the appropriate
  values in the queries themselves)."
  [query [{:keys [target value], :as param} & rest]]
  (cond
    (not param)
    query

    (or (not target)
        (not value))
    (recur query rest)

    :else
    (let [filter-clause (build-filter-clause param)
          query         (mbql.u/add-filter-clause query filter-clause)]
      (recur query rest))))
