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
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.metadata.provider :as lib-metric.metadata.provider]))

(comment lib-metric.dimension/keep-me
         lib-metric.metadata.provider/keep-me
         #?(:clj lib-metric.metadata.jvm/keep-me
            :cljs lib-metric.metadata.js/keep-me))

#?(:clj
   (p/import-vars
    [lib-metric.dimension
     dimensionable-query
     get-persisted-dimension-mappings
     get-persisted-dimensions
     hydrate-dimensions
     save-dimensions!]
    [lib-metric.metadata.provider
     database-provider-for-table
     metric-context-metadata-provider]
    [lib-metric.metadata.jvm
     metadata-provider])

   :cljs
   (do
     (def dimensionable-query lib-metric.dimension/dimensionable-query)
     (def get-persisted-dimension-mappings lib-metric.dimension/get-persisted-dimension-mappings)
     (def get-persisted-dimensions lib-metric.dimension/get-persisted-dimensions)
     (def hydrate-dimensions lib-metric.dimension/hydrate-dimensions)
     (def save-dimensions! lib-metric.dimension/save-dimensions!)
     (def database-provider-for-table lib-metric.metadata.provider/database-provider-for-table)
     (def metric-context-metadata-provider lib-metric.metadata.provider/metric-context-metadata-provider)
     (def metadata-provider lib-metric.metadata.js/metadata-provider)))
