(ns metabase.documents.api
  "`/api/document/` routes"
  (:require
   [metabase.documents.api.document]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/document/` routes."
  metabase.documents.api.document/routes)
