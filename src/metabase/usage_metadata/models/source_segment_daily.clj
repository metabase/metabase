(ns metabase.usage-metadata.models.source-segment-daily
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.db :as usage-metadata.db]
   [metabase.usage-metadata.schema :as usage-metadata.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SourceSegmentDaily [_model] :source_segment_daily)

(t2/deftransforms :model/SourceSegmentDaily
  {:source_type    mi/transform-keyword
   :ownership_mode mi/transform-keyword})

(derive :model/SourceSegmentDaily :metabase/model)
(derive :model/SourceSegmentDaily :hook/worktree-id)

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-segment-rollups!
  "Insert the SourceSegmentDaily `rows` in one statement."
  [rows :- [:sequential ::usage-metadata.schema/source-segment-daily.create]]
  (usage-metadata.db/insert-segment-rollups! rows))

(mu/defn delete-segment-rollups-for-day!
  "Delete the SourceSegmentDaily rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (usage-metadata.db/delete-segment-rollups-for-day! bucket-date))

(mu/defn delete-segment-rollups-for-cleanup!
  "Delete the SourceSegmentDaily rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (usage-metadata.db/delete-segment-rollups-before! bucket-date))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/SourceSegmentDaily [_model]
  {:skip? true})
