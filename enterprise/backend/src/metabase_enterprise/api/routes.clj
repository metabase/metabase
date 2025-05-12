(ns metabase-enterprise.api.routes
  "API routes that are only available when running Metabase® Enterprise Edition™. Even tho these routes are available,
  not all routes might work unless we have a valid premium features token to enable those features.

  These routes should generally live under prefixes like `/api/ee/<feature>/` -- see the
  `enterprise/backend/README.md` for more details."
  (:require
   [metabase-enterprise.advanced-config.api.logs]
   [metabase-enterprise.advanced-permissions.api.routes]
   [metabase-enterprise.ai-entity-analysis.api]
   [metabase-enterprise.ai-sql-fixer.api]
   [metabase-enterprise.ai-sql-generation.api]
   [metabase-enterprise.api.routes.common :as ee.api.common]
   [metabase-enterprise.audit-app.api.routes]
   [metabase-enterprise.billing.api.routes]
   [metabase-enterprise.content-verification.api.routes]
   [metabase-enterprise.data-editing.api]
   [metabase-enterprise.database-routing.api]
   [metabase-enterprise.gsheets.api :as gsheets.api]
   [metabase-enterprise.llm.api]
   [metabase-enterprise.metabot-v3.api]
   [metabase-enterprise.metabot-v3.tools.api]
   [metabase-enterprise.query-reference-validation.api]
   [metabase-enterprise.sandbox.api.routes]
   [metabase-enterprise.scim.routes]
   [metabase-enterprise.serialization.api]
   [metabase-enterprise.stale.api]
   [metabase-enterprise.tenants.api]
   [metabase-enterprise.upload-management.api]
   [metabase.api.macros :as api.macros]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.i18n :refer [deferred-tru]]))

(comment metabase-enterprise.advanced-config.api.logs/keep-me
         metabase-enterprise.llm.api/keep-me)

(def ^:private required-feature->message
  {:advanced-permissions       (deferred-tru "Advanced Permissions")
   :ai-sql-fixer               (deferred-tru "AI SQL Fixer")
   :ai-sql-generation          (deferred-tru "AI SQL Generation")
   :ai-entity-analysis         (deferred-tru "AI Entity Analysis")
   :attached-dwh               (deferred-tru "Attached DWH")
   :audit-app                  (deferred-tru "Audit app")
   :collection-cleanup         (deferred-tru "Collection Cleanup")
   :database-routing           (deferred-tru "Database Routing")
   :etl-connections            (deferred-tru "ETL Connections")
   :table-data-editing         (deferred-tru "Editing Table Data")
   :llm-autodescription        (deferred-tru "LLM Auto-description")
   :metabot-v3                 (deferred-tru "MetaBot")
   :query-reference-validation (deferred-tru "Query Reference Validation")
   :scim                       (deferred-tru "SCIM configuration")
   :serialization              (deferred-tru "Serialization")
   :tenants                    (deferred-tru "Tenants")
   :upload-management          (deferred-tru "Upload Management")})

(defn- premium-handler [handler required-feature]
  (let [handler (cond-> handler
                  (simple-symbol? handler) api.macros/ns-handler)]
    (->> handler
         (ee.api.common/+require-premium-feature required-feature (required-feature->message required-feature)))))

(def ^:private naughty-routes-map
  "The following routes are NAUGHTY and do not follow the naming convention (i.e., they do not start with
  `/ee/<feature>/`).

  TODO -- Please fix them! See #22687"
  {"/moderation-review" metabase-enterprise.content-verification.api.routes/routes
   "/mt"                metabase-enterprise.sandbox.api.routes/sandbox-routes
   "/table"             metabase-enterprise.sandbox.api.routes/sandbox-table-routes})

;;; ↓↓↓ KEEP THIS SORTED OR ELSE! ↓↓↓
(def ^:private ee-routes-map
  "/api/ee routes. The following routes are NICE and do follow the `/ee/<feature>/` naming convention. Please add new
  routes here and follow the convention."
  {"/advanced-permissions"       (premium-handler metabase-enterprise.advanced-permissions.api.routes/routes :advanced-permissions)
   "/ai-entity-analysis"         (premium-handler metabase-enterprise.ai-entity-analysis.api/routes :ai-entity-analysis)
   "/ai-sql-fixer"               (premium-handler metabase-enterprise.ai-sql-fixer.api/routes :ai-sql-fixer)
   "/ai-sql-generation"          (premium-handler metabase-enterprise.ai-sql-generation.api/routes :ai-sql-generation)
   "/audit-app"                  (premium-handler metabase-enterprise.audit-app.api.routes/routes :audit-app)
   "/autodescribe"               (premium-handler 'metabase-enterprise.llm.api :llm-autodescription)
   "/billing"                    metabase-enterprise.billing.api.routes/routes
   "/data-editing"               (premium-handler metabase-enterprise.data-editing.api/routes :table-data-editing)
   "/gsheets"                    (-> gsheets.api/routes ;; gsheets requires both features.
                                     (premium-handler :attached-dwh)
                                     (premium-handler :etl-connections))
   "/database-routing"           (premium-handler metabase-enterprise.database-routing.api/routes :database-routing)
   "/logs"                       (premium-handler 'metabase-enterprise.advanced-config.api.logs :audit-app)
   "/metabot-v3"                 (premium-handler metabase-enterprise.metabot-v3.api/routes :metabot-v3)
   "/metabot-tools"              metabase-enterprise.metabot-v3.tools.api/routes
   "/query-reference-validation" (premium-handler metabase-enterprise.query-reference-validation.api/routes :query-reference-validation)
   "/scim"                       (premium-handler metabase-enterprise.scim.routes/routes :scim)
   "/serialization"              (premium-handler metabase-enterprise.serialization.api/routes :serialization)
   "/stale"                      (premium-handler metabase-enterprise.stale.api/routes :collection-cleanup)
   "/tenants"                    (premium-handler metabase-enterprise.tenants.api/routes :tenants)
   "/upload-management"          (premium-handler metabase-enterprise.upload-management.api/routes :upload-management)})
;;; ↑↑↑ KEEP THIS SORTED OR ELSE ↑↑↑

(def ^:private routes-map
  (merge
   naughty-routes-map
   {"/ee" ee-routes-map}))

(def ^{:arglists '([request respond raise])} routes
  "API routes only available when running Metabase® Enterprise Edition™.

  Almost all of these start with `/api/ee, but a handful of naughty routes (see [[naughty-routes-map]]) do not follow
  this convention."
  (handlers/route-map-handler routes-map))
