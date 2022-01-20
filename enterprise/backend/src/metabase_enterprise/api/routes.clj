(ns metabase-enterprise.api.routes
  "API routes that are only available when running Metabase® Enterprise Edition™. Even tho these routes are available,
  not all routes might work unless we have a valid premium features token to enable those features.

  These routes should generally live under prefixes like `/api/ee/<feature>/` -- see the
  `enterprise/backend/README.md` for more details."
  (:require [compojure.core :as compojure]
            [metabase-enterprise.api.routes.common :as ee.api.common]
            [metabase-enterprise.audit-app.api.routes :as audit-app]
            [metabase-enterprise.content-management.api.routes :as content-management]
            [metabase-enterprise.sandbox.api.routes :as sandbox]))

(compojure/defroutes ^{:doc "API routes only available when running Metabase® Enterprise Edition™."} routes
  ;; The following routes are NAUGHTY and do not follow the naming convention (i.e., they do not start with
  ;; `/ee/<feature>/`).
  ;;
  ;; TODO -- Please fix them!
  content-management/routes
  sandbox/routes
  ;; The following routes are NICE and do follow the `/ee/<feature>/` naming convention. Please add new routes here
  ;; and follow the convention.
  (compojure/context
   "/ee" []
   (compojure/context
    "/audit-app" []
    (ee.api.common/+require-premium-feature :audit-app audit-app/routes))))
