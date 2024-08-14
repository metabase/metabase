(ns metabase-enterprise.billing.api.routes
  "API endpoint(s) that are only enabled if ee is enabled. These live under `/api/ee/billing/`. We don't feature flag this
  endpoint unlike other ee endpoints."
  (:require
   [compojure.core :as compojure]
   [metabase-enterprise.billing.billing :as billing]
   [metabase.api.routes.common :refer [+auth]]))

(compojure/defroutes ^{:doc "Ring routes for billing API endpoints."} routes
  (compojure/context "/" [] (+auth billing/routes)))
