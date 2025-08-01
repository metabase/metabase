(ns metabase-enterprise.documents.api
  "`/api/ee/document/` routes"
  (:require
   [metabase-enterprise.documents.api.document]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/document` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)
   metabase-enterprise.documents.api.document/routes))