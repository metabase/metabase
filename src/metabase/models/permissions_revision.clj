(ns metabase.models.permissions-revision
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def PermissionsRevision
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/PermissionsRevision)

(methodical/defmethod t2/table-name :model/PermissionsRevision [_model] :permissions_revision)

(doto :model/PermissionsRevision
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/deftransforms :model/PermissionsRevision
  {:before mi/transform-json
   :after  mi/transform-json})

(t2/define-before-update :model/PermissionsRevision
  [_]
  (throw (Exception. (tru "You cannot update a PermissionsRevision!"))))

(defn latest-id
  "Return the ID of the newest `PermissionsRevision`, or zero if none have been made yet.
   (This is used by the permissions graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (t2/select-one-pk PermissionsRevision {:order-by [[:id :desc]]})
      0))

(mu/defn latest-id-and-user :- [:map [:revision nat-int?] [:user [:maybe :map]]]
  "Return the ID of the newest `PermissionsRevision`, or zero if none have been made yet, as well as the user who commited that change.
   (This is used by the permissions graph update logic that checks for changes since the original graph was fetched)."
  []
  (let [{:keys [id user_id]} (t2/select-one :model/PermissionsRevision {:select [:id :user_id] :order-by [[:id :desc]]})
        user (t2/select-one :model/User :id user_id)]
    {:revision (or id 0) :user user}))
