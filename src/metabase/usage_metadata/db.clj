(ns metabase.usage-metadata.db
  "Application database queries for the usage metadata module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn query-execution-hash-counts
  "The `:hash` and execution count `:n` of the QueryExecutions started at or after `started-at` and before
  `started-before`, grouped by hash."
  [started-at started-before]
  (t2/select [:model/QueryExecution :hash [:%count.* :n]]
             {:where    [:and
                         [:>= :started_at started-at]
                         [:<  :started_at started-before]]
              :group-by [:hash]}))

(defn raw-field-fingerprint
  "The stored fingerprint of the Field with `field-id`, as it sits in the table, or nil."
  [field-id]
  (t2/select-one-fn :fingerprint :metabase_field :id field-id))

(defn queries-reducible
  "A reducible over `conn` of the hash and query of the Queries with `query-hashes`."
  [conn query-hashes]
  (t2/reducible-select :conn conn [:model/Query :query_hash :query] :query_hash [:in query-hashes]))

(defn delete-segment-rollups-before!
  "Delete the SourceSegmentDaily rollup rows bucketed before `bucket-date`."
  [bucket-date]
  (t2/delete! :model/SourceSegmentDaily :bucket_date [:< bucket-date]))

(defn delete-segment-rollups-for-day!
  "Delete the SourceSegmentDaily rollup rows bucketed on `bucket-date`."
  [bucket-date]
  (t2/delete! :model/SourceSegmentDaily :bucket_date bucket-date))

(defn insert-segment-rollups!
  "Insert `rows` into SourceSegmentDaily."
  [rows]
  (t2/insert! :model/SourceSegmentDaily rows))

(defn delete-segment-composite-rollups-before!
  "Delete the SourceSegmentCompositeDaily rollup rows bucketed before `bucket-date`."
  [bucket-date]
  (t2/delete! :model/SourceSegmentCompositeDaily :bucket_date [:< bucket-date]))

(defn delete-segment-composite-rollups-for-day!
  "Delete the SourceSegmentCompositeDaily rollup rows bucketed on `bucket-date`."
  [bucket-date]
  (t2/delete! :model/SourceSegmentCompositeDaily :bucket_date bucket-date))

(defn insert-segment-composite-rollups!
  "Insert `rows` into SourceSegmentCompositeDaily."
  [rows]
  (t2/insert! :model/SourceSegmentCompositeDaily rows))

(defn delete-metric-rollups-before!
  "Delete the SourceMetricDaily rollup rows bucketed before `bucket-date`."
  [bucket-date]
  (t2/delete! :model/SourceMetricDaily :bucket_date [:< bucket-date]))

(defn delete-metric-rollups-for-day!
  "Delete the SourceMetricDaily rollup rows bucketed on `bucket-date`."
  [bucket-date]
  (t2/delete! :model/SourceMetricDaily :bucket_date bucket-date))

(defn insert-metric-rollups!
  "Insert `rows` into SourceMetricDaily."
  [rows]
  (t2/insert! :model/SourceMetricDaily rows))

(defn delete-dimension-rollups-before!
  "Delete the SourceDimensionDaily rollup rows bucketed before `bucket-date`."
  [bucket-date]
  (t2/delete! :model/SourceDimensionDaily :bucket_date [:< bucket-date]))

(defn delete-dimension-rollups-for-day!
  "Delete the SourceDimensionDaily rollup rows bucketed on `bucket-date`."
  [bucket-date]
  (t2/delete! :model/SourceDimensionDaily :bucket_date bucket-date))

(defn insert-dimension-rollups!
  "Insert `rows` into SourceDimensionDaily."
  [rows]
  (t2/insert! :model/SourceDimensionDaily rows))

(defn delete-dimension-profile-rollups-before!
  "Delete the SourceDimensionProfileDaily rollup rows bucketed before `bucket-date`."
  [bucket-date]
  (t2/delete! :model/SourceDimensionProfileDaily :bucket_date [:< bucket-date]))

(defn delete-dimension-profile-rollups-for-day!
  "Delete the SourceDimensionProfileDaily rollup rows bucketed on `bucket-date`."
  [bucket-date]
  (t2/delete! :model/SourceDimensionProfileDaily :bucket_date bucket-date))

(defn insert-dimension-profile-rollups!
  "Insert `rows` into SourceDimensionProfileDaily."
  [rows]
  (t2/insert! :model/SourceDimensionProfileDaily rows))

(defn field-names
  "The id, name, and display name of the Fields with `field-ids`."
  [field-ids]
  (t2/select [:model/Field :id :name :display_name] :id [:in field-ids]))

(defn table-names
  "The id, name, display name, Database id, and schema of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Table :id :name :display_name :db_id :schema] :id [:in table-ids]))

(defn table-database-ids
  "The id and Database id of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Table :id :db_id] :id [:in table-ids]))

(defn card-names
  "The id and name of the Cards with `card-ids`."
  [card-ids]
  (t2/select [:model/Card :id :name] :id [:in card-ids]))

(defn- grouped-rollup-where
  [source-type source-id bucket-start bucket-end]
  (cond-> [:and [:in :ownership_mode ["direct" "projected"]]]
    source-type  (conj [:= :source_type (name source-type)])
    source-id    (conj [:= :source_id source-id])
    bucket-start (conj [:>= :bucket_date bucket-start])
    bucket-end   (conj [:<= :bucket_date bucket-end])))

(defn grouped-segment-rows
  "The summed `source_segment_daily` counts optionally narrowed to `source-type`, `source-id`, and bucketed between
  `bucket-start` and `bucket-end`, grouped by source, field, and predicate, largest first."
  [source-type source-id bucket-start bucket-end]
  (t2/select [:model/SourceSegmentDaily
              :source_type
              :source_id
              :field_id
              :predicate
              [[:sum :count] :total_count]]
             {:where    (grouped-rollup-where source-type source-id bucket-start bucket-end)
              :group-by [:source_type :source_id :field_id :predicate]
              :order-by [[:total_count :desc]]}))

(defn grouped-metric-rows
  "The summed `source_metric_daily` counts optionally narrowed to `source-type`, `source-id`, and bucketed between
  `bucket-start` and `bucket-end`, grouped by source and aggregation, largest first."
  [source-type source-id bucket-start bucket-end]
  (t2/select [:model/SourceMetricDaily
              :source_type
              :source_id
              :agg_type
              :agg_field_id
              :temporal_field_id
              :temporal_unit
              [[:sum :count] :total_count]]
             {:where    (grouped-rollup-where source-type source-id bucket-start bucket-end)
              :group-by [:source_type :source_id :agg_type :agg_field_id :temporal_field_id :temporal_unit]
              :order-by [[:total_count :desc]]}))

(defn grouped-dimension-rows
  "The summed `source_dimension_daily` counts optionally narrowed to `source-type`, `source-id`, and bucketed
  between `bucket-start` and `bucket-end`, grouped by source, field, unit, and binning, largest first."
  [source-type source-id bucket-start bucket-end]
  (t2/select [:model/SourceDimensionDaily
              :source_type
              :source_id
              :field_id
              :temporal_unit
              :binning
              [[:sum :count] :total_count]]
             {:where    (grouped-rollup-where source-type source-id bucket-start bucket-end)
              :group-by [:source_type :source_id :field_id :temporal_unit :binning]
              :order-by [[:total_count :desc]]}))

(defn grouped-composite-rows
  "The summed `source_segment_composite_daily` counts optionally narrowed to `source-type`, `source-id`, and
  bucketed between `bucket-start` and `bucket-end`, grouped by source and clause, largest first."
  [source-type source-id bucket-start bucket-end]
  (t2/select [:model/SourceSegmentCompositeDaily
              :source_type
              :source_id
              :clause
              :atom_fingerprints
              :atom_count
              [[:sum :count] :total_count]]
             {:where    (grouped-rollup-where source-type source-id bucket-start bucket-end)
              :group-by [:source_type :source_id :clause :atom_fingerprints :atom_count]
              :order-by [[:total_count :desc]]}))

(defn grouped-profile-rows
  "The summed `source_dimension_profile_daily` counts optionally narrowed to `source-type`, `source-id`, and
  bucketed between `bucket-start` and `bucket-end`, grouped by source, field, and observation, largest first."
  [source-type source-id bucket-start bucket-end]
  (t2/select [:model/SourceDimensionProfileDaily
              :source_type
              :source_id
              :field_id
              :source_basis
              :observation_type
              :observation_value
              [[:sum :count] :total_count]]
             {:where    (cond-> [:and]
                          source-type  (conj [:= :source_type (name source-type)])
                          source-id    (conj [:= :source_id source-id])
                          bucket-start (conj [:>= :bucket_date bucket-start])
                          bucket-end   (conj [:<= :bucket_date bucket-end]))
              :group-by [:source_type :source_id :field_id :source_basis :observation_type :observation_value]
              :order-by [[:total_count :desc]]}))

(defn unarchived-segments
  "The id, Table id, and definition of the unarchived Segments, optionally narrowed to `table-id`."
  [table-id]
  (t2/select [:model/Segment :id :table_id :definition]
             {:where (cond-> [:and [:= :archived false]]
                       table-id (conj [:= :table_id table-id]))}))

(defn unarchived-metric-cards
  "reThe id, Database id, query, and schema of the unarchived metric Cards."
  []
  (t2/select [:model/Card :id :database_id :dataset_query :card_schema :type :result_metadata :dimensions :dimension_mappings]
             :type "metric" :archived false))
