(ns metabase-enterprise.documents.core
  (:require
   [metabase-enterprise.documents.api.document]
   [metabase-enterprise.documents.recent-views]
   [potemkin :as p]))

(comment
  metabase-enterprise.documents.api.document/keep-me
  metabase-enterprise.documents.recent-views/keep-me)

(p/import-vars
 [metabase-enterprise.documents.api.document
  get-document]
 [metabase-enterprise.documents.recent-views
  select-documents-for-recents])
