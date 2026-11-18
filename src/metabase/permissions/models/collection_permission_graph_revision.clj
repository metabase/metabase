(ns metabase.permissions.models.collection-permission-graph-revision
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.permissions.db :as permissions.db]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/CollectionPermissionGraphRevision [_model] :collection_permission_graph_revision)

(doto :model/CollectionPermissionGraphRevision
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(defmethod app-db-copy/spec :model/CollectionPermissionGraphRevision [_model]
  {:skip? false})

(t2/deftransforms :model/CollectionPermissionGraphRevision
  {:before mi/transform-json
   :after  mi/transform-json})

(t2/define-before-update :model/CollectionPermissionGraphRevision
  [revision]
  (let [changes  (t2/changes revision)
        original (t2/original revision)]
    (when (seq (dissoc changes :before :after))
      (throw (ex-info (tru "You cannot update a PermissionsRevision!") {:status-code 400})))
    (when (and (contains? changes :before) (seq (:before original)))
      (throw (ex-info (tru "You cannot change the details of a PermissionsRevision once they are filled in.")
                      {:status-code 400})))
    (when (and (contains? changes :after) (seq (:after original)))
      (throw (ex-info (tru "You cannot change the details of a PermissionsRevision once they are filled in.")
                      {:status-code 400})))
    revision))

(defn latest-id
  "Return the ID of the newest `CollectionPermissionGraphRevision`, or zero if none have been made yet.
   (This is used by the collection graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (permissions.db/latest-collection-permission-graph-revision-id)
      0))
