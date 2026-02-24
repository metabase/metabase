(ns metabase.lib-be.source-swap
  (:require
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.parameters :as lib.parameters]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.performance  :as perf]))

(defn- walk-clause-field-refs
  [clause f]
  (lib.walk/walk-clause clause
                        (fn [clause]
                          (cond-> clause
                            (lib.field/is-field-clause? clause)
                            f))))

(mu/defn- upgrade-field-ref :- :mbql.clause/field
  [query         :- ::lib.schema/query
   stage-number  :- :int
   field-ref     :- :mbql.clause/field
   columns       :- [:sequential ::lib.schema.metadata/column]]
  (or (when-let [column (lib.equality/find-matching-column query stage-number field-ref columns)]
        (-> (cond-> column
              (:lib/card-id column) (dissoc :id))
            lib.ref/ref))
      field-ref))

(mu/defn- upgrade-field-refs-in-clauses :- [:sequential :any]
  [query        :- ::lib.schema/query
   stage-number :- :int
   clauses      :- [:sequential :any]
   columns      :- [:sequential ::lib.schema.metadata/column]]
  (perf/mapv (fn [clause]
               (walk-clause-field-refs clause #(upgrade-field-ref query stage-number % columns)))
             clauses))

(mu/defn- upgrade-field-refs-in-join :- ::lib.schema.join/join
  [query        :- ::lib.schema/query
   stage-number :- :int
   join         :- ::lib.schema.join/join
   columns      :- [:sequential ::lib.schema.metadata/column]]
  (-> join
      (u/update-some :fields #(if (keyword? %) % (upgrade-field-refs-in-clauses query stage-number % columns)))
      (u/update-some :conditions #(upgrade-field-refs-in-clauses query stage-number % columns))))

(mu/defn- upgrade-field-refs-in-joins :- [:sequential ::lib.schema.join/join]
  [query        :- ::lib.schema/query
   stage-number :- :int
   joins        :- [:sequential ::lib.schema.join/join]
   columns      :- [:sequential ::lib.schema.metadata/column]]
  (perf/mapv #(upgrade-field-refs-in-join query stage-number % columns) joins))

(mu/defn- upgrade-field-refs-in-stage :- ::lib.schema/stage
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [stage (lib.util/query-stage query stage-number)
        visible-columns (when ((some-fn :fields :filters :expressions :aggregation :breakout :order-by :joins) stage)
                          (lib.metadata.calculation/visible-columns query stage-number))
        orderable-columns (if ((some-fn :aggregation :breakout) stage)
                            (lib.order-by/orderable-columns query stage-number)
                            visible-columns)]
    (-> stage
        (u/update-some :fields      #(upgrade-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :joins       #(upgrade-field-refs-in-joins query stage-number % visible-columns))
        (u/update-some :expressions #(upgrade-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :filters     #(upgrade-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :aggregation #(upgrade-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :breakout    #(upgrade-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :order-by    #(upgrade-field-refs-in-clauses query stage-number % orderable-columns)))))

(mu/defn upgrade-field-refs-in-query :- ::lib.schema/query
  [query     :- ::lib.schema/query]
  (update query :stages #(vec (map-indexed (fn [stage-number _]
                                             (upgrade-field-refs-in-stage query stage-number))
                                           %))))

(mu/defn upgrade-field-ref-in-parameter-target :- ::lib.schema.parameter/target
  [query  :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (or (when (lib.parameters/parameter-target-field-ref target)
        (let [opts         (lib.parameters/parameter-target-dimension-options target)
              stage-number (or (:stage-number opts) -1)]
          (when (and (>= stage-number 0) (< stage-number (lib.query/stage-count query)))
            (let [columns (lib.metadata.calculation/visible-columns query stage-number)]
              (lib.parameters/update-parameter-target-field-ref
               target
               #(upgrade-field-ref query stage-number % columns))))))
      target))
