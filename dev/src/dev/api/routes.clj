(ns dev.api.routes
  (:require [dev.api.preview]
            [dev.api.prototype]
            [dev.api.viz-eval]
            [metabase.api.util.handlers :as handlers]))

(comment
  dev.api.preview/keep-me
  dev.api.prototype/keep-me
  dev.api.viz-eval/keep-me)

(def ^:private dev-routes-map
  {"/preview"   'dev.api.preview
   "/prototype" 'dev.api.prototype
   "/viz-eval"  'dev.api.viz-eval})

(def ^{:arglists '([request respond raise])} routes
  ;; This map will be merged at the top level, so /dev/prototype is available.
  (handlers/route-map-handler {"/dev" (handlers/route-map-handler dev-routes-map)}))
