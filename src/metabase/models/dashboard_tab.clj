(ns metabase.models.dashboard-tab
  (:require
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.dashboard-card :refer [DashboardCard]]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
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

(methodical/defmethod t2.hydrate/batched-hydrate [:default :ordered-tab-cards]
  [_model _k tabs]
  (assert (= 1 (count (set (map :dashboard_id tabs)))), "All tabs must belong to the same dashboard")
  (let [dashboard-id      (:dashboard_id (first tabs))
        tab-ids           (map :id tabs)
        dashcards         (t2/select DashboardCard :dashboard_id dashboard-id :dashboard_tab_id [:in tab-ids])
        tab-id->dashcards (group-by :dashboard_tab_id dashcards)
        ordered-tabs      (sort-by :position tabs)]
    (for [{:keys [id] :as tab} ordered-tabs]
      (assoc tab :cards (get tab-id->dashcards id)))))

(defmethod mi/perms-objects-set :model/DashboardTab
  [dashtab read-or-write]
  (let [dashboard (or (:dashboard dashtab)
                      (t2/select-one Dashboard :id (:dashboard_id dashtab)))]
    (mi/perms-objects-set dashboard read-or-write)))

(defmethod serdes/hash-fields :model/DashboardTab
  [_dashboard-tab]
  [:name
   (comp serdes/identity-hash
        #(t2/select-one Dashboard :id %)
        :dashboard_id)
   :position
   :created_at])
