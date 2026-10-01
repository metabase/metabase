(ns metabase.usage-metadata.store
  (:require
   [metabase.usage-metadata.db :as usage-metadata.db]
   [metabase.usage-metadata.models.source-dimension-daily]
   [metabase.usage-metadata.models.source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-metric-daily]
   [metabase.usage-metadata.models.source-segment-composite-daily]
   [metabase.usage-metadata.models.source-segment-daily]
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
  (usage-metadata.db/delete-segment-rollups-for-day! bucket-date)
  (usage-metadata.db/delete-segment-composite-rollups-for-day! bucket-date)
  (usage-metadata.db/delete-metric-rollups-for-day! bucket-date)
  (usage-metadata.db/delete-dimension-rollups-for-day! bucket-date)
  (usage-metadata.db/delete-dimension-profile-rollups-for-day! bucket-date)
  nil)

(defn insert-segment-rollups!
  "Insert daily segment rollup rows."
  [rows]
  (chunked-insert! usage-metadata.db/insert-segment-rollups! rows)
  nil)

(defn insert-composite-rollups!
  "Insert daily composite segment (whole-:and basket) rollup rows."
  [rows]
  (when (seq rows)
    (usage-metadata.db/insert-segment-composite-rollups! rows))
  nil)

(defn insert-metric-rollups!
  "Insert daily metric rollup rows."
  [rows]
  (chunked-insert! usage-metadata.db/insert-metric-rollups! rows)
  nil)

(defn insert-dimension-rollups!
  "Insert daily dimension rollup rows."
  [rows]
  (chunked-insert! usage-metadata.db/insert-dimension-rollups! rows)
  nil)

(defn insert-dimension-profile-rollups!
  "Insert daily dimension profile observation rows."
  [rows]
  (chunked-insert! usage-metadata.db/insert-dimension-profile-rollups! rows)
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
