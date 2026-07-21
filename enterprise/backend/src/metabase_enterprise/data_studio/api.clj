(ns metabase-enterprise.data-studio.api
  "`/api/ee/data-studio/` routes"
  (:require
   [metabase-enterprise.data-studio.api.seed]
   [metabase-enterprise.data-studio.api.table]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-studio` routes."
  (handlers/route-map-handler
   {"/seed"  metabase-enterprise.data-studio.api.seed/routes
    "/table" metabase-enterprise.data-studio.api.table/routes}))
