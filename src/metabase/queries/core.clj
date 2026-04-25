(ns metabase.queries.core
  (:require
   [metabase.queries.card]
   [metabase.queries.metadata]
   [metabase.queries.models.card]
   [metabase.queries.models.card.metadata]
   [metabase.queries.models.parameter-card]
   [metabase.queries.models.query]
   [potemkin :as p]))

(comment metabase.queries.card/keep-me
         metabase.queries.metadata/keep-me
         metabase.queries.models.card/keep-me
         metabase.queries.models.card.metadata/keep-me
         metabase.queries.models.parameter-card/keep-me
         metabase.queries.models.query/keep-me)

(p/import-vars
 [metabase.queries.card
  card-param-values
  card-param-remapped-value]
 [metabase.queries.models.card
  create-card!]
 [metabase.queries.metadata
  batch-fetch-card-metadata
  ;; TODO does this belong here, or in the `dashboards` module?
  batch-fetch-dashboard-metadata
  batch-fetch-query-metadata]
 [metabase.queries.models.card
  fully-parameterized?
  model-supports-implicit-actions?
  model?
  sole-dashboard-id
  starting-card-schema-version
  update-card!
   ;; TODO -- not convinced whether this belongs here or in `permissions`
  with-can-run-adhoc-query]
 [metabase.queries.models.card.metadata
  infer-metadata
  maybe-async-result-metadata
  refresh-metadata
  save-metadata-async!]
 [metabase.queries.models.parameter-card]
 [metabase.queries.models.query
  average-execution-time-ms
  query->database-and-table-ids
  save-query-and-update-average-execution-time!])

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.queries.models.card/populate-query-fields populate-card-query-fields)

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.queries.models.card/template-tag-parameters card-template-tag-parameters)

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.queries.models.parameter-card/delete-all-for-parameterized-object!
              delete-all-parameter-cards-for-parameterized-object!)

#_{:clj-kondo/ignore [:missing-docstring]}
(p/import-def metabase.queries.models.parameter-card/upsert-or-delete-from-parameters!
              upsert-or-delete-parameter-cards-from-parameters!)
