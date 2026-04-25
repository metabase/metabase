(ns metabase.query-processor.core
  "Convenience facade over the query-processor module. Re-exports the most-used public vars from
  sub-namespaces so callers that need several QP functions only need a single require:

    (:require [metabase.query-processor.core :as qp])

  Sub-namespaces remain valid imports for callers that need only a narrow slice."
  (:refer-clojure :exclude [compile])
  (:require
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.limit :as qp.limit]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.query-processor.util :as qp.util]
   [metabase.query-processor.writeback :as qp.writeback]
   [metabase.util.namespaces :as shared.ns]))

(shared.ns/import-fns
 ;; Core entrypoints — metabase.query-processor
 [qp
  process-query
  userland-query
  userland-query-with-default-constraints]
 ;; Card — metabase.query-processor.card
 [qp.card
  combined-parameters-and-template-tags
  process-query-for-card
  process-query-for-card-default-qp
  query-for-card]
 ;; Compile — metabase.query-processor.compile
 [qp.compile
  compile
  compile-with-inline-parameters]
 ;; Dashboard — metabase.query-processor.dashboard
 [qp.dashboard
  process-query-for-dashcard]
 ;; Metadata — metabase.query-processor.metadata
 [qp.metadata
  result-metadata]
 ;; Constraints — metabase.query-processor.middleware.constraints
 [qp.constraints
  default-query-constraints]
 ;; Limit — metabase.query-processor.middleware.limit
 [qp.limit
  disable-max-results]

 ;; Pivot — metabase.query-processor.pivot
 [qp.pivot
  run-pivot-query]
 ;; Preprocessing — metabase.query-processor.preprocess
 [qp.preprocess
  preprocess
  query->expected-cols]
 ;; Streaming — metabase.query-processor.streaming
 [qp.streaming
  order-cols
  streaming-response]
 ;; Timezone — metabase.query-processor.timezone
 [qp.timezone
  database-timezone-id
  report-timezone-id-if-supported
  requested-timezone-id
  results-timezone-id
  system-timezone-id]
 ;; Util — metabase.query-processor.util
 [qp.util
  default-query->remark
  internal-query?
  query->remark
  query-hash
  userland-query?]
 ;; Writeback — metabase.query-processor.writeback
 [qp.writeback
  execute-write-query!])
