(ns metabase.models.collection-revision
  (:require [metabase.db :as db]
            [metabase.models.interface :as i]
            [metabase.util :as u]))

(i/defentity CollectionRevision :collection_revision)

(defn- pre-insert [revision]
  (assoc revision :created_at (u/new-sql-timestamp)))

(u/strict-extend (class CollectionRevision)
  i/IEntity
  (merge i/IEntityDefaults
         {:types      (constantly {:before :json
                                   :after  :json
                                   :remark :clob})
          :pre-insert pre-insert
          :pre-update (fn [& _] (throw (Exception. "You cannot update a CollectionRevision!")))}))


(defn latest-id
  "Return the ID of the newest `CollectionRevision`, or zero if none have been made yet.
   (This is used by the collection graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (db/select-one-id CollectionRevision {:order-by [[:id :desc]]})
      0))
