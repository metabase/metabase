(ns metabase.embedding-hub.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.audit-app.core :as audit]
   [metabase.appearance.settings :as appearance.settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- has-user-added-database? []
  "Check if there are any databases other than the sample database and internal audit database."
  (t2/exists? :model/Database {:where [:and
                                       [:= :is_sample false]
                                       [:= :is_audit false]]}))

(defn- has-user-created-dashboard? []
  "Check if there are any dashboards other than the example dashboard and audit dashboards."
  (let [example-dashboard-id (appearance.settings/example-dashboard-id)
        audit-collection-ids (filter some? [(when-let [audit-coll (audit/default-audit-collection)] (:id audit-coll))
                                            (when-let [custom-coll (audit/default-custom-reports-collection)] (:id custom-coll))])
        where-clause [:and
                      [:= :archived false]
                      (when example-dashboard-id [:not= :id example-dashboard-id])
                      (when (seq audit-collection-ids) [:not-in :collection_id audit-collection-ids])]
        where-clause (filterv some? where-clause)]
    (t2/exists? :model/Dashboard {:where where-clause})))

(defn- embedding-hub-checklist []
  "Return checklist of embedding hub steps and their completion status."
  { "add-data" (has-user-added-database?)
    "create-dashboard" (has-user-created-dashboard?)})

(api.macros/defendpoint :get "/checklist"
  "Return embedding hub checklist steps and whether they've been completed."
  []
  (embedding-hub-checklist))
