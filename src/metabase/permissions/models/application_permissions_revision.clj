(ns metabase.permissions.models.application-permissions-revision
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.permissions.db :as permissions.db]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ApplicationPermissionsRevision [_model] :application_permissions_revision)

(doto :model/ApplicationPermissionsRevision
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(defmethod app-db-copy/spec :model/ApplicationPermissionsRevision [_model]
  {:skip? false})

(t2/deftransforms :model/ApplicationPermissionsRevision
  {:before mi/transform-json
   :after  mi/transform-json})

(t2/define-before-update :model/ApplicationPermissionsRevision
  [_]
  (throw (ex-info (tru "You cannot update a PermissionsRevision!") {:status-code 400})))

(defn latest-id
  "Return the ID of the newest `ApplicationPermissionsRevision`, or zero if none have been made yet.
   (This is used by the permissions graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (permissions.db/latest-application-permissions-revision-id)
      0))
