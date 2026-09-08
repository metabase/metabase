(ns metabase.usage-metadata.schema
  "Shared malli schemas for usage-metadata public API inputs and results.

  These are the shape contracts pinned at the `metabase.usage-metadata.core` boundary and
  enforced inside `metabase.usage-metadata.insights` producers."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
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

(mr/def ::mbql-clause
  [:fn {:error/message "expected an MBQL clause"}
   (fn [x] (and (vector? x) (keyword? (first x))))])

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
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:source_type    [:or :keyword :string]]
   [:source_id      ms/PositiveInt]
   [:ownership_mode [:or :keyword :string]]
   [:field_id       ::lib.schema.id/field]
   [:temporal_unit  [:maybe [:or :keyword :string]]]
   [:binning        [:maybe [:or :string :map sequential?]]]
   [:bucket_date    ms/TemporalInstant]
   [:count          :int]])

(mr/def ::source-dimension-daily.update
  "What an update (or insert) of a SourceDimensionDaily accepts: every column of `:source_dimension_daily` except `id`, all optional."
  [:map {:closed true}
   [:source_type    {:optional true} [:maybe [:or :keyword :string]]]
   [:source_id      {:optional true} [:maybe ms/PositiveInt]]
   [:ownership_mode {:optional true} [:maybe [:or :keyword :string]]]
   [:field_id       {:optional true} [:maybe ::lib.schema.id/field]]
   [:temporal_unit  {:optional true} [:maybe [:or :keyword :string]]]
   [:binning        {:optional true} [:maybe [:or :string :map sequential?]]]
   [:bucket_date    {:optional true} [:maybe ms/TemporalInstant]]
   [:count          {:optional true} [:maybe :int]]])

(mr/def ::source-dimension-profile-daily
  "A SourceDimensionProfileDaily as selected from the app DB: every column of `:source_dimension_profile_daily`."
  [:map {:closed true}
   [:id                ms/PositiveInt]
   [:source_type       [:or :keyword :string]]
   [:source_id         ms/PositiveInt]
   [:field_id          ::lib.schema.id/field]
   [:source_basis      [:or :keyword :string]]
   [:observation_type  [:or :keyword :string]]
   [:observation_value [:maybe [:or :string :map sequential?]]]
   [:bucket_date       ms/TemporalInstant]
   [:count             :int]])

(mr/def ::source-dimension-profile-daily.update
  "What an update (or insert) of a SourceDimensionProfileDaily accepts: every column of `:source_dimension_profile_daily` except `id`, all optional."
  [:map {:closed true}
   [:source_type       {:optional true} [:maybe [:or :keyword :string]]]
   [:source_id         {:optional true} [:maybe ms/PositiveInt]]
   [:field_id          {:optional true} [:maybe ::lib.schema.id/field]]
   [:source_basis      {:optional true} [:maybe [:or :keyword :string]]]
   [:observation_type  {:optional true} [:maybe [:or :keyword :string]]]
   [:observation_value {:optional true} [:maybe [:or :string :map sequential?]]]
   [:bucket_date       {:optional true} [:maybe ms/TemporalInstant]]
   [:count             {:optional true} [:maybe :int]]])

(mr/def ::source-metric-daily
  "A SourceMetricDaily as selected from the app DB: every column of `:source_metric_daily`."
  [:map {:closed true}
   [:id                ms/PositiveInt]
   [:source_type       [:maybe [:or :keyword :string]]]
   [:source_id         [:maybe ms/PositiveInt]]
   [:ownership_mode    [:or :keyword :string]]
   [:agg_type          [:or :keyword :string]]
   [:agg_field_id      [:maybe ::lib.schema.id/field]]
   [:temporal_field_id [:maybe ::lib.schema.id/field]]
   [:temporal_unit     [:maybe [:or :keyword :string]]]
   [:bucket_date       ms/TemporalInstant]
   [:count             :int]])

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
  [:map {:closed true}
   [:id                ms/PositiveInt]
   [:source_type       [:maybe [:or :keyword :string]]]
   [:source_id         [:maybe ms/PositiveInt]]
   [:ownership_mode    [:or :keyword :string]]
   [:clause            [:or :string :map sequential?]]
   [:atom_fingerprints [:or :string :map sequential?]]
   [:atom_count        :int]
   [:bucket_date       ms/TemporalInstant]
   [:count             :int]])

(mr/def ::source-segment-composite-daily.update
  "What an update (or insert) of a SourceSegmentCompositeDaily accepts: every column of `:source_segment_composite_daily` except `id`, all optional."
  [:map {:closed true}
   [:source_type       {:optional true} [:maybe [:or :keyword :string]]]
   [:source_id         {:optional true} [:maybe ms/PositiveInt]]
   [:ownership_mode    {:optional true} [:maybe [:or :keyword :string]]]
   [:clause            {:optional true} [:maybe [:or :string :map sequential?]]]
   [:atom_fingerprints {:optional true} [:maybe [:or :string :map sequential?]]]
   [:atom_count        {:optional true} [:maybe :int]]
   [:bucket_date       {:optional true} [:maybe ms/TemporalInstant]]
   [:count             {:optional true} [:maybe :int]]])

(mr/def ::source-segment-daily
  "A SourceSegmentDaily as selected from the app DB: every column of `:source_segment_daily`."
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:source_type    [:maybe [:or :keyword :string]]]
   [:source_id      [:maybe ms/PositiveInt]]
   [:ownership_mode [:or :keyword :string]]
   [:field_id       [:maybe ::lib.schema.id/field]]
   [:predicate      [:or :string :map sequential?]]
   [:bucket_date    ms/TemporalInstant]
   [:count          :int]])

(mr/def ::source-segment-daily.update
  "What an update (or insert) of a SourceSegmentDaily accepts: every column of `:source_segment_daily` except `id`, all optional."
  [:map {:closed true}
   [:source_type    {:optional true} [:maybe [:or :keyword :string]]]
   [:source_id      {:optional true} [:maybe ms/PositiveInt]]
   [:ownership_mode {:optional true} [:maybe [:or :keyword :string]]]
   [:field_id       {:optional true} [:maybe ::lib.schema.id/field]]
   [:predicate      {:optional true} [:maybe [:or :string :map sequential?]]]
   [:bucket_date    {:optional true} [:maybe ms/TemporalInstant]]
   [:count          {:optional true} [:maybe :int]]])
