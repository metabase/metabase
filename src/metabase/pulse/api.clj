(ns metabase.pulse.api
  "`/api/pulse` and `/api/alert` API routes. These routes are allegedly deprecated, but they're been deprecated for a
  pretty long time now, so no telling how much longer they'll be around."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common]
   [metabase.api.util.handlers :as handlers]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.pulse.api.alert]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.pulse.api.pulse]
   [metabase.pulse.api.unsubscribe]
   [potemkin :as p]))

(comment metabase.pulse.api.alert/keep-me
         metabase.pulse.api.pulse/keep-me
         metabase.pulse.api.unsubscribe/keep-me)

(p/import-vars
 [metabase.pulse.api.pulse
  create-pulse-with-perm-checks!])

(def ^{:arglists '([request respond raise])} pulse-routes
  "`/api/pulse` routes. `/api/pulse/unsubscribe/*` does not require authentication, so you can unsubscribe without being
  logged in."
  (handlers/routes
   (handlers/route-map-handler
    {"/unsubscribe" 'metabase.pulse.api.unsubscribe})
   (routes.common/+auth metabase.pulse.api.pulse/routes)))

(def ^{:arglists '([request respond raise])} alert-routes
  "`/api/alert` routes."
  (api.macros/ns-handler 'metabase.pulse.api.alert))
