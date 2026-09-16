(ns metabase-enterprise.embedding-hub.api
  (:require
   [metabase-enterprise.embedding-hub.db :as embedding-hub.db]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.appearance.core :as appearance]
   [metabase.audit-app.core :as audit]
   [metabase.embedding.settings :as embedding.settings]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]))

(defn- has-user-added-database? []
  (or (embedding-hub.db/user-database-exists?)
      ;; check for CSV uploads to sample db
      ;; as the sample db is excluded from the above query
      (when-let [sample-db-id (embedding-hub.db/sample-database-id)]
        (embedding-hub.db/upload-table-exists-in-database? sample-db-id))))

(defn- has-user-created-dashboard? []
  (let [example-dashboard-id (appearance/example-dashboard-id)
        audit-collection-ids (filter some? [(when-let [audit-coll (audit/default-audit-collection)] (:id audit-coll))
                                            (when-let [custom-coll (audit/default-custom-reports-collection)] (:id custom-coll))])]
    (embedding-hub.db/user-dashboard-exists? example-dashboard-id audit-collection-ids)))

(defn- has-configured-sandboxes? []
  (and (premium-features/has-feature? :sandboxes)
       (embedding-hub.db/sandbox-exists?)))

(defn- has-configured-sso? []
  (or (and (premium-features/has-feature? :sso-jwt) (sso-settings/jwt-enabled-and-configured))
      (and (premium-features/has-feature? :sso-saml) (sso-settings/saml-enabled) (sso-settings/saml-configured))))

(defn- has-user-created-models? []
  (embedding-hub.db/user-model-exists? (:id (audit/default-audit-collection))))

(defn- has-user-created-tenants? []
  (embedding-hub.db/active-tenant-exists?))

(defn- has-shared-tenant-collections? []
  (embedding-hub.db/shared-tenant-collection-exists?))

(defn- shared-collection-has-dashboards? []
  (when-let [shared-coll-id (embedding-hub.db/shared-tenant-collection-id)]
    (embedding-hub.db/unarchived-dashboard-exists-in-collection? shared-coll-id)))

(defn- has-configured-data-segregation-strategy? []
  ;; Check if any of the 3 data segregation strategies are enabled:
  ;; 1. Row and Column Level Security (Sandboxing)
  ;; 2. Connection Impersonation
  ;; 3. Database Routing
  (or (has-configured-sandboxes?)
      (embedding-hub.db/impersonation-exists?)
      (embedding-hub.db/database-router-exists?)))

(defn- active-data-segregation-strategy []
  (cond
    (has-configured-sandboxes?)              "row-column-level-security"
    (embedding-hub.db/impersonation-exists?) "connection-impersonation"
    (embedding-hub.db/database-router-exists?)       "database-routing"
    :else                                    nil))

(defn- has-published-guest-embed? []
  ;; Check if at least one card or dashboard has embedding enabled (is published as a guest embed)
  (or (embedding-hub.db/embedded-card-exists?)
      (embedding-hub.db/embedded-dashboard-exists?)))

(defn- embedding-hub-checklist []
  (let [enable-tenants?                  (and (perms/use-tenants)
                                              (has-shared-tenant-collections?))
        create-tenants?                  (has-user-created-tenants?)
        setup-data-segregation-strategy? (has-configured-data-segregation-strategy?)]
    {"checklist"
     {;; for the main embedding hub checklist
      "add-data"                          (has-user-added-database?)
      "create-dashboard"                  (has-user-created-dashboard?)
      "create-models"                     (has-user-created-models?)
      "configure-row-column-security"     (has-configured-sandboxes?)
      "create-test-embed"                 (or (has-published-guest-embed?)
                                              (embedding.settings/embedding-hub-test-embed-snippet-created))
      "embed-production"                  (embedding.settings/embedding-hub-production-embed-snippet-created)
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

(def ^:private EmbeddingHubChecklistResponse
  "Schema for the embedding hub checklist response."
  [:map {:closed true}
   ["checklist"
    [:map {:closed true}
     ["add-data"                             :boolean]
     ["create-dashboard"                     :boolean]
     ["create-models"                        :boolean]
     ["configure-row-column-security"        :boolean]
     ["create-test-embed"                    :boolean]
     ["embed-production"                     :boolean]
     ["sso-configured"                       :boolean]
     ["data-permissions-and-enable-tenants"  :boolean]
     ["enable-tenants"                       :boolean]
     ["move-dashboard-to-shared"             :boolean]
     ["create-tenants"                       :boolean]
     ["setup-data-segregation-strategy"      :boolean]
     ["sso-auth-manual-tested"               :boolean]]]
   ["data-isolation-strategy"
    [:maybe [:enum "row-column-level-security" "connection-impersonation" "database-routing"]]]])

(api.macros/defendpoint :get "/checklist" :- EmbeddingHubChecklistResponse
  "Get the embedding hub checklist status, indicating which setup steps have been completed."
  []
  (embedding-hub-checklist))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/embedding-hub` routes."
  (api.macros/ns-handler *ns* +auth))
