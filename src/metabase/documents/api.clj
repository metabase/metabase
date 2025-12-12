(ns metabase.documents.api
  "`/api/document/` routes"
  (:require
   [metabase.api.util.handlers :as handlers]
   [metabase.documents.api.document]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/document/` routes."
  (handlers/routes
   metabase.documents.api.document/routes))
