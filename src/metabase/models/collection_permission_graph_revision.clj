(ns metabase.models.collection-permission-graph-revision
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def CollectionPermissionGraphRevision
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/CollectionPermissionGraphRevision)

(methodical/defmethod t2/table-name :model/CollectionPermissionGraphRevision [_model] :collection_permission_graph_revision)

(t2/deftransforms :model/CollectionPermissionGraphRevision
 {:before mi/transform-json
  :after  mi/transform-json})

(doto :model/CollectionPermissionGraphRevision
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/define-before-update :model/CollectionPermissionGraphRevision
 [_]
 (throw (Exception. (tru "You cannot update a CollectionPermissionGraphRevision!"))))

(defn latest-id
  "Return the ID of the newest `CollectionPermissionGraphRevision`, or zero if none have been made yet.
   (This is used by the collection graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (:id (t2/select-one [CollectionPermissionGraphRevision [:%max.id :id]]))
      0))
