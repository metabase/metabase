(ns metabase.models.permissions-revision
  (:require [metabase.util :as u]
            [metabase.util
             [date :as du]
             [i18n :refer [tru]]]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel PermissionsRevision :permissions_revision)

(defn- pre-insert [revision]
  (assoc revision :created_at (du/new-sql-timestamp)))

(u/strict-extend (class PermissionsRevision)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:before :json
                                   :after  :json
                                   :remark :clob})
          :pre-insert pre-insert
          :pre-update (fn [& _] (throw (Exception. (str (tru "You cannot update a PermissionsRevision!")))))}))


(defn latest-id
  "Return the ID of the newest `PermissionsRevision`, or zero if none have been made yet.
   (This is used by the permissions graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (db/select-one-id PermissionsRevision {:order-by [[:id :desc]]})
      0))
