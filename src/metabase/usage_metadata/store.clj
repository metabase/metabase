(ns metabase.usage-metadata.store
  (:require
   [metabase.usage-metadata.models.source-dimension-daily]
   [metabase.usage-metadata.models.source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-metric-daily]
   [metabase.usage-metadata.models.source-segment-daily]
   [toucan2.core :as t2]))

(defn delete-day!
  "Delete all rollup rows for `bucket-date` across the usage metadata daily tables."
  [bucket-date]
  (t2/delete! :model/SourceSegmentDaily :bucket_date bucket-date)
  (t2/delete! :model/SourceMetricDaily :bucket_date bucket-date)
  (t2/delete! :model/SourceDimensionDaily :bucket_date bucket-date)
  (t2/delete! :model/SourceDimensionProfileDaily :bucket_date bucket-date)
  nil)

(defn insert-segment-rollups!
  "Insert daily segment rollup rows."
  [rows]
  (when (seq rows)
    (t2/insert! :model/SourceSegmentDaily rows))
  nil)

(defn insert-metric-rollups!
  "Insert daily metric rollup rows."
  [rows]
  (when (seq rows)
    (t2/insert! :model/SourceMetricDaily rows))
  nil)

(defn insert-dimension-rollups!
  "Insert daily dimension rollup rows."
  [rows]
  (when (seq rows)
    (t2/insert! :model/SourceDimensionDaily rows))
  nil)

(defn insert-dimension-profile-rollups!
  "Insert daily dimension profile observation rows."
  [rows]
  (when (seq rows)
    (t2/insert! :model/SourceDimensionProfileDaily rows))
  nil)

(defn replace-day!
  "Replace all rollup rows for `bucket-date` in one transaction."
  [bucket-date {:keys [segments metrics dimensions profiles]}]
  (t2/with-transaction [_conn]
    (delete-day! bucket-date)
    (insert-segment-rollups! segments)
    (insert-metric-rollups! metrics)
    (insert-dimension-rollups! dimensions)
    (insert-dimension-profile-rollups! profiles))
  nil)
