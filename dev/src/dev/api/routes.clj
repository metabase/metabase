(ns dev.api.routes
  (:require [dev.api.prototype]
            [metabase.api.util.handlers :as handlers]))

(comment
  dev.api.prototype/keep-me)

(def ^:private dev-routes-map
  {"/prototype" 'dev.api.prototype})

(def ^{:arglists '([request respond raise])} routes
  ;; This map will be merged at the top level, so /dev/prototype is available.
  (handlers/route-map-handler {"/dev" (handlers/route-map-handler dev-routes-map)}))
