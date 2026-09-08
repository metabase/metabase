(ns metabase.usage-metadata.db
  "Application database queries for the usage metadata module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.segments.schema :as segments.schema]
   [metabase.usage-metadata.schema :as usage-metadata.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(mu/defn query-execution-hash-counts :- [:sequential (mut/optional-keys (mut/open-schema ::queries.schema/query-execution))]
  "The `:hash` and execution count `:n` of the QueryExecutions started at or after `started-at` and before
  `started-before`, grouped by hash."
  [started-at     :- ms/TemporalInstant
   started-before :- ms/TemporalInstant]
  (t2/select [:model/QueryExecution :hash [:%count.* :n]]
             {:where    [:and
                         [:>= :started_at started-at]
                         [:<  :started_at started-before]]
              :group-by [:hash]}))

(mu/defn raw-field-fingerprint :- [:maybe [:or :string :map]]
  "The stored fingerprint of the Field with `field-id`, as it sits in the table, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :fingerprint :metabase_field :id field-id))

(mu/defn queries-reducible
  "A reducible over `conn` of the hash and query of the Queries with `query-hashes`."
  [conn         :- (ms/InstanceOfClass java.sql.Connection)
   query-hashes :- [:sequential bytes?]]
  (t2/reducible-select :conn conn [:model/Query :query_hash :query] :query_hash [:in query-hashes]))

(mu/defn delete-segment-rollups-before! :- :int
  "Delete the SourceSegmentDaily rollup rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceSegmentDaily :bucket_date [:< bucket-date]))

(mu/defn delete-segment-rollups-for-day! :- :int
  "Delete the SourceSegmentDaily rollup rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceSegmentDaily :bucket_date bucket-date))

(mu/defn insert-segment-rollups! :- :int
  "Insert `rows` into SourceSegmentDaily."
  [rows :- [:sequential
            (mut/select-keys ::usage-metadata.schema/source-segment-daily.update [:source_type :source_id :ownership_mode :field_id :predicate :bucket_date :count])]]
  (t2/insert! :model/SourceSegmentDaily rows))

(mu/defn delete-segment-composite-rollups-before! :- :int
  "Delete the SourceSegmentCompositeDaily rollup rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceSegmentCompositeDaily :bucket_date [:< bucket-date]))

(mu/defn delete-segment-composite-rollups-for-day! :- :int
  "Delete the SourceSegmentCompositeDaily rollup rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceSegmentCompositeDaily :bucket_date bucket-date))

(mu/defn insert-segment-composite-rollups! :- :int
  "Insert `rows` into SourceSegmentCompositeDaily."
  [rows :- [:sequential
            ::usage-metadata.schema/source-segment-composite-daily.update]]
  (t2/insert! :model/SourceSegmentCompositeDaily rows))

(mu/defn delete-metric-rollups-before! :- :int
  "Delete the SourceMetricDaily rollup rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceMetricDaily :bucket_date [:< bucket-date]))

(mu/defn delete-metric-rollups-for-day! :- :int
  "Delete the SourceMetricDaily rollup rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceMetricDaily :bucket_date bucket-date))

(mu/defn insert-metric-rollups! :- :int
  "Insert `rows` into SourceMetricDaily."
  [rows :- [:sequential
            ::usage-metadata.schema/source-metric-daily.update]]
  (t2/insert! :model/SourceMetricDaily rows))

(mu/defn delete-dimension-rollups-before! :- :int
  "Delete the SourceDimensionDaily rollup rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceDimensionDaily :bucket_date [:< bucket-date]))

(mu/defn delete-dimension-rollups-for-day! :- :int
  "Delete the SourceDimensionDaily rollup rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceDimensionDaily :bucket_date bucket-date))

(mu/defn insert-dimension-rollups! :- :int
  "Insert `rows` into SourceDimensionDaily."
  [rows :- [:sequential
            ::usage-metadata.schema/source-dimension-daily.update]]
  (t2/insert! :model/SourceDimensionDaily rows))

(mu/defn delete-dimension-profile-rollups-before! :- :int
  "Delete the SourceDimensionProfileDaily rollup rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceDimensionProfileDaily :bucket_date [:< bucket-date]))

(mu/defn delete-dimension-profile-rollups-for-day! :- :int
  "Delete the SourceDimensionProfileDaily rollup rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceDimensionProfileDaily :bucket_date bucket-date))

(mu/defn insert-dimension-profile-rollups! :- :int
  "Insert `rows` into SourceDimensionProfileDaily."
  [rows :- [:sequential
            ::usage-metadata.schema/source-dimension-profile-daily.update]]
  (t2/insert! :model/SourceDimensionProfileDaily rows))

(mu/defn field-names :- [:sequential (mut/select-keys ::warehouse-schema.schema/field [:id :name :display_name])]
  "The id, name, and display name of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select [:model/Field :id :name :display_name] :id [:in field-ids]))

(mu/defn table-names :- [:sequential (mut/select-keys ::warehouse-schema.schema/table [:id :name :display_name :db_id :schema])]
  "The id, name, display name, Database id, and schema of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Table :id :name :display_name :db_id :schema] :id [:in table-ids]))

(mu/defn table-database-ids :- [:sequential (mut/select-keys ::warehouse-schema.schema/table [:id :db_id])]
  "The id and Database id of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Table :id :db_id] :id [:in table-ids]))

(mu/defn card-names :- [:sequential (mut/select-keys ::queries.schema/card [:id :name])]
  "The id and name of the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select [:model/Card :id :name] :id [:in card-ids]))

(defn- grouped-rollup-where
  [source-type source-id bucket-start bucket-end]
  (cond-> [:and [:in :ownership_mode ["direct" "projected"]]]
    source-type  (conj [:= :source_type (name source-type)])
    source-id    (conj [:= :source_id source-id])
    bucket-start (conj [:>= :bucket_date bucket-start])
    bucket-end   (conj [:<= :bucket_date bucket-end])))

(mu/defn grouped-segment-rows :- [:sequential (mut/optional-keys (mut/open-schema ::usage-metadata.schema/source-segment-daily))]
  "The summed `source_segment_daily` counts optionally narrowed to `source-type`, `source-id`, and bucketed between
  `bucket-start` and `bucket-end`, grouped by source, field, and predicate, largest first."
  [source-type  :- [:maybe :keyword]
   source-id    :- [:maybe ms/PositiveInt]
   bucket-start :- [:maybe ms/TemporalInstant]
   bucket-end   :- [:maybe ms/TemporalInstant]]
  (t2/select [:model/SourceSegmentDaily
              :source_type
              :source_id
              :field_id
              :predicate
              [[:sum :count] :total_count]]
             {:where    (grouped-rollup-where source-type source-id bucket-start bucket-end)
              :group-by [:source_type :source_id :field_id :predicate]
              :order-by [[:total_count :desc]]}))

(mu/defn grouped-metric-rows :- [:sequential (mut/optional-keys (mut/open-schema ::usage-metadata.schema/source-metric-daily))]
  "The summed `source_metric_daily` counts optionally narrowed to `source-type`, `source-id`, and bucketed between
  `bucket-start` and `bucket-end`, grouped by source and aggregation, largest first."
  [source-type  :- [:maybe :keyword]
   source-id    :- [:maybe ms/PositiveInt]
   bucket-start :- [:maybe ms/TemporalInstant]
   bucket-end   :- [:maybe ms/TemporalInstant]]
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

(mu/defn grouped-dimension-rows :- [:sequential (mut/optional-keys (mut/open-schema ::usage-metadata.schema/source-dimension-daily))]
  "The summed `source_dimension_daily` counts optionally narrowed to `source-type`, `source-id`, and bucketed
  between `bucket-start` and `bucket-end`, grouped by source, field, unit, and binning, largest first."
  [source-type  :- [:maybe :keyword]
   source-id    :- [:maybe ms/PositiveInt]
   bucket-start :- [:maybe ms/TemporalInstant]
   bucket-end   :- [:maybe ms/TemporalInstant]]
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

(mu/defn grouped-composite-rows :- [:sequential (mut/optional-keys (mut/open-schema ::usage-metadata.schema/source-segment-composite-daily))]
  "The summed `source_segment_composite_daily` counts optionally narrowed to `source-type`, `source-id`, and
  bucketed between `bucket-start` and `bucket-end`, grouped by source and clause, largest first."
  [source-type  :- [:maybe :keyword]
   source-id    :- [:maybe ms/PositiveInt]
   bucket-start :- [:maybe ms/TemporalInstant]
   bucket-end   :- [:maybe ms/TemporalInstant]]
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

(mu/defn grouped-profile-rows :- [:sequential (mut/optional-keys (mut/open-schema ::usage-metadata.schema/source-dimension-profile-daily))]
  "The summed `source_dimension_profile_daily` counts optionally narrowed to `source-type`, `source-id`, and
  bucketed between `bucket-start` and `bucket-end`, grouped by source, field, and observation, largest first."
  [source-type  :- [:maybe :keyword]
   source-id    :- [:maybe ms/PositiveInt]
   bucket-start :- [:maybe ms/TemporalInstant]
   bucket-end   :- [:maybe ms/TemporalInstant]]
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

(mu/defn unarchived-segments :- [:sequential (mut/select-keys ::segments.schema/segment [:id :table_id :definition])]
  "The id, Table id, and definition of the unarchived Segments, optionally narrowed to `table-id`."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select [:model/Segment :id :table_id :definition]
             {:where (cond-> [:and [:= :archived false]]
                       table-id (conj [:= :table_id table-id]))}))

(mu/defn unarchived-metric-cards :- [:sequential (mut/select-keys ::queries.schema/card [:id :database_id :dataset_query :card_schema])]
  "The id, Database id, query, and schema of the unarchived metric Cards."
  []
  (t2/select [:model/Card :id :database_id :dataset_query :card_schema] :type "metric" :archived false))
