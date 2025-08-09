(ns metabase-enterprise.documents.core
  (:require
   [metabase-enterprise.documents.api.document]
   [potemkin :as p]))

(comment
  metabase-enterprise.documents.api.document/keep-me)

(p/import-vars
 [metabase-enterprise.documents.api.document
  get-document])
