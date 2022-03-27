(ns metabase.models.general-permissions-revision
  (:require [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel GeneralPermissionsRevision :general_permissions_revision)

(defn- pre-insert [revision]
  (assoc revision :created_at :%now))

(u/strict-extend (class GeneralPermissionsRevision)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:before :json
                                   :after  :json})
          :pre-insert pre-insert
          :pre-update (fn [& _] (throw (Exception. (tru "You cannot update a GeneralPermissionsRevision!"))))}))

(defn latest-id
  "Return the ID of the newest `PermissionsRevision`, or zero if none have been made yet.
   (This is used by the permissions graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (db/select-one-id GeneralPermissionsRevision {:order-by [[:id :desc]]})
      0))
