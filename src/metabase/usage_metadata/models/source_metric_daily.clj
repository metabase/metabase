(ns metabase.usage-metadata.models.source-metric-daily
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.db :as usage-metadata.db]
   [metabase.usage-metadata.schema :as usage-metadata.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SourceMetricDaily [_model] :source_metric_daily)

(t2/deftransforms :model/SourceMetricDaily
  {:source_type    mi/transform-keyword
   :ownership_mode mi/transform-keyword
   :agg_type       mi/transform-keyword
   :temporal_unit  mi/transform-keyword})

(derive :model/SourceMetricDaily :metabase/model)
(derive :model/SourceMetricDaily :hook/worktree-id)

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-metric-rollups!
  "Insert the SourceMetricDaily `rows` in one statement."
  [rows :- [:sequential ::usage-metadata.schema/source-metric-daily.create]]
  (usage-metadata.db/insert-metric-rollups! rows))

(mu/defn delete-metric-rollups-for-day!
  "Delete the SourceMetricDaily rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (usage-metadata.db/delete-metric-rollups-for-day! bucket-date))

(mu/defn delete-metric-rollups-for-cleanup!
  "Delete the SourceMetricDaily rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (usage-metadata.db/delete-metric-rollups-before! bucket-date))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/SourceMetricDaily [_model]
  {:skip? true})
