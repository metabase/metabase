(ns metabase.documents.core
  (:require
   [metabase.documents.api.document]
   [metabase.documents.models.document]
   [metabase.documents.prose-mirror]
   [metabase.documents.recent-views]
   [potemkin :as p]))

(comment
  metabase.documents.api.document/keep-me
  metabase.documents.models.document/keep-me
  metabase.documents.recent-views/keep-me)

(p/import-vars
 [metabase.documents.api.document
  add-card-to-document!
  get-document]
 [metabase.documents.models.document
  register-doc-content-visibility-fn!]
 [metabase.documents.prose-mirror
  prose-mirror-content-type])
