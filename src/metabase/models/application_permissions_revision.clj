(ns metabase.models.application-permissions-revision
  (:require [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel ApplicationPermissionsRevision :application_permissions_revision)

(u/strict-extend (class ApplicationPermissionsRevision)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:before :json
                                   :after  :json})
          :properties (constantly {:created-at-timestamped? true})
          :pre-update (fn [& _] (throw (Exception. (tru "You cannot update a ApplicationPermissionsRevision!"))))}))

(defn latest-id
  "Return the ID of the newest `ApplicationPermissionsRevision`, or zero if none have been made yet.
   (This is used by the permissions graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (db/select-one-id ApplicationPermissionsRevision {:order-by [[:id :desc]]})
      0))
