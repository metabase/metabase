(ns metabase-enterprise.billing.api.routes
  "API endpoint(s) that are only enabled if ee is enabled. These live under `/api/ee/billing/`. We don't feature flag this
  endpoint unlike other ee endpoints."
  (:require
   [metabase-enterprise.billing.api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

(comment metabase-enterprise.billing.api/keep-me)

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for /api/ee/billing API endpoints."
  (+auth (api.macros/ns-handler 'metabase-enterprise.billing.api)))
