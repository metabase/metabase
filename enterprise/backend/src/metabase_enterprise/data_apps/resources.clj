(ns metabase-enterprise.data-apps.resources
  "Lifecycle for the resource collection owned by a data app."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.collections.core :as collection]))

(set! *warn-on-reflection* true)

(defn- resource-name [app]
  (format "Data App: %s" (:name app)))

(defn create-resource-collection!
  "Create the resource collection of `app`, a root collection in the `data-apps` namespace, before the app is inserted.
   Created like any collection, so its events are published and remote sync tracks it."
  [app]
  (collection/create-collection! {:name      (resource-name app)
                                  :namespace (name collection/data-apps-ns)}))

(defn rename-resource-collection!
  "Name the resource collection of `app` after the app's slug."
  [{:keys [resource_collection_id] :as app}]
  (when resource_collection_id
    (data-apps.db/rename-resource-collection! resource_collection_id (resource-name app))))

(defn delete-resources!
  "Delete the app collection."
  [{:keys [resource_collection_id]}]
  (when resource_collection_id
    (data-apps.db/delete-resource-collection! resource_collection_id)))
