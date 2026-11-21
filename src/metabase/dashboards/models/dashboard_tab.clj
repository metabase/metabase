(ns metabase.dashboards.models.dashboard-tab
  (:require
   [medley.core :as m]
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
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

;;; ------------------------------------------------------ Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/DashboardTab [_model] :dashboard_tab)

(doto :model/DashboardTab
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

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

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-dashboard-tabs* :- [:map [:tabs [:sequential :map]] [:events events/Events]]
  "Insert the DashboardTab `rows`, returning the inserted instances in the order of the rows as `:tabs` and their create
  event as `:events`, which the caller publishes."
  [rows :- [:sequential ::dashboards.schema/dashboard-tab.create]]
  (let [tabs (dashboards.db/insert-dashboard-tabs! rows)]
    {:tabs   tabs
     :events [(events/created :event/dashboard-tab-create tabs)]}))

(mu/defn create-dashboard-tabs! :- [:sequential ms/PositiveInt]
  "Insert the DashboardTab `rows` and return their ids, in the order of the rows, publishing their events."
  [rows :- [:sequential ::dashboards.schema/dashboard-tab.create]]
  (t2/with-transaction [_conn]
    (let [{:keys [tabs events]} (create-dashboard-tabs* rows)]
      (events/publish-lifecycle! events)
      (mapv :id tabs))))

(mu/defn- update-changed-tabs* :- [:map [:events events/Events]]
  "Update the name and the position of each of `new-tabs` that differ from its tab in `current-tabs`, returning the
  update event as `:events`."
  [dashboard-id  :- ms/PositiveInt
   current-tabs  :- [:sequential :map]
   new-tabs      :- [:sequential ::dashboards.schema/dashboard-tab]]
  (let [update-ks       [:name :position]
        id->current-tab (m/index-by :id current-tabs)
        changed         (filterv (fn [tab]
                                   (not= (select-keys (get id->current-tab (:id tab)) update-ks)
                                         (select-keys tab update-ks)))
                                 new-tabs)
        previous        (mapv #(t2/instance :model/DashboardTab (assoc (get id->current-tab (:id %)) :dashboard_id dashboard-id))
                              changed)
        objects         (mapv (fn [tab before]
                                (let [changes (select-keys tab update-ks)]
                                  (dashboards.db/update-dashboard-tab! (:id tab) changes)
                                  (events/updated-row before changes)))
                              changed previous)]
    {:events [(events/updated :event/dashboard-tab-update previous objects)]}))

(mu/defn update-tabs* :- [:map
                          [:old->new-tab-id [:maybe [:map-of :int ms/PositiveInt]]]
                          [:created-tab-ids [:sequential ms/PositiveInt]]
                          [:deleted-tab-ids [:sequential :int]]
                          [:total-num-tabs  :int]
                          [:events          events/Events]]
  "Given the `current-tabs` of the Dashboard with `dashboard-id` and its `new-tabs`, create, update and delete the tabs
  that differ. Returns:
  - `:old->new-tab-id`: a map from the ids of the tabs of `new-tabs` that were created to their new ids
  - `:created-tab-ids`, `:deleted-tab-ids`
  - `:total-num-tabs`: the total number of active tabs after the operation
  - `:events`: the events of the writes, which the caller publishes."
  [dashboard-id :- ms/PositiveInt
   current-tabs :- [:maybe [:sequential :map]]
   new-tabs     :- [:maybe [:sequential :map]]]
  (let [{:keys [to-create to-update to-delete]} (u/row-diff current-tabs new-tabs)
        to-delete-ids   (mapv :id to-delete)
        deleted         (when (seq to-delete)
                          (events/deleted :event/dashboard-tab-delete :model/DashboardTab
                                          (dashboards.db/dashboard-tabs-by-ids to-delete-ids)))
        _               (when (seq to-delete)
                          (dashboards.db/delete-dashboard-tabs! to-delete-ids))
        created         (when (seq to-create)
                          (create-dashboard-tabs* (->> to-create
                                                       (map #(dissoc % :id))
                                                       (map #(assoc % :dashboard_id dashboard-id)))))
        old->new-tab-id (when created
                          (zipmap (map :id to-create) (map :id (:tabs created))))
        updated         (when (seq to-update)
                          (update-changed-tabs* dashboard-id current-tabs to-update))]
    {:old->new-tab-id old->new-tab-id
     :created-tab-ids (vec (vals old->new-tab-id))
     :deleted-tab-ids to-delete-ids
     :total-num-tabs  (reduce + (map count [to-create to-update]))
     :events          (-> []
                          (into (some-> deleted vector))
                          (into (:events created))
                          (into (:events updated)))}))

(defn- insert-imported-dashboard-tabs!
  "Insert the DashboardTab `rows` of an import, keeping their entity ids, and return the inserted instances."
  [rows]
  (t2/with-transaction [_conn]
    (u/prog1 (dashboards.db/insert-dashboard-tabs! rows)
      (events/publish-lifecycle! [(events/created :event/dashboard-tab-create <>)]))))

(defn- update-imported-dashboard-tabs!
  "Apply the columns of each of `rows`, each holding the `:id` of its DashboardTab, and return the rows of the tabs that
  exist."
  [rows]
  (t2/with-transaction [_conn]
    (let [previous (m/index-by :id (if (seq rows) (dashboards.db/dashboard-tabs-by-ids (mapv :id rows)) []))
          stored   (filterv #(contains? previous (:id %)) rows)
          before   (mapv #(get previous (:id %)) stored)]
      (doseq [[changes group] (group-by #(dissoc % :id) stored)]
        (dashboards.db/update-dashboard-tabs! (mapv :id group) changes))
      (events/publish-lifecycle! [(events/updated :event/dashboard-tab-update
                                                  before
                                                  (mapv (fn [row prev] (events/updated-row prev (dissoc row :id))) stored before))])
      stored)))

(defn- delete-imported-dashboard-tabs!
  "Delete the DashboardTabs with `ids`."
  [ids]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (let [event (events/deleted :event/dashboard-tab-delete :model/DashboardTab (dashboards.db/dashboard-tabs-by-ids (vec ids)))]
        (dashboards.db/delete-dashboard-tabs! (vec ids))
        (events/publish-lifecycle! [event]))))
  nil)

(defn do-update-tabs!
  "Apply `new-tabs` to the Dashboard with `dashboard-id` as [[update-tabs*]] does, publishing the events of the writes,
  and return what it returns but the events."
  [dashboard-id current-tabs new-tabs]
  (t2/with-transaction [_conn]
    (let [result (update-tabs* dashboard-id current-tabs new-tabs)]
      (events/publish-lifecycle! (:events result))
      (dissoc result :events))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DashboardTab [_model]
  {:skip? false})

(defmethod serialization/spec :model/DashboardTab [_]
  {:schema    ::dashboards.schema/external-dashboard-tab
   :copy      [:entity_id :name :position]
   :parent    {:model :model/Dashboard :key :dashboard_id :order (juxt :position :entity_id)}
   :insert!   insert-imported-dashboard-tabs!
   :update!   update-imported-dashboard-tabs!
   :delete!   delete-imported-dashboard-tabs!
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
