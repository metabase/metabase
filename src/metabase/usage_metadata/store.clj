(ns metabase.usage-metadata.store
  (:require
   [metabase.usage-metadata.models.source-dimension-daily :as source-dimension-daily]
   [metabase.usage-metadata.models.source-dimension-profile-daily :as source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-metric-daily :as source-metric-daily]
   [metabase.usage-metadata.models.source-segment-composite-daily :as source-segment-composite-daily]
   [metabase.usage-metadata.models.source-segment-daily :as source-segment-daily]
   [toucan2.core :as t2]))

(def ^:private insert-chunk-size
  "Chunk size for bulk inserts. Keeps us under the Postgres ~65535 bind-parameter
  cap even for wide rows."
  1000)

(defn- chunked-insert!
  [insert-fn! rows]
  (when (seq rows)
    (doseq [chunk (partition-all insert-chunk-size rows)]
      (insert-fn! chunk))))

(defn delete-day!
  "Delete all rollup rows for `bucket-date` across the usage metadata daily tables."
  [bucket-date]
  (source-segment-daily/delete-segment-rollups-for-day! bucket-date)
  (source-segment-composite-daily/delete-segment-composite-rollups-for-day! bucket-date)
  (source-metric-daily/delete-metric-rollups-for-day! bucket-date)
  (source-dimension-daily/delete-dimension-rollups-for-day! bucket-date)
  (source-dimension-profile-daily/delete-dimension-profile-rollups-for-day! bucket-date)
  nil)

(defn insert-segment-rollups!
  "Insert daily segment rollup rows."
  [rows]
  (chunked-insert! source-segment-daily/create-segment-rollups! rows)
  nil)

(defn insert-composite-rollups!
  "Insert daily composite segment (whole-:and basket) rollup rows."
  [rows]
  (when (seq rows)
    (source-segment-composite-daily/create-segment-composite-rollups! rows))
  nil)

(defn insert-metric-rollups!
  "Insert daily metric rollup rows."
  [rows]
  (chunked-insert! source-metric-daily/create-metric-rollups! rows)
  nil)

(defn insert-dimension-rollups!
  "Insert daily dimension rollup rows."
  [rows]
  (chunked-insert! source-dimension-daily/create-dimension-rollups! rows)
  nil)

(defn insert-dimension-profile-rollups!
  "Insert daily dimension profile observation rows."
  [rows]
  (chunked-insert! source-dimension-profile-daily/create-dimension-profile-rollups! rows)
  nil)

(defn replace-day!
  "Replace all rollup rows for `bucket-date` in one transaction."
  [bucket-date {:keys [segments composites metrics dimensions profiles]}]
  (t2/with-transaction [_conn]
    (delete-day! bucket-date)
    (insert-segment-rollups! segments)
    (insert-composite-rollups! composites)
    (insert-metric-rollups! metrics)
    (insert-dimension-rollups! dimensions)
    (insert-dimension-profile-rollups! profiles))
  nil)
