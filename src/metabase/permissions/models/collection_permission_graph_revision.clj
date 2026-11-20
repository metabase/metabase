(ns metabase.permissions.models.collection-permission-graph-revision
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.write]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/CollectionPermissionGraphRevision [_model] :collection_permission_graph_revision)

(doto :model/CollectionPermissionGraphRevision
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/deftransforms :model/CollectionPermissionGraphRevision
  {:before mi/transform-json
   :after  mi/transform-json})

(defn latest-id
  "Return the ID of the newest `CollectionPermissionGraphRevision`, or zero if none have been made yet.
   (This is used by the collection graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (permissions.db/latest-collection-permission-graph-revision-id)
      0))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/CollectionPermissionGraphRevision [_model]
  {:skip? false})
