(ns metabase-enterprise.audit-app.api.routes
  "API endpoints that are only enabled if we have a premium token with the `:audit-app` feature. These live under
  `/api/ee/audit-app/`. Feature-flagging for these routes happens in [[metabase-enterprise.api.routes/routes]]."
  (:require
   [compojure.core :as compojure]
   [metabase-enterprise.audit-app.api.user :as user]
   [metabase.api.routes.common :refer [+auth]]))

(compojure/defroutes ^{:doc "Ring routes for mt API endpoints."} routes
  (compojure/context "/user" [] (+auth user/routes)))
