(ns metabase-enterprise.embedding-hub.api
  (:require
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.appearance.core :as appearance]
   [metabase.audit-app.core :as audit]
   [metabase.embedding.settings :as embedding.settings]
   [metabase.premium-features.core :as premium-features]
   [toucan2.core :as t2]))

(defn- has-user-added-database? []
  (or (t2/exists? :model/Database {:where [:and
                                           [:= :is_sample false]
                                           [:= :is_audit false]]})
      ;; check for CSV uploads to sample db
      ;; as the sample db is excluded from the above query
      (when-let [sample-db-id (t2/select-one-pk :model/Database :is_sample true)]
        (t2/exists? :model/Table {:where [:and
                                          [:= :active true]
                                          [:= :is_upload true]
                                          [:= :db_id sample-db-id]]}))))

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

(defn- has-configured-sso? []
  (or (and (premium-features/has-feature? :sso-jwt) (sso-settings/jwt-enabled) (sso-settings/jwt-configured))
      (and (premium-features/has-feature? :sso-saml) (sso-settings/saml-enabled) (sso-settings/saml-configured))))

(defn- has-user-created-models? []
  (t2/exists? :model/Card {:where [:and
                                   [:= :type "model"]
                                   [:= :archived false]
                                   [:or
                                    [:not-in :collection_id [(:id (audit/default-audit-collection)) {:select :id
                                                                                                     :from   [(t2/table-name :model/Collection)]
                                                                                                     :where  [:= :is_sample true]}]]
                                    [:is :collection_id nil]]]}))

(defn- embedding-hub-checklist []
  {"add-data"                      (has-user-added-database?)
   "create-dashboard"              (has-user-created-dashboard?)
   "create-models"                 (has-user-created-models?)
   "configure-row-column-security" (has-configured-sandboxes?)
   "create-test-embed"             (embedding.settings/embedding-hub-test-embed-snippet-created)
   "embed-production"              (embedding.settings/embedding-hub-production-embed-snippet-created)
   "secure-embeds"                 (has-configured-sso?)})

(api.macros/defendpoint :get "/checklist"
  "Get the embedding hub checklist status, indicating which setup steps have been completed."
  []
  (embedding-hub-checklist))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/embedding-hub` routes."
  (api.macros/ns-handler *ns* +auth))
