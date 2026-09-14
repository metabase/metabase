(ns metabase.embedding-hub.api
  "Checklist state for the setup guide. Named for the embedding hub because that is the API path
  (`/api/embedding-hub/checklist`); the UI it serves is the setup guide."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.appearance.core :as appearance]
   [metabase.audit-app.core :as audit]
   [metabase.config.core :as config]
   [metabase.embedding-hub.db :as embedding-hub.db]
   [metabase.embedding.settings :as embedding.settings]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]))

(defn- has-user-added-database? []
  ;; `boolean`, because the trailing `when-let` yields nil on an instance with no sample database,
  ;; and the response schema requires a boolean.
  (boolean
   (or (embedding-hub.db/user-added-database?)
       ;; check for CSV uploads to sample db
       ;; as the sample db is excluded from the above query
       (when-let [sample-db-id (embedding-hub.db/sample-database-id)]
         (embedding-hub.db/uploaded-table? sample-db-id)))))

(defn- has-user-created-dashboard? []
  (let [example-dashboard-id (appearance/example-dashboard-id)
        audit-collection-ids (filter some? [(when-let [audit-coll (audit/default-audit-collection)] (:id audit-coll))
                                            (when-let [custom-coll (audit/default-custom-reports-collection)] (:id custom-coll))])]
    (embedding-hub.db/user-created-dashboard? example-dashboard-id audit-collection-ids)))

(defn- has-configured-sandboxes? []
  (and (premium-features/has-feature? :sandboxes)
       (embedding-hub.db/sandbox?)))

(defenterprise has-configured-sso?
  "Whether JWT or SAML is licensed, enabled and configured. The JWT and SAML settings are enterprise-only, so a
  community build has nothing to configure and always reports false."
  metabase-enterprise.embedding-hub.api
  []
  false)

(defn- has-user-created-models? []
  (embedding-hub.db/user-created-model? (:id (audit/default-audit-collection))))

(defn- has-user-created-tenants? []
  ;; config/ee-available? guards the enterprise-only models below: resolving one requires a
  ;; namespace a community build does not ship
  (and config/ee-available?
       (embedding-hub.db/active-tenant?)))

(defn- has-shared-tenant-collections? []
  (embedding-hub.db/shared-tenant-collection?))

(defn- shared-collection-has-dashboards? []
  (when-let [shared-coll-id (embedding-hub.db/shared-tenant-collection-id)]
    (embedding-hub.db/dashboard-in-collection? shared-coll-id)))

(defn- has-configured-data-segregation-strategy? []
  ;; Any data segregation strategy: row and column level security (sandboxing), connection
  ;; impersonation, or database routing.
  (or (has-configured-sandboxes?)
      (and config/ee-available? (embedding-hub.db/connection-impersonation?))
      (and config/ee-available? (embedding-hub.db/database-router?))))

(defn- active-data-segregation-strategy []
  (cond
    (has-configured-sandboxes?)                                              "row-column-level-security"
    (and config/ee-available? (embedding-hub.db/connection-impersonation?))  "connection-impersonation"
    (and config/ee-available? (embedding-hub.db/database-router?))           "database-routing"
    :else                                                                    nil))

(defn- has-published-guest-embed? []
  ;; Check if at least one card or dashboard has embedding enabled (is published as a guest embed)
  (or (embedding-hub.db/embedding-enabled-card?)
      (embedding-hub.db/embedding-enabled-dashboard?)))

(defn- has-created-custom-theme? []
  ;; `is_default` marks the Light/Dark themes Metabase seeds; anything else is
  ;; the admin's own. Themes seeded before the flag existed are unmarked, so they read as custom --
  ;; accepted rather than backfilled, since nothing can identify them retroactively.
  (embedding-hub.db/custom-embedding-theme?))

(defn- has-configured-ai? []
  ;; Both halves: credentials for the chosen provider, and embedded Metabot
  ;; actually switched on. `embedded-metabot-enabled?` defaults to true, so on
  ;; its own it would report a fresh instance as done.
  (boolean
   (and (metabot.settings/llm-metabot-configured?)
        (metabot.settings/embedded-metabot-enabled?))))

(defn- setup-guide-checklist []
  (let [enable-tenants?                  (and (perms/use-tenants)
                                              (has-shared-tenant-collections?))
        create-tenants?                  (has-user-created-tenants?)
        setup-data-segregation-strategy? (has-configured-data-segregation-strategy?)]
    {"checklist"
     {;; for the main setup guide checklist
      "add-data"                          (has-user-added-database?)
      "create-dashboard"                  (has-user-created-dashboard?)
      "create-models"                     (has-user-created-models?)
      "configure-row-column-security"     (has-configured-sandboxes?)
      "create-test-embed"                 (or (has-published-guest-embed?)
                                              (embedding.settings/embedding-hub-test-embed-snippet-created))
      "embed-production"                  (embedding.settings/embedding-hub-production-embed-snippet-created)
      "create-custom-theme"               (has-created-custom-theme?)
      "configure-ai"                      (has-configured-ai?)
      "data-permissions-and-enable-tenants" (and enable-tenants?
                                                 create-tenants?
                                                 setup-data-segregation-strategy?)

      ;; for the "configure data permissions and enable tenants" sub-checklist page
      "enable-tenants"                    enable-tenants?
      "move-dashboard-to-shared"          (boolean (shared-collection-has-dashboards?))
      "create-tenants"                    create-tenants?
      "setup-data-segregation-strategy"   setup-data-segregation-strategy?

      ;; for the "configure SSO" sub-checklist page
      "sso-configured"                    (has-configured-sso?)
      "sso-auth-manual-tested"            (embedding.settings/embedding-hub-sso-auth-manual-tested)}

     "data-isolation-strategy"           (active-data-segregation-strategy)}))

(def ^:private SetupGuideChecklistResponse
  "Schema for the setup guide checklist response."
  [:map {:closed true}
   ["checklist"
    [:map {:closed true}
     ["add-data"                             :boolean]
     ["create-dashboard"                     :boolean]
     ["create-models"                        :boolean]
     ["configure-row-column-security"        :boolean]
     ["create-test-embed"                    :boolean]
     ["embed-production"                     :boolean]
     ["create-custom-theme"                  :boolean]
     ["configure-ai"                         :boolean]
     ["sso-configured"                       :boolean]
     ["data-permissions-and-enable-tenants"  :boolean]
     ["enable-tenants"                       :boolean]
     ["move-dashboard-to-shared"             :boolean]
     ["create-tenants"                       :boolean]
     ["setup-data-segregation-strategy"      :boolean]
     ["sso-auth-manual-tested"               :boolean]]]
   ["data-isolation-strategy"
    [:maybe [:enum "row-column-level-security" "connection-impersonation" "database-routing"]]]])

(api.macros/defendpoint :get "/checklist" :- SetupGuideChecklistResponse
  "Get the setup guide checklist status, indicating which setup steps have been completed."
  []
  ;; The checklist reports instance setup state, so it is admin-only. Stated here because no premium
  ;; gate stands in front of the route -- the guide has to work unlicensed.
  (api/check-superuser)
  (setup-guide-checklist))

(def ^{:arglists '([request respond raise])} routes
  "`/api/embedding-hub` routes."
  (api.macros/ns-handler *ns* +auth))
