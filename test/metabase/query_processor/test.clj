(ns metabase.query-processor.test
  "Test facade for the query-processor module. Re-exports everything from [[metabase.query-processor.core]]
  plus broadly-useful test utilities, so test namespaces only need a single require:

    (:require [metabase.query-processor.test :as qp])"
  (:refer-clojure :exclude [compile])
  (:require
   [metabase.query-processor.core :as qp.core]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.util.namespaces :as shared.ns]))

(shared.ns/import-fns
 ;; Core QP operations — metabase.query-processor.core
 [qp.core
  compile
  compile-with-inline-parameters
  combined-parameters-and-template-tags
  database-timezone-id
  default-query-constraints
  default-query->remark
  internal-query?
  order-cols
  preprocess
  process-query
  process-query-for-card
  process-query-for-card-default-qp
  process-query-for-dashcard
  query->expected-cols
  query->remark
  query-hash
  query-for-card
  report-timezone-id-if-supported
  requested-timezone-id
  result-metadata
  results-timezone-id
  run-pivot-query
  streaming-response
  system-timezone-id
  userland-query
  userland-query-with-default-constraints
  userland-query?]
 ;; Test utilities — metabase.query-processor.test-util
 [qp.test-util
  ;; Driver sets
  normal-drivers
  normal-drivers-with-feature
  normal-drivers-without-feature
  ;; Result extraction
  data
  rows
  cols
  first-row
  rows-and-cols
  rows+column-names
  formatted-rows
  formatted-rows+column-names
  format-rows-by
  boolish->bool
  ;; Timezone test helpers
  supports-report-timezone?
  tz-shifted-driver-bug?
  with-database-timezone-id
  with-report-timezone-id!
  with-results-timezone-id
  ;; Metadata providers for tests
  card-with-metadata
  card-with-source-metadata-for-query
  card-with-updated-metadata
  metadata-provider-with-cards-for-queries
  metadata-provider-with-cards-with-metadata-for-queries
  metadata-provider-with-cards-with-transformed-metadata-for-queries
  mock-fks-application-database-metadata-provider
  ;; Misc
  field-values-from-def])
