(ns metabase.models.collection-permission-graph-revision
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(models/defmodel CollectionPermissionGraphRevision :collection_permission_graph_revision)

(mi/define-methods
 CollectionPermissionGraphRevision
 {:types      (constantly {:before :json
                           :after  :json})
  :properties (constantly {::mi/created-at-timestamped? true})
  :pre-update (fn [& _] (throw (Exception. (tru "You cannot update a CollectionPermissionGraphRevision!"))))})

(defn latest-id
  "Return the ID of the newest `CollectionPermissionGraphRevision`, or zero if none have been made yet.
   (This is used by the collection graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (:id (t2/select-one [CollectionPermissionGraphRevision [:%max.id :id]]))
      0))
