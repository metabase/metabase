(ns metabase.documents.core
  (:require
   [metabase.documents.api.document]
   [metabase.documents.prose-mirror]
   [metabase.documents.recent-views]
   [metabase.documents.result-data]
   [metabase.documents.validate]
   [potemkin :as p]))

(comment
  metabase.documents.api.document/keep-me
  metabase.documents.recent-views/keep-me)

(p/import-vars
 [metabase.documents.api.document
  get-document]
 [metabase.documents.prose-mirror
  prose-mirror-content-type]
 [metabase.documents.result-data
  allowed-chart-sorts
  assert-can-view-cached-result!]
 [metabase.documents.validate
  validate-prose-mirror
  valid-prose-mirror?])
