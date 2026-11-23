(ns metabase.dashboards.models.dashboard-tab
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.change-log.core :as change-log]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

;;; -------------------------------------------------- Model setup ---------------------------------------------------

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
  "Insert the DashboardTab `rows` and return the inserted instances, in the order of the rows."
  [rows :- [:sequential ::dashboards.schema/dashboard-tab.create]]
  (dashboards.db/insert-dashboard-tabs! rows))

(mu/defn update-dashboard-tabs! :- [:sequential :map]
  "Apply the columns of each of `rows`, each holding the `:id` of its DashboardTab, and return the rows of the tabs
  that exist."
  [rows :- [:sequential ::dashboards.schema/dashboard-tab.update]]
  (let [stored (m/index-by :id (if (seq rows) (dashboards.db/dashboard-tabs-by-ids (mapv :id rows)) []))
        rows   (filterv #(contains? stored (:id %)) rows)]
    (doseq [{:keys [id] :as row} rows
            :let [changes (dissoc row :id)]
            :when (seq changes)]
      (dashboards.db/update-dashboard-tabs! [id] changes))
    rows))

(mu/defn delete-dashboard-tabs! :- :nil
  "Delete the DashboardTabs with `ids`, logging to the change log the PulseCards that the database deletes with their
  DashboardCards."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (change-log/log-changes! :model/PulseCard :delete (dashboards.db/pulse-cards-in-tabs (vec ids)))
    (dashboards.db/delete-dashboard-tabs! (vec ids)))
  nil)

(mr/def ::tab-replacement
  "The tabs `:current-tabs` of the Dashboard with `:dashboard_id` and the `:new-tabs` that replace them."
  [:map {:closed true}
   [:dashboard_id ms/PositiveInt]
   [:current-tabs [:maybe [:sequential :map]]]
   [:new-tabs     [:maybe [:sequential :map]]]])

(mu/defn replace-dashboard-tabs! :- [:sequential [:map {:closed true}
                                                  [:old->new-tab-id [:maybe [:map-of :int ms/PositiveInt]]]
                                                  [:created-tab-ids [:sequential ms/PositiveInt]]
                                                  [:updated-tab-ids [:sequential ms/PositiveInt]]
                                                  [:deleted-tab-ids [:sequential :int]]
                                                  [:total-num-tabs  :int]]]
  "Given the `:current-tabs` and the `:new-tabs` of each of `replacements`, delete, create and update the tabs that
  differ, with one statement for each of them. Returns, for each of `replacements`, in order:
  - `:old->new-tab-id`: a map from the ids of the tabs of its `:new-tabs` that were created to their new ids
  - `:created-tab-ids`, `:updated-tab-ids`, `:deleted-tab-ids`
  - `:total-num-tabs`: the total number of active tabs of its Dashboard after the operation."
  [replacements :- [:sequential ::tab-replacement]]
  (let [update-ks [:name :position]
        diffs     (mapv (fn [{:keys [current-tabs new-tabs]}] (u/row-diff current-tabs new-tabs)) replacements)
        deleted   (into [] (mapcat (fn [diff] (map :id (:to-delete diff)))) diffs)
        _         (delete-dashboard-tabs! deleted)
        created   (vec (create-dashboard-tabs!
                        (vec (mapcat (fn [{:keys [dashboard_id]} diff]
                                       (map #(-> % (dissoc :id) (assoc :dashboard_id dashboard_id)) (:to-create diff)))
                                     replacements diffs))))
        changed   (mapv (fn [{:keys [current-tabs]} diff]
                          (let [id->current-tab (m/index-by :id current-tabs)]
                            (into []
                                  (keep (fn [tab]
                                          (let [current (get id->current-tab (:id tab))
                                                changes (into {} (filter (fn [[k v]] (not= v (get current k)))) (select-keys tab update-ks))]
                                            (when (seq changes)
                                              (assoc changes :id (:id tab))))))
                                  (:to-update diff))))
                        replacements diffs)]
    (update-dashboard-tabs! (into [] cat changed))
    (mapv (fn [diff changed offset]
            (let [to-create       (:to-create diff)
                  new-tabs        (subvec created offset (+ offset (count to-create)))
                  old->new-tab-id (when (seq new-tabs)
                                    (zipmap (map :id to-create) (map :id new-tabs)))]
              {:old->new-tab-id old->new-tab-id
               :updated-tab-ids (mapv :id changed)
               :created-tab-ids (vec (vals old->new-tab-id))
               :deleted-tab-ids (mapv :id (:to-delete diff))
               :total-num-tabs  (reduce + (map count [to-create (:to-update diff)]))}))
          diffs
          changed
          (reductions + 0 (map (comp count :to-create) diffs)))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DashboardTab [_model]
  {:skip? false})

(defmethod serialization/spec :model/DashboardTab [_]
  {:schema    ::dashboards.schema/external-dashboard-tab
   :copy      [:entity_id :name :position]
   :parent    {:model :model/Dashboard :key :dashboard_id :order (juxt :position :entity_id)}
   :insert!   create-dashboard-tabs!
   :update!   update-dashboard-tabs!
   :delete!   delete-dashboard-tabs!
   :transform {:dashboard_id serialization/import-only-transform}})

(defmethod remote-sync/spec :model/DashboardTab
  [_model]
  {:synced-filter-clause dashboards.db/synced-dashboard-tabs-clause})

(defmethod eid-translation/spec :model/DashboardTab [_model]
  {:names [:dashboard-tab]})
