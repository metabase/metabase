(ns metabase.agent-lib.mbql-integration.fields
  "Facade over field-resolution MBQL bridge helpers."
  (:require
   [metabase.agent-lib.mbql-integration.field-resolution]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(p/import-vars
 [metabase.agent-lib.mbql-integration.field-resolution
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
  resolve-field-in-query])
