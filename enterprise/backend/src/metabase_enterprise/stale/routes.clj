(ns metabase-enterprise.stale.routes
  (:require
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for Stale API"
  (+auth (handlers/lazy-ns-handler 'metabase-enterprise.stale.api)))
