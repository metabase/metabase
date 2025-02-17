(ns metabase-enterprise.stale.routes
  (:require
   [metabase-enterprise.stale.api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

(comment metabase-enterprise.stale.api/keep-me)

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for Stale API"
  (+auth (api.macros/ns-handler 'metabase-enterprise.stale.api)))
