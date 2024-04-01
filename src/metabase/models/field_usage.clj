(ns metabase.models.field-usage
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.interface :as mi]
   [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.disallow :as t2.disallow]))

(doto :model/FieldUsage
  (derive :metabase/model)
  (derive ::t2.disallow/update))

(methodical/defmethod t2/table-name :model/FieldUsage [_model] :field_usage)

(t2/deftransforms :model/FieldUsage
  {:used_in                mi/transform-keyword
   :aggregation_function   mi/transform-keyword
   :breakout_temporal_unit mi/transform-keyword
   :breakout_binning       mi/transform-json
   :filter_op              mi/transform-keyword
   :filter_args            mi/transform-json})

(t2/define-before-insert :model/FieldUsage
  [instance]
  (merge {:timestamp :%now}
         instance))

(defn- filter->field-usage
  [query stage filter-clause]
  (let [filter-parts (lib/filter-parts query stage filter-clause)
        field-id     (-> filter-parts :column :id)]
    (when (int? field-id)
      {:field_id    field-id
       :used_in     :filter
       :filter_op   (-> filter-parts :operator :short)
       :filter_args (:args filter-parts)})))

(defn- aggregation->field-usage
  [query stage aggregation-clause]
  (let [aggregation-column (lib/aggregation-column query stage aggregation-clause)
        field-id           (:id aggregation-column)]
    (when (int? field-id)
      {:field_id             field-id
       :used_in              :aggregation
       :aggregation_function (first aggregation-clause)})))

(defn- breakout->field-usage
  [query stage breakout-clause]
  (let [breakout-column (lib/breakout-column query stage breakout-clause)
        field-id        (:id breakout-column)]
    (when (int? field-id)
      {:field_id               field-id
       :used_in                :breakout
       :breakout_temporal_unit (lib/raw-temporal-bucket breakout-clause)
       :breakout_binning       (lib/binning breakout-clause)})))

(defn- expression->field-usage
  [expresison-clause]
  (when-let [field-ids (seq (lib.util.match/match expresison-clause [:field _ (id :guard int?)] id))]
    (for [field-id field-ids]
      {:field_id field-id
       :used_in  :expression})))

(defmulti ^:private pquery->field-usages-method
  "Impl for [[pquery->field-usages]]."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x] (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod pquery->field-usages-method :mbql/query
  [query _stage-number x]
  (flatten (for [stage (range (lib/stage-count x))]
                (pquery->field-usages-method query stage (lib.util/query-stage query stage)))))

(defmethod pquery->field-usages-method :metabase.lib.stage/stage
  [query stage-number x]
  (concat
    (keep #(filter->field-usage query stage-number %) (lib/filters query stage-number))
    (keep #(aggregation->field-usage query stage-number %) (lib/aggregations query stage-number))
    (keep #(breakout->field-usage query stage-number %) (lib/breakouts query stage-number))
    (flatten (keep expression->field-usage (lib/expressions query stage-number)))
    (flatten (keep #(pquery->field-usages-method query stage-number %) (:joins x)))))

(defmethod pquery->field-usages-method :mbql/join
  [query _stage-number x]
  (let [join-query (fetch-source-query/resolve-source-cards (assoc query :stages (get x :stages)))]
    ;; treat the source query as a :mbql/query
    (pquery->field-usages-method join-query nil join-query)))

(mu/defn pquery->field-usages
  "Given a pmbql query, returns field usages from filter, breakout, aggregation, expression of a query.
  Walk all stages and joins."
  [pquery :- ::lib.schema/query]
  (pquery->field-usages-method pquery nil pquery))
