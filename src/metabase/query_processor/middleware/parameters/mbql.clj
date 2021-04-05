(ns metabase.query-processor.middleware.parameters.mbql
  "Code for handling parameter substitution in MBQL queries."
  (:require [metabase.driver.common.parameters :as i]
            [metabase.driver.common.parameters.dates :as date-params]
            [metabase.driver.common.parameters.operators :as ops]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.field :refer [Field]]
            [metabase.models.params :as params]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private to-numeric :- s/Num
  "Returns either a double or a long. Possible to use the edn reader but we would then have to worry about biginters
  or arbitrary maps/stuff being read. Error messages would be more confusing EOF while reading instead of a more
  sensical number format exception."
  [s]
  (if (re-find #"\." s)
    (Double/parseDouble s)
    (Long/parseLong s)))

(s/defn ^:private parse-param-value-for-type
  "Convert `param-value` to a type appropriate for `param-type`.
  The frontend always passes parameters in as strings, which is what we want in most cases; for numbers, instead
  convert the parameters to integers or floating-point numbers."
  [param-type param-value field-clause :- mbql.s/field]
  (cond
    ;; for `id` or `category` type params look up the base-type of the Field and see if it's a number or not.
    ;; If it *is* a number then recursively call this function and parse the param value as a number as appropriate.
    (and (#{:id :category} param-type)
         (let [base-type (mbql.u/match-one field-clause
                           [:field (id :guard integer?) _]  (db/select-one-field :base_type Field :id id)
                           [:field (_ :guard string?) opts] (:base-type opts))]
           (isa? base-type :type/Number)))
    (recur :number param-value field-clause)

    ;; no conversion needed if PARAM-TYPE isn't :number or PARAM-VALUE isn't a string
    (or (not= param-type :number)
        (not (string? param-value)))
    param-value

    :else
    (to-numeric param-value)))

(s/defn ^:private build-filter-clause :- (s/maybe mbql.s/Filter)
  [{param-type :type, param-value :value, [_ field :as target] :target, :as param}]
  (cond
    (ops/operator? param-type)
    (ops/to-clause (i/throw-if-field-filter-operators-not-enabled param))
    ;; multipe values. Recursively handle them all and glue them all together with an OR clause
    (sequential? param-value)
    (mbql.u/simplify-compound-filter
     (vec (cons :or (for [value param-value]
                      (build-filter-clause {:type param-type, :value value, :target target})))))

    ;; single value, date range. Generate appropriate MBQL clause based on date string
    (date-params/date-type? param-type)
    (date-params/date-string->filter (parse-param-value-for-type param-type param-value (params/unwrap-field-clause field))
                                     field)

    ;; TODO - We can't tell the difference between a dashboard parameter (convert to an MBQL filter) and a native
    ;; query template tag parameter without this. There's should be a better, less fragile way to do this. (Not 100%
    ;; sure why, but this is needed for GTAPs to work.)
    (mbql.u/is-clause? :template-tag field)
    nil

    ;; single-value, non-date param. Generate MBQL [= [field <field> nil] <value>] clause
    :else
    [:=
     (params/wrap-field-id-if-needed field)
     (parse-param-value-for-type param-type param-value (params/unwrap-field-clause field))]))

(defn expand
  "Expand parameters for MBQL queries in `query` (replacing Dashboard or Card-supplied params with the appropriate
  values in the queries themselves)."
  [query [{:keys [target value default], :as param} & rest]]
  (let [param-value (or value default)]
    (cond
      (not param)
      query

      (or (not target)
          (not param-value))
      (recur query rest)

      :else
      (let [filter-clause (build-filter-clause (assoc param :value param-value))
            query         (mbql.u/add-filter-clause query filter-clause)]
        (recur query rest)))))
