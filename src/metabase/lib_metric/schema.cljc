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
   [:field-id {:optional true} [:maybe ::lib.schema.id/field]]
   [:binning  {:optional true} [:maybe :boolean]]])

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

(mr/def ::dimension-or-reference
  "Dimension or a reference to a dimension."
  [:or
   ::dimension-reference
   ::metadata-dimension])

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

;;; ------------------------------------------------- Metric Math Expressions -------------------------------------------------
;;; Expression schemas for metric math: combining multiple metrics/measures with arithmetic.

(defn- normalize-expression-ref
  "Normalize an expression ref from API format: [\"metric\" {\"lib/uuid\" \"...\"} id] -> [:metric {:lib/uuid \"...\"} id]."
  [tag]
  (fn [x]
    (when (and (sequential? x)
               (= 3 (count x)))
      (let [[t opts id] x]
        (when (or (= t tag) (= t (name tag)))
          [tag
           (lib.schema.common/normalize-options-map (or opts {}))
           id])))))

(mr/def ::metric-expression-ref
  "A metric reference in an expression: [:metric {:lib/uuid uuid} card-id]."
  [:tuple
   {:decode/normalize (normalize-expression-ref :metric)}
   [:= {:decode/normalize lib.schema.common/normalize-keyword} :metric]
   [:map {:decode/normalize lib.schema.common/normalize-options-map}
    [:lib/uuid ::lib.schema.common/non-blank-string]]
   pos-int?])

(mr/def ::measure-expression-ref
  "A measure reference in an expression: [:measure {:lib/uuid uuid} measure-id]."
  [:tuple
   {:decode/normalize (normalize-expression-ref :measure)}
   [:= {:decode/normalize lib.schema.common/normalize-keyword} :measure]
   [:map {:decode/normalize lib.schema.common/normalize-options-map}
    [:lib/uuid ::lib.schema.common/non-blank-string]]
   pos-int?])

(mr/def ::expression-leaf
  "A leaf node in a metric math expression: either a metric or measure reference."
  [:or ::metric-expression-ref ::measure-expression-ref])

(mr/def ::arithmetic-operator
  "Arithmetic operators for metric math."
  [:enum {:decode/normalize lib.schema.common/normalize-keyword} :+ :- :* :/])

(defn- normalize-math-expression
  "Recursively normalize a metric math expression from API format.
   Handles string keys, string operators, and nested expressions."
  [x]
  (when (sequential? x)
    (let [[first-el] x]
      (if (and (>= (count x) 3)
               (let [tag (lib.schema.common/normalize-keyword first-el)]
                 (or (= tag :metric) (= tag :measure))))
        ;; It's a leaf ref - normalize it
        ((normalize-expression-ref (lib.schema.common/normalize-keyword first-el)) x)
        ;; It's an arithmetic expression: [op opts & exprs]
        (when (>= (count x) 4)
          (let [[op opts & exprs] x]
            (into [(lib.schema.common/normalize-keyword op)
                   (lib.schema.common/normalize-options-map (or opts {}))]
                  (map normalize-math-expression exprs))))))))

(mr/def ::metric-math-expression
  "A recursive metric math expression tree.
   Can be a leaf (metric/measure ref) or an arithmetic expression [op opts expr expr ...]
   with at least 2 operands.
   Note: uses :fn validator for arithmetic to avoid Malli's recursive seqex limitation."
  [:schema
   {:decode/normalize normalize-math-expression}
   [:or
    ::expression-leaf
    [:and
     vector?
     [:fn {:error/message "must be arithmetic expression [op opts expr expr ...] with at least 2 operands"}
      (fn [x]
        (and (>= (count x) 4)
             (#{:+ :- :* :/} (first x))
             (map? (second x))))]]]])

;;; ------------------------------------------------- Per-Instance Filters -------------------------------------------------
;;; Filters keyed by lib/uuid from the expression, for independent filtering per instance.

(mr/def ::instance-filter
  "A filter associated with a specific expression instance via lib/uuid."
  [:map
   {:decode/normalize lib.schema.common/normalize-map}
   [:lib/uuid ::lib.schema.common/non-blank-string]
   [:filter   ::filter-clause]])

(mr/def ::instance-filters
  "A sequence of per-instance filters."
  [:sequential ::instance-filter])

;;; ------------------------------------------------- Typed Projections -------------------------------------------------
;;; Projections keyed by source type and ID.

(mr/def ::typed-projection
  "A projection associated with a specific source type and ID."
  [:map
   {:decode/normalize lib.schema.common/normalize-map}
   [:type       [:enum {:decode/normalize lib.schema.common/normalize-keyword} :metric :measure]]
   [:id         pos-int?]
   [:projection [:sequential ::dimension-reference]]])

(mr/def ::typed-projections
  "A sequence of typed projections."
  [:sequential ::typed-projection])

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

(mr/def ::metric-definition
  "A MetricDefinition represents an exploration of a metric or measure.
   - expression: a metric math expression tree (leaf ref or arithmetic)
   - filters: per-instance filters keyed by :lib/uuid from the expression
   - projections: typed projections keyed by source type and ID
   - metadata-provider: for resolving additional metadata

   Metadata is loaded lazily from the provider in the AST builder,
   not stored in the definition."
  [:map
   [:lib/type          [:= :metric/definition]]
   [:expression        ::metric-math-expression]
   [:filters           ::instance-filters]
   [:projections       ::typed-projections]
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

;;; ------------------------------------------------- Computed Dimensions -------------------------------------------------
;;; Schemas for computed dimensions during reconciliation.

(mr/def ::computed-dimension
  "A dimension computed from a visible column, before reconciliation.
   The :id is nil until assigned during reconciliation."
  [:map
   [:id [:maybe ::dimension-id]]
   [:name :string]
   [:display-name {:optional true} [:maybe :string]]
   [:effective-type {:optional true} [:maybe :keyword]]
   [:semantic-type {:optional true} [:maybe :keyword]]
   [:lib/source {:optional true} [:maybe :keyword]]
   [:group {:optional true} [:maybe ::dimension-group]]])

(mr/def ::computed-pair
  "A computed dimension paired with its mapping (before ID assignment)."
  [:map
   [:dimension ::computed-dimension]
   [:mapping [:map
              [:type ::dimension-mapping.type]
              [:table-id {:optional true} [:maybe ::lib.schema.id/table]]
              [:target ::dimension-mapping.target]]]])

;;; ------------------------------------------------- Display Info -------------------------------------------------

(mr/def ::display-info
  "Schema for display info returned by display-info function."
  [:map
   [:display-name {:optional true} :string]
   [:name {:optional true} :string]
   [:long-display-name {:optional true} :string]
   [:effective-type {:optional true} :keyword]
   [:semantic-type {:optional true} :keyword]
   [:description {:optional true} [:maybe :string]]
   [:selected {:optional true} :boolean]
   [:default {:optional true} :boolean]
   [:short-name {:optional true} :string]
   ;; Position tracking for dimensions
   [:filter-positions {:optional true} [:sequential :int]]
   [:projection-positions {:optional true} [:sequential :int]]
   ;; Dimension group
   [:group {:optional true} [:maybe ::dimension-group]]
   ;; Source indicators
   [:is-from-join {:optional true} :boolean]
   [:is-calculated {:optional true} :boolean]
   [:is-implicitly-joinable {:optional true} :boolean]
   ;; Temporal bucket specific
   [:is-temporal-extraction {:optional true} :boolean]])
