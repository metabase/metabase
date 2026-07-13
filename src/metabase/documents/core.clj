(ns metabase.documents.core
  (:require
   [metabase.documents.api.document]
   [metabase.documents.markdown]
   [metabase.documents.recent-views]
   [potemkin :as p]))

(comment
  metabase.documents.api.document/keep-me
  metabase.documents.markdown/keep-me
  metabase.documents.recent-views/keep-me)

(p/import-vars
 [metabase.documents.api.document
  create-document!
  get-document]
 [metabase.documents.markdown
  markdown->prose-mirror])
