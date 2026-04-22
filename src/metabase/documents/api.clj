(ns metabase.documents.api
  "`/api/document/` routes"
  (:require
   [metabase.api.util.handlers :as handlers]
   [metabase.documents.api.document]
   [metabase.documents.collab.handler]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/document/` routes."
  (handlers/routes
   metabase.documents.collab.handler/routes
   metabase.documents.api.document/routes))
