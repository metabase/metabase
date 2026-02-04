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
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [potemkin :as p]))

(comment lib-metric.dimension/keep-me)

(p/import-vars
 [lib-metric.dimension
  dimensionable-query
  get-persisted-dimension-mappings
  get-persisted-dimensions
  hydrate-dimensions
  save-dimensions!])
