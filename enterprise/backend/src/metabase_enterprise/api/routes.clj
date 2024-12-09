(ns metabase-enterprise.api.routes
  "API routes that are only available when running Metabase® Enterprise Edition™. Even tho these routes are available,
  not all routes might work unless we have a valid premium features token to enable those features.

  These routes should generally live under prefixes like `/api/ee/<feature>/` -- see the
  `enterprise/backend/README.md` for more details."
  (:require
   [metabase-enterprise.advanced-config.api.logs :as logs]
   [metabase-enterprise.advanced-permissions.api.routes
    :as advanced-permissions]
   [metabase-enterprise.api.routes.common :as ee.api.common]
   [metabase-enterprise.audit-app.api.routes :as audit-app]
   [metabase-enterprise.billing.api.routes :as billing]
   [metabase-enterprise.content-verification.api.routes
    :as content-verification]
   [metabase-enterprise.llm.api :as llm.api]
   [metabase-enterprise.query-reference-validation.api :as api.query-reference-validation]
   [metabase-enterprise.sandbox.api.routes :as sandbox]
   [metabase-enterprise.scim.routes :as scim]
   [metabase-enterprise.serialization.api :as api.serialization]
   [metabase-enterprise.stale.routes :as stale]
   [metabase-enterprise.upload-management.api :as api.uploads]
   [metabase.api.common :refer [context defroutes]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defroutes ^{:doc "API routes only available when running Metabase® Enterprise Edition™."} routes
  ;; The following routes are NAUGHTY and do not follow the naming convention (i.e., they do not start with
  ;; `/ee/<feature>/`).
  ;;
  ;; TODO -- Please fix them! See #22687
  content-verification/routes
  sandbox/routes
  ;; The following routes are NICE and do follow the `/ee/<feature>/` naming convention. Please add new routes here
  ;; and follow the convention.
  (context
    "/ee" []
    (context
      "/advanced-permissions" []
      (ee.api.common/+require-premium-feature :advanced-permissions (deferred-tru "Advanced Permissions") advanced-permissions/routes))
    (context
      "/audit-app" []
      (ee.api.common/+require-premium-feature :audit-app (deferred-tru "Audit app") audit-app/routes))
    (context
      "/autodescribe" []
      (ee.api.common/+require-premium-feature :llm-autodescription (deferred-tru "LLM Auto-description") llm.api/routes))
    (context
      "/billing" []
      billing/routes)
    (context
      "/logs" []
      (ee.api.common/+require-premium-feature :audit-app (deferred-tru "Audit app") logs/routes))
    (context
      "/scim" []
      (ee.api.common/+require-premium-feature :scim (deferred-tru "SCIM configuration") scim/routes))
    (context
      "/stale" []
      (ee.api.common/+require-premium-feature :collection-cleanup (deferred-tru "Collection Cleanup") stale/routes))
    (context
      "/serialization" []
      (ee.api.common/+require-premium-feature :serialization (deferred-tru "Serialization") api.serialization/routes))
    (context
      "/query-reference-validation" []
      (ee.api.common/+require-premium-feature :query-reference-validation (deferred-tru "Query Reference Validation") api.query-reference-validation/routes))
    (context
      "/upload-management" []
      (ee.api.common/+require-premium-feature :upload-management (deferred-tru "Upload Management") api.uploads/routes))))
