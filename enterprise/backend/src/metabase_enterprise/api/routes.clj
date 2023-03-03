(ns metabase-enterprise.api.routes
  "API routes that are only available when running Metabase® Enterprise Edition™. Even tho these routes are available,
  not all routes might work unless we have a valid premium features token to enable those features.

  These routes should generally live under prefixes like `/api/ee/<feature>/` -- see the
  `enterprise/backend/README.md` for more details."
  (:require
   [compojure.core :as compojure]
   [metabase-enterprise.advanced-config.api.logs :as logs]
   [metabase-enterprise.advanced-permissions.api.routes
    :as advanced-permissions]
   [metabase-enterprise.api.routes.common :as ee.api.common]
   [metabase-enterprise.audit-app.api.routes :as audit-app]
   [metabase-enterprise.content-management.api.routes
    :as content-management]
   [metabase-enterprise.sandbox.api.routes :as sandbox]
   [metabase-enterprise.serialization.api.routes :as serialization]))

(compojure/defroutes ^{:doc "API routes only available when running Metabase® Enterprise Edition™."} routes
  ;; The following routes are NAUGHTY and do not follow the naming convention (i.e., they do not start with
  ;; `/ee/<feature>/`).
  ;;
  ;; TODO -- Please fix them! See #22687
  content-management/routes
  sandbox/routes
  ;; The following routes are NICE and do follow the `/ee/<feature>/` naming convention. Please add new routes here
  ;; and follow the convention.
  (compojure/context
   "/ee" []
   (compojure/context
    "/audit-app" []
    (ee.api.common/+require-premium-feature :audit-app audit-app/routes))
   (compojure/context
    "/advanced-permissions" []
    (ee.api.common/+require-premium-feature :advanced-permissions advanced-permissions/routes))
   (compojure/context
    "/logs" []
    (ee.api.common/+require-premium-feature :advanced-config logs/routes))
   (compojure/context
    "/serialization" []
    (ee.api.common/+require-premium-feature :serialization serialization/routes))))
