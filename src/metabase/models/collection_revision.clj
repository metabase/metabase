(ns metabase.models.collection-revision
  (:require [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel CollectionRevision :collection_revision)

(defn- pre-insert [revision]
  (assoc revision :created_at :%now))

(u/strict-extend (class CollectionRevision)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:before :json
                                   :after  :json})
          :pre-insert pre-insert
          :pre-update (fn [& _] (throw (Exception. (tru "You cannot update a CollectionRevision!"))))}))


(defn latest-id
  "Return the ID of the newest `CollectionRevision`, or zero if none have been made yet.
   (This is used by the collection graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (:id (db/select-one [CollectionRevision [:%max.id :id]]))
      0))
