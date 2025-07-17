(ns metabase.query-processor.middleware.parameters.mbql
  "Code for handling parameter substitution in MBQL queries."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.query-processor.parameters.operators :as params.ops]
   [metabase.query-processor.util.temporal-bucket :as qp.u.temporal-bucket]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn- to-numeric :- number?
  "Returns long, biginteger, or double. Possible to use the edn reader but we would then have to worry about arbitrary
  maps/stuff being read. Error messages would be more confusing EOF while reading instead of a more sensical number
  format exception."
  [s :- string?]
  (if (re-find #"\." s)
    (parse-double s)
    (or (parse-long s) (biginteger s))))

(mu/defn- field-type :- ::lib.schema.common/base-type
  [query        :- ::lib.schema/query
   stage-number :- :int
   a-ref        :- [:or :mbql.clause/field :mbql.clause/expression]]
  (lib/type-of query stage-number a-ref))

(mu/defn- expression-type :- ::lib.schema.common/base-type
  [query          :- ::lib.schema/query
   expression-ref :- :mbql.clause/expression]
  (or (lib/type-of query expression-ref)
      :type/*))

(mu/defn- parse-param-value-for-type
  "Convert `param-value` to a type appropriate for `param-type`.
  The frontend always passes parameters in as strings, which is what we want in most cases; for numbers, instead
  convert the parameters to integers or floating-point numbers."
  [query        :- ::lib.schema/query
   stage-number :- :int
   param-type   :- ::lib.schema.parameter/type
   param-value
   a-ref        :- [:or :mbql.clause/field :mbql.clause/expression]]
  (cond
    ;; for `id` or `category` type params look up the base-type of the Field and see if it's a number or not.
    ;; If it *is* a number then recursively call this function and parse the param value as a number as appropriate.
    (and (#{:id :category} param-type)
         (let [base-type (or (field-type query stage-number a-ref)
                             (expression-type query a-ref))]
           (isa? base-type :type/Number)))
    (recur query stage-number :number param-value a-ref)

    ;; no conversion needed if PARAM-TYPE isn't :number or PARAM-VALUE isn't a string
    (or (not= param-type :number)
        (not (string? param-value)))
    param-value

    :else
    (to-numeric param-value)))

(mu/defn- build-filter-clause :- [:maybe ::lib.schema.expression/boolean]
  [query                                                                       :- ::lib.schema/query
   stage-number                                                                :- :int
   {param-type :type, param-value :value, target :target, :as param} :- ::lib.schema.parameter/parameter]
  (let [a-ref (lib.util.match/match-one target
                #{:field :expression}
                (lib/->pMBQL &match))]
    (cond
      (params.ops/operator? param-type)
      (params.ops/to-clause param)

      ;; multiple values. Recursively handle them all and glue them all together with an OR clause
      (sequential? param-value)
      (let [clauses (for [value param-value]
                      (build-filter-clause query stage-number {:type param-type, :value value, :target target}))]
        (if (= (count clauses) 1)
          (first clauses)
          (apply lib/or clauses)))

      ;; single value, date range. Generate appropriate MBQL clause based on date string
      (and (params.dates/date-type? param-type)
           a-ref)
      (params.dates/date-string->filter
       (parse-param-value-for-type query stage-number param-type param-value a-ref)
       a-ref)

      ;; TODO - We can't tell the difference between a dashboard parameter (convert to an MBQL filter) and a native
      ;; query template tag parameter without this. There's should be a better, less fragile way to do this. (Not 100%
      ;; sure why, but this is needed for GTAPs to work.)
      (= (first target) :template-tag)
      nil

      ;; single-value, non-date param. Generate MBQL [= [field <field> nil] <value>] clause
      a-ref
      (lib/=
       a-ref
       (parse-param-value-for-type query stage-number param-type param-value a-ref)))))

(mu/defn- update-breakout-unit* :- ::lib.schema/stage
  [stage         :- ::lib.schema/stage
   target-column :- [:or ::lib.schema.id/field :string]
   temporal-unit :- ::lib.schema.temporal-bucketing/unit
   new-unit      :- ::lib.schema.temporal-bucketing/unit]
  (lib.util.match/replace stage
    [(tag :guard #{:field :expression})
     (opts :guard #(= temporal-unit (:temporal-unit %)))
     (_id-or-name :guard #(= target-column %))]
    (lib/with-temporal-bucket &match new-unit)))

(mu/defn- update-breakout-unit :- ::lib.schema/stage
  [metadata-providerable  :- ::lib.schema.metadata/metadata-providerable
   stage                  :- ::lib.schema/stage
   {[_dimension [_ref target-column {:keys [base-type temporal-unit]}] _dim-opts] :target
    :keys [value] :as _param} :- ::lib.schema.parameter/parameter]
  (let [new-unit (keyword value)
        base-type (or base-type
                      (when (integer? target-column)
                        (:base-type (lib.metadata/field metadata-providerable target-column))))]
    (assert (some? base-type) "`base-type` is not set.")
    (when-not (qp.u.temporal-bucket/compatible-temporal-unit? base-type new-unit)
      (throw (ex-info (tru "This chart can not be broken out by the selected unit of time: {0}." value)
                      {:type       qp.error-type/invalid-query
                       :is-curated true
                       :base-type  base-type
                       :unit       new-unit})))
    (update-breakout-unit* stage target-column temporal-unit new-unit)))

(mu/defn expand :- ::lib.schema/query
  "Expand parameters for MBQL queries in a query stage (replacing Dashboard or Card-supplied params with the appropriate
  values in the queries themselves)."
  ([query params]
   (reduce
    (fn [query stage-number]
      (expand query stage-number params))
    query
    (range (count (:stages query)))))

  ([query                                                     :- ::lib.schema/query
    stage-number                                              :- :int
    [{:keys [target value default], :as param} & more-params] :- [:maybe [:sequential ::lib.schema.parameter/parameter]]]
   (let [target      (lib/->pMBQL target)
         opts        (lib/options target)
         param-value (or value default)]
     (cond
       (not param)
       query

       (and (:stage-number opts)
            (not= (lib.util/canonical-stage-index query stage-number)
                  (lib.util/canonical-stage-index query (:stage-number opts))))
       (recur query stage-number more-params)

       (or (not target)
           (not param-value))
       (recur query stage-number more-params)

       (= (:type param) :temporal-unit)
       (let [query' (lib/update-query-stage query stage-number (fn [stage]
                                                                 (update-breakout-unit query stage (assoc param :value param-value))))]
         (recur query' stage-number more-params))

       :else
       (let [filter-clause (or (build-filter-clause query stage-number (assoc param :value param-value))
                               (log/warnf "build-filter-clause did not return a valid clause for param %s" (pr-str param)))
             query'        (cond-> query
                             filter-clause (lib/filter stage-number filter-clause))]
         (recur query' stage-number more-params))))))
