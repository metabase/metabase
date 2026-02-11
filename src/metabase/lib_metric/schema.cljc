(ns metabase.lib-metric.schema
  "Malli schemas for metric dimensions, dimension-mappings, and dimension-references."
  (:require
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.malli.registry :as mr]))

(comment lib.schema.ref/keep-me)

(mr/def ::dimension-id
  "UUID string identifying a dimension."
  ::lib.schema.common/uuid)

(mr/def ::dimension-group
  "Group descriptor for a dimension, indicating which table it belongs to."
  [:map
   [:id :string]
   [:type [:enum "main" "connection"]]
   [:display-name :string]])

(mr/def ::dimension-source.type
  [:enum :field])

(mr/def ::dimension-source
  [:map
   [:type     ::dimension-source.type]
   [:field-id {:optional true} [:maybe ::lib.schema.id/field]]])

(mr/def ::dimension
  "Schema for a dimension definition."
  [:map
   [:id             ::dimension-id]
   [:display-name   {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:effective-type {:optional true} [:maybe ::lib.schema.common/base-type]]
   [:semantic-type  {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]
   [:sources        {:optional true} [:maybe [:sequential ::dimension-source]]]])

(mr/def ::dimension-mapping.type
  "Type of dimension mapping."
  [:enum :table])

(mr/def ::dimension-mapping.target
  "Target field reference for a dimension mapping, e.g. [:field {:source-field 1} 2]."
  [:ref :mbql.clause/field])

(mr/def ::dimension-mapping
  "Schema for a dimension mapping."
  [:map
   [:type         ::dimension-mapping.type]
   [:table-id     {:optional true} [:maybe ::lib.schema.id/table]]
   [:dimension-id ::dimension-id]
   [:target       ::dimension-mapping.target]])

(mr/def ::dimension-reference.options
  "Options map for dimension references."
  [:map
   {:decode/normalize lib.schema.common/normalize-options-map}
   [:display-name   {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:effective-type {:optional true} [:maybe ::lib.schema.common/base-type]]
   [:semantic-type  {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]
   [:temporal-unit  {:optional true} [:maybe ::lib.schema.temporal-bucketing/unit]]
   [:binning        {:optional true} [:maybe ::lib.schema.binning/binning]]])

(mr/def ::dimension-reference
  "Dimension reference clause [:dimension opts uuid].
   Handles normalization from JSON where the tag arrives as a string."
  [:tuple
   {:decode/normalize (fn [x]
                        (when (and (sequential? x)
                                   (= 3 (count x)))
                          (let [[tag opts dimension-id] x]
                            [:dimension
                             (or opts {})
                             dimension-id])))}
   [:= {:decode/normalize lib.schema.common/normalize-keyword} :dimension]
   ::dimension-reference.options
   ::dimension-id])

;;; ------------------------------------------------- Filter Clause Normalization -------------------------------------------------
;;; Filter clauses from the API arrive with string operators and dimension refs that need normalization.

(defn normalize-dimension-ref
  "Normalize a dimension reference from API format to internal format."
  [x]
  (when (and (sequential? x)
             (= 3 (count x))
             (let [tag (first x)]
               (or (= tag "dimension") (= tag :dimension))))
    (let [[_tag opts dimension-id] x]
      [:dimension
       (lib.schema.common/normalize-options-map (or opts {}))
       dimension-id])))

(defn normalize-filter-clause
  "Recursively normalize a filter clause from API format.
   Converts string operators to keywords and normalizes dimension references."
  [clause]
  (when (sequential? clause)
    (let [[op opts & args] clause
          operator (lib.schema.common/normalize-keyword op)
          norm-opts (lib.schema.common/normalize-options-map (or opts {}))]
      (case operator
        ;; Compound filters - recursively normalize children
        (:and :or)
        (into [operator norm-opts] (map normalize-filter-clause args))

        :not
        [operator norm-opts (normalize-filter-clause (first args))]

        ;; All other filters - normalize dimension refs in args
        (into [operator norm-opts]
              (map (fn [arg]
                     (or (normalize-dimension-ref arg) arg))
                   args))))))

(mr/def ::filter-clause
  "MBQL filter clause with normalization for API input.
   Handles string operators and dimension references."
  [:any {:decode/normalize normalize-filter-clause}])

;;; ------------------------------------------------- Persisted Dimensions -------------------------------------------------
;;; These schemas are used for storage format in the database.

(mr/def ::dimension-status
  "Status of a dimension indicating whether it's active or has issues.
   - :status/active   - Column exists, dimension is usable
   - :status/orphaned - Column was removed from schema, dimension preserved for reference"
  [:enum :status/active :status/orphaned])

(mr/def ::persisted-dimension
  "Schema for a persisted dimension definition with status tracking.
   Persisted dimensions include additional metadata about their status
   and any issues that prevent them from being used.
   Note: target field references are stored in dimension-mappings, not here."
  [:map
   [:id              ::dimension-id]
   [:name            {:optional true} [:maybe :string]]
   [:display-name    {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:effective-type  {:optional true} [:maybe ::lib.schema.common/base-type]]
   [:semantic-type   {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]
   [:status          {:optional true} [:maybe ::dimension-status]]
   [:status-message  {:optional true} [:maybe :string]]
   [:sources         {:optional true} [:maybe [:sequential ::dimension-source]]]
   [:group           {:optional true} [:maybe ::dimension-group]]])

(mr/def ::persisted-dimensions
  "Schema for a sequence of persisted dimensions."
  [:sequential ::persisted-dimension])

;;; ------------------------------------------------- MetricDefinition -------------------------------------------------

(mr/def ::metric-definition.source-type
  "Type of source for a metric definition."
  [:enum :source/metric :source/measure])

(mr/def ::metric-definition.source
  "The source entity for a metric definition."
  [:map
   [:type     ::metric-definition.source-type]
   [:id       pos-int?]
   [:metadata :map]])

(mr/def ::metric-definition
  "A MetricDefinition represents an exploration of a metric or measure.
   - source: reference to the metric or measure with its metadata
   - filters: MBQL filter clauses using dimension references
   - projections: dimension references for grouping
   - metadata-provider: for resolving additional metadata

   Note: dimensions and dimension-mappings are always derived from the source
   metadata when building the AST, so they are not part of the definition schema."
  [:map
   [:lib/type          [:= :metric/definition]]
   [:source            ::metric-definition.source]
   [:filters           [:sequential :any]]  ; MBQL filter clauses
   [:projections       [:sequential ::dimension-reference]]
   [:metadata-provider [:maybe :some]]])

;;; ------------------------------------------------- Fetchable Dimension Metadata -------------------------------------------------
;;; These schemas support dimensions as first-class metadata entities
;;; fetchable through the MetricContextMetadataProvider.

(mr/def ::dimension-source-type
  "Source type indicating whether a dimension comes from a metric or measure."
  [:enum :metric :measure])

(mr/def ::metadata-dimension
  "Schema for dimension metadata fetchable via metadata provider.
   Dimensions are extracted from metrics/measures at fetch time, with source
   tracking to identify their parent entity."
  [:map
   [:lib/type         [:= :metadata/dimension]]
   [:id               ::dimension-id]  ; UUID string
   [:name             {:optional true} [:maybe :string]]
   [:display-name     {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:effective-type   {:optional true} [:maybe ::lib.schema.common/base-type]]
   [:semantic-type    {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]
   [:status           {:optional true} [:maybe ::dimension-status]]
   [:status-message   {:optional true} [:maybe :string]]
   [:sources          {:optional true} [:maybe [:sequential ::dimension-source]]]
   [:group            {:optional true} [:maybe ::dimension-group]]
   ;; Source tracking
   [:source-type      ::dimension-source-type]
   [:source-id        pos-int?]
   ;; Optional mapping for field resolution
   [:dimension-mapping {:optional true} [:maybe ::dimension-mapping]]])

(mr/def ::dimension-spec
  "Spec for fetching dimensions from metadata provider.
   At least one filter should be provided for efficient querying."
  [:map
   [:lib/type   [:= :metadata/dimension]]
   [:id         {:optional true} [:set {:min 1} ::lib.schema.common/uuid]]
   [:metric-id  {:optional true} pos-int?]
   [:measure-id {:optional true} pos-int?]
   [:table-id   {:optional true} pos-int?]])
