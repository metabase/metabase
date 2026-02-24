(ns metabase.lib-be.source-swap
  (:require
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance  :as perf]))

(defn- walk-clause-field-refs
  [clause f]
  (lib.walk/walk-clause clause
                        (fn [clause]
                          (cond-> clause
                            (lib.field/is-field-clause? clause)
                            f))))

(mu/defn- update-field-ref :- :mbql.clause/field
  [query         :- ::lib.schema/query
   stage-number  :- :int
   field-ref     :- :mbql.clause/field
   columns       :- [:sequential ::lib.schema.metadata/column]]
  (or (when-let [column (lib.equality/find-matching-column query stage-number field-ref columns)]
        (-> (cond-> column
              (:lib/card-id column) (dissoc :id))
            lib.ref/ref))
      field-ref))

(mu/defn- update-field-refs-in-clauses :- [:sequential :any]
  [query        :- ::lib.schema/query
   stage-number :- :int
   clauses      :- [:sequential :any]
   columns      :- [:sequential ::lib.schema.metadata/column]]
  (perf/mapv (fn [clause]
               (walk-clause-field-refs clause #(update-field-ref query stage-number % columns)))
             clauses))

(mu/defn- update-field-refs-in-join :- ::lib.schema.join/join
  [query        :- ::lib.schema/query
   stage-number :- :int
   join         :- ::lib.schema.join/join
   columns      :- [:sequential ::lib.schema.metadata/column]]
  (-> join
      (u/update-some :fields #(if (keyword? %) % (update-field-refs-in-clauses query stage-number % columns)))
      (u/update-some :conditions #(update-field-refs-in-clauses query stage-number % columns))))

(mu/defn- update-field-refs-in-joins :- [:sequential ::lib.schema.join/join]
  [query        :- ::lib.schema/query
   stage-number :- :int
   joins        :- [:sequential ::lib.schema.join/join]
   columns      :- [:sequential ::lib.schema.metadata/column]]
  (perf/mapv #(update-field-refs-in-join query stage-number % columns) joins))

(mu/defn- update-field-refs-in-stage :- ::lib.schema/stage
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [stage (lib.util/query-stage query stage-number)
        visible-columns (when ((some-fn :fields :filters :expressions :aggregation :breakout :order-by :joins) stage)
                          (lib.metadata.calculation/visible-columns query stage-number))
        orderable-columns (if ((some-fn :aggregation :breakout) stage)
                            (lib.order-by/orderable-columns query stage-number)
                            visible-columns)]
    (-> stage
        (u/update-some :fields      #(update-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :joins       #(update-field-refs-in-joins query stage-number % visible-columns))
        (u/update-some :expressions #(update-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :filters     #(update-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :aggregation #(update-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :breakout    #(update-field-refs-in-clauses query stage-number % visible-columns))
        (u/update-some :order-by    #(update-field-refs-in-clauses query stage-number % orderable-columns)))))

(mu/defn update-field-refs-in-query :- ::lib.schema/query
  [query     :- ::lib.schema/query]
  (update query :stages #(vec (map-indexed (fn [stage-number _]
                                             (update-field-refs-in-stage query stage-number))
                                           %))))
