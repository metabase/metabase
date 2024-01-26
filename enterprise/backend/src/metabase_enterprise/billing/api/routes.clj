(ns metabase-enterprise.billing.api.routes
  "API endpoints that are only enabled if we have a premium token with the `:audit-app` feature. These live under
    `/api/ee/billing/`. Feature-flagging for these routes happens in [[metabase-enterprise.api.routes/routes]]."
  (:require
   [compojure.core :as compojure]
   [metabase-enterprise.billing.billing :as billing]
   [metabase.api.routes.common :refer [+auth]]))

(compojure/defroutes ^{:doc "Ring routes for billing API endpoints."} routes
  (compojure/context "/" [] (+auth billing/routes)))

