(ns metabase.agent-lib.mbql-integration
  "Temporary bridge between agent-lib and canonical MBQL lib APIs.

  This namespace is the stable facade over the smaller MBQL integration units
  under `metabase.agent-lib.mbql-integration.*`. It remains the single handoff
  surface that agent-lib callers depend on, while the actual implementation is
  split by concern."
  (:require
   [metabase.agent-lib.mbql-integration.common]
   [metabase.agent-lib.mbql-integration.fields]
   [metabase.agent-lib.mbql-integration.joins]
   [metabase.agent-lib.mbql-integration.orderables]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(p/import-vars
 [metabase.agent-lib.mbql-integration.common
  query?
  extract-field-ids
  expression-definition
  normalized-name
  column-names
  dedupe-candidate-columns
  current-query-field-candidates
  prefer-single-candidate
  unique-query-candidate
  field-selection?
  resolve-aggregation-selection]
 [metabase.agent-lib.mbql-integration.fields
  fields-by-table-id
  field-target-table-id
  field-path-start-ids
  fk-path-to-table
  numeric-type?
  types-compatible?
  candidate-has-resolution-lineage?
  source-column-field-name
  source-column-field-join-alias
  source-column-original-field-id
  source-column-original-field-name
  source-column-original-field-join-alias
  candidate-join-alias-for-field-id
  synthesize-chained-related-field
  multi-hop-lineage-candidate?
  previous-stage-name-matches
  previous-stage-lineage-matches
  previous-stage-aggregation-matches
  resolve-field-in-query]
 [metabase.agent-lib.mbql-integration.orderables
  matching-expression-ref
  matching-previous-stage-column-by-name
  current-stage-expression-ref
  expression-ref-or-current-stage-column
  ensure-query-expression-ref
  orderable-column-key
  current-query-orderable-candidates
  column-field-ids
  breakout-expression-name
  previous-stage-aggregation-column
  aggregation-ref-or-current-stage-column
  aggregation-signature
  aggregation-columns
  aggregation-column-pairs
  requested-orderable-field-ids
  orderable-field-id->query-columns
  orderable-field-ids->query-columns
  field-id->breakout-expression-refs
  field-ids->breakout-expression-ref
  field-id->aggregation-columns
  field-ids->aggregation-columns
  resolve-field-like-orderable
  resolve-orderable]
 [metabase.agent-lib.mbql-integration.joins
  implicitly-resolved-column?
  redundant-implicit-join?])
