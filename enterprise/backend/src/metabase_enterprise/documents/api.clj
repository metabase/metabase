(ns metabase-enterprise.documents.api
  "`/api/ee/document/` routes"
  (:require
   [metabase-enterprise.documents.api.document]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/document/` routes."
  (handlers/routes
   metabase-enterprise.documents.api.document/routes))
