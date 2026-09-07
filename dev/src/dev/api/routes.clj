(ns dev.api.routes
  "Routes that are available only on a development classpath."
  (:require
   [dev.api.preview]
   [dev.api.prototype]
   [metabase.api.util.handlers :as handlers]))

(comment
  dev.api.preview/keep-me
  dev.api.prototype/keep-me)

(def ^:private dev-routes-map
  {"/preview"   'dev.api.preview
   "/prototype" 'dev.api.prototype})

(def ^{:arglists '([request respond raise])} routes
  "Top-level development API routes."
  (handlers/route-map-handler {"/dev" (handlers/route-map-handler dev-routes-map)}))
