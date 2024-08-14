(ns metabase.models.dashboard-tab
  (:require
   [medley.core :as m]
   [metabase.models.dashboard-card :as dashboard-card]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(methodical/defmethod t2/table-name :model/DashboardTab [_model] :dashboard_tab)

(doto :model/DashboardTab
  (derive :metabase/model)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(methodical/defmethod t2/model-for-automagic-hydration [:metabase.models.dashboard-card/DashboardCard :dashboard_tab]
  [_original-model _k]
  :model/DashboardTab)

(methodical/defmethod t2.hydrate/fk-keys-for-automagic-hydration [:metabase.models.dashboard-card/DashboardCard :dashboard_tab :default]
  [_original-model _dest-key _hydrating-model]
  [:dashboard_tab_id])

(methodical/defmethod t2.hydrate/batched-hydrate [:default :tab-cards]
  "Given a list of tabs, return a seq of ordered tabs, in which each tabs contain a seq of ordered cards."
  [_model _k tabs]
  (assert (= 1 (count (set (map :dashboard_id tabs)))), "All tabs must belong to the same dashboard")
  (let [dashboard-id      (:dashboard_id (first tabs))
        tab-ids           (map :id tabs)
        dashcards         (t2/select :model/DashboardCard :dashboard_id dashboard-id :dashboard_tab_id [:in tab-ids])
        tab-id->dashcards (-> (group-by :dashboard_tab_id dashcards)
                              (update-vals #(sort dashboard-card/dashcard-comparator %)))
        tabs              (sort-by :position tabs)]
    (for [{:keys [id] :as tab} tabs]
      (assoc tab :cards (get tab-id->dashcards id)))))

(defmethod mi/perms-objects-set :model/DashboardTab
  [dashtab read-or-write]
  (let [dashboard (or (:dashboard dashtab)
                      (t2/select-one :model/Dashboard :id (:dashboard_id dashtab)))]
    (mi/perms-objects-set dashboard read-or-write)))


;;; ----------------------------------------------- SERIALIZATION ----------------------------------------------------
(defmethod serdes/hash-fields :model/DashboardTab
  [_dashboard-tab]
  [:name
   (comp serdes/identity-hash
        #(t2/select-one :model/Dashboard :id %)
        :dashboard_id)
   :position
   :created_at])

(defmethod serdes/generate-path "DashboardTab" [_ dashcard]
  [(serdes/infer-self-path "Dashboard" (t2/select-one :model/Dashboard :id (:dashboard_id dashcard)))
   (serdes/infer-self-path "DashboardTab" dashcard)])

(defmethod serdes/make-spec "DashboardTab" [_model-name _opts]
  {:copy      [:entity_id :name :position]
   :skip      []
   :transform {:created_at   (serdes/date)
               :dashboard_id (serdes/parent-ref)}})

;;; -------------------------------------------------- CRUD fns ------------------------------------------------------

(mu/defn create-tabs! :- [:map-of neg-int? pos-int?]
  "Create the new tabs and returned a mapping from temporary tab ID to the new tab ID."
  [dashboard-id :- ms/PositiveInt
   new-tabs     :- [:sequential [:map [:id neg-int?]]]]
  (let [new-tab-ids (t2/insert-returning-pks! :model/DashboardTab (->> new-tabs
                                                                       (map #(dissoc % :id))
                                                                       (map #(assoc % :dashboard_id dashboard-id))))]
    (zipmap (map :id new-tabs) new-tab-ids)))

(mu/defn update-tabs! :- nil?
  "Updates tabs of a dashboard if changed."
  [current-tabs :- [:sequential [:map [:id ms/PositiveInt]]]
   new-tabs     :- [:sequential [:map [:id ms/PositiveInt]]]]
  (let [update-ks       [:name :position]
        id->current-tab (m/index-by :id current-tabs)
        to-update-tabs  (filter
                          ;; filter out tabs that haven't changed
                          (fn [new-tab]
                            (let [current-tab (get id->current-tab (:id new-tab))]
                              (not= (select-keys current-tab update-ks)
                                    (select-keys new-tab update-ks))))

                          new-tabs)]
    (doseq [tab to-update-tabs]
      (t2/update! :model/DashboardTab (:id tab) (select-keys tab update-ks)))
    nil))

(mu/defn delete-tabs! :- nil?
  "Delete tabs of a Dashboard"
  [tab-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (when (seq tab-ids)
    (t2/delete! :model/DashboardTab :id [:in tab-ids]))
  nil)

(defn do-update-tabs!
  "Given current tabs and new tabs, do the necessary create/update/delete to apply new tab changes.
  Returns:
  - `old->new-tab-id`: a map from tab IDs in `new-tabs` to newly created tab IDs
  - `created-tab-ids`
  - `updated-tab-ids`
  - `deleted-tab-ids`
  - `total-num-tabs`: the total number of active tabs after the operation."
  [dashboard-id current-tabs new-tabs]
  (let [{:keys [to-create
                to-update
                to-delete]} (u/row-diff current-tabs new-tabs)
        to-delete-ids       (map :id to-delete)
        _                   (when-let [to-delete-ids (seq to-delete-ids)]
                              (delete-tabs! to-delete-ids))
        old->new-tab-id     (when (seq to-create)
                              (let [new-tab-ids (t2/insert-returning-pks! :model/DashboardTab
                                                                          (->> to-create
                                                                               (map #(dissoc % :id))
                                                                               (map #(assoc % :dashboard_id dashboard-id))))]
                                (zipmap (map :id to-create) new-tab-ids)))]
    (when (seq to-update)
      (update-tabs! current-tabs to-update))
    {:old->new-tab-id old->new-tab-id
     :created-tab-ids (vals old->new-tab-id)
     :deleted-tab-ids to-delete-ids
     :total-num-tabs  (reduce + (map count [to-create to-update]))}))
