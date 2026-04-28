(ns metabase.lib-metric.ast.schema
  "Malli schemas for Metric AST nodes.
   The AST provides an intermediate representation for metric definitions
   that can be walked, transformed, and compiled to MBQL queries."
  (:require
   [metabase.lib-metric.operators :as operators]
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
   [:id [:or pos-int? string?]]
   [:name {:optional true} [:maybe string?]]
   [:table-id {:optional true} [:maybe pos-int?]]
   [:base-type {:optional true} [:maybe keyword?]]])

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

(mr/def ::dimension-expression-node
  "A dimension reference wrapped in an expression (e.g. temporal extraction like :get-day-of-week)."
  [:map
   [:node/type [:= :ast/dimension-expression]]
   [:expression-op keyword?]
   [:dimension ::dimension-ref-node]
   [:args {:optional true} [:maybe [:sequential :any]]]])

(mr/def ::dimension-or-expression
  "A dimension reference or an expression wrapping one."
  [:or ::dimension-ref-node ::dimension-expression-node])

(mr/def ::dimension-mapping-node
  "Connects a dimension to a physical column."
  [:map
   [:node/type [:= :ast/dimension-mapping]]
   [:dimension-id ::lib-metric.schema/dimension-id]
   [:table-id {:optional true} [:maybe pos-int?]]
   [:column ::column-node]])

;;; -------------------- Aggregation Nodes --------------------

(mr/def ::aggregation-count
  [:map
   [:node/type [:= :aggregation/count]]
   [:column {:optional true} [:maybe ::column-node]]])

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
   [:dimension ::dimension-or-expression]
   [:values [:sequential :any]]])

(mr/def ::filter-between
  "Between filter for range checks."
  [:map
   [:node/type [:= :filter/between]]
   [:dimension ::dimension-or-expression]
   [:min :any]
   [:max :any]])

(mr/def ::filter-string
  "String filter operations."
  [:map
   [:node/type [:= :filter/string]]
   [:operator [:enum :contains :starts-with :ends-with :does-not-contain]]
   [:dimension ::dimension-or-expression]
   [:value string?]
   [:options {:optional true} [:map [:case-sensitive {:optional true} [:maybe boolean?]]]]])

(mr/def ::filter-null
  "Null/empty check filter."
  [:map
   [:node/type [:= :filter/null]]
   [:operator [:enum :is-null :not-null :is-empty :not-empty]]
   [:dimension ::dimension-or-expression]])

(mr/def ::filter-in
  "Multi-value filter (in, not-in)."
  [:map
   [:node/type [:= :filter/in]]
   [:operator [:enum :in :not-in]]
   [:dimension ::dimension-or-expression]
   [:values [:sequential :any]]])

(mr/def ::filter-inside
  "Geographic bounding-box filter."
  [:map
   [:node/type [:= :filter/inside]]
   [:lat-dimension ::dimension-or-expression]
   [:lon-dimension ::dimension-or-expression]
   [:north :any]
   [:east :any]
   [:south :any]
   [:west :any]])

(mr/def ::filter-temporal
  "Temporal filter for time-based operations."
  [:map
   [:node/type [:= :filter/temporal]]
   [:operator [:enum :time-interval :relative-time-interval]]
   [:dimension ::dimension-or-expression]
   [:value int?]
   [:unit keyword?]
   [:offset-value {:optional true} [:maybe int?]]
   [:offset-unit {:optional true} [:maybe keyword?]]])

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
   ::filter-inside
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

;;; -------------------- Join Nodes --------------------

(mr/def ::join-node
  "A join from the source metric's query, preserved as raw MBQL 5."
  [:map
   [:node/type [:= :ast/join]]
   [:mbql-join :any]])

;;; -------------------- Source Nodes --------------------

(defn- source-node-schema
  "Create a source node schema with the given node-type keyword."
  [node-type]
  [:map
   [:node/type [:= node-type]]
   [:id pos-int?]
   [:name {:optional true} [:maybe string?]]
   [:aggregation ::aggregation-node]
   [:base-table ::table-node]
   [:source-card-id {:optional true} [:maybe pos-int?]]
   [:metadata {:optional true} [:maybe :map]]
   [:joins {:optional true} [:maybe [:sequential ::join-node]]]
   [:filters {:optional true} [:maybe [:ref ::filter-node]]]])

(mr/def ::source-metric
  "Metric source - contains the metric's query as AST."
  (source-node-schema :source/metric))

(mr/def ::source-measure
  "Measure source - contains the measure's definition as AST."
  (source-node-schema :source/measure))

(mr/def ::source-node
  "Union of source node types."
  [:or ::source-metric ::source-measure])

;;; -------------------- Expression Nodes --------------------

(mr/def ::source-query
  "A single-source query node with source, dimensions, mappings, filters, and group-by.
   Used inside expression leaves as the compilable sub-query."
  [:map
   [:node/type [:= :ast/source-query]]
   [:source ::source-node]
   [:dimensions [:sequential ::dimension-node]]
   [:mappings [:sequential ::dimension-mapping-node]]
   [:filter {:optional true} [:maybe ::filter-node]]
   [:group-by {:optional true} [:maybe [:sequential ::dimension-ref-node]]]])

(mr/def ::expression-leaf
  "A leaf in an expression tree — wraps a source-query."
  [:map
   [:node/type [:= :expression/leaf]]
   [:uuid string?]
   [:ast ::source-query]])

(mr/def ::expression-constant
  "A numeric constant in an expression tree."
  [:map
   [:node/type [:= :expression/constant]]
   [:value number?]])

(mr/def ::expression-arithmetic
  "An arithmetic operation over expression children."
  [:map
   [:node/type [:= :expression/arithmetic]]
   [:operator (into [:enum] (operators/arithmetic-operator-keywords))]
   [:children [:sequential [:or [:ref ::expression-leaf] [:ref ::expression-arithmetic] [:ref ::expression-constant]]]]])

(mr/def ::expression-node
  "Union of expression node types."
  [:or ::expression-leaf ::expression-arithmetic ::expression-constant])

;;; -------------------- Root Node --------------------

(mr/def ::ast
  "Root AST node - the complete metric exploration.
   Always has an :expression tree (single leaf or arithmetic)."
  [:map
   [:node/type [:= :ast/root]]
   [:expression ::expression-node]
   [:metadata-provider {:optional true} [:maybe :some]]])
