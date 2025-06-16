(ns metabase.analytics.api
  (:require
   [metabase.analytics.stats :as stats]
   [metabase.api.macros :as api.macros]
   [metabase.permissions.validation :as validation]))

;;; I don't think this endpoint is actually used anywhere for anything.
(api.macros/defendpoint :get "/anonymous-stats"
  "Anonymous usage stats. Endpoint for testing, and eventually exposing this to instance admins to let them see
  what is being phoned home."
  []
  (validation/check-has-application-permission :monitoring)
  (stats/legacy-anonymous-usage-stats))
