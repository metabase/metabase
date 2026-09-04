(ns metabase.documents.core
  (:require
   [metabase.documents.api.document]
   [metabase.documents.markdown]
   [metabase.documents.models.document]
   [metabase.documents.prose-mirror]
   [metabase.documents.recent-views]
   [potemkin :as p]))

(comment
  metabase.documents.api.document/keep-me
  metabase.documents.markdown/keep-me
  metabase.documents.models.document/keep-me
  metabase.documents.prose-mirror/keep-me
  metabase.documents.recent-views/keep-me)

(p/import-vars
 [metabase.documents.api.document
  add-card-to-document!
  copy-document!]
 [metabase.documents.markdown
  parse
  serialize
  splice]
 [metabase.documents.models.document
  clone-cards-in-document!
  create-document!
  get-document
  register-doc-content-visibility-fn!
  update-document!
  with-content-gate-cache]
 [metabase.documents.prose-mirror
  insert-card-embed
  prose-mirror-content-type])
