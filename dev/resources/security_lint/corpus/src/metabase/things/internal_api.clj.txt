(ns metabase.things.internal-api
  "Security-lint test example: a namespace mounted with no authentication wrapper, relying on a check in each
  handler by convention."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]))

(api.macros/defendpoint :get "/stats"
  "Checks for a superuser by hand, which demands a session; not reported."
  [_route _query _body]
  (api/check-superuser)
  {:things 0})

(api.macros/defendpoint :get "/count"
  "The next endpoint added, which checks nothing: served to anyone."
  [_route _query _body]
  {:things 0})

(def routes (api.macros/ns-handler *ns*))
