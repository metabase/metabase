(ns metabase.dashboards.models.dashboard-tab
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.dependencies.core :as dependencies]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

;;; ------------------------------------------------------ Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/DashboardTab [_model] :dashboard_tab)

(doto :model/DashboardTab
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-update :model/DashboardTab
  [tab]
  (let [changes (t2/changes tab)]
    (when (contains? changes :dashboard_id)
      (throw (ex-info (tru "You cannot move a tab to another dashboard.") {:status-code 400})))
    tab))
;;; --------------------------------------------------- Permissions --------------------------------------------------

(defn- dashboard-collection-ids
  "The id of the Collection, nil for the root, of the Dashboard of each of `tabs`, by Dashboard id, the Dashboards
  loaded together."
  [tabs]
  (run! #(when % (api/check-500 (contains? % :dashboard_id) "No :dashboard_id is set for a DashboardTab.")) tabs)
  (let [ids (into [] (comp (remove nil?) (keep :dashboard_id) (distinct)) tabs)]
    (if (seq ids)
      (into {} (map (juxt :id :collection_id)) (dashboards.db/dashboard-collection-rows ids))
      {})))

(methodical/defmethod t2/batched-hydrate [:model/DashboardTab :can_read]
  "Whether the current user reads each of `tabs`: the content of the Collection of its Dashboard, answered together."
  [_model _k tabs]
  (let [collection-ids (dashboard-collection-ids tabs)
        readable       (collection/content-readable-collection-ids (vals collection-ids)
                                                                   {:root-namespace nil, :audit-rules? false})]
    (for [tab tabs]
      (when tab
        (vary-meta tab assoc :can_read (and (contains? collection-ids (:dashboard_id tab))
                                            (contains? readable (get collection-ids (:dashboard_id tab)))))))))

(methodical/defmethod t2/batched-hydrate [:model/DashboardTab :can_write]
  "Whether the current user writes each of `tabs`: the content of the Collection of its Dashboard, answered together."
  [_model _k tabs]
  (let [collection-ids (dashboard-collection-ids tabs)
        writable       (collection/content-writable-collection-ids (vals collection-ids)
                                                                   {:root-namespace nil, :audit-rules? false})]
    (for [tab tabs]
      (when tab
        (assoc tab :can_write (and (contains? collection-ids (:dashboard_id tab))
                                   (contains? writable (get collection-ids (:dashboard_id tab)))))))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/model-for-automagic-hydration [:metabase.dashboards.models.dashboard-card/DashboardCard :dashboard_tab]
  [_original-model _k]
  :model/DashboardTab)

(methodical/defmethod t2.hydrate/fk-keys-for-automagic-hydration [:metabase.dashboards.models.dashboard-card/DashboardCard :dashboard_tab :default]
  [_original-model _dest-key _hydrating-model]
  [:dashboard_tab_id])

(methodical/defmethod t2.hydrate/batched-hydrate [:default :tab-cards]
  "Given a list of tabs, return a seq of ordered tabs, in which each tabs contain a seq of ordered cards."
  [_model _k tabs]
  (assert (= 1 (count (set (map :dashboard_id tabs)))), "All tabs must belong to the same dashboard")
  (let [dashboard-id      (:dashboard_id (first tabs))
        tab-ids           (map :id tabs)
        dashcards         (dashboards.db/dashcards-in-tabs dashboard-id tab-ids)
        tab-id->dashcards (-> (group-by :dashboard_tab_id dashcards)
                              (update-vals #(sort dashboard-card/dashcard-comparator %)))
        tabs              (sort-by :position tabs)]
    (for [{:keys [id] :as tab} tabs]
      (assoc tab :cards (get tab-id->dashcards id [])))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/DashboardTab
  [_model]
  {:create :event/dashboard-tab-create
   :update :event/dashboard-tab-update
   :delete :event/dashboard-tab-delete})

(defmethod app-db-copy/spec :model/DashboardTab [_model]
  {:skip? false})

(defmethod serialization/spec :model/DashboardTab [_]
  {:schema    ::dashboards.schema/external-dashboard-tab
   :copy      [:entity_id :name :position]
   :parent    {:model :model/Dashboard :key :dashboard_id :order (juxt :position :entity_id)}
   :transform {:dashboard_id serialization/import-only-transform}})

(defmethod remote-sync/spec :model/DashboardTab
  [_model]
  {:synced-filter-clause dashboards.db/synced-dashboard-tabs-clause})

(defmethod revisions/spec :model/DashboardTab [_model]
  {:track  [:name :position :dashboard_id]
   :skip   [:entity_id]
   :parent {:model :model/Dashboard :key :dashboard_id}})

(defmethod dependencies/spec :model/DashboardTab [_model]
  {:part-of      {:type :dashboard :key :dashboard_id}
   :part-columns #{}})

(defmethod eid-translation/spec :model/DashboardTab [_model]
  {:names [:dashboard-tab]})
