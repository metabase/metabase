(ns metabase.usage-metadata.models.source-dimension-profile-daily
  "Daily rollup of dimension-profile observations (`:single-value`, `:all-null`,
  `:low-cardinality`) for fields that showed up as direct table dimensions in
  the day's activity. Each observation is read from the field's existing
  `Field.fingerprint` (populated by the sync fingerprinter); `source_basis` is
  `:fingerprint`."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.db :as usage-metadata.db]
   [metabase.usage-metadata.schema :as usage-metadata.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SourceDimensionProfileDaily [_model] :source_dimension_profile_daily)

(t2/deftransforms :model/SourceDimensionProfileDaily
  {:source_type      mi/transform-keyword
   :source_basis     mi/transform-keyword
   :observation_type mi/transform-keyword})

(derive :model/SourceDimensionProfileDaily :metabase/model)

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-dimension-profile-rollups!
  "Insert the SourceDimensionProfileDaily `rows` in one statement."
  [rows :- [:sequential ::usage-metadata.schema/source-dimension-profile-daily.create]]
  (usage-metadata.db/insert-dimension-profile-rollups! rows))

(mu/defn delete-dimension-profile-rollups-for-day!
  "Delete the SourceDimensionProfileDaily rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (usage-metadata.db/delete-dimension-profile-rollups-for-day! bucket-date))

(mu/defn delete-dimension-profile-rollups-before!
  "Delete the SourceDimensionProfileDaily rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (usage-metadata.db/delete-dimension-profile-rollups-before! bucket-date))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/SourceDimensionProfileDaily [_model]
  {:skip? true})
