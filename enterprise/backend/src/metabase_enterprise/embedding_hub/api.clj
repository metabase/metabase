(ns metabase-enterprise.embedding-hub.api
  (:require
   [metabase-enterprise.sso.settings :as sso]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.appearance.core :as appearance]
   [metabase.audit-app.core :as audit]
   [metabase.embedding.settings :as embedding.settings]
   [metabase.premium-features.core :as premium-features]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- has-user-added-database? []
  (t2/exists? :model/Database {:where [:and
                                       [:= :is_sample false]
                                       [:= :is_audit false]]}))

(defn- has-user-created-dashboard? []
  (let [example-dashboard-id (appearance/example-dashboard-id)
        audit-collection-ids (filter some? [(when-let [audit-coll (audit/default-audit-collection)] (:id audit-coll))
                                            (when-let [custom-coll (audit/default-custom-reports-collection)] (:id custom-coll))])
        where-clause [:and
                      [:= :archived false]
                      (when example-dashboard-id [:not= :id example-dashboard-id])
                      (when (seq audit-collection-ids) [:not-in :collection_id audit-collection-ids])]
        where-clause (filterv some? where-clause)]
    (t2/exists? :model/Dashboard {:where where-clause})))

(defn- has-configured-sandboxes? []
  (boolean
   (and (premium-features/has-feature? :sandboxes)
        (try
          (t2/exists? :model/GroupTableAccessPolicy)
          (catch Throwable _ false)))))

(defn- has-configured-sso? []
  (boolean (or (and (premium-features/has-feature? :sso-jwt) (sso/jwt-enabled) (sso/jwt-configured))
               (and (premium-features/has-feature? :sso-saml) (sso/saml-enabled) (sso/saml-configured)))))

(defn- embedding-hub-checklist []
  {"add-data" (has-user-added-database?)
   "create-dashboard" (has-user-created-dashboard?)
   "configure-row-column-security" (has-configured-sandboxes?)
   "create-test-embed" (boolean (embedding.settings/embedding-hub-test-embed-snippet-created))
   "embed-production" (boolean (embedding.settings/embedding-hub-production-embed-snippet-created))
   "secure-embeds" (boolean (has-configured-sso?))})

(api.macros/defendpoint :get "/checklist"
  "Get the embedding hub checklist status, indicating which setup steps have been completed."
  []
  (embedding-hub-checklist))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/embedding-hub` routes."
  (api.macros/ns-handler *ns* +auth))
