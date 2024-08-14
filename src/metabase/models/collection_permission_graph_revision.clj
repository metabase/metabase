(ns metabase.models.collection-permission-graph-revision
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def CollectionPermissionGraphRevision
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/CollectionPermissionGraphRevision)

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
  (or (:id (t2/select-one [:model/CollectionPermissionGraphRevision [:%max.id :id]]))
      0))
