(ns metabase.usage-metadata.db
  "Application database queries for the usage metadata module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.usage-metadata.schema :as usage-metadata.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn query-execution-hash-counts
  "The `:hash` and execution count `:n` of the QueryExecutions started at or after `started-at` and before
  `started-before`, grouped by hash."
  [started-at     :- ms/TemporalInstant
   started-before :- ms/TemporalInstant]
  (t2/select [:model/QueryExecution :hash [:%count.* :n]]
             {:where    [:and
                         [:>= :started_at started-at]
                         [:<  :started_at started-before]]
              :group-by [:hash]}))

(mu/defn raw-field-fingerprint
  "The stored fingerprint of the Field with `field-id`, as it sits in the table, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :fingerprint :metabase_field :id field-id))

(mu/defn queries-reducible
  "A reducible over `conn` of the hash and query of the Queries with `query-hashes`."
  [conn         :- (ms/InstanceOfClass java.sql.Connection)
   query-hashes :- [:sequential bytes?]]
  (t2/reducible-select :conn conn [:model/Query :query_hash :query] :query_hash [:in query-hashes]))

(mu/defn delete-segment-rollups-before!
  "Delete the SourceSegmentDaily rollup rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceSegmentDaily :bucket_date [:< bucket-date]))

(mu/defn delete-segment-rollups-for-day!
  "Delete the SourceSegmentDaily rollup rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceSegmentDaily :bucket_date bucket-date))

(mu/defn insert-segment-rollups!
  "Insert `rows` into SourceSegmentDaily."
  [rows :- [:sequential
            (mut/select-keys ::usage-metadata.schema/source-segment-daily.update [:source_type :source_id :ownership_mode :field_id :predicate :bucket_date :count])]]
  (t2/insert! :model/SourceSegmentDaily rows))

(mu/defn delete-segment-composite-rollups-before!
  "Delete the SourceSegmentCompositeDaily rollup rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceSegmentCompositeDaily :bucket_date [:< bucket-date]))

(mu/defn delete-segment-composite-rollups-for-day!
  "Delete the SourceSegmentCompositeDaily rollup rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceSegmentCompositeDaily :bucket_date bucket-date))

(mu/defn insert-segment-composite-rollups!
  "Insert `rows` into SourceSegmentCompositeDaily."
  [rows :- [:sequential
            ::usage-metadata.schema/source-segment-composite-daily.update]]
  (t2/insert! :model/SourceSegmentCompositeDaily rows))

(mu/defn delete-metric-rollups-before!
  "Delete the SourceMetricDaily rollup rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceMetricDaily :bucket_date [:< bucket-date]))

(mu/defn delete-metric-rollups-for-day!
  "Delete the SourceMetricDaily rollup rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceMetricDaily :bucket_date bucket-date))

(mu/defn insert-metric-rollups!
  "Insert `rows` into SourceMetricDaily."
  [rows :- [:sequential
            ::usage-metadata.schema/source-metric-daily.update]]
  (t2/insert! :model/SourceMetricDaily rows))

(mu/defn delete-dimension-rollups-before!
  "Delete the SourceDimensionDaily rollup rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceDimensionDaily :bucket_date [:< bucket-date]))

(mu/defn delete-dimension-rollups-for-day!
  "Delete the SourceDimensionDaily rollup rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceDimensionDaily :bucket_date bucket-date))

(mu/defn insert-dimension-rollups!
  "Insert `rows` into SourceDimensionDaily."
  [rows :- [:sequential
            ::usage-metadata.schema/source-dimension-daily.update]]
  (t2/insert! :model/SourceDimensionDaily rows))

(mu/defn delete-dimension-profile-rollups-before!
  "Delete the SourceDimensionProfileDaily rollup rows bucketed before `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceDimensionProfileDaily :bucket_date [:< bucket-date]))

(mu/defn delete-dimension-profile-rollups-for-day!
  "Delete the SourceDimensionProfileDaily rollup rows bucketed on `bucket-date`."
  [bucket-date :- ms/TemporalInstant]
  (t2/delete! :model/SourceDimensionProfileDaily :bucket_date bucket-date))

(mu/defn insert-dimension-profile-rollups!
  "Insert `rows` into SourceDimensionProfileDaily."
  [rows :- [:sequential
            ::usage-metadata.schema/source-dimension-profile-daily.update]]
  (t2/insert! :model/SourceDimensionProfileDaily rows))

(mu/defn field-names
  "The id, name, and display name of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select [:model/Field :id :name :display_name] :id [:in field-ids] {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn table-names
  "The id, name, display name, Database id, and schema of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Table :id :name :display_name :db_id :schema] :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn table-database-ids
  "The id and Database id of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Table :id :db_id] :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn card-names
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

(mu/defn grouped-segment-rows
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

(mu/defn grouped-metric-rows
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

(mu/defn grouped-dimension-rows
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

(mu/defn grouped-composite-rows
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

(mu/defn grouped-profile-rows
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

(mu/defn unarchived-segments
  "The id, Table id, and definition of the unarchived Segments, optionally narrowed to `table-id`."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select [:model/Segment :id :table_id :definition]
             {:where (cond-> [:and [:= :archived false]]
                       table-id (conj [:= :table_id table-id]))}))

(mu/defn unarchived-metric-cards
  "The id, name, description, type, Database id, query, and schema of the unarchived metric Cards."
  []
  (t2/select [:model/Card :id :name :description :type :database_id :dataset_query :card_schema]
             :type "metric"
             :archived false))

;;; ------------------------------------------------ Candidate sources ------------------------------------------------

(def ^:private CardColumns
  [:cat [:= :model/Card] [:* :keyword]])

(mu/defn eligible-source-cards
  "The `columns` of every unarchived question and model Card."
  [columns :- CardColumns]
  (t2/select columns :archived false :type [:in [:question :model]]))

(mu/defn eligible-source-cards-by-id
  "The `columns` of the unarchived question and model Cards with `card-ids`."
  [columns  :- CardColumns
   card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select columns :id [:in card-ids] :archived false :type [:in [:question :model]]))

(mu/defn verified-card-ids
  "The ids of the Cards among `card-ids` whose most recent moderation review verified them."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select-fn-set :moderated_item_id :model/ModerationReview
                    :moderated_item_id [:in card-ids]
                    :moderated_item_type "card"
                    :most_recent true
                    :status "verified"))

(mu/defn official-collection-ids
  "The ids of the official Collections among `collection-ids`."
  [collection-ids :- [:sequential ms/PositiveInt]]
  (t2/select-pks-set :model/Collection :id [:in collection-ids] :authority_level "official"))

(mu/defn collection-locations
  "The id, location, and personal owner of the Collections with `collection-ids`."
  [collection-ids :- [:sequential ms/PositiveInt]]
  (t2/select [:model/Collection :id :location :personal_owner_id] :id [:in collection-ids]))

(mu/defn collection-names
  "The id, name, and authority level of the Collections with `collection-ids`."
  [collection-ids :- [:set ms/PositiveInt]]
  (t2/select [:model/Collection :id :name :authority_level] :id [:in collection-ids]))

(mu/defn card-view-counts-since
  "Card views logged at or after `cutoff` for the Cards with `card-ids`, counted per Card."
  [card-ids :- [:sequential ::lib.schema.id/card]
   cutoff   :- ms/TemporalInstant]
  (t2/select [:model/ViewLog :model_id [:%count.* :view_count]]
             {:where    [:and
                         [:= :model "card"]
                         [:>= :timestamp cutoff]
                         [:in :model_id card-ids]]
              :group-by [:model_id]}))

(mu/defn unarchived-cards-of-types
  "The id, name, type, Database id, query, and schema of the unarchived Cards with `card-ids` and one of `types`."
  [card-ids :- [:sequential ::lib.schema.id/card]
   types    :- [:set :keyword]]
  (t2/select [:model/Card :id :name :type :database_id :dataset_query :card_schema]
             :id [:in card-ids]
             :archived false
             :type [:in types]))

;;; ---------------------------------------------- Candidate tables -------------------------------------------------

(mu/defn candidate-dependency-tables
  "The Tables with `table-ids` as users see them, with the columns that decide whether they can back a candidate."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Table :id :db_id :schema :name :display_name :description
              :data_layer :data_authority :view_count :active :visibility_type :is_published :collection_id]
             :id [:in table-ids]
             {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn visible-candidate-tables
  "The active, visible, not-hidden Tables with `table-ids` as users see them."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Table :id :db_id :schema :name :display_name :description
              :data_layer :data_authority :view_count :active :visibility_type :is_published :collection_id]
             {:from  [(warehouse-schema-overlay/table-query)]
              :where [:and
                      [:in :id table-ids]
                      [:= :active true]
                      [:= :visibility_type nil]
                      [:or [:= :data_layer nil] [:not= :data_layer "hidden"]]]}))

(mu/defn published-table-ids
  "The ids of the published Tables among `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select-fn-set :id [:model/Table :id]
                    :id [:in table-ids]
                    :is_published true
                    {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn table
  "The Table with `table-id` as users see it."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table :id table-id {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn candidate-databases
  "The id, name, and audit/sample/router flags of the Databases with `database-ids`."
  [database-ids :- [:set ::lib.schema.id/database]]
  (t2/select [:model/Database :id :name :is_audit :is_sample :router_database_id] :id [:in database-ids]))

;;; ----------------------------------------------- Candidate runs --------------------------------------------------

(mu/defn candidate-run
  "The candidate refresh run with `run-id`."
  [run-id :- ms/PositiveInt]
  (t2/select-one :model/UsageMetadataCandidateRun :id run-id))

(mu/defn latest-finished-candidate-run
  "The most recently finished candidate refresh run with `status`."
  [status :- ::usage-metadata.schema/candidate-run-status]
  (t2/select-one :model/UsageMetadataCandidateRun
                 :status status
                 {:order-by [[:finished_at :desc] [:id :desc]]}))

(mu/defn latest-active-candidate-run
  "The newest queued or running candidate refresh run."
  []
  (t2/select-one :model/UsageMetadataCandidateRun
                 :status [:in [:queued :running]]
                 {:order-by [[:id :desc]]}))

(mu/defn insert-candidate-run!
  "Insert a candidate refresh run and return it."
  [run :- ::usage-metadata.schema/candidate-run.update]
  (t2/insert-returning-instance! :model/UsageMetadataCandidateRun run))

(mu/defn update-candidate-run-in-status!
  "Apply `changes` to the run with `run-id` if its status is one of `statuses`; the number of rows updated."
  [run-id   :- ms/PositiveInt
   statuses :- [:sequential ::usage-metadata.schema/candidate-run-status]
   changes  :- ::usage-metadata.schema/candidate-run.update]
  (t2/update! :model/UsageMetadataCandidateRun {:id run-id, :status [:in statuses]} changes))

(mu/defn newest-candidate-run-ids
  "The ids of the newest `n` candidate refresh runs."
  [n :- ms/PositiveInt]
  (t2/select-pks-set :model/UsageMetadataCandidateRun {:order-by [[:id :desc]], :limit n}))

(mu/defn delete-candidate-runs-except!
  "Delete every candidate refresh run whose id is not in `keep-ids`."
  [keep-ids :- [:set ms/PositiveInt]]
  (t2/delete! :model/UsageMetadataCandidateRun :id [:not-in keep-ids]))

;;; ------------------------------------------------- Candidates ----------------------------------------------------

(mu/defn candidate
  "The candidate with `candidate-id`."
  [candidate-id :- ms/PositiveInt]
  (t2/select-one :model/UsageMetadataCandidate :id candidate-id))

(mu/defn run-candidates
  "The `columns` of the candidates in `run-id`, optionally narrowed to `candidate-types`."
  [columns         :- [:sequential :keyword]
   run-id          :- ms/PositiveInt
   candidate-types :- [:maybe [:sequential ::usage-metadata.schema/candidate-type]]]
  (t2/select (into [:model/UsageMetadataCandidate] columns)
             {:where (cond-> [:and [:= :run_id run-id]]
                       candidate-types (conj [:in :candidate_type (mapv name candidate-types)]))}))

(mu/defn run-candidates-with-signature-hashes
  "The candidates in `run-id` whose signature hash is one of `signature-hashes`."
  [run-id           :- ms/PositiveInt
   signature-hashes :- [:sequential :string]]
  (t2/select :model/UsageMetadataCandidate :run_id run-id :signature_hash [:in signature-hashes]))

(mu/defn run-candidates-after
  "The `columns` of up to `limit` candidates in `run-id` with ids greater than `last-id`, in id order."
  [columns :- [:sequential :keyword]
   run-id  :- ms/PositiveInt
   last-id :- :int
   limit   :- ms/PositiveInt]
  (t2/select (into [:model/UsageMetadataCandidate] columns)
             :run_id run-id
             :id [:> last-id]
             {:order-by [[:id :asc]], :limit limit}))

(mu/defn candidates-by-id
  "The `columns` of the candidates with `candidate-ids`, keyed by id."
  [columns       :- [:sequential :keyword]
   candidate-ids :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn identity (into [:model/UsageMetadataCandidate :id] columns) :id [:in candidate-ids]))

(mu/defn candidate-ids-outside-run
  "The ids of up to `limit` candidates that do not belong to `run-id`, in id order."
  [run-id :- ms/PositiveInt
   limit  :- ms/PositiveInt]
  (t2/select-pks-set :model/UsageMetadataCandidate
                     {:where    [:not= :run_id run-id]
                      :order-by [[:id :asc]]
                      :limit    limit}))

(mu/defn run-candidate-table-count
  "The number of distinct Tables with candidates in `run-id`."
  [run-id :- ms/PositiveInt]
  (:table_count (t2/query-one {:select [[[:count [:distinct :table_id]] :table_count]]
                               :from   [(t2/table-name :model/UsageMetadataCandidate)]
                               :where  [:= :run_id run-id]})))

(mu/defn insert-candidates!
  "Insert candidate `rows`."
  [rows :- [:sequential ::usage-metadata.schema/candidate.update]]
  (t2/insert! :model/UsageMetadataCandidate rows))

(mu/defn update-candidates!
  "Apply `changes` to the candidates with `candidate-ids`."
  [candidate-ids :- [:sequential ms/PositiveInt]
   changes       :- ::usage-metadata.schema/candidate.update]
  (t2/update! :model/UsageMetadataCandidate :id [:in candidate-ids] changes))

(mr/def ::candidate-set-clause
  [:map {:closed true}
   [:verified_source_count {:optional true} ::h2x/expr]
   [:official_source_count {:optional true} ::h2x/expr]
   [:popular_source_count  {:optional true} ::h2x/expr]
   [:distinct_source_count {:optional true} ::h2x/expr]
   [:recent_view_count     {:optional true} ::h2x/expr]
   [:last_used_at          {:optional true} ::h2x/expr]
   [:semantic_details      {:optional true} ::h2x/expr]
   [:display_name          {:optional true} ::h2x/expr]
   [:sort_position         {:optional true} ::h2x/expr]])

(mu/defn set-candidate-columns!
  "Set the candidates with `candidate-ids` to the Honey SQL `set-clause`, which may compute per-row values."
  [candidate-ids :- [:sequential ms/PositiveInt]
   set-clause    :- ::candidate-set-clause]
  (t2/query {:update (t2/table-name :model/UsageMetadataCandidate)
             :set    set-clause
             :where  [:in :id candidate-ids]}))

(mu/defn delete-candidates!
  "Delete the candidates with `candidate-ids`."
  [candidate-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/UsageMetadataCandidate :id [:in candidate-ids]))

;;; ------------------------------------------------ Candidate lists ------------------------------------------------

(defn- candidate-list-query
  [run-id {:keys [table-id database-id schema table-published? candidate-types reviews modeling-statuses
                  last-used-from last-used-to search]}]
  {:from       [[(t2/table-name :model/UsageMetadataCandidate) :candidate]]
   :inner-join [(warehouse-schema-overlay/table-query {:alias :table})
                [:= :candidate.table_id :table.id]
                [(t2/table-name :model/Database) :database]
                [:= :table.db_id :database.id]]
   :left-join  [[(t2/table-name :model/UsageMetadataCandidateDismissal) :dismissal]
                [:and
                 [:= :candidate.candidate_type :dismissal.candidate_type]
                 [:= :candidate.table_id :dismissal.table_id]
                 [:= :candidate.signature_version :dismissal.signature_version]
                 [:= :candidate.signature_hash :dismissal.signature_hash]]]
   :where      (cond-> [:and [:= :candidate.run_id run-id]]
                 table-id                 (conj [:= :candidate.table_id table-id])
                 database-id              (conj [:= :table.db_id database-id])
                 schema                   (conj [:= :table.schema schema])
                 (some? table-published?) (conj [:= :table.is_published table-published?])
                 (seq candidate-types)    (conj [:in :candidate.candidate_type (mapv name candidate-types)])
                 (seq modeling-statuses)  (conj [:in :candidate.modeling_status (mapv name modeling-statuses)])
                 last-used-from           (conj [:>= :candidate.last_used_at last-used-from])
                 last-used-to             (conj [:< :candidate.last_used_at last-used-to])

                 ;; Both review states together, or neither, is every candidate.
                 (= reviews #{:to-review}) (conj [:= :dismissal.id nil])
                 (= reviews #{:discarded}) (conj [:!= :dismissal.id nil])

                 (not (str/blank? search))
                 (conj (let [pattern (str "%" (u/lower-case-en search) "%")]
                         [:or
                          [:like [:lower :candidate.suggested_name] pattern]
                          [:like [:lower :candidate.display_name] pattern]
                          [:like [:lower :candidate.suggested_description] pattern]
                          [:like [:lower :table.name] pattern]
                          [:like [:lower :table.display_name] pattern]
                          [:like [:lower :table.schema] pattern]
                          [:like [:lower :database.name] pattern]])))})

(defn- order-by-with-direction
  "Order-by clauses sorting on `expression` in `direction`, with NULLs last either way. (MySQL has no `NULLS LAST`.)"
  [expression direction]
  [[[:case [:= expression nil] 1 :else 0] :asc]
   [expression direction]])

(def ^:private candidate-sort-expressions
  {:name      [:lower :candidate.display_name]
   :views     :candidate.recent_view_count
   :sources   :candidate.distinct_source_count
   :last-used :candidate.last_used_at})

(mu/defn candidate-list-count
  "The number of candidates in `run-id` that match `filters`."
  [run-id  :- ms/PositiveInt
   filters :- ::usage-metadata.schema/candidate-list-filters]
  (:total (t2/query-one (assoc (candidate-list-query run-id filters)
                               :select [[[:count :candidate.id] :total]]))))

(mu/defn candidate-list-ids
  "One page of the ids of the candidates in `run-id` that match `filters`, in `sort` order, or in their deterministic
  family order when there is no `sort`."
  [run-id  :- ms/PositiveInt
   filters :- ::usage-metadata.schema/candidate-list-filters
   sort    :- [:maybe ::usage-metadata.schema/candidate-list-sort]
   limit   :- ms/PositiveInt
   offset  :- ms/IntGreaterThanOrEqualToZero]
  (mapv :id (t2/query (assoc (candidate-list-query run-id filters)
                             :select   [[:candidate.id :id]]
                             :order-by (cond-> []
                                         sort (into (order-by-with-direction
                                                     (candidate-sort-expressions (:column sort))
                                                     (:direction sort)))
                                         true (conj [:candidate.sort_position :asc] [:candidate.id :asc]))
                             :limit    limit
                             :offset   offset))))

(mu/defn candidate-table-list-count
  "The number of distinct Tables with candidates in `run-id` that match `filters`."
  [run-id  :- ms/PositiveInt
   filters :- ::usage-metadata.schema/candidate-list-filters]
  (:total (t2/query-one (assoc (candidate-list-query run-id filters)
                               :select [[[:count [:distinct :candidate.table_id]] :total]]))))

(defn- table-view-counts-query
  "Views of each Table's matching candidates, counting every source Card once however many candidates it feeds."
  [run-id filters]
  ^:allow-subquery
  {:select   [:table_id [[:sum :recent_view_count] :recent_view_count]]
   :from     [[(-> (candidate-list-query run-id filters)
                   (update :inner-join into [[(t2/table-name :model/UsageMetadataCandidateSource) :source]
                                             [:= :source.candidate_id :candidate.id]])
                   (assoc :select-distinct [[:candidate.table_id :table_id]
                                            [:source.card_id :card_id]
                                            [:source.recent_view_count :recent_view_count]])
                   (vary-meta assoc :allow-subquery true))
               :table_source]]
   :group-by [:table_id]})

(def ^:private table-sort-expressions
  {:name       [:lower [:coalesce :table.display_name :table.name]]
   :views      [:coalesce :table_views.recent_view_count 0]
   :candidates [:count :candidate.id]})

(mu/defn candidate-table-list-counts
  "One page of the Tables with candidates in `run-id` that match `filters`, with their candidate counts and the views
  of their distinct source Cards, in `sort` order (most candidates first when there is no `sort`)."
  [run-id  :- ms/PositiveInt
   filters :- ::usage-metadata.schema/candidate-list-filters
   sort    :- [:maybe ::usage-metadata.schema/candidate-table-list-sort]
   limit   :- ms/PositiveInt
   offset  :- ms/IntGreaterThanOrEqualToZero]
  (let [{:keys [column direction] :or {column :candidates, direction :desc}} sort]
    (t2/query (-> (candidate-list-query run-id filters)
                  (update :left-join into [[(table-view-counts-query run-id filters) :table_views]
                                           [:= :table_views.table_id :candidate.table_id]])
                  (assoc :select   [[:candidate.table_id :table_id]
                                    [[:count :candidate.id] :candidate_count]
                                    [[:coalesce :table_views.recent_view_count 0] :recent_view_count]]
                         :group-by [:candidate.table_id :table.display_name :table.name
                                    :table_views.recent_view_count]
                         :order-by (into (order-by-with-direction (table-sort-expressions column) direction)
                                         [[[:lower [:coalesce :table.display_name :table.name]] :asc]
                                          [:candidate.table_id :asc]])
                         :limit    limit
                         :offset   offset)))))

;;; ------------------------------------------- Candidate sources and matches -------------------------------------

(def ^:private candidate-source-columns
  [:card_id :card_name :card_type :verified :official :popular :recent_view_count :joined :stage_numbers
   :model_lineage :collection_id :last_used_at])

(mu/defn candidate-sources
  "The source Cards recorded for the candidates with `candidate-ids`."
  [candidate-ids :- [:sequential ms/PositiveInt]]
  (t2/select (into [:model/UsageMetadataCandidateSource :candidate_id] candidate-source-columns)
             :candidate_id [:in candidate-ids]
             {:order-by [[:candidate_id :asc] [:card_id :asc]]}))

(mu/defn insert-candidate-sources!
  "Insert candidate source `rows`."
  [rows :- [:sequential ::usage-metadata.schema/candidate-source.update]]
  (t2/insert! :model/UsageMetadataCandidateSource rows))

(mu/defn candidate-matches
  "The Library entities matched to the candidate with `candidate-id`, in insertion order."
  [candidate-id :- ms/PositiveInt]
  (t2/select [:model/UsageMetadataCandidateMatch :relation :entity_id :entity_name :entity_description]
             :candidate_id candidate-id
             {:order-by [[:id :asc]]}))

(mu/defn insert-candidate-matches!
  "Insert candidate match `rows`."
  [rows :- [:sequential ::usage-metadata.schema/candidate-match.update]]
  (t2/insert! :model/UsageMetadataCandidateMatch rows))

(mu/defn select-or-insert-candidate-match!
  "The candidate match identified by `match-keys`, inserting `row` when there is none."
  [match-keys :- [:map {:closed true}
                  [:candidate_id ms/PositiveInt]
                  [:relation     ::usage-metadata.schema/candidate-match-relation]
                  [:entity_id    ms/PositiveInt]]
   row        :- ::usage-metadata.schema/candidate-match.update]
  (app-db/select-or-insert! :model/UsageMetadataCandidateMatch match-keys (constantly row)))

(mu/defn unarchived-library-entities
  "The id, Table id, name, description, and definition of the unarchived Measures or Segments on `table-ids`."
  [model     :- [:enum :model/Measure :model/Segment]
   table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [model :id :table_id :name :description :definition] :table_id [:in table-ids] :archived false))

;;; ---------------------------------------------- Candidate dismissals -------------------------------------------

(mu/defn table-candidate-dismissals
  "The candidate dismissals recorded on `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/UsageMetadataCandidateDismissal :table_id [:in table-ids]))

(mu/defn select-or-insert-candidate-dismissal!
  "The dismissal with `dismissal-identity`, inserting `row` when there is none."
  [dismissal-identity :- ::usage-metadata.schema/candidate-dismissal-identity
   row                :- ::usage-metadata.schema/candidate-dismissal.update]
  (app-db/select-or-insert! :model/UsageMetadataCandidateDismissal dismissal-identity (constantly row)))

(mu/defn delete-candidate-dismissal!
  "Delete the dismissal with `dismissal-identity`."
  [{:keys [candidate_type table_id signature_version signature_hash]} :- ::usage-metadata.schema/candidate-dismissal-identity]
  (t2/delete! :model/UsageMetadataCandidateDismissal
              :candidate_type candidate_type
              :table_id table_id
              :signature_version signature_version
              :signature_hash signature_hash))
