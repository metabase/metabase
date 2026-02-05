(ns metabase.lib-metric.definition
  "Functions for creating and manipulating MetricDefinitions."
  (:require
   [metabase.lib-metric.ast.build :as ast.build]
   [metabase.lib-metric.ast.compile :as ast.compile]
   [metabase.lib-metric.ast.schema :as ast.schema]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.util.malli :as mu]))

(comment ast.schema/keep-me)

(mu/defn from-metric-metadata :- ::lib-metric.schema/metric-definition
  "Create a MetricDefinition from MetricMetadata.
   Dimensions and dimension-mappings are derived from source metadata when building the AST."
  [provider metric-metadata]
  {:lib/type          :metric/definition
   :source            {:type     :source/metric
                       :id       (:id metric-metadata)
                       :metadata metric-metadata}
   :filters           []
   :projections       []
   :metadata-provider provider})

(mu/defn from-measure-metadata :- ::lib-metric.schema/metric-definition
  "Create a MetricDefinition from MeasureMetadata.
   Dimensions and dimension-mappings are derived from source metadata when building the AST."
  [provider measure-metadata]
  {:lib/type          :metric/definition
   :source            {:type     :source/measure
                       :id       (:id measure-metadata)
                       :metadata measure-metadata}
   :filters           []
   :projections       []
   :metadata-provider provider})

(mu/defn source-metric-id :- [:maybe pos-int?]
  "Get the source metric ID if this definition is based on a metric."
  [definition :- ::lib-metric.schema/metric-definition]
  (when (= :source/metric (get-in definition [:source :type]))
    (get-in definition [:source :id])))

(mu/defn source-measure-id :- [:maybe pos-int?]
  "Get the source measure ID if this definition is based on a measure."
  [definition :- ::lib-metric.schema/metric-definition]
  (when (= :source/measure (get-in definition [:source :type]))
    (get-in definition [:source :id])))

(defn filters
  "Get the filter clauses from a metric definition."
  [definition]
  (:filters definition))

(defn projections
  "Get the projection clauses from a metric definition."
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

