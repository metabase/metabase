(ns metabase.query-processor.middleware.parameters.mbql
  "Code for handling parameter substitution in MBQL queries."
  (:require
   [metabase.driver.common.parameters.dates :as params.dates]
   [metabase.driver.common.parameters.operators :as params.ops]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.temporal-bucket :as qp.u.temporal-bucket]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn- to-numeric :- number?
  "Returns either a double or a long. Possible to use the edn reader but we would then have to worry about biginters
  or arbitrary maps/stuff being read. Error messages would be more confusing EOF while reading instead of a more
  sensical number format exception."
  [s]
  (if (re-find #"\." s)
    (Double/parseDouble s)
    (Long/parseLong s)))

(defn- field-type
  [field-clause]
  (lib.util.match/match-one field-clause
    [:field (id :guard integer?) _]  ((some-fn :effective-type :base-type)
                                      (lib.metadata.protocols/field (qp.store/metadata-provider) id))
    [:field (_ :guard string?) opts] (:base-type opts)))

(defn- expression-type
  [query expression-clause]
  (lib.util.match/match-one expression-clause
    [:expression (expression-name :guard string?)]
    (lib/type-of (lib/query (qp.store/metadata-provider) (lib.convert/->pMBQL query))
                 (lib.convert/->pMBQL &match))))

(mu/defn- parse-param-value-for-type
  "Convert `param-value` to a type appropriate for `param-type`.
  The frontend always passes parameters in as strings, which is what we want in most cases; for numbers, instead
  convert the parameters to integers or floating-point numbers."
  [query param-type param-value field-clause :- mbql.s/Field]
  (cond
    ;; for `id` or `category` type params look up the base-type of the Field and see if it's a number or not.
    ;; If it *is* a number then recursively call this function and parse the param value as a number as appropriate.
    (and (#{:id :category} param-type)
         (let [base-type (or (field-type field-clause)
                             (expression-type query field-clause))]
           (isa? base-type :type/Number)))
    (recur query :number param-value field-clause)

    ;; no conversion needed if PARAM-TYPE isn't :number or PARAM-VALUE isn't a string
    (or (not= param-type :number)
        (not (string? param-value)))
    param-value

    :else
    (to-numeric param-value)))

(mu/defn- build-filter-clause :- [:maybe mbql.s/Filter]
  [query {param-type :type, param-value :value, [_ field :as target] :target, :as param}]
  (cond
    (params.ops/operator? param-type)
    (params.ops/to-clause param)
    ;; multipe values. Recursively handle them all and glue them all together with an OR clause
    (sequential? param-value)
    (mbql.u/simplify-compound-filter
     (vec (cons :or (for [value param-value]
                      (build-filter-clause query {:type param-type, :value value, :target target})))))

    ;; single value, date range. Generate appropriate MBQL clause based on date string
    (params.dates/date-type? param-type)
    (params.dates/date-string->filter
     (parse-param-value-for-type query param-type param-value (mbql.u/unwrap-field-or-expression-clause field))
     field)

    ;; TODO - We can't tell the difference between a dashboard parameter (convert to an MBQL filter) and a native
    ;; query template tag parameter without this. There's should be a better, less fragile way to do this. (Not 100%
    ;; sure why, but this is needed for GTAPs to work.)
    (mbql.u/is-clause? :template-tag field)
    nil

    ;; single-value, non-date param. Generate MBQL [= [field <field> nil] <value>] clause
    :else
    [:=
     (mbql.u/wrap-field-id-if-needed field)
     (parse-param-value-for-type query param-type param-value (mbql.u/unwrap-field-or-expression-clause field))]))

(defn- update-breakout-unit-in [query path target-field-id temporal-unit new-unit]
  (lib.util.match/replace-in
    query path
    [(tag :guard #{:field :expression})
     (_ :guard #(= target-field-id %))
     (opts :guard #(= temporal-unit (:temporal-unit %)))]
    [tag target-field-id (assoc opts :temporal-unit new-unit)]))

(defn- update-breakout-unit
  [query
   {[_dimension [_field target-field-id {:keys [base-type temporal-unit]}] dim-opts] :target
    :keys [value] :as _param}]
  (let [new-unit (keyword value)
        base-type (or base-type
                      (when (integer? target-field-id)
                        (:base-type (lib.metadata/field (qp.store/metadata-provider) target-field-id))))
        stage-path (into [:query] (mbql.u/stage-path (:query query) (:stage-number dim-opts)))]
    (assert (some? base-type) "`base-type` is not set.")
    (when-not (qp.u.temporal-bucket/compatible-temporal-unit? base-type new-unit)
      (throw (ex-info (tru "This chart can not be broken out by the selected unit of time: {0}." value)
                      {:type       qp.error-type/invalid-query
                       :is-curated true
                       :base-type  base-type
                       :unit       new-unit})))
    (-> query
        (update-breakout-unit-in (conj stage-path :breakout) target-field-id temporal-unit new-unit)
        (update-breakout-unit-in (conj stage-path :order-by) target-field-id temporal-unit new-unit))))

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

      (= (:type param) :temporal-unit)
      (let [query (update-breakout-unit query (assoc param :value param-value))]
        (recur query rest))

      :else
      (let [filter-clause (build-filter-clause query (assoc param :value param-value))
            [_ _ opts]    target
            query         (mbql.u/add-filter-clause query (:stage-number opts) filter-clause)]
        (recur query rest)))))
