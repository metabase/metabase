(ns metabase-enterprise.api-routes.routes
  "API routes that are only available when running Metabase® Enterprise Edition™. Even tho these routes are available,
  not all routes might work unless we have a valid premium features token to enable those features.

  These routes should generally live under prefixes like `/api/ee/<feature>/` -- see the
  `enterprise/backend/README.md` for more details."
  (:require
   [metabase-enterprise.action-v2.api]
   [metabase-enterprise.advanced-config.api.logs]
   [metabase-enterprise.advanced-permissions.api.routes]
   [metabase-enterprise.agent-api.api]
   [metabase-enterprise.ai-entity-analysis.api]
   [metabase-enterprise.ai-sql-fixer.api]
   [metabase-enterprise.ai-sql-generation.api]
   [metabase-enterprise.api.core :as ee.api]
   [metabase-enterprise.audit-app.api.routes]
   [metabase-enterprise.billing.api.routes]
   [metabase-enterprise.cloud-add-ons.api]
   [metabase-enterprise.cloud-proxy.api]
   [metabase-enterprise.content-translation.routes]
   [metabase-enterprise.content-verification.api.routes]
   [metabase-enterprise.data-studio.api]
   [metabase-enterprise.database-replication.api :as database-replication.api]
   [metabase-enterprise.database-routing.api]
   [metabase-enterprise.dependencies.api]
   [metabase-enterprise.email.api]
   [metabase-enterprise.embedding-hub.api]
   [metabase-enterprise.gsheets.api :as gsheets.api]
   [metabase-enterprise.library.api]
   [metabase-enterprise.llm.api]
   [metabase-enterprise.metabot-v3.api]
   [metabase-enterprise.metabot-v3.tools.api]
   [metabase-enterprise.permission-debug.api]
   [metabase-enterprise.remote-sync.api]
   [metabase-enterprise.sandbox.api.routes]
   [metabase-enterprise.scim.routes]
   [metabase-enterprise.semantic-search.api]
   [metabase-enterprise.serialization.api]
   [metabase-enterprise.stale.api]
   [metabase-enterprise.support-access-grants.api]
   [metabase-enterprise.tenants.api]
   [metabase-enterprise.transforms-python.api]
   [metabase-enterprise.upload-management.api]
   [metabase-enterprise.workspaces.api]
   [metabase.api.macros :as api.macros]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.i18n :refer [deferred-tru]]))

(comment metabase-enterprise.advanced-config.api.logs/keep-me
         metabase-enterprise.llm.api/keep-me
         metabase-enterprise.agent-api.api/keep-me)

(def ^:private required-feature->message
  {:advanced-permissions       (deferred-tru "Advanced Permissions")
   :agent-api                  (deferred-tru "Agent API")
   :ai-sql-fixer               (deferred-tru "AI SQL Fixer")
   :ai-sql-generation          (deferred-tru "AI SQL Generation")
   :ai-entity-analysis         (deferred-tru "AI Entity Analysis")
   :attached-dwh               (deferred-tru "Attached DWH")
   :audit-app                  (deferred-tru "Audit app")
   :collection-cleanup         (deferred-tru "Collection Cleanup")
   :content-translation        (deferred-tru "Content translation")
   :data-studio                (deferred-tru "Data Studio")
   :dependencies               (deferred-tru "Dependency Tracking")
   :embedding                  (deferred-tru "Embedding")
   :remote-sync                (deferred-tru "Remote Sync")
   :etl-connections            (deferred-tru "ETL Connections")
   :etl-connections-pg         (deferred-tru "ETL Connections PG replication")
   :llm-autodescription        (deferred-tru "LLM Auto-description")
   :metabot-v3                 (deferred-tru "MetaBot")
   :scim                       (deferred-tru "SCIM configuration")
   :semantic-search            (deferred-tru "Semantic Search")
   :serialization              (deferred-tru "Serialization")
   :table-data-editing         (deferred-tru "Table Data Editing")
   :tenants                    (deferred-tru "Tenants")
   :upload-management          (deferred-tru "Upload Management")
   :database-routing           (deferred-tru "Database Routing")
   :cloud-custom-smtp          (deferred-tru "Custom SMTP")
   :support-users              (deferred-tru "Support Users")
   :transforms-python          (deferred-tru "Transforms Python")
   :workspaces                 (deferred-tru "Workspaces")})

(defn- premium-handler [handler required-feature]
  (let [handler (cond-> handler
                  (simple-symbol? handler) api.macros/ns-handler)]
    (->> handler
         (ee.api/+require-premium-feature required-feature (required-feature->message required-feature)))))

(def ^:private naughty-routes-map
  "The following routes are NAUGHTY and do not follow the naming convention (i.e., they do not start with
  `/ee/<feature>/`).

  TODO -- Please fix them! See #22687"
  {"/agent"             (premium-handler metabase-enterprise.agent-api.api/routes :agent-api)
   "/moderation-review" metabase-enterprise.content-verification.api.routes/routes
   "/mt"                metabase-enterprise.sandbox.api.routes/sandbox-routes
   "/table"             metabase-enterprise.sandbox.api.routes/sandbox-table-routes})

;;; ↓↓↓ KEEP THIS SORTED OR ELSE! ↓↓↓
(def ^:private ee-routes-map
  "/api/ee routes. The following routes are NICE and do follow the `/ee/<feature>/` naming convention. Please add new
  routes here and follow the convention."
  ;; Postponing a granular flag for :actions until it's used more widely.
  {"/action-v2"                    (premium-handler metabase-enterprise.action-v2.api/routes :table-data-editing)
   "/advanced-permissions"         (premium-handler metabase-enterprise.advanced-permissions.api.routes/routes :advanced-permissions)
   "/ai-entity-analysis"           (premium-handler metabase-enterprise.ai-entity-analysis.api/routes :ai-entity-analysis)
   "/ai-sql-fixer"                 (premium-handler metabase-enterprise.ai-sql-fixer.api/routes :ai-sql-fixer)
   "/ai-sql-generation"            (premium-handler metabase-enterprise.ai-sql-generation.api/routes :ai-sql-generation)
   "/audit-app"                    (premium-handler metabase-enterprise.audit-app.api.routes/routes :audit-app)
   "/autodescribe"                 (premium-handler 'metabase-enterprise.llm.api :llm-autodescription)
   "/billing"                      metabase-enterprise.billing.api.routes/routes
   "/content-translation"          (premium-handler metabase-enterprise.content-translation.routes/routes :content-translation)
   "/cloud-add-ons"                metabase-enterprise.cloud-add-ons.api/routes
   "/cloud-proxy"                  metabase-enterprise.cloud-proxy.api/routes
   "/data-studio"                  (premium-handler metabase-enterprise.data-studio.api/routes :data-studio)
   "/database-replication"         (-> database-replication.api/routes ;; database-replication requires all these features.
                                       (premium-handler :attached-dwh)
                                       (premium-handler :etl-connections)
                                       (premium-handler :etl-connections-pg))
   "/database-routing"             (premium-handler metabase-enterprise.database-routing.api/routes :database-routing)
   "/dependencies"                 (premium-handler metabase-enterprise.dependencies.api/routes :dependencies)
   "/email"                        (premium-handler metabase-enterprise.email.api/routes :cloud-custom-smtp)
   "/remote-sync"                  (premium-handler metabase-enterprise.remote-sync.api/routes :remote-sync)
   "/embedding-hub"                (premium-handler metabase-enterprise.embedding-hub.api/routes :embedding)
   "/gsheets"                      (-> gsheets.api/routes ;; gsheets requires both features.
                                       (premium-handler :attached-dwh)
                                       (premium-handler :etl-connections))
   "/library"                      (premium-handler metabase-enterprise.library.api/routes :data-studio)
   "/logs"                         (premium-handler 'metabase-enterprise.advanced-config.api.logs :audit-app)
   "/metabot-tools"                metabase-enterprise.metabot-v3.tools.api/routes
   "/metabot-v3"                   (premium-handler metabase-enterprise.metabot-v3.api/routes :metabot-v3)
   "/permission_debug"             (premium-handler metabase-enterprise.permission-debug.api/routes :advanced-permissions)
   "/transforms-python"            (premium-handler metabase-enterprise.transforms-python.api/routes :transforms-python)
   "/scim"                         (premium-handler metabase-enterprise.scim.routes/routes :scim)
   "/semantic-search"              (premium-handler metabase-enterprise.semantic-search.api/routes :semantic-search)
   "/serialization"                (premium-handler metabase-enterprise.serialization.api/routes :serialization)
   "/stale"                        (premium-handler metabase-enterprise.stale.api/routes :collection-cleanup)
   "/support-access-grant" (premium-handler metabase-enterprise.support-access-grants.api/routes :support-users)
   "/tenant"                       (premium-handler metabase-enterprise.tenants.api/routes :tenants)
   "/upload-management"            (premium-handler metabase-enterprise.upload-management.api/routes :upload-management)
   "/workspace"                    (premium-handler metabase-enterprise.workspaces.api/routes :workspaces)})
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
