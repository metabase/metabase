(ns metabase.lib-metric.definition
  "Functions for creating and manipulating MetricDefinitions."
  (:require
   [metabase.lib-metric.ast.build :as ast.build]
   [metabase.lib-metric.ast.compile :as ast.compile]
   [metabase.lib-metric.ast.schema :as ast.schema]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.util.malli :as mu]))

(comment ast.schema/keep-me)

;;; -------------------------------------------------- Expression Helpers --------------------------------------------------

(def expression-leaf?
  "Returns true if the expression is a single leaf node ([:metric opts id] or [:measure opts id])."
  ast.build/expression-leaf?)

(def expression-leaf-type
  "Returns the type keyword (:metric or :measure) from an expression leaf."
  ast.build/expression-leaf-type)

(def expression-leaf-id
  "Returns the source ID (integer) from an expression leaf."
  ast.build/expression-leaf-id)

(def expression-leaf-uuid
  "Returns the :lib/uuid from an expression leaf's options map."
  ast.build/expression-leaf-uuid)

(defn source-type-for-leaf
  "Returns the source type keyword for an expression leaf.
   :metric -> :source/metric, :measure -> :source/measure."
  [expression]
  (case (expression-leaf-type expression)
    :metric  :source/metric
    :measure :source/measure
    nil))

(defn expression-leaves
  "Recursively collect all leaf nodes from an expression tree.
   Returns a vector of leaf nodes: [:metric opts id] or [:measure opts id]."
  [expression]
  (cond
    (nil? expression) []
    (expression-leaf? expression) [expression]
    (and (sequential? expression)
         (#{:+ :- :* :/} (first expression))
         (>= (count expression) 4))
    (into [] (mapcat expression-leaves) (drop 2 expression))
    :else (throw (ex-info "Invalid expression: not a leaf or arithmetic node"
                          {:expression expression}))))

(defn flat-projections
  "Extract flat dimension-reference vectors from typed projections.
   [{:type :metric :id 42 :projection [dim-ref-1 dim-ref-2]} ...]
   => [dim-ref-1 dim-ref-2 ...]"
  [typed-projections]
  (into [] (mapcat :projection) typed-projections))

;;; -------------------------------------------------- Constructors --------------------------------------------------

(mu/defn from-metric-metadata :- ::lib-metric.schema/metric-definition
  "Create a MetricDefinition from MetricMetadata.
   Dimensions and dimension-mappings are derived from source metadata when building the AST."
  [provider metric-metadata]
  (let [uuid (str (random-uuid))]
    {:lib/type          :metric/definition
     :expression        [:metric {:lib/uuid uuid} (:id metric-metadata)]
     :filters           []
     :projections       []
     :metadata-provider provider}))

(mu/defn from-measure-metadata :- ::lib-metric.schema/metric-definition
  "Create a MetricDefinition from MeasureMetadata.
   Dimensions and dimension-mappings are derived from source metadata when building the AST."
  [provider measure-metadata]
  (let [uuid (str (random-uuid))]
    {:lib/type          :metric/definition
     :expression        [:measure {:lib/uuid uuid} (:id measure-metadata)]
     :filters           []
     :projections       []
     :metadata-provider provider}))

;;; -------------------------------------------------- Accessors --------------------------------------------------

(mu/defn source-metric-id :- [:maybe pos-int?]
  "Get the source metric ID if this definition is based on a metric."
  [definition :- ::lib-metric.schema/metric-definition]
  (let [expr (:expression definition)]
    (when (= :metric (expression-leaf-type expr))
      (expression-leaf-id expr))))

(mu/defn source-measure-id :- [:maybe pos-int?]
  "Get the source measure ID if this definition is based on a measure."
  [definition :- ::lib-metric.schema/metric-definition]
  (let [expr (:expression definition)]
    (when (= :measure (expression-leaf-type expr))
      (expression-leaf-id expr))))

(defn filters
  "Get the filter clauses from a metric definition.
   Returns the instance-filters vector."
  [definition]
  (:filters definition))

(defn projections
  "Get the projection clauses from a metric definition.
   Returns the typed-projections vector."
  [definition]
  (:projections definition))

;;; -------------------------------------------------- AST Functions --------------------------------------------------

(mu/defn ->ast :- ::ast.schema/ast
  "Convert MetricDefinition to AST."
  [definition :- ::lib-metric.schema/metric-definition]
  (ast.build/from-definition definition))

(mu/defn ->mbql-query
  "Convert MetricDefinition to MBQL query via AST."
  ([definition :- ::lib-metric.schema/metric-definition]
   (->mbql-query definition {}))
  ([definition :- ::lib-metric.schema/metric-definition
    opts :- [:map
             [:limit {:optional true} [:maybe pos-int?]]]]
   (let [ast (->ast definition)]
     (if-let [limit (:limit opts)]
       (ast.compile/compile-to-mbql ast :limit limit)
       (ast.compile/compile-to-mbql ast)))))

(mu/defn ->values-query
  "Convert MetricDefinition to a values-only MBQL query via AST.
   Like [[->mbql-query]] but omits aggregation, returning distinct breakout values."
  ([definition :- ::lib-metric.schema/metric-definition]
   (->values-query definition {}))
  ([definition :- ::lib-metric.schema/metric-definition
    opts :- [:map
             [:limit {:optional true} [:maybe pos-int?]]]]
   (let [ast (->ast definition)]
     (if-let [limit (:limit opts)]
       (ast.compile/compile-to-values-query ast :limit limit)
       (ast.compile/compile-to-values-query ast)))))
