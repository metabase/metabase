(ns metabase.models.dashboard-tab
  (:require
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util.date-2 :as u.date]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DashboardTab [_model] :dashboard_tab)

(doto :model/DashboardTab
  (derive :metabase/model)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod mi/perms-objects-set :model/DashboardTab
  [dashtab read-or-write]
  (let [dashboard (or (:dashboard dashtab)
                      (t2/select-one Dashboard :id (:dashboard_id dashtab)))]
    (mi/perms-objects-set dashboard read-or-write)))


;;; ----------------------------------------------- SERIALIZATION ----------------------------------------------------
(defmethod serdes/hash-fields :model/DashboardTab
  [_dashboard-tab]
  [:name
   (comp serdes/identity-hash
        #(t2/select-one Dashboard :id %)
        :dashboard_id)
   :position
   :created_at])

;; DashboardTabs are not serialized as their own, separate entities. They are inlined onto their parent Dashboards.
(defmethod serdes/generate-path "DashboardTab" [_ dashcard]
  [(serdes/infer-self-path "Dashboard" (t2/select-one 'Dashboard :id (:dashboard_id dashcard)))
   (serdes/infer-self-path "DashboardTab" dashcard)])

(defmethod serdes/load-xform "DashboardTab"
  [dashtab]
  (-> dashtab
      (dissoc :serdes/meta)
      (update :dashboard_id serdes/*import-fk* 'Dashboard)
      (update :created_at   #(if (string? %) (u.date/parse %) %))))
