(ns dev.usage-metadata
  (:require
   [java-time.api :as t]
   [metabase.usage-metadata.batch :as usage-metadata.batch]
   [metabase.usage-metadata.core :as usage-metadata]
   [metabase.usage-metadata.models.source-dimension-daily]
   [metabase.usage-metadata.models.source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-metric-daily]
   [metabase.usage-metadata.models.source-segment-daily]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn today-utc
  "Today's UTC date as a LocalDate."
  []
  (t/local-date (t/offset-date-time (t/zone-offset "Z"))))

(defn process-day!
  "Reprocess `bucket-date` without advancing the usage metadata watermark."
  [bucket-date]
  (usage-metadata.batch/reprocess-day! bucket-date))

(defn process-today!
  "Reprocess today's UTC bucket without advancing the usage metadata watermark."
  []
  (process-day! (today-utc)))

(defn rollups-for-day
  "Fetch usage metadata rollups for `bucket-date`, ordered by descending count."
  [bucket-date]
  {:segments   (t2/select :model/SourceSegmentDaily
                          :bucket_date bucket-date
                          {:order-by [[:count :desc]]})
   :metrics    (t2/select :model/SourceMetricDaily
                          :bucket_date bucket-date
                          {:order-by [[:count :desc]]})
   :dimensions (t2/select :model/SourceDimensionDaily
                          :bucket_date bucket-date
                          {:order-by [[:count :desc]]})
   :profiles   (t2/select :model/SourceDimensionProfileDaily
                          :bucket_date bucket-date
                          {:order-by [[:count :desc]]})})

(defn rollup-counts-for-day
  "Return the number of rollup rows present for `bucket-date`."
  [bucket-date]
  {:segments   (t2/count :model/SourceSegmentDaily :bucket_date bucket-date)
   :metrics    (t2/count :model/SourceMetricDaily :bucket_date bucket-date)
   :dimensions (t2/count :model/SourceDimensionDaily :bucket_date bucket-date)
   :profiles   (t2/count :model/SourceDimensionProfileDaily :bucket_date bucket-date)})

(defn implicit-entities-for-table
  [table-id]
  (let [opts {:source-type :table :source-id table-id}]
    {:segments   (usage-metadata/implicit-segments opts)
     :metrics    (usage-metadata/implicit-metrics opts)
     :dimensions (usage-metadata/implicit-dimensions opts)}))

(defn implicit-entities
  []
  {:segments   (usage-metadata/implicit-segments {})
   :metrics    (usage-metadata/implicit-metrics {})
   :dimensions (usage-metadata/implicit-dimensions {})})
