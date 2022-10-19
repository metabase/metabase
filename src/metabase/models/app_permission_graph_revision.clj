(ns metabase.models.app-permission-graph-revision
  (:require [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel AppPermissionGraphRevision :app_permission_graph_revision)

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class AppPermissionGraphRevision)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:before :json
                                   :after  :json})
          :properties (constantly {:created-at-timestamped? true})
          :pre-update (fn [& _] (throw (Exception. (tru "You cannot update an AppPermissionGraphRevision!"))))}))

(defn latest-id
  "Return the ID of the newest `AppPermissionGraphRevision`, or zero if none have been made yet.
   (This is used by the app graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (:id (db/select-one [AppPermissionGraphRevision [:%max.id :id]]))
      0))
