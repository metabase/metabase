(ns metabase-enterprise.advanced-config.api.routes
  "Routes for the EE advanced-config API endpoints."
  (:require
   [metabase-enterprise.advanced-config.api :as advanced-config.api]
   [metabase-enterprise.advanced-config.api.external :as advanced-config.api.external]
   [metabase.api.routes.common :refer [+static-apikey]]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the EE advanced-config API endpoints."
  (handlers/route-map-handler
   {"/"         advanced-config.api/routes
    "/external" (+static-apikey advanced-config.api.external/routes)}))
