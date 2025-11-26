(ns metabase.documents.api
  "`/api/document/` routes"
  (:require
   [metabase.documents.api.document]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/document/` routes."
  (handlers/routes
   metabase.documents.api.document/routes))
