(ns metabase.documents.core
  (:require
   [metabase.documents.api.document]
   [metabase.documents.content-gate-cache]
   [metabase.documents.markdown]
   [metabase.documents.models.document]
   [metabase.documents.prose-mirror]
   [metabase.documents.recent-views]
   [potemkin :as p]))

(comment
  metabase.documents.api.document/keep-me
  metabase.documents.content-gate-cache/keep-me
  metabase.documents.markdown/keep-me
  metabase.documents.models.document/keep-me
  metabase.documents.prose-mirror/keep-me
  metabase.documents.recent-views/keep-me)

(p/import-vars
 [metabase.documents.api.document
  add-card-to-document!
  copy-document!]
 [metabase.documents.content-gate-cache
  with-content-gate-cache]
 [metabase.documents.markdown
  contains-table?
  escape-text
  parse
  serialize
  splice]
 [metabase.documents.models.document
  clone-cards-in-document!
  create-document!
  DocumentName
  get-document
  register-doc-content-visibility-fn!
  update-document!
  validate-collection-move-permissions]
 [metabase.documents.prose-mirror
  insert-card-embed
  prose-mirror-content-type])
