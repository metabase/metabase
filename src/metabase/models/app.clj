(ns metabase.models.app
  (:require [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel App :app)

(u/strict-extend (class App)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:options :json
                              :nav_items :json})
          :properties (constantly {:timestamped? true})})

  ;; You can read/write an App if you can read/write its Collection
  mi/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)
