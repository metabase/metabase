(ns metabase-enterprise.reports.api
  "`/api/ee/report/` routes"
  (:require
   [metabase-enterprise.reports.api.run]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)
   metabase-enterprise.reports.api.run/routes))
