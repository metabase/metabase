(ns metabase.usage-metadata.models.source-dimension-daily
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.db :as usage-metadata.db]
   [metabase.usage-metadata.schema :as usage-metadata.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SourceDimensionDaily [_model] :source_dimension_daily)

(t2/deftransforms :model/SourceDimensionDaily
  {:source_type    mi/transform-keyword
   :ownership_mode mi/transform-keyword
   :temporal_unit  mi/transform-keyword})

(derive :model/SourceDimensionDaily :metabase/model)
(derive :model/SourceDimensionDaily :hook/worktree-id)

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-dimension-rollups!
  "Insert the SourceDimensionDaily `rows` in one statement."
  [rows :- [:sequential ::usage-metadata.schema/source-dimension-daily.create]]
  (usage-metadata.db/insert-dimension-rollups! rows))

(mu/defn delete-dimension-rollups-for-day!
  "Delete the SourceDimensionDaily rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (usage-metadata.db/delete-dimension-rollups-for-day! bucket-date))

(mu/defn delete-dimension-rollups-for-cleanup!
  "Delete the SourceDimensionDaily rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (usage-metadata.db/delete-dimension-rollups-before! bucket-date))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/SourceDimensionDaily [_model]
  {:skip? true})
