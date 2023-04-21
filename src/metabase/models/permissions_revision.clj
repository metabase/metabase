(ns metabase.models.permissions-revision
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(models/defmodel PermissionsRevision :permissions_revision)

(mi/define-methods
 PermissionsRevision
 {:types      (constantly {:before :json
                           :after  :json})
  :properties (constantly {::mi/created-at-timestamped? true})
  :pre-update (fn [& _] (throw (Exception. (tru "You cannot update a PermissionsRevision!"))))})

(defn latest-id
  "Return the ID of the newest `PermissionsRevision`, or zero if none have been made yet.
   (This is used by the permissions graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (t2/select-one-pk PermissionsRevision {:order-by [[:id :desc]]})
      0))
