(ns metabase.query-processor.middleware.parameters.mbql
  "Code for handling parameter substitution in MBQL queries."
  (:refer-clojure :exclude [every?])
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
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.query-processor.parameters.operators :as params.ops]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [every?]]))

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
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/path
   a-ref      :- [:or :mbql.clause/field :mbql.clause/expression]]
  (lib.walk/apply-f-for-stage-at-path lib/type-of query stage-path a-ref))

(mu/defn- expression-type :- ::lib.schema.common/base-type
  [query          :- ::lib.schema/query
   expression-ref :- :mbql.clause/expression]
  (or (lib/type-of query expression-ref)
      :type/*))

(mu/defn- parse-param-value-for-type
  "Convert `param-value` to a type appropriate for `param-type`.
  The frontend always passes parameters in as strings, which is what we want in most cases; for numbers, instead
  convert the parameters to integers or floating-point numbers."
  [query       :- ::lib.schema/query
   stage-path  :- ::lib.walk/path
   param-type  :- ::lib.schema.parameter/type
   param-value
   a-ref       :- [:or :mbql.clause/field :mbql.clause/expression]]
  (cond
    ;; for `id` or `category` type params look up the base-type of the Field and see if it's a number or not.
    ;; If it *is* a number then recursively call this function and parse the param value as a number as appropriate.
    (and (#{:id :category} param-type)
         (let [base-type (or (field-type query stage-path a-ref)
                             (expression-type query a-ref))]
           (isa? base-type :type/Number)))
    (recur query stage-path :number param-value a-ref)

    ;; no conversion needed if PARAM-TYPE isn't :number or PARAM-VALUE isn't a string
    (or (not= param-type :number)
        (not (string? param-value)))
    param-value

    :else
    (to-numeric param-value)))

(mu/defn- build-filter-clause :- [:maybe ::lib.schema.expression/boolean]
  [query                                                             :- ::lib.schema/query
   stage-path                                                        :- ::lib.walk/path
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
                      (build-filter-clause query stage-path {:type param-type, :value value, :target target}))]
        (if (= (count clauses) 1)
          (first clauses)
          (apply lib/or clauses)))

      ;; single value, date range. Generate appropriate MBQL clause based on date string
      (and (params.dates/date-type? param-type)
           a-ref)
      (params.dates/date-string->filter
       (parse-param-value-for-type query stage-path param-type param-value a-ref)
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
       (parse-param-value-for-type query stage-path param-type param-value a-ref)))))

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
    (when-not (lib.temporal-bucket/compatible-temporal-unit? base-type new-unit)
      (throw (ex-info (tru "This chart can not be broken out by the selected unit of time: {0}." value)
                      {:type       qp.error-type/invalid-query
                       :is-curated true
                       :base-type  base-type
                       :unit       new-unit})))
    (update-breakout-unit* stage target-column temporal-unit new-unit)))

(mu/defn expand :- ::lib.schema/stage.mbql
  "Expand parameters for MBQL queries in a query stage (replacing Dashboard or Card-supplied params with the appropriate
  values in the queries themselves)."
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/path
   stage      :- ::lib.schema/stage.mbql]
  (loop [stage stage, [{:keys [target value default], :as param} & more-params] (:parameters stage)]
    (let [param-value (or value default)]
      (cond
        (not param)
        stage

        ;; ignore `:template-tag` parameters... these may be lying around if we had a source card that was native and
        ;; then replaced it with an MBQL source card.
        (lib.util.match/match-one target :template-tag &match)
        (do
          (log/warnf "Ignoring :template-tag parameter %s because this is an MBQL stage (path = %s)"
                     (pr-str target)
                     (pr-str stage-path))
          (recur stage more-params))

        (not target)
        (do
          (log/debugf "Ignoring parameter %s because it has no target" (pr-str param))
          (recur stage more-params))

        (or (nil? param-value)
            (and (sequential? param-value)
                 (every? nil? param-value)))
        (do
          (log/debugf "Ignoring parameter %s because it has no value" (pr-str param-value))
          (recur stage more-params))

        (= (:type param) :temporal-unit)
        (let [stage' (update-breakout-unit query stage (assoc param :value param-value))]
          (recur stage' more-params))

        :else
        (let [filter-clause (or (build-filter-clause query stage-path (assoc param :value param-value))
                                (log/warnf "build-filter-clause did not return a valid clause for param %s" (pr-str param)))
              stage'        (lib/add-filter-to-stage stage filter-clause)]
          (recur stage' more-params))))))
