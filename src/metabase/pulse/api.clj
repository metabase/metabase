(ns metabase.pulse.api
  "`/api/pulse` API routes. These endpoints are allegedly deprecated."
  (:require
   [metabase.api.routes.common :as routes.common]
   [metabase.api.util.handlers :as handlers]
   [metabase.pulse.api.pulse]
   [metabase.pulse.api.unsubscribe]))

(comment metabase.pulse.api.unsubscribe/keep-me)

(def ^{:arglists '([request respond raise])} routes
  "`/api/pulse` routes. `/api/pulse/unsubscribe/*` does not require authentication, so you can unsubscribe without being
  logged in."
  (handlers/routes
   (handlers/route-map-handler
    {"/unsubscribe" 'metabase.pulse.api.unsubscribe})
   (routes.common/+auth metabase.pulse.api.pulse/routes)))
