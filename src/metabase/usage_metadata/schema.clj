(ns metabase.usage-metadata.schema
  "Shared malli schemas for usage-metadata inputs and results."
  (:require
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::source-type [:enum :table :card])

(mr/def ::opts
  [:map {:closed true}
   [:source-type  {:optional true, :description "Restrict to a specific source kind."}
    [:maybe ::source-type]]
   [:source-id    {:optional true, :description "Restrict to a specific source id."}
    [:maybe pos-int?]]
   [:bucket-start {:optional true, :description "Inclusive lower bound on rollup bucket_date."}
    [:maybe :time/local-date]]
   [:bucket-end   {:optional true, :description "Inclusive upper bound on rollup bucket_date."}
    [:maybe :time/local-date]]
   [:limit        {:optional true, :description "Maximum number of results to return."}
    [:maybe pos-int?]]])

(mr/def ::candidate-opts
  [:map {:closed true}
   [:card-ids       {:optional true, :description "Explicit Card IDs controlling which questions and models are analyzed."}
    [:maybe [:set pos-int?]]]
   [:min-view-count {:optional true, :description "Lifetime Card view_count used by the default source and as popularity evidence."}
    [:maybe nat-int?]]
   [:view-count-window-days {:optional true, :description "When set, use Card views within this many days instead of lifetime view_count."}
    [:maybe pos-int?]]])

(mr/def ::source
  [:map
   [:type         ::source-type]
   [:id           pos-int?]
   [:name         [:maybe :string]]
   [:display-name [:maybe :string]]
   ;; :db-id / :schema are present only on :table sources.
   [:db-id        {:optional true} [:maybe pos-int?]]
   [:schema       {:optional true} [:maybe :string]]])

(mr/def ::field
  [:map
   [:id           pos-int?]
   [:name         [:maybe :string]]
   [:display-name [:maybe :string]]])

(mr/def ::candidate-source-item
  [:map {:closed true}
   [:id                   pos-int?]
   [:name                 [:maybe :string]]
   [:type                 [:enum :question :model]]
   [:verified?            :boolean]
   [:official-collection? :boolean]
   [:popular?             :boolean]
   [:view-count           nat-int?]
   [:collection-id        [:maybe pos-int?]]
   [:last-used-at         [:maybe ms/TemporalInstant]]
   [:stage-numbers        [:sequential {:min 1} nat-int?]]
   [:joined?              :boolean]
   [:model-lineage        {:optional true}
    [:sequential {:min 1}
     [:map {:closed true}
      [:id   pos-int?]
      [:name [:maybe :string]]]]]])

(mr/def ::candidate-evidence
  [:map {:closed true}
   [:source-items          [:sequential {:min 1} ::candidate-source-item]]
   [:distinct-source-count pos-int?]
   [:verified-source-count nat-int?]
   [:official-source-count nat-int?]
   [:popular-source-count  nat-int?]
   [:total-view-count      nat-int?]
   [:last-used-at          [:maybe ms/TemporalInstant]]])

(mr/def ::candidate-table-model
  [:map {:closed true}
   [:id   pos-int?]
   [:name [:maybe :string]]])

(mr/def ::candidate-table-dependency-path
  [:map {:closed true}
   [:direct? :boolean]
   [:models  [:sequential ::candidate-table-model]]])

(mr/def ::candidate-table-source-item
  [:map {:closed true}
   [:id                   pos-int?]
   [:name                 [:maybe :string]]
   [:type                 [:enum :question :model]]
   [:verified?            :boolean]
   [:official-collection? :boolean]
   [:popular?             :boolean]
   [:view-count           nat-int?]
   [:collection-id        [:maybe pos-int?]]
   [:last-used-at         [:maybe ms/TemporalInstant]]
   [:dependency-paths     [:sequential {:min 1} ::candidate-table-dependency-path]]])

(mr/def ::candidate-table-evidence
  [:map {:closed true}
   [:source-items          [:sequential {:min 1} ::candidate-table-source-item]]
   [:distinct-source-count pos-int?]
   [:verified-source-count nat-int?]
   [:official-source-count nat-int?]
   [:popular-source-count  nat-int?]
   [:total-view-count      nat-int?]
   [:last-used-at          [:maybe ms/TemporalInstant]]])

(mr/def ::candidate-table-metadata
  [:map {:closed true}
   [:id             pos-int?]
   [:database-id    pos-int?]
   [:database-name  [:maybe :string]]
   [:schema         [:maybe :string]]
   [:name           [:maybe :string]]
   [:display-name   [:maybe :string]]
   [:description    [:maybe :string]]
   [:data-layer     [:maybe :keyword]]
   [:data-authority [:maybe :keyword]]
   [:view-count     nat-int?]])

(mr/def ::candidate-table
  [:map {:closed true}
   [:table    ::candidate-table-metadata]
   [:evidence ::candidate-table-evidence]])

(mr/def ::unsupported-candidate-source-item
  [:map {:closed true}
   [:id            pos-int?]
   [:name          [:maybe :string]]
   [:type          [:enum :question :model]]
   [:reason        [:enum :native-query :unreadable-query]]
   [:model-lineage {:optional true} [:sequential {:min 1} ::candidate-table-model]]])

(mr/def ::candidate-table-report
  [:map {:closed true}
   [:candidates               [:sequential ::candidate-table]]
   [:unsupported-source-items [:sequential ::unsupported-candidate-source-item]]])

(mr/def ::mbql-clause
  [:fn {:error/message "expected an MBQL clause"}
   (fn [x] (and (vector? x) (keyword? (first x))))])

(mr/def ::candidate-metric-required-table
  [:map {:closed true}
   [:id             pos-int?]
   [:database-id    pos-int?]
   [:database-name  [:maybe :string]]
   [:schema         [:maybe :string]]
   [:name           [:maybe :string]]
   [:display-name   [:maybe :string]]
   [:description    [:maybe :string]]
   [:data-layer     [:maybe :keyword]]
   [:data-authority [:maybe :keyword]]
   [:view-count     nat-int?]
   [:published?     :boolean]])

(mr/def ::candidate-metric
  [:map {:closed true}
   [:definition            :map]
   [:suggested-name        ::lib.schema.common/non-blank-string]
   [:suggested-description ::lib.schema.common/non-blank-string]
   [:aggregation           ::mbql-clause]
   [:temporal-breakout     {:optional true} ::mbql-clause]
   [:required-tables       [:sequential {:min 1} ::candidate-metric-required-table]]
   [:evidence              ::candidate-evidence]])

(mr/def ::implicit-segment
  [:map {:closed true}
   [:predicate {:description "The MBQL filter clause as it appeared in queries, decoded from canonical storage."}
    [:maybe ::mbql-clause]]
   [:source    {:description "The table or card the predicate was applied to."}
    ::source]
   [:fields    {:description "Field metadata for every field referenced inside the predicate. Rows with no resolvable fields are dropped upstream."}
    [:sequential {:min 1} ::field]]
   [:count     {:description "Number of query executions in the window whose stage used this exact predicate."}
    pos-int?]])

(mr/def ::implicit-metric
  [:map {:closed true}
   [:source      {:description "The table or card the aggregation was applied to."}
    ::source]
   [:aggregation [:map {:closed true}
                  [:type           {:description "Primitive op (`:sum`, `:count`, `:avg`, …). Composite aggregations and saved-metric refs are excluded upstream."}
                   :keyword]
                  [:field          {:description "The aggregated column's metadata (nil for `:count`)."}
                   [:maybe ::field]]
                  [:temporal-field {:description "The temporal breakout column joined to this aggregation, if any. nil means an untimed aggregation."}
                   [:maybe ::field]]
                  [:temporal-unit  {:description "Bucket of the temporal breakout (`:day`, `:month`, …)."}
                   [:maybe :keyword]]]]
   [:count       {:description "Number of executions whose stage used this aggregation shape."}
    pos-int?]])

(mr/def ::implicit-dimension
  [:map {:closed true}
   [:source    {:description "The table or card the breakout was applied to."}
    ::source]
   [:dimension [:map {:closed true}
                [:field         {:description "The broken-out column's metadata."}
                 ::field]
                [:temporal-unit {:description "Temporal bucket (`:day`, `:month`, …) if the breakout was temporally bucketed; nil otherwise."}
                 [:maybe :keyword]]
                [:binning       {:description "Decoded binning spec (`:num-bins`, `:bin-width`, `:strategy`) if the breakout was binned; nil otherwise."}
                 [:maybe :map]]]]
   [:count     {:description "Number of executions whose stage broke out by this exact shape."}
    pos-int?]])

(mr/def ::suggested-segment
  [:map {:closed true}
   [:clause        {:description "Reconstructed `[:and ...]` MBQL clause built from the itemset's atoms — what a caller would offer the user to save as a new Segment."}
    ::mbql-clause]
   [:itemset-size  {:description "Number of atomic predicates the suggestion combines (`k` in FIM terms; 2..5 bounded by `fim-k-min`/`fim-k-max`). NOT the size of the source baskets the itemset was mined from — those can be larger."}
    pos-int?]
   [:source        {:description "The table or card the suggestion is attributed to. Suggestions live within a single source; cross-source composites are not mined."}
    ::source]
   [:support       {:description "Weighted count of baskets containing ALL the itemset's atoms (basket weight is the rollup row's execution count). Primary ranking key."}
    pos-int?]
   [:support-ratio {:description "Fraction of baskets-touching-any-atom that also contain the full itemset. Guards against an individually popular atom dragging a co-occurrence that doesn't actually travel together. Floored by `fim-relative-support-floor`."}
    number?]])

(mr/def ::profile-observation
  [:map {:closed true}
   [:source      {:description "The table or card the field lives on."}
    ::source]
   [:field       {:description "Field metadata for the column the observation is about."}
    ::field]
   [:basis       {:description "Where the observation came from (e.g. `:fingerprint`)."}
    :keyword]
   [:observation [:map {:closed true}
                  [:type  {:description "Observation kind (`:single-value`, `:all-null`, `:low-cardinality`)."}
                   :keyword]
                  [:value {:description "Kind-specific detail (e.g. the distinct count for `:low-cardinality`)."}
                   :any]]]
   [:count       {:description "Number of executions in the window that surfaced this observation for this field."}
    pos-int?]])

(mr/def ::source-dimension-daily
  "A SourceDimensionDaily as selected from the app DB: every column of `:source_dimension_daily`."
  [:merge
   ::source-dimension-daily.update
   [:map {:closed true}
    [:id             ms/PositiveInt]]])

(mr/def ::source-dimension-daily.update
  "What an update (or insert) of a SourceDimensionDaily accepts: every column of `:source_dimension_daily` except `id`, all optional."
  [:map {:closed true}
   [:source_type    {:optional true} [:maybe [:or :keyword :string]]]
   [:source_id      {:optional true} [:maybe ms/PositiveInt]]
   [:ownership_mode {:optional true} [:maybe [:or :keyword :string]]]
   [:field_id       {:optional true} [:maybe ::lib.schema.id/field]]
   [:temporal_unit  {:optional true} [:maybe [:or :keyword :string]]]
   [:binning        {:optional true} [:maybe :string]]
   [:bucket_date    {:optional true} [:maybe ms/TemporalInstant]]
   [:count          {:optional true} [:maybe :int]]])

(mr/def ::source-dimension-profile-daily
  "A SourceDimensionProfileDaily as selected from the app DB: every column of `:source_dimension_profile_daily`."
  [:merge
   ::source-dimension-profile-daily.update
   [:map {:closed true}
    [:id                ms/PositiveInt]]])

(mr/def ::source-dimension-profile-daily.update
  "What an update (or insert) of a SourceDimensionProfileDaily accepts: every column of `:source_dimension_profile_daily` except `id`, all optional."
  [:map {:closed true}
   [:source_type       {:optional true} [:maybe [:or :keyword :string]]]
   [:source_id         {:optional true} [:maybe ms/PositiveInt]]
   [:field_id          {:optional true} [:maybe ::lib.schema.id/field]]
   [:source_basis      {:optional true} [:maybe [:or :keyword :string]]]
   [:observation_type  {:optional true} [:maybe [:or :keyword :string]]]
   [:observation_value {:optional true} [:maybe :string]]
   [:bucket_date       {:optional true} [:maybe ms/TemporalInstant]]
   [:count             {:optional true} [:maybe :int]]])

(mr/def ::source-metric-daily
  "A SourceMetricDaily as selected from the app DB: every column of `:source_metric_daily`."
  [:merge
   ::source-metric-daily.update
   [:map {:closed true}
    [:id                ms/PositiveInt]]])

(mr/def ::source-metric-daily.update
  "What an update (or insert) of a SourceMetricDaily accepts: every column of `:source_metric_daily` except `id`, all optional."
  [:map {:closed true}
   [:source_type       {:optional true} [:maybe [:or :keyword :string]]]
   [:source_id         {:optional true} [:maybe ms/PositiveInt]]
   [:ownership_mode    {:optional true} [:maybe [:or :keyword :string]]]
   [:agg_type          {:optional true} [:maybe [:or :keyword :string]]]
   [:agg_field_id      {:optional true} [:maybe ::lib.schema.id/field]]
   [:temporal_field_id {:optional true} [:maybe ::lib.schema.id/field]]
   [:temporal_unit     {:optional true} [:maybe [:or :keyword :string]]]
   [:bucket_date       {:optional true} [:maybe ms/TemporalInstant]]
   [:count             {:optional true} [:maybe :int]]])

(mr/def ::source-segment-composite-daily
  "A SourceSegmentCompositeDaily as selected from the app DB: every column of `:source_segment_composite_daily`."
  [:merge
   ::source-segment-composite-daily.update
   [:map {:closed true}
    [:id                ms/PositiveInt]]])

(mr/def ::source-segment-composite-daily.update
  "What an update (or insert) of a SourceSegmentCompositeDaily accepts: every column of `:source_segment_composite_daily` except `id`, all optional."
  [:map {:closed true}
   [:source_type       {:optional true} [:maybe [:or :keyword :string]]]
   [:source_id         {:optional true} [:maybe ms/PositiveInt]]
   [:ownership_mode    {:optional true} [:maybe [:or :keyword :string]]]
   [:clause            {:optional true} [:maybe :string]]
   [:atom_fingerprints {:optional true} [:maybe :string]]
   [:atom_count        {:optional true} [:maybe :int]]
   [:bucket_date       {:optional true} [:maybe ms/TemporalInstant]]
   [:count             {:optional true} [:maybe :int]]])

(mr/def ::source-segment-daily
  "A SourceSegmentDaily as selected from the app DB: every column of `:source_segment_daily`."
  [:merge
   ::source-segment-daily.update
   [:map {:closed true}
    [:id             ms/PositiveInt]]])

(mr/def ::source-segment-daily.update
  "What an update (or insert) of a SourceSegmentDaily accepts: every column of `:source_segment_daily` except `id`, all optional."
  [:map {:closed true}
   [:source_type    {:optional true} [:maybe [:or :keyword :string]]]
   [:source_id      {:optional true} [:maybe ms/PositiveInt]]
   [:ownership_mode {:optional true} [:maybe [:or :keyword :string]]]
   [:field_id       {:optional true} [:maybe ::lib.schema.id/field]]
   [:predicate      {:optional true} [:maybe :string]]
   [:bucket_date    {:optional true} [:maybe ms/TemporalInstant]]
   [:count          {:optional true} [:maybe :int]]])

;;; ------------------------------------------------ Candidate rows -------------------------------------------------

(mr/def ::candidate-type
  [:enum :measure :segment :metric :table])

(mr/def ::candidate-run-status
  [:enum :queued :running :succeeded :failed])

(mr/def ::app-db-timestamp
  "A timestamp column value: an instant, or a Honey SQL expression such as [[metabase.models.interface/now]] that the
  application database evaluates."
  [:or ms/TemporalInstant ::h2x/expr])

(mr/def ::candidate-evidence-cutoff
  [:map {:closed true}
   [:minimum-distinct-source-count {:optional true} pos-int?]
   [:minimum-total-view-count      nat-int?]])

(mr/def ::candidate-source-config
  "The mining inputs and evidence cutoffs a candidate refresh run was materialized with."
  [:map {:closed true}
   [:kind                      [:enum :qualified-cards]]
   [:usage-window-days         pos-int?]
   [:minimum-recent-view-count nat-int?]
   [:candidate-cutoffs         [:map {:closed true}
                                [:verified ::candidate-evidence-cutoff]
                                [:official ::candidate-evidence-cutoff]
                                [:general  ::candidate-evidence-cutoff]]]])

(mr/def ::candidate-run.update
  "What an update (or insert) of a UsageMetadataCandidateRun accepts: every column of `:usage_metadata_candidate_run`
  except `id`, all optional."
  [:map {:closed true}
   [:status            {:optional true} [:maybe ::candidate-run-status]]
   [:trigger           {:optional true} [:maybe [:enum :manual :scheduled]]]
   [:requested_by      {:optional true} [:maybe ::lib.schema.id/user]]
   [:algorithm_version {:optional true} [:maybe :int]]
   [:source_config     {:optional true} [:maybe ::candidate-source-config]]
   [:started_at        {:optional true} [:maybe ::app-db-timestamp]]
   [:finished_at       {:optional true} [:maybe ::app-db-timestamp]]
   [:error             {:optional true} [:maybe :string]]
   [:summary           {:optional true} [:maybe [:map {:closed true} [:table-count nat-int?]]]]])

(mr/def ::candidate-field
  [:map {:closed true}
   [:id           pos-int?]
   [:name         [:maybe :string]]
   [:display-name [:maybe :string]]])

(mr/def ::candidate-atom
  "One atomic predicate of a candidate, as presented."
  [:map {:closed true}
   [:signature    :string]
   [:display-name :string]
   [:kind         :keyword]])

(mr/def ::candidate-measure-details
  "The `:semantic_details` of a Measure candidate: its aggregation."
  [:map {:closed true}
   [:type                 :keyword]
   [:field                [:maybe ::candidate-field]]
   [:percentile           {:optional true} number?]
   [:condition            {:optional true} [:maybe ::mbql-clause]]
   [:condition-fields     {:optional true} [:sequential ::candidate-field]]
   [:condition-atom-count {:optional true} nat-int?]
   [:condition-atoms      {:optional true} [:sequential ::candidate-atom]]
   [:base-name            {:optional true} :string]])

(mr/def ::candidate-segment-details
  "The `:semantic_details` of a Segment candidate: its predicate and the atoms it combines."
  [:map {:closed true}
   [:predicate  [:maybe ::mbql-clause]]
   [:fields     [:sequential ::candidate-field]]
   [:atoms      {:optional true} [:maybe [:sequential ::candidate-atom]]]
   [:composite? :boolean]
   [:atom-count nat-int?]])

(mr/def ::candidate-metric-details
  "The `:semantic_details` of a Metric candidate."
  [:map {:closed true}
   [:aggregation       ::mbql-clause]
   [:required-tables   [:sequential ::candidate-metric-required-table]]
   [:temporal-breakout {:optional true} ::mbql-clause]])

(mr/def ::candidate-table-details
  "The `:semantic_details` of a publish-Table candidate: the Table and the saved content depending on it."
  [:map {:closed true}
   [:table               ::candidate-table-metadata]
   [:source-dependencies [:sequential [:map {:closed true}
                                       [:card-id          pos-int?]
                                       [:dependency-paths [:sequential ::candidate-table-dependency-path]]]]]])

(mr/def ::candidate.update
  "What an update (or insert) of a UsageMetadataCandidate accepts: every column of `:usage_metadata_candidate` except
  `id`, all optional."
  [:map {:closed true}
   [:run_id                {:optional true} [:maybe ms/PositiveInt]]
   [:candidate_type        {:optional true} [:maybe ::candidate-type]]
   [:table_id              {:optional true} [:maybe ::lib.schema.id/table]]
   [:signature_version     {:optional true} [:maybe :int]]
   [:signature_hash        {:optional true} [:maybe :string]]
   [:signature             {:optional true} [:maybe :string]]
   [:definition            {:optional true} [:maybe [:or
                                                     [:map {:closed true} [:table-id ::lib.schema.id/table]]
                                                     ::lib-be.schema/maybe-legacy-query]]]
   [:semantic_details      {:optional true} [:maybe [:or
                                                     ::candidate-measure-details
                                                     ::candidate-segment-details
                                                     ::candidate-metric-details
                                                     ::candidate-table-details]]]
   [:suggested_name        {:optional true} [:maybe :string]]
   [:display_name          {:optional true} [:maybe :string]]
   [:suggested_description {:optional true} [:maybe :string]]
   [:modeling_status       {:optional true} [:maybe [:enum :missing :partially-modeled :modeled]]]
   [:verified_source_count {:optional true} [:maybe nat-int?]]
   [:official_source_count {:optional true} [:maybe nat-int?]]
   [:popular_source_count  {:optional true} [:maybe nat-int?]]
   [:distinct_source_count {:optional true} [:maybe nat-int?]]
   [:recent_view_count     {:optional true} [:maybe nat-int?]]
   [:last_used_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:complexity            {:optional true} [:maybe nat-int?]]
   [:sort_position         {:optional true} [:maybe nat-int?]]])

(mr/def ::candidate-source.update
  "What an update (or insert) of a UsageMetadataCandidateSource accepts: every column of
  `:usage_metadata_candidate_source` except `id`, all optional."
  [:map {:closed true}
   [:candidate_id      {:optional true} [:maybe ms/PositiveInt]]
   [:card_id           {:optional true} [:maybe ::lib.schema.id/card]]
   [:card_name         {:optional true} [:maybe :string]]
   [:card_type         {:optional true} [:maybe [:enum :question :model]]]
   [:verified          {:optional true} [:maybe :boolean]]
   [:official          {:optional true} [:maybe :boolean]]
   [:popular           {:optional true} [:maybe :boolean]]
   [:recent_view_count {:optional true} [:maybe nat-int?]]
   [:joined            {:optional true} [:maybe :boolean]]
   [:stage_numbers     {:optional true} [:maybe [:sequential nat-int?]]]
   [:model_lineage     {:optional true} [:maybe [:sequential ::candidate-table-model]]]
   [:collection_id     {:optional true} [:maybe pos-int?]]
   [:last_used_at      {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::candidate-match-relation
  [:enum :exact :same-base :subset :superset :overlap])

(mr/def ::candidate-match.update
  "What an update (or insert) of a UsageMetadataCandidateMatch accepts: every column of
  `:usage_metadata_candidate_match` except `id`, all optional."
  [:map {:closed true}
   [:candidate_id       {:optional true} [:maybe ms/PositiveInt]]
   [:relation           {:optional true} [:maybe ::candidate-match-relation]]
   [:entity_id          {:optional true} [:maybe ms/PositiveInt]]
   [:entity_name        {:optional true} [:maybe :string]]
   [:entity_description {:optional true} [:maybe :string]]])

(mr/def ::candidate-dismissal-identity
  "The durable identity a candidate shares with its instance-wide dismissal."
  [:map {:closed true}
   [:candidate_type    ::candidate-type]
   [:table_id          ::lib.schema.id/table]
   [:signature_version :int]
   [:signature_hash    :string]])

(mr/def ::candidate-dismissal.update
  "What an insert of a UsageMetadataCandidateDismissal accepts."
  [:merge
   ::candidate-dismissal-identity
   [:map {:closed true}
    [:dismissed_by [:maybe ::lib.schema.id/user]]
    [:dismissed_at ::app-db-timestamp]]])

(mr/def ::candidate-list-filters
  "The filters of a candidate or candidate-Table list."
  [:map {:closed true}
   [:table-id       {:optional true} [:maybe ::lib.schema.id/table]]
   [:database-id    {:optional true} [:maybe ::lib.schema.id/database]]
   [:candidate-type {:optional true} [:maybe ::candidate-type]]
   [:queue          {:optional true} [:maybe [:enum :suggested :used-raw :discarded]]]
   [:search         {:optional true} [:maybe :string]]])
