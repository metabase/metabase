(ns metabase.lib.metric.basics
  (:require
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(defn source-metric
  "Returns the `:metadata/metric` for the given stage, or nil if this stage is not based on a metric."
  [metadata-providerable stage]
  (some->> stage :source-card (lib.metadata/metric metadata-providerable)))

(defn join-metric
  "Given a metadata provider and a join or joinable, return the `:metadata/metric` the join is targeting.

  `join-or-joinable` can be a join clause, or a `:metadata/card` or `:metadata/metric`."
  [metadata-providerable join-or-joinable]
  (case (:lib/type join-or-joinable)
    :mbql/join
    (when-let [metric (->> join-or-joinable :stages first (source-metric metadata-providerable))]
      (assoc metric :metabase.lib.join/join-alias (:alias join-or-joinable)))

    ;; :metadata/card or :metadata/metric; look it up by ID.
    (:metadata/card :metadata/metric)
    (lib.metadata/metric metadata-providerable (:id join-or-joinable))

    ;; anything else - not found
    nil))

(mu/defn primary-breakout :- [:maybe ::lib.schema.metadata/column]
  "returns the **primary** breakout of this metric, if it has breakouts.

  by convention the first breakout is the primary breakout."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   metric :- ::lib.schema.metadata/metric]
  (let [metric-query   (->> metric
                            :dataset-query
                            mbql.normalize/normalize
                            lib.convert/->pMBQL
                            (lib.query/query (lib.metadata/->metadata-provider metadata-providerable)))
        ;; todo: it's a circular dep to use [[metabase.lib.breakout]] here - clean that up.
        first-breakout  (-> (lib.util/query-stage metric-query -1)
                            :breakout
                            first)
        breakout-column (when first-breakout
                          (->> (lib.metadata.calculation/visible-columns
                                 metric-query -1 (lib.util/query-stage metric-query -1)
                                 {:include-implicitly-joinable?                 false
                                  :include-implicitly-joinable-for-source-card? false})
                               (lib.equality/find-matching-column first-breakout)))
        temporal-bucket (lib.temporal-bucket/temporal-bucket first-breakout)]
    (cond-> breakout-column
      ;; copy the temporal bucket (if any) from the breakout ref to its column.
      temporal-bucket (lib.temporal-bucket/with-temporal-bucket temporal-bucket))))
