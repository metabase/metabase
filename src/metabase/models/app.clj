(ns metabase.models.app
  (:require [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.models :as models]
            [medley.core :as m]))

(models/defmodel App :app)
(models/defmodel AppNavItem :app_nav_item)

(u/strict-extend (class App)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:options :json})
          :properties (constantly {:timestamped? true})})

  ;; You can read/write an App if you can read/write its parent Collection
  mi/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)

(u/strict-extend (class AppNavItem)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:options :json})}))

(defn nav-items
  {:batched-hydrate :app/nav-items}
  [apps]
  (let [nav-items (db/select AppNavItem :app_id [:in (map :id apps)])
        nav-items-by-app-id (reduce
                              (fn [m nav-item]
                                (update m (:app_id nav-item) (fnil conj []) (select-keys nav-item [:options])))
                              {}
                              nav-items)]
    (for [app apps]
      (m/assoc-some app :nav-items (get nav-items-by-app-id (:id app))))))
