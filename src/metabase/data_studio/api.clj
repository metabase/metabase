(ns metabase.data-studio.api
  "`/api/data-studio/` routes"
  (:require
   [metabase.api.util.handlers :as handlers]
   [metabase.data-studio.api.table]))

(comment metabase.data-studio.api.table/keep-me)

(def ^{:arglists '([request respond raise])} routes
  "`/api/data-studio` routes."
  (handlers/route-map-handler
   {"/table" metabase.data-studio.api.table/routes}))
