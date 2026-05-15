(ns metabase.documents.api
  "`/api/document/` routes"
  (:require
   [metabase.api.util.handlers :as handlers]
   [metabase.documents.api.document]
   [metabase.documents.api.stored-result]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/document/` routes."
  (handlers/routes
   (handlers/route-map-handler
    {"/stored-result" metabase.documents.api.stored-result/routes})
   metabase.documents.api.document/routes))
