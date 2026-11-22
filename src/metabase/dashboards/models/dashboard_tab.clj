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

(mu/defn create-dashboard-tabs! :- [:sequential :map]
  "Insert the DashboardTab `rows` and return the inserted instances, in the order of the rows, publishing their create
  event."
  ([rows :- [:sequential ::dashboards.schema/dashboard-tab.create]]
   (create-dashboard-tabs! rows nil))
  ([rows :- [:sequential ::dashboards.schema/dashboard-tab.create]
    opts :- ::dashboards.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [tabs (dashboards.db/insert-dashboard-tabs! rows)]
       (events/publish-event! :event/dashboard-tab-create (events/create-event tabs (events/context opts)))
       tabs))))

(mu/defn update-dashboard-tabs! :- [:sequential :map]
  "Apply the columns of each of `rows`, each holding the `:id` of its DashboardTab, publishing the update event of the
  tabs, and return the rows of the tabs that exist."
  ([rows :- [:sequential ::dashboards.schema/dashboard-tab.update-row]]
   (update-dashboard-tabs! rows nil))
  ([rows :- [:sequential ::dashboards.schema/dashboard-tab.update-row]
    opts :- ::dashboards.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [stored (m/index-by :id (if (seq rows) (dashboards.db/dashboard-tabs-by-ids (mapv :id rows)) []))
           rows   (filterv #(contains? stored (:id %)) rows)]
       (doseq [[changes group] (group-by #(dissoc % :id) rows)]
         (dashboards.db/update-dashboard-tabs! (mapv :id group) changes))
       (events/publish-event! :event/dashboard-tab-update
                              (events/update-event stored rows {:context (events/context opts)}))
       rows))))

(mu/defn delete-dashboard-tabs! :- :nil
  "Delete the DashboardTabs with `ids`, publishing their delete event right before the statement."
  ([ids :- [:sequential ms/PositiveInt]]
   (delete-dashboard-tabs! ids nil))
  ([ids  :- [:sequential ms/PositiveInt]
    opts :- ::dashboards.schema/write-opts]
   (when (seq ids)
     (t2/with-transaction [_conn]
       (let [tabs (dashboards.db/dashboard-tabs-by-ids (vec ids))]
         (events/publish-event! :event/dashboard-tab-delete (events/delete-event tabs (events/context opts)))
         (dashboards.db/delete-dashboard-tabs! (mapv :id tabs)))))
   nil))

(mu/defn replace-dashboard-tabs! :- [:map
                                     [:old->new-tab-id [:maybe [:map-of :int ms/PositiveInt]]]
                                     [:created-tab-ids [:sequential ms/PositiveInt]]
                                     [:updated-tab-ids [:sequential ms/PositiveInt]]
                                     [:deleted-tab-ids [:sequential :int]]
                                     [:total-num-tabs  :int]]
  "Given the `current-tabs` of the Dashboard with `dashboard-id` and its `new-tabs`, delete, create and update the tabs
  that differ. Returns:
  - `:old->new-tab-id`: a map from the ids of the tabs of `new-tabs` that were created to their new ids
  - `:created-tab-ids`, `:updated-tab-ids`, `:deleted-tab-ids`
  - `:total-num-tabs`: the total number of active tabs after the operation."
  ([dashboard-id :- ms/PositiveInt
    current-tabs :- [:maybe [:sequential :map]]
    new-tabs     :- [:maybe [:sequential :map]]]
   (replace-dashboard-tabs! dashboard-id current-tabs new-tabs nil))
  ([dashboard-id :- ms/PositiveInt
    current-tabs :- [:maybe [:sequential :map]]
    new-tabs     :- [:maybe [:sequential :map]]
    opts         :- ::dashboards.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [{:keys [to-create to-update to-delete]} (u/row-diff current-tabs new-tabs)
           id->current-tab (m/index-by :id current-tabs)
           update-ks       [:name :position]
           to-delete-ids   (mapv :id to-delete)
           _               (delete-dashboard-tabs! to-delete-ids opts)
           created         (create-dashboard-tabs! (mapv #(-> % (dissoc :id) (assoc :dashboard_id dashboard-id)) to-create)
                                                   opts)
           old->new-tab-id (when (seq created)
                             (zipmap (map :id to-create) (map :id created)))
           changed         (into []
                                 (comp (filter #(not= (select-keys (get id->current-tab (:id %)) update-ks)
                                                      (select-keys % update-ks)))
                                       (map #(assoc (select-keys % update-ks) :id (:id %))))
                                 to-update)]
       (update-dashboard-tabs! changed opts)
       {:old->new-tab-id old->new-tab-id
        :updated-tab-ids (mapv :id changed)
        :created-tab-ids (vec (vals old->new-tab-id))
        :deleted-tab-ids to-delete-ids
        :total-num-tabs  (reduce + (map count [to-create to-update]))}))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DashboardTab [_model]
  {:skip? false})

(defmethod serialization/spec :model/DashboardTab [_]
  {:schema    ::dashboards.schema/external-dashboard-tab
   :copy      [:entity_id :name :position]
   :parent    {:model :model/Dashboard :key :dashboard_id :order (juxt :position :entity_id)}
   :insert!   #(create-dashboard-tabs! % {:writer :import})
   :update!   #(update-dashboard-tabs! % {:writer :import})
   :delete!   #(delete-dashboard-tabs! % {:writer :import})
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
