(ns metabase.lib-metric.ast.schema
  "Malli schemas for Metric AST nodes.
   The AST provides an intermediate representation for metric definitions
   that can be walked, transformed, and compiled to MBQL queries."
  (:require
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.util.malli.registry :as mr]))

;;; -------------------- Primitive Nodes --------------------

(mr/def ::table-node
  "Reference to a database table."
  [:map
   [:node/type [:= :ast/table]]
   [:id pos-int?]
   [:name {:optional true} [:maybe string?]]])

(mr/def ::column-node
  "Reference to a database column/field."
  [:map
   [:node/type [:= :ast/column]]
   [:id pos-int?]
   [:name {:optional true} [:maybe string?]]
   [:table-id {:optional true} [:maybe pos-int?]]])

;;; -------------------- Dimension Nodes --------------------

(mr/def ::dimension-node
  "A dimension definition - the abstract dimension."
  [:map
   [:node/type [:= :ast/dimension]]
   [:id ::lib-metric.schema/dimension-id]
   [:name {:optional true} [:maybe string?]]
   [:display-name {:optional true} [:maybe string?]]
   [:effective-type {:optional true} [:maybe keyword?]]
   [:semantic-type {:optional true} [:maybe keyword?]]
   [:status {:optional true} [:maybe [:enum :status/active :status/orphaned]]]])

(mr/def ::dimension-ref-options
  "Options for dimension references (bucketing, binning, etc.)."
  [:map
   [:temporal-unit {:optional true} [:maybe keyword?]]
   [:binning {:optional true} [:maybe :map]]])

(mr/def ::dimension-ref-node
  "A reference to a dimension, used in filters and group-by."
  [:map
   [:node/type [:= :ast/dimension-ref]]
   [:dimension-id ::lib-metric.schema/dimension-id]
   [:options {:optional true} [:maybe ::dimension-ref-options]]])

(mr/def ::dimension-mapping-node
  "Connects a dimension to a physical column."
  [:map
   [:node/type [:= :ast/dimension-mapping]]
   [:dimension-id ::lib-metric.schema/dimension-id]
   [:table-id {:optional true} [:maybe pos-int?]]
   [:column ::column-node]])

;;; -------------------- Aggregation Nodes --------------------

(mr/def ::aggregation-count
  [:map [:node/type [:= :aggregation/count]]])

(mr/def ::aggregation-sum
  [:map
   [:node/type [:= :aggregation/sum]]
   [:column ::column-node]])

(mr/def ::aggregation-avg
  [:map
   [:node/type [:= :aggregation/avg]]
   [:column ::column-node]])

(mr/def ::aggregation-min
  [:map
   [:node/type [:= :aggregation/min]]
   [:column ::column-node]])

(mr/def ::aggregation-max
  [:map
   [:node/type [:= :aggregation/max]]
   [:column ::column-node]])

(mr/def ::aggregation-distinct
  [:map
   [:node/type [:= :aggregation/distinct]]
   [:column ::column-node]])

(mr/def ::aggregation-mbql
  "For complex/custom aggregations that don't fit standard types."
  [:map
   [:node/type [:= :aggregation/mbql]]
   [:clause :any]])

(mr/def ::aggregation-node
  "Union of all aggregation node types."
  [:or
   ::aggregation-count
   ::aggregation-sum
   ::aggregation-avg
   ::aggregation-min
   ::aggregation-max
   ::aggregation-distinct
   ::aggregation-mbql])

;;; -------------------- Filter Nodes --------------------

(mr/def ::filter-comparison
  "Comparison filter (=, !=, <, <=, >, >=)."
  [:map
   [:node/type [:= :filter/comparison]]
   [:operator [:enum := :!= :< :<= :> :>=]]
   [:dimension ::dimension-ref-node]
   [:value :any]])

(mr/def ::filter-between
  "Between filter for range checks."
  [:map
   [:node/type [:= :filter/between]]
   [:dimension ::dimension-ref-node]
   [:min :any]
   [:max :any]])

(mr/def ::filter-string
  "String filter operations."
  [:map
   [:node/type [:= :filter/string]]
   [:operator [:enum :contains :starts-with :ends-with :does-not-contain]]
   [:dimension ::dimension-ref-node]
   [:value string?]
   [:options {:optional true} [:map [:case-sensitive {:optional true} [:maybe boolean?]]]]])

(mr/def ::filter-null
  "Null/empty check filter."
  [:map
   [:node/type [:= :filter/null]]
   [:operator [:enum :is-null :not-null :is-empty :not-empty]]
   [:dimension ::dimension-ref-node]])

(mr/def ::filter-in
  "Multi-value filter (in, not-in)."
  [:map
   [:node/type [:= :filter/in]]
   [:operator [:enum :in :not-in]]
   [:dimension ::dimension-ref-node]
   [:values [:sequential :any]]])

(mr/def ::filter-temporal
  "Temporal filter for time-based operations."
  [:map
   [:node/type [:= :filter/temporal]]
   [:operator [:enum :time-interval :relative-time-interval]]
   [:dimension ::dimension-ref-node]
   [:value int?]
   [:unit keyword?]])

(mr/def ::filter-mbql
  "Raw MBQL filter clause passthrough for source filters."
  [:map
   [:node/type [:= :filter/mbql]]
   [:clause :any]])

;; Forward declare for recursive references
(mr/def ::filter-node
  "Union of all filter node types (including compound)."
  [:or
   ::filter-comparison
   ::filter-between
   ::filter-string
   ::filter-null
   ::filter-in
   ::filter-temporal
   ::filter-mbql
   [:map
    [:node/type [:= :filter/and]]
    [:children [:sequential [:ref ::filter-node]]]]
   [:map
    [:node/type [:= :filter/or]]
    [:children [:sequential [:ref ::filter-node]]]]
   [:map
    [:node/type [:= :filter/not]]
    [:child [:ref ::filter-node]]]])

;;; -------------------- Source Nodes --------------------

(mr/def ::source-metric
  "Metric source - contains the metric's query as AST."
  [:map
   [:node/type [:= :source/metric]]
   [:id pos-int?]
   [:name {:optional true} [:maybe string?]]
   [:aggregation ::aggregation-node]
   [:base-table ::table-node]
   [:joins {:optional true} [:maybe [:sequential :any]]]
   [:filters {:optional true} [:maybe [:ref ::filter-node]]]])

(mr/def ::source-measure
  "Measure source - contains the measure's definition as AST."
  [:map
   [:node/type [:= :source/measure]]
   [:id pos-int?]
   [:name {:optional true} [:maybe string?]]
   [:aggregation ::aggregation-node]
   [:base-table ::table-node]
   [:joins {:optional true} [:maybe [:sequential :any]]]
   [:filters {:optional true} [:maybe [:ref ::filter-node]]]])

(mr/def ::source-node
  "Union of source node types."
  [:or ::source-metric ::source-measure])

;;; -------------------- Root Node --------------------

(mr/def ::ast
  "Root AST node - the complete metric exploration."
  [:map
   [:node/type [:= :ast/root]]
   [:source ::source-node]
   [:dimensions [:sequential ::dimension-node]]
   [:mappings [:sequential ::dimension-mapping-node]]
   [:filter {:optional true} [:maybe ::filter-node]]
   [:group-by {:optional true} [:maybe [:sequential ::dimension-ref-node]]]
   [:metadata-provider {:optional true} [:maybe :some]]])
