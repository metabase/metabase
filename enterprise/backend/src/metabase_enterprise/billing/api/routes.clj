(ns metabase-enterprise.billing.api.routes
  "API endpoint(s) that are only enabled if ee is enabled. These live under `/api/ee/billing/`. We don't feature flag this
  endpoint unlike other ee endpoints."
  (:require
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for /api/ee/billing API endpoints."
  (+auth (handlers/lazy-ns-handler 'metabase-enterprise.billing.api)))
