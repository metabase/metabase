(ns metabase-enterprise.data-apps.resources
  "Lifecycle for the resource collection owned by a data app."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.collections.core :as collection]
   [metabase.request.core :as request]))

(set! *warn-on-reflection* true)

(defn- resource-name [app]
  (format "Data App: %s" (:name app)))

(defn create-resource-collection!
  "Create the resource collection of `app`, a root collection in the `data-apps` namespace, as the app is inserted.
   Created like any collection, so its events are published; as admin, since an import has no user bound."
  [app]
  (request/as-admin
    (collection/create-collection! {:name      (resource-name app)
                                    :namespace (name collection/data-apps-ns)})))

(defn- restore-trashed-collection!
  "Bring `collection` back out of the trash, with everything archived alongside it.

   Trashing it archives every copy inside, and an app is served from those copies,
   so a sync that left it there would report success over an app whose viewers see
   nothing. It goes back to the root, where the app created it: restoring in place
   fails outright when an ancestor is still in the trash.

   The restore runs with full permissions because a repository import reaches this
   from a scheduled task, where no user is bound; the collection is the app's own,
   so there is no one else's decision to weigh."
  [collection]
  (when (:archived collection)
    (request/as-admin
      (collection/archive-or-unarchive-collection! collection
                                                   {:archived false, :parent_id nil}))))

(defn- resource-collection!
  "The resource collection of `app`, created again if the app's was deleted out from under it: the reference is
   nullable so that deleting the app can delete the collection first, which also lets the collection go alone."
  [app]
  (or (some->> (:resource_collection_id app)
               (data-apps.db/resource-collection))
      (let [collection (create-resource-collection! app)]
        (data-apps.db/update-data-app! (:id app) {:resource_collection_id (:id collection)})
        collection)))

(defn ensure-resources!
  "Create, rename, or restore the resource collection of `app`, and return `{:resource_collection_id id}`."
  [app]
  (let [app        (data-apps.db/data-app (:id app))
        collection (resource-collection! app)]
    (data-apps.db/update-resource-collection! (:id collection)
                                              {:name (resource-name app)})
    (restore-trashed-collection! collection)
    {:resource_collection_id (:id collection)}))

(defn delete-resources!
  "Delete the app collection."
  [{:keys [resource_collection_id]}]
  (when resource_collection_id
    (data-apps.db/delete-resource-collection! resource_collection_id)))
