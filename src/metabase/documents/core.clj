(ns metabase.documents.core
  (:require
   [metabase.documents.api.document]
   [metabase.documents.markdown]
   [metabase.documents.models.document]
   [metabase.documents.recent-views]
   [potemkin :as p]))

(comment
  metabase.documents.api.document/keep-me
  metabase.documents.markdown/keep-me
  metabase.documents.models.document/keep-me
  metabase.documents.recent-views/keep-me)

(p/import-vars
 [metabase.documents.api.document
  add-card-to-document!]
 [metabase.documents.markdown
  parse
  serialize
  splice]
 [metabase.documents.models.document
  clone-cards-in-document!
  create-document!
  get-document
  update-document!
  validate-collection-move-permissions])
