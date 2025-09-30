(ns metabase.xrays.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.xrays.api.automagic-dashboards]))

(comment metabase.xrays.api.automagic-dashboards/keep-me)

(def ^{:arglists '([request respond raise])} automagic-dashboards-routes
  "`/api/automagic-dashboards/` routes."
  (api.macros/ns-handler 'metabase.xrays.api.automagic-dashboards))
