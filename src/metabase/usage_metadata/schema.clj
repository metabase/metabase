(ns metabase.usage-metadata.schema
  "Shared malli schemas for usage-metadata public API inputs and results.

  These are the shape contracts pinned at the `metabase.usage-metadata.core` boundary and
  enforced inside `metabase.usage-metadata.insights` producers."
  (:require
   [metabase.util.malli.registry :as mr]))

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
