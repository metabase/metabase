(ns metabase.query-processor.util.transformations.nest-cumulative-aggregations
  "In some drivers (e.g. BigQuery) `ORDER BY` inside `OVER` expressions in window functions don't work the way we'd
  expect. Something like

    -- Broken
    SELECT
      timestamp_trunc(created_at, month) AS created_at_month,
      sum(sum(total)) OVER (ORDER BY created_at_month ROWS UNBOUNDED PRECEDING) AS sum
    FROM
      my_table
    GROUP BY
      created_at_month
    ORDER BY
      created_at_month ASC

  Doesn't work because `created_at_month` is not visible inside the `OVER` expression. Copying the entire expression
  definition like we do for Postgres e.g.

    -- Broken
    SELECT
      timestamp_trunc(created_at, month) AS created_at_month,
      sum(sum(total)) OVER (ORDER BY timestamp_trunc(created_at, month) ROWS UNBOUNDED PRECEDING) AS sum
    FROM
      my_table
    GROUP BY
      created_at_month
    ORDER BY
      created_at_month ASC

  doesn't work either -- drivers like BigQuery complain that `timestamp_trunc(created_at, month)` is not used in a
  `GROUP BY` expression (:unamused:). And BigQuery doesn't support ordering by output column index, either.

  Thus our only choice is to introduce two additional levels of nesting and do the accumulation in the new penultimate
  level of the query, like this:

    -- Good
    SELECT
      source.created_at_month AS created_at_month,
      source.sum AS sum
    FROM (
      SELECT
        source.created_at_month AS created_at_month,
        sum(source.__cumulative_sum) OVER (
          ORDER BY
            source.created_at_month ASC,
            source.__cumulative_sum ASC
          ROWS UNBOUNDED PRECEDING
        ) AS sum
      FROM (
        SELECT
          timestamp_trunc(created_at, month) AS created_at_month,
          sum(total) AS __cumulative_sum
        FROM
          my_table
        GROUP BY
          created_at_month
        ORDER BY
          created_at_month ASC
      ) source
      GROUP BY
        source.created_at_month,
        source.__cumulative_sum,
      ORDER BY
        source.created_at_month ASC,
        source.__cumulative_sum ASC
  )

  The new top-level query restores the original column order as needed.

  [[nest-cumulative-aggregations]] rewrites MBQL queries that would have produced broken queries so we get correct
  ones instead."
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.util.transformations.common :as qp.transformations.common]
   [metabase.query-processor.util.transformations.nest-cumulative-aggregations-in-expressions :as qp.transformations.nest-cumulative-aggregations-in-expressions]
   [metabase.util.malli :as mu]))

(mu/defn ^:private convert-first-stage-cumulative-aggregations-to-regular-aggregations :- ::lib.schema/stage
  "Convert cumulative aggregations to regular versions in first stage."
  [stage :- ::lib.schema/stage]
  (letfn [(update-aggregation [[ag-type & args :as aggregation]]
            (case ag-type
              :cum-sum   (into [:sum] args)
              :cum-count (into [:count] args)
              aggregation))
          (update-aggregations [aggregations]
            (mapv update-aggregation aggregations))]
    (update stage :aggregation update-aggregations)))

(mu/defn ^:private add-second-stage-breakouts :- ::lib.schema/stage
  "Add breakouts for all columns from the first stage to the second stage."
  [second-stage  :- ::lib.schema/stage
   original-cols :- [:sequential ::lib.schema.metadata/column]]
  ;; need to make fresh refs for breakouts vs order by so we have different UUIDs
  (let [refs (fn []
               (mapv (fn [col]
                       (let [desired-alias (if (::cumulative? col)
                                             (str "__cumulative_" (:lib/desired-column-alias col))
                                             (:lib/desired-column-alias col))]
                         (-> col
                             qp.transformations.common/update-aggregation-metadata-from-previous-stage-to-produce-correct-ref-in-current-stage
                             lib/ref
                             (lib.options/update-options assoc :name desired-alias))))
                     original-cols))
        breakouts (refs)
        ;; also, add order-bys, since we don't expect the QP middleware that usually adds it to be run again.
        ;;
        ;; TODO -- probably not safe to assume `:asc` order by here, this actually should probably get copied from the
        ;; first stage.
        order-bys (mapv (fn [col-ref]
                          [:asc {:lib/uuid (str (random-uuid))} col-ref])
                        (refs))]
    (assoc second-stage :breakout breakouts, :order-by order-bys)))

(mu/defn ^:private add-second-stage-cumulative-aggregations :- ::lib.schema/stage
  "Add :aggregations for the cumulative aggregations in the first stage to the second stage."
  [second-stage  :- ::lib.schema/stage
   original-cols :- [:sequential ::lib.schema.metadata/column]]
  (let [cumulative-ag-columns (filter ::cumulative? original-cols)
        aggregations (mapv (fn [col]
                             (-> col
                                 qp.transformations.common/update-aggregation-metadata-from-previous-stage-to-produce-correct-ref-in-current-stage
                                 lib/cum-sum
                                 (lib.options/update-options assoc :name (:lib/desired-column-alias col))))
                           cumulative-ag-columns)]
    (cond-> second-stage
      (seq aggregations) (assoc :aggregation aggregations))))

(mu/defn ^:private add-third-stage-fields :- ::lib.schema/stage
  "Add :fields to return columns in the original order as the first stage."
  [third-stage   :- ::lib.schema/stage
   original-cols :- [:sequential ::lib.schema.metadata/column]]
  (let [fields (mapv (fn [col]
                       (-> col
                           qp.transformations.common/update-aggregation-metadata-from-previous-stage-to-produce-correct-ref-in-current-stage
                           lib.ref/ref))
                     original-cols)]
    (assoc third-stage :fields fields)))

(mu/defn ^:private original-returned-columns :- [:sequential ::lib.schema.metadata/column]
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/stage-path]
  (lib.walk/apply-f-for-stage-at-path
   (fn [query stage-number]
     (mapv (fn [col]
             (let [cumulative? (when (= (:lib/source col) :source/aggregations)
                                 (when-let [[ag-type :as _ag] (lib.aggregation/resolve-aggregation query stage-number (:lib/source-uuid col))]
                                   (#{:cum-sum :cum-count} ag-type)))]
               (assoc col ::cumulative? cumulative?)))
           (lib/returned-columns query stage-number)))
   query
   stage-path))

(defn- has-breakouts? [stage]
  (seq (:breakout stage)))

(defn- has-cumulative-aggregations? [stage]
  (lib.util.match/match-one (:aggregation stage) #{:cum-sum :cum-count}))

(mu/defn ^:private nest-cumulative-aggregations-in-stage :- [:maybe [:sequential {:min 3} ::lib.schema/stage]]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/stage-path
   stage :- ::lib.schema/stage]
  ;; we only need to rewrite queries with at least one breakout. With no breakouts, cumulative sum and cumulative
  ;; count are treated the same as regular sum or count respectively; base SQL QP implementation handles this case.
  (when (and (has-cumulative-aggregations? stage)
             (has-breakouts? stage))
    (let [original-cols (original-returned-columns query path)
          first-stage   (-> stage
                            ;; 1. convert cumulative aggregations to regular versions in first stage
                            convert-first-stage-cumulative-aggregations-to-regular-aggregations)
          second-stage  (-> {:lib/type :mbql.stage/mbql}
                            ;; 2. add breakouts for all columns from the first stage to the second stage.
                            (add-second-stage-breakouts original-cols)
                            ;; 3. add :aggregations for the cumulative aggregations in the first stage to the second
                            ;; stage.
                            (add-second-stage-cumulative-aggregations original-cols))
          third-stage   (-> {:lib/type :mbql.stage/mbql}
                            ;; 4. Add :fields to return columns in the original order as the first stage
                            (add-third-stage-fields original-cols))]
      [first-stage second-stage third-stage])))

(mu/defn nest-cumulative-aggregations :- ::lib.schema/query
  "Rewrite `query` if it contains cumulative aggregations to introduce additional stages.
  See [[metabase.query-processor.util.transformations.nest-cumulative-aggregations]] for more info.

  Note that this expects a pMBQL query rather than a legacy MBQL query; you may need to convert your query
  using [[metabase.lib.query/query]] and [[metabase.query-processor.store/metadata-provider]] first."
  {:added "0.50.0"}
  [query :- ::lib.schema/query]
  (-> query
      qp.transformations.nest-cumulative-aggregations-in-expressions/nest-cumulative-aggregations-in-expressions
      (lib.walk/walk-stages nest-cumulative-aggregations-in-stage)))
