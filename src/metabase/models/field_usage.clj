(ns metabase.models.field-usage
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.models.interface :as mi]
   [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.disallow :as t2.disallow]))

(doto :model/FieldUsage
  (derive :metabase/model)
  (derive ::t2.disallow/update)
  (derive :hook/created-at-timestamped?))

(methodical/defmethod t2/table-name :model/FieldUsage [_model] :field_usage)

(t2/deftransforms :model/FieldUsage
  {:used_in                   mi/transform-keyword
   :aggregation_function      mi/transform-keyword
   :breakout_temporal_unit    mi/transform-keyword
   :breakout_binning_strategy mi/transform-keyword
   :filter_op                 mi/transform-keyword})

(defn- filter->field-usage
  [query stage filter-clause]
  (let [filter-parts (lib/filter-parts query stage filter-clause)
        field-id     (-> filter-parts :column :id)]
    (when (int? field-id)
      {:field_id    field-id
       :used_in     :filter
       :filter_op   (-> filter-parts :operator :short)})))

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
      (let [binning-option (lib/binning breakout-clause)]
       {:field_id                   field-id
        :used_in                    :breakout
        :breakout_temporal_unit     (lib/raw-temporal-bucket breakout-clause)
        :breakout_binning_strategy  (:strategy binning-option)
        :breakout_binning_bin_width (:bin-width binning-option)
        :breakout_binning_num_bins  (:num-bins binning-option)}))))

(defn- expression->field-usage
  [expression-clause]
  (when-let [field-ids (seq (lib.util/referenced-field-ids expression-clause))]
    (for [field-id field-ids]
      {:field_id field-id
       :used_in  :expression})))

(declare pmbql->field-usages)

(defn- join->field-usages
  [query join]
  (let [join-query (fetch-source-query/resolve-source-cards (assoc query :stages (:stages join)))]
    ;; treat the source query as a :mbql/query
    (pmbql->field-usages join-query)))

(defn- stage->field-usages
  [query stage-number]
  (concat
    (keep #(filter->field-usage query stage-number %) (lib/filters query stage-number))
    (keep #(aggregation->field-usage query stage-number %) (lib/aggregations query stage-number))
    (keep #(breakout->field-usage query stage-number %) (lib/breakouts query stage-number))
    (flatten (keep expression->field-usage (lib/expressions query stage-number)))
    (flatten (keep #(join->field-usages query %) (lib/joins query stage-number)))))

(mu/defn pmbql->field-usages
  "Given a pmbql query, returns field usages from filter, breakout, aggregation, expression of a query.
  Walk all stages and joins.
  Expects all the source cards were resolved"
  [pmbql :- ::lib.schema/query]
  (mapcat #(stage->field-usages pmbql %) (range (lib/stage-count pmbql))))
