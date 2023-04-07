(ns metabase.models.dashboard-tab
  (:require
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :m/DashboardTab [_model] :report_dashboardtab)

(doto :m/DashboardTab
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod mi/perms-objects-set :m/DashboardTab
  [dashtab read-or-write]
  (let [dashboard (or (:dashboard dashtab)
                      (t2/select-one Dashboard :id (:dashboard_id dashtab)))]
    (mi/perms-objects-set dashboard read-or-write)))
