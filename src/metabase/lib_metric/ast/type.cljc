(ns metabase.lib-metric.ast.type
  "Type hierarchy for multimethod dispatch on AST node types.")

(def ast-hierarchy
  "Hierarchy for multimethod dispatch on AST node types."
  (-> (make-hierarchy)
      ;; Aggregations that take a required column
      (derive :aggregation/sum      :aggregation/column)
      (derive :aggregation/avg      :aggregation/column)
      (derive :aggregation/min      :aggregation/column)
      (derive :aggregation/max      :aggregation/column)
      (derive :aggregation/distinct :aggregation/column)
      ;; Compound filters with :children
      (derive :filter/and :filter/compound)
      (derive :filter/or  :filter/compound)
      ;; Source nodes
      (derive :source/metric  :source/any)
      (derive :source/measure :source/any)))
