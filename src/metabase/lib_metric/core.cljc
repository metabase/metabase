(ns metabase.lib-metric.core
  "Library for constructing and manipulating metric definitions.

   A MetricDefinition represents an exploration of a metric or measure, specifying:
   - A source: either a metric (saved card) or measure (reusable aggregation)
   - Filters: constraints on dimension values
   - Projections: dimensions to group by (become MBQL breakouts)

   Dimensions are UUID-referenced columns available for filtering and grouping.
   They provide stable identifiers that survive query changes, unlike field refs
   or column aliases. Dimension refs `[:dimension {} \"uuid\"]` are resolved to
   concrete field refs when the definition is converted to an executable MBQL query."
  (:require
   #?@(:clj [[metabase.lib-metric.metadata.jvm :as lib-metric.metadata.jvm]
             [potemkin :as p]]
       :cljs [[metabase.lib-metric.metadata.js :as lib-metric.metadata.js]])
   [metabase.lib-metric.clause :as lib-metric.clause]
   [metabase.lib-metric.definition :as lib-metric.definition]
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.measures :as lib-metric.measures]
   [metabase.lib-metric.metadata.provider :as lib-metric.metadata.provider]
   [metabase.lib-metric.metrics :as lib-metric.metrics]
   [metabase.lib-metric.projection :as lib-metric.projection]))

;; Ensure multimethod implementations are loaded
(comment lib-metric.dimension/keep-me
         lib-metric.measures/keep-me
         lib-metric.metrics/keep-me
         lib-metric.metadata.provider/keep-me
         lib-metric.projection/keep-me
         #?(:clj lib-metric.metadata.jvm/keep-me
            :cljs lib-metric.metadata.js/keep-me))

#?(:clj
   (p/import-vars
    [lib-metric.clause
     remove-clause
     replace-clause
     swap-clauses]
    [lib-metric.definition
     filters
     from-measure-metadata
     from-metric-metadata
     projections
     source-measure-id
     source-metric-id]
    [lib-metric.dimension
     compute-dimension-pairs
     dimension
     dimensionable-query
     dimensions-changed?
     dimensions-for-measure
     dimensions-for-metric
     dimensions-for-table
     extract-persisted-dimensions
     get-persisted-dimension-mappings
     get-persisted-dimensions
     mappings-changed?
     reconcile-dimensions-and-mappings
     resolve-dimension-to-field-id]
    [lib-metric.metadata.provider
     database-provider-for-table
     metric-context-metadata-provider]
    [lib-metric.metadata.jvm
     metadata-provider]
    [lib-metric.projection
     add-projection-positions
     projectable-dimensions])

   :cljs
   (do
     (def remove-clause lib-metric.clause/remove-clause)
     (def replace-clause lib-metric.clause/replace-clause)
     (def swap-clauses lib-metric.clause/swap-clauses)
     (def filters lib-metric.definition/filters)
     (def from-measure-metadata lib-metric.definition/from-measure-metadata)
     (def from-metric-metadata lib-metric.definition/from-metric-metadata)
     (def projections lib-metric.definition/projections)
     (def source-measure-id lib-metric.definition/source-measure-id)
     (def source-metric-id lib-metric.definition/source-metric-id)
     (def dimension lib-metric.dimension/dimension)
     (def dimensionable-query lib-metric.dimension/dimensionable-query)
     (def dimensions-for-measure lib-metric.dimension/dimensions-for-measure)
     (def dimensions-for-metric lib-metric.dimension/dimensions-for-metric)
     (def dimensions-for-table lib-metric.dimension/dimensions-for-table)
     (def get-persisted-dimensions lib-metric.dimension/get-persisted-dimensions)
     (def get-persisted-dimension-mappings lib-metric.dimension/get-persisted-dimension-mappings)
     (def resolve-dimension-to-field-id lib-metric.dimension/resolve-dimension-to-field-id)
     (def database-provider-for-table lib-metric.metadata.provider/database-provider-for-table)
     (def metric-context-metadata-provider lib-metric.metadata.provider/metric-context-metadata-provider)
     (def metadata-provider lib-metric.metadata.js/metadata-provider)
     (def add-projection-positions lib-metric.projection/add-projection-positions)
     (def projectable-dimensions lib-metric.projection/projectable-dimensions)))
