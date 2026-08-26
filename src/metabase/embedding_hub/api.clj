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
   [metabase.embedding.settings :as embedding.settings]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [toucan2.core :as t2]))

(defn- has-user-added-database? []
  ;; `boolean`, because the trailing `when-let` yields nil on an instance with no sample database,
  ;; and the response schema requires a boolean.
  (boolean
   (or (t2/exists? :model/Database {:where [:and
                                            [:= :is_sample false]
                                            [:= :is_audit false]]})
       ;; check for CSV uploads to sample db
       ;; as the sample db is excluded from the above query
       (when-let [sample-db-id (t2/select-one-pk :model/Database :is_sample true)]
         (t2/exists? :model/Table {:where [:and
                                           [:= :active true]
                                           [:= :is_upload true]
                                           [:= :db_id sample-db-id]]})))))

(defn- has-user-created-dashboard? []
  (let [example-dashboard-id (appearance/example-dashboard-id)
        audit-collection-ids (filter some? [(when-let [audit-coll (audit/default-audit-collection)] (:id audit-coll))
                                            (when-let [custom-coll (audit/default-custom-reports-collection)] (:id custom-coll))])]
    (t2/exists? :model/Dashboard {:where (cond-> [:and
                                                  [:= :archived false]]
                                           example-dashboard-id (conj [:not= :id example-dashboard-id])
                                           (seq audit-collection-ids) (conj [:or
                                                                             [:is :collection_id nil]
                                                                             [:not-in :collection_id audit-collection-ids]]))})))

(defn- has-configured-sandboxes? []
  (and (premium-features/has-feature? :sandboxes)
       (t2/exists? :model/Sandbox)))

(defenterprise has-configured-sso?
  "Whether JWT or SAML is licensed, enabled and configured. The JWT and SAML settings are enterprise-only, so a
  community build has nothing to configure and always reports false."
  metabase-enterprise.embedding-hub.api
  []
  false)

(defn- has-user-created-models? []
  (t2/exists? :model/Card {:where [:and
                                   [:= :type "model"]
                                   [:= :archived false]
                                   [:or
                                    [:and
                                     [:!= :collection_id (:id (audit/default-audit-collection))]
                                     [:not [:exists ^:allow-subquery
                                            {:select [1]
                                             :from   [[(t2/table-name :model/Collection) :sample_coll]]
                                             :where  [:and
                                                      [:= :sample_coll.is_sample true]
                                                      [:= :sample_coll.id :report_card.collection_id]]}]]]
                                    [:is :collection_id nil]]]}))

(defn- has-user-created-tenants? []
  ;; config/ee-available? guards the enterprise-only models below: resolving one requires a
  ;; namespace a community build does not ship
  (and config/ee-available?
       (t2/exists? :model/Tenant :is_active true)))

(defn- has-shared-tenant-collections? []
  (t2/exists? :model/Collection {:where [:and
                                         [:= :namespace "shared-tenant-collection"]
                                         [:= :archived false]]}))

(defn- shared-collection-has-dashboards? []
  (when-let [shared-coll-id (t2/select-one-pk :model/Collection {:where [:and
                                                                         [:= :namespace "shared-tenant-collection"]
                                                                         [:= :archived false]]})]
    (t2/exists? :model/Dashboard {:where [:and
                                          [:= :collection_id shared-coll-id]
                                          [:= :archived false]]})))

(defn- has-configured-data-segregation-strategy? []
  ;; Any data segregation strategy: row and column level security (sandboxing), connection
  ;; impersonation, or database routing.
  (or (has-configured-sandboxes?)
      (and config/ee-available? (t2/exists? :model/ConnectionImpersonation))
      (and config/ee-available? (t2/exists? :model/DatabaseRouter))))

(defn- active-data-segregation-strategy []
  (cond
    (has-configured-sandboxes?)                                              "row-column-level-security"
    (and config/ee-available? (t2/exists? :model/ConnectionImpersonation))   "connection-impersonation"
    (and config/ee-available? (t2/exists? :model/DatabaseRouter))            "database-routing"
    :else                                                                    nil))

(defn- has-published-guest-embed? []
  ;; Check if at least one card or dashboard has embedding enabled (is published as a guest embed)
  (or (t2/exists? :model/Card :enable_embedding true)
      (t2/exists? :model/Dashboard :enable_embedding true)))

(defn- has-created-custom-theme? []
  ;; `is_default` marks the Light/Dark themes Metabase seeds; anything else is
  ;; the admin's own. Themes seeded before the flag existed are unmarked, so they read as custom --
  ;; accepted rather than backfilled, since nothing can identify them retroactively.
  (t2/exists? :model/EmbeddingTheme :is_default false))

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
