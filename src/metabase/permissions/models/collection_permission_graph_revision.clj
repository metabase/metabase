(ns metabase.permissions.models.collection-permission-graph-revision
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.before-update :as t2.before-update]))

(methodical/defmethod t2/table-name :model/CollectionPermissionGraphRevision [_model] :collection_permission_graph_revision)

(doto :model/CollectionPermissionGraphRevision
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

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

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-collection-permission-graph-revisions!
  "Insert the CollectionPermissionGraphRevision `rows` in one transaction and return them in order."
  [rows :- [:sequential ::permissions.schema/collection-permission-graph-revision.create]]
  (app-db/create-batched! :model/CollectionPermissionGraphRevision rows {}))

(defn- check-revision-updates
  "Throws unless every row of `updates` whose revision `id->stored` holds satisfies these rules:

  - the hooks of the revision accept the row merged into its stored row"
  [updates id->stored]
  (doseq [{id :id :as row} updates
          :let [stored (id->stored id)]
          :when stored]
    (t2.before-update/before-update :model/CollectionPermissionGraphRevision (merge stored (dissoc row :id)))))

(mu/defn update-collection-permission-graph-revisions! :- :nil
  "Apply the `rows`, each an `:id` and its changes, to their CollectionPermissionGraphRevisions in one transaction."
  [rows :- [:sequential ::permissions.schema/collection-permission-graph-revision.update]]
  (app-db/update-batched! :model/CollectionPermissionGraphRevision rows {:before-update check-revision-updates}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/CollectionPermissionGraphRevision [_model]
  {:skip? false})
