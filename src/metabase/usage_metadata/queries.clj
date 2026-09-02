(ns metabase.usage-metadata.queries
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

(defn delete-rollups-before!
  "Delete the `model` rollup rows bucketed before `bucket-date`."
  [model bucket-date]
  (t2/delete! model :bucket_date [:< bucket-date]))

(defn delete-rollups-for-day!
  "Delete the `model` rollup rows bucketed on `bucket-date`."
  [model bucket-date]
  (t2/delete! model :bucket_date bucket-date))

(defn insert-rows!
  "Insert `rows` into `model`."
  [model rows]
  (t2/insert! model rows))

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

(defn grouped-segment-rows
  "The summed `source_segment_daily` counts matching the Honey SQL `where` clause, grouped by source, field, and
  predicate, largest first."
  [where]
  (t2/select [:model/SourceSegmentDaily
              :source_type
              :source_id
              :field_id
              :predicate
              [[:sum :count] :total_count]]
             {:where    where
              :group-by [:source_type :source_id :field_id :predicate]
              :order-by [[:total_count :desc]]}))

(defn grouped-metric-rows
  "The summed `source_metric_daily` counts matching the Honey SQL `where` clause, grouped by source and aggregation,
  largest first."
  [where]
  (t2/select [:model/SourceMetricDaily
              :source_type
              :source_id
              :agg_type
              :agg_field_id
              :temporal_field_id
              :temporal_unit
              [[:sum :count] :total_count]]
             {:where    where
              :group-by [:source_type :source_id :agg_type :agg_field_id :temporal_field_id :temporal_unit]
              :order-by [[:total_count :desc]]}))

(defn grouped-dimension-rows
  "The summed `source_dimension_daily` counts matching the Honey SQL `where` clause, grouped by source, field, unit,
  and binning, largest first."
  [where]
  (t2/select [:model/SourceDimensionDaily
              :source_type
              :source_id
              :field_id
              :temporal_unit
              :binning
              [[:sum :count] :total_count]]
             {:where    where
              :group-by [:source_type :source_id :field_id :temporal_unit :binning]
              :order-by [[:total_count :desc]]}))

(defn grouped-composite-rows
  "The summed `source_segment_composite_daily` counts matching the Honey SQL `where` clause, grouped by source and
  clause, largest first."
  [where]
  (t2/select [:model/SourceSegmentCompositeDaily
              :source_type
              :source_id
              :clause
              :atom_fingerprints
              :atom_count
              [[:sum :count] :total_count]]
             {:where    where
              :group-by [:source_type :source_id :clause :atom_fingerprints :atom_count]
              :order-by [[:total_count :desc]]}))

(defn grouped-profile-rows
  "The summed `source_dimension_profile_daily` counts matching the Honey SQL `where` clause, grouped by source,
  field, and observation, largest first."
  [where]
  (t2/select [:model/SourceDimensionProfileDaily
              :source_type
              :source_id
              :field_id
              :source_basis
              :observation_type
              :observation_value
              [[:sum :count] :total_count]]
             {:where    where
              :group-by [:source_type :source_id :field_id :source_basis :observation_type :observation_value]
              :order-by [[:total_count :desc]]}))

(defn segments
  "The id, Table id, and definition of the Segments matching the Honey SQL `where` clause."
  [where]
  (t2/select [:model/Segment :id :table_id :definition] {:where where}))

(defn unarchived-metric-cards
  "The id, Database id, query, and schema of the unarchived metric Cards."
  []
  (t2/select [:model/Card :id :database_id :dataset_query :card_schema] :type "metric" :archived false))
