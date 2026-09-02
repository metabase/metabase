(ns metabase.queries.core
  (:require
   [metabase.queries.cached-result]
   [metabase.queries.card]
   [metabase.queries.card-write-checks]
   [metabase.queries.metadata]
   [metabase.queries.models.card]
   [metabase.queries.models.card.metadata]
   [metabase.queries.models.parameter-card]
   [metabase.queries.models.query]
   [metabase.queries.models.stored-result]
   [metabase.queries.models.stored-result-use]
   [potemkin :as p]))

(comment metabase.queries.cached-result/keep-me
         metabase.queries.card/keep-me
         metabase.queries.card-write-checks/keep-me
         metabase.queries.metadata/keep-me
         metabase.queries.models.card/keep-me
         metabase.queries.models.card.metadata/keep-me
         metabase.queries.models.parameter-card/keep-me
         metabase.queries.models.query/keep-me
         metabase.queries.models.stored-result/keep-me
         metabase.queries.models.stored-result-use/keep-me)

(p/import-vars
 [metabase.queries.card
  card-param-values
  card-param-remapped-value]
 [metabase.queries.models.card
  create-card!]
 [metabase.queries.card-write-checks
  actual-collection-id
  check-allowed-to-create-card!
  check-allowed-to-update-card!
  check-card-can-be-saved!
  check-no-save-cycle!]
 [metabase.queries.metadata
  batch-fetch-card-metadata
  ;; TODO does this belong here, or in the `dashboards` module?
  batch-fetch-dashboard-metadata
  batch-fetch-query-metadata]
 [metabase.queries.models.card
  fully-parameterized?
  maybe-unverify!
  model-supports-implicit-actions?
  model?
  parameter-template-tag?
  sole-dashboard-id
  starting-card-schema-version
  update-card!
  visible-metric-cards-where-clause]
 [metabase.queries.models.card.metadata
  infer-metadata
  infer-metadata-with-model-overrides
  maybe-async-result-metadata
  refresh-metadata
  save-metadata-async!]
 [metabase.queries.models.parameter-card
  check-new-parameter-source-card-permissions
  check-parameter-source-card-permissions
  values-source-card-ids]
 [metabase.queries.models.query
  average-execution-time-ms
  query->database-and-table-ids
  save-queries-and-update-average-execution-times!]
 [metabase.queries.cached-result
  allowed-chart-sorts
  assert-can-view-cached-result!
  viewer-can-view-cached-result?
  cached-dataset]
 [metabase.queries.models.stored-result-use
  assert-can-view-card-snapshots!
  carry-pairings-for-document!])

;; the re-exported var carries the docstring; kondo can't see through import-def
#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.queries.models.card/populate-query-fields populate-card-query-fields)

;; the re-exported var carries the docstring; kondo can't see through import-def
#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.queries.models.card/template-tag-parameters card-template-tag-parameters)

;; the re-exported var carries the docstring; kondo can't see through import-def
#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.queries.models.parameter-card/delete-all-for-parameterized-object!
              delete-all-parameter-cards-for-parameterized-object!)

;; the re-exported var carries the docstring; kondo can't see through import-def
#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.queries.models.parameter-card/upsert-or-delete-from-parameters!
              upsert-or-delete-parameter-cards-from-parameters!)
