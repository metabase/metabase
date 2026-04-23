(ns metabase-enterprise.api-routes.routes
  "API routes that are only available when running Metabase® Enterprise Edition™. Even tho these routes are available,
  not all routes might work unless we have a valid premium features token to enable those features.

  These routes should generally live under prefixes like `/api/ee/<feature>/` -- see the
  `enterprise/backend/README.md` for more details."
  (:require
   [metabase-enterprise.action-v2.api]
   [metabase-enterprise.advanced-config.api.logs]
   [metabase-enterprise.advanced-permissions.api.routes]
   [metabase-enterprise.api.core :as ee.api]
   [metabase-enterprise.audit-app.api.routes]
   [metabase-enterprise.billing.api.routes]
   [metabase-enterprise.cloud-add-ons.api]
   [metabase-enterprise.cloud-proxy.api]
   [metabase-enterprise.content-translation.routes]
   [metabase-enterprise.content-verification.api.routes]
   [metabase-enterprise.data-complexity-score.api]
   [metabase-enterprise.data-studio.api]
   [metabase-enterprise.database-replication.api :as database-replication.api]
   [metabase-enterprise.database-routing.api]
   [metabase-enterprise.dependencies.api]
   [metabase-enterprise.email.api]
   [metabase-enterprise.embedding-hub.api]
   [metabase-enterprise.gsheets.api :as gsheets.api]
   [metabase-enterprise.library.api]
   [metabase-enterprise.metabot-analytics.api]
   [metabase-enterprise.metabot.api]
   [metabase-enterprise.metabot.api.routes]
   [metabase-enterprise.permission-debug.api]
   [metabase-enterprise.remote-sync.api]
   [metabase-enterprise.replacement.api]
   [metabase-enterprise.sandbox.api.routes]
   [metabase-enterprise.scim.routes]
   [metabase-enterprise.security-center.api]
   [metabase-enterprise.semantic-search.api]
   [metabase-enterprise.serialization.api]
   [metabase-enterprise.stale.api]
   [metabase-enterprise.support-access-grants.api]
   [metabase-enterprise.tenants.api]
   [metabase-enterprise.transforms-python.api]
   [metabase-enterprise.transforms.api]
   [metabase-enterprise.upload-management.api]
   [metabase.api.macros :as api.macros]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.i18n :refer [deferred-tru]]))

(comment metabase-enterprise.advanced-config.api.logs/keep-me)

(def ^:private required-feature->message
  {:advanced-permissions       (deferred-tru "Advanced Permissions")
   :ai-controls                (deferred-tru "AI Controls")
   :attached-dwh               (deferred-tru "Attached DWH")
   :audit-app                  (deferred-tru "Audit app")
   :collection-cleanup         (deferred-tru "Collection Cleanup")
   :content-translation        (deferred-tru "Content translation")
   :library                    (deferred-tru "Library")
   :dependencies               (deferred-tru "Dependency Tracking")
   :embedding                  (deferred-tru "Embedding")
   :remote-sync                (deferred-tru "Remote Sync")
   :etl-connections            (deferred-tru "ETL Connections")
   :etl-connections-pg         (deferred-tru "ETL Connections PG replication")
   :scim                       (deferred-tru "SCIM configuration")
   :semantic-search            (deferred-tru "Semantic Search")
   :admin-security-center      (deferred-tru "Security Center")
   :serialization              (deferred-tru "Serialization")
   :table-data-editing         (deferred-tru "Table Data Editing")
   :tenants                    (deferred-tru "Tenants")
   :upload-management          (deferred-tru "Upload Management")
   :database-routing           (deferred-tru "Database Routing")
   :metabot-v3                (deferred-tru "Metabot")
   :cloud-custom-smtp          (deferred-tru "Custom SMTP")
   :support-users              (deferred-tru "Support Users")
   :transforms-python          (deferred-tru "Transforms Python")})

(defn- premium-handler [handler required-feature]
  (let [handler (cond-> handler
                  (simple-symbol? handler) api.macros/ns-handler)]
    (->> handler
         (ee.api/+require-premium-feature required-feature (required-feature->message required-feature)))))

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
  ;; Postponing a granular flag for :actions until it's used more widely.
  {"/action-v2"                    (premium-handler metabase-enterprise.action-v2.api/routes :table-data-editing)
   "/advanced-permissions"         (premium-handler metabase-enterprise.advanced-permissions.api.routes/routes :advanced-permissions)
   "/ai-controls"                  (premium-handler metabase-enterprise.metabot.api.routes/routes :ai-controls)
   "/audit-app"                    (premium-handler metabase-enterprise.audit-app.api.routes/routes :audit-app)
   "/billing"                      metabase-enterprise.billing.api.routes/routes
   "/content-translation"          (premium-handler metabase-enterprise.content-translation.routes/routes :content-translation)
   "/cloud-add-ons"                metabase-enterprise.cloud-add-ons.api/routes
   "/cloud-proxy"                  metabase-enterprise.cloud-proxy.api/routes
   ;; No premium-handler gate yet — we haven't settled on the feature flag name or final API shape.
   ;; Endpoint is superuser-only so it's not exposed to regular users in the meantime.
   "/data-complexity-score"        metabase-enterprise.data-complexity-score.api/routes
   "/data-studio"                  (premium-handler metabase-enterprise.data-studio.api/routes :library)
   "/database-replication"         (-> database-replication.api/routes ;; database-replication requires all these features.
                                       (premium-handler :attached-dwh)
                                       (premium-handler :etl-connections)
                                       (premium-handler :etl-connections-pg))
   "/database-routing"             (premium-handler metabase-enterprise.database-routing.api/routes :database-routing)
   "/dependencies"                 (premium-handler metabase-enterprise.dependencies.api/routes :dependencies)
   "/email"                        (premium-handler metabase-enterprise.email.api/routes :cloud-custom-smtp)
   "/remote-sync"                  (premium-handler metabase-enterprise.remote-sync.api/routes :remote-sync)
   "/replacement"                  (premium-handler metabase-enterprise.replacement.api/routes :dependencies)
   "/embedding-hub"                (premium-handler metabase-enterprise.embedding-hub.api/routes :embedding)
   "/gsheets"                      (-> gsheets.api/routes ;; gsheets requires both features.
                                       (premium-handler :attached-dwh)
                                       (premium-handler :etl-connections))
   "/library"                      (premium-handler metabase-enterprise.library.api/routes :library)
   "/logs"                         (premium-handler 'metabase-enterprise.advanced-config.api.logs :audit-app)
   "/metabot"                      (premium-handler 'metabase-enterprise.metabot.api :metabot-v3)
   "/metabot-analytics"            (premium-handler metabase-enterprise.metabot-analytics.api/routes :audit-app)
   "/permission_debug"             (premium-handler metabase-enterprise.permission-debug.api/routes :advanced-permissions)
   ;; TODO (Ngoc 2026-03-25) -- use :transforms-advanced feature flag once it exists
   "/transforms"                   (premium-handler metabase-enterprise.transforms.api/routes :transforms-python)
   "/transforms-python"            (premium-handler metabase-enterprise.transforms-python.api/routes :transforms-python)
   "/scim"                         (premium-handler metabase-enterprise.scim.routes/routes :scim)
   "/semantic-search"              (premium-handler metabase-enterprise.semantic-search.api/routes :semantic-search)
   "/security-center"              (premium-handler metabase-enterprise.security-center.api/routes :admin-security-center)
   "/serialization"                (premium-handler metabase-enterprise.serialization.api/routes :serialization)
   "/stale"                        (premium-handler metabase-enterprise.stale.api/routes :collection-cleanup)
   "/support-access-grant" (premium-handler metabase-enterprise.support-access-grants.api/routes :support-users)
   "/tenant"                       (premium-handler metabase-enterprise.tenants.api/routes :tenants)
   "/upload-management"            (premium-handler metabase-enterprise.upload-management.api/routes :upload-management)})
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
