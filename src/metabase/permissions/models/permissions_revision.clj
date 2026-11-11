(ns metabase.permissions.models.permissions-revision
  (:require
   [metabase.models.interface :as mi]
   [metabase.permissions.db :as permissions.db]
   [metabase.toucan.core :as t2]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(t2/define-table-name :model/PermissionsRevision [_model] :permissions_revision)

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
  "Return the ID of the newest `PermissionsRevision`, or zero if none have been made yet. (This is used by the
  permissions graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (permissions.db/latest-permissions-revision-id)
      0))
