(ns metabase.usage-metadata.insights
  "Stable public façade for usage-metadata rollups and deterministic candidate mining."
  (:require
   [metabase.usage-metadata.candidate-builders :as candidate-builders]
   [metabase.usage-metadata.candidate-mining :as candidate-mining]
   [metabase.usage-metadata.rollups :as rollups]))

(set! *warn-on-reflection* true)

(def canonical-signature
  "Canonical JSON used for deterministic candidate grouping and semantic collision checks."
  candidate-mining/canonical-signature)
(def conditional-aggregation-operators
  "Aggregation operators whose semantics include a filter predicate."
  candidate-mining/conditional-aggregation-operators)
(def with-candidate-analysis-cache
  "Run `f` with a cache shared by all candidate analyses it invokes."
  candidate-mining/with-candidate-analysis-cache)
(def with-candidate-batch-cache
  "Run `f` with reusable selected-Card and lineage inputs for one candidate batch."
  candidate-mining/with-candidate-batch-cache)
(def qualified-card-ids
  "Return the default persisted-cleanup population without loading query definitions."
  candidate-mining/qualified-card-ids)

(def candidate-tables
  "Rank unpublished physical tables reached by selected MBQL questions and models."
  candidate-builders/candidate-tables)
(def candidate-table-observations
  "Return unbounded physical-table observations for persisted candidate materialization."
  candidate-builders/candidate-table-observations)
(def candidate-metrics
  "Return creation-ready Metric Card candidates mined from selected questions and models."
  candidate-builders/candidate-metrics)
(def candidate-metric-observations
  "Return unbounded Metric Card observations for persisted candidate materialization."
  candidate-builders/candidate-metric-observations)
(def cleanup-candidates
  "Return reconciliation-ready Measure and Segment observations for persistence."
  candidate-builders/cleanup-candidates)
(def candidate-measures
  "Return creation-ready Measure candidates mined from selected questions and models."
  candidate-builders/candidate-measures)
(def candidate-segments
  "Return creation-ready Segment candidates mined from selected questions and models."
  candidate-builders/candidate-segments)

(def implicit-segments
  "Top implicit segments recorded across usage-metadata rollups."
  rollups/implicit-segments)
(def implicit-metrics
  "Top implicit metrics recorded across usage-metadata rollups."
  rollups/implicit-metrics)
(def implicit-dimensions
  "Top implicit dimensions recorded across usage-metadata rollups."
  rollups/implicit-dimensions)
(def suggested-segments-for-owner
  "Suggest recurring composite Segment definitions from usage-metadata rollups."
  rollups/suggested-segments-for-owner)
(def profile-observations
  "Top dimension profile observations recorded across usage-metadata rollups."
  rollups/profile-observations)
