(ns metabase-enterprise.api.routes
  "API routes that are only available when running Metabase® Enterprise Edition™. Even tho these routes are available,
  not all routes might work unless we have a valid premium features token to enable those features.

  These routes should generally live under prefixes like `/api/ee/<feature>/` -- see the
  `enterprise/backend/README.md` for more details."
  (:require
   [metabase-enterprise.api.routes.common :as ee.api.common]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.i18n :refer [deferred-tru]]))

(def ^:private required-feature->message
  {:advanced-permissions       (deferred-tru "Advanced Permissions")
   :audit-app                  (deferred-tru "Audit app")
   :collection-cleanup         (deferred-tru "Collection Cleanup")
   :llm-autodescription        (deferred-tru "LLM Auto-description")
   :query-reference-validation (deferred-tru "Query Reference Validation")
   :scim                       (deferred-tru "SCIM configuration")
   :serialization              (deferred-tru "Serialization")
   :upload-management          (deferred-tru "Upload Management")})

(defn- lazy-handler [routes-symb required-feature]
  (->> (handlers/lazy-handler routes-symb)
       (ee.api.common/+require-premium-feature required-feature (required-feature->message required-feature))))

(defn- lazy-ns-handler [ns-symb required-feature]
  (->> (handlers/lazy-ns-handler ns-symb)
       (ee.api.common/+require-premium-feature required-feature (required-feature->message required-feature))))

(def ^:private naughty-routes-map
  "The following routes are NAUGHTY and do not follow the naming convention (i.e., they do not start with
  `/ee/<feature>/`).

  TODO -- Please fix them! See #22687"
  {"/moderation-review" (handlers/lazy-handler 'metabase-enterprise.content-verification.api.routes/routes)
   "/mt"                (handlers/lazy-handler 'metabase-enterprise.sandbox.api.routes/sandbox-routes)
   "/table"             (handlers/lazy-handler 'metabase-enterprise.sandbox.api.routes/sandbox-table-routes)})

;;; ↓↓↓ KEEP THIS SORTED OR ELSE! ↓↓↓
(def ^:private ee-routes-map
  "/api/ee routes. The following routes are NICE and do follow the `/ee/<feature>/` naming convention. Please add new
  routes here and follow the convention."
  {"/advanced-permissions"       (lazy-handler 'metabase-enterprise.advanced-permissions.api.routes/routes :advanced-permissions)
   "/audit-app"                  (lazy-handler 'metabase-enterprise.audit-app.api.routes/routes :audit-app)
   "/autodescribe"               (lazy-ns-handler 'metabase-enterprise.llm.api :llm-autodescription)
   "/billing"                    (handlers/lazy-handler 'metabase-enterprise.billing.api.routes/routes)
   "/logs"                       (lazy-ns-handler 'metabase-enterprise.advanced-config.api.logs :audit-app)
   "/query-reference-validation" (lazy-handler 'metabase-enterprise.query-reference-validation.api/routes :query-reference-validation)
   "/scim"                       (lazy-handler 'metabase-enterprise.scim.routes/routes :scim)
   "/serialization"              (lazy-handler 'metabase-enterprise.serialization.api/routes :serialization)
   "/stale"                      (lazy-handler 'metabase-enterprise.stale.routes/routes :collection-cleanup)
   "/upload-management"          (lazy-handler 'metabase-enterprise.upload-management.api/routes :upload-management)})
;;; ↑↑↑ KEEP THIS SORTED OR ELSE ↑↑↑

(def ^:private routes-map
  (merge
   naughty-routes-map
   {"/ee" (handlers/route-map-handler ee-routes-map)}))

(def ^{:arglists '([request respond raise])} routes
  "API routes only available when running Metabase® Enterprise Edition™.

  Almost all of these start with `/api/ee, but a handful of naughty routes (see [[naughty-routes-map]]) do not follow
  this convention."
  (handlers/route-map-handler routes-map))
