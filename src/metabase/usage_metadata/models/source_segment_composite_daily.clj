(ns metabase.usage-metadata.models.source-segment-composite-daily
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.db :as usage-metadata.db]
   [metabase.usage-metadata.schema :as usage-metadata.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SourceSegmentCompositeDaily [_model] :source_segment_composite_daily)

(t2/deftransforms :model/SourceSegmentCompositeDaily
  {:source_type    mi/transform-keyword
   :ownership_mode mi/transform-keyword})

(derive :model/SourceSegmentCompositeDaily :metabase/model)

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-segment-composite-rollups!
  "Insert the SourceSegmentCompositeDaily `rows` in one statement."
  [rows :- [:sequential ::usage-metadata.schema/source-segment-composite-daily.create]]
  (usage-metadata.db/insert-segment-composite-rollups! rows))

(mu/defn delete-segment-composite-rollups-for-day!
  "Delete the SourceSegmentCompositeDaily rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (usage-metadata.db/delete-segment-composite-rollups-for-day! bucket-date))

(mu/defn delete-segment-composite-rollups-for-cleanup!
  "Delete the SourceSegmentCompositeDaily rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (usage-metadata.db/delete-segment-composite-rollups-before! bucket-date))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/SourceSegmentCompositeDaily [_model]
  {:skip? true})
