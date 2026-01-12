(ns metabase-enterprise.data-studio.api
  "`/api/ee/data-studio/` routes"
  (:require
   [metabase-enterprise.data-studio.api.table]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-studio` routes."
  (handlers/route-map-handler
   {"/table" metabase-enterprise.data-studio.api.table/routes}))
