(ns metabase.models.collection-revision
  (:require [metabase.util :as u]
            [metabase.util.date :as du]
            [puppetlabs.i18n.core :refer [tru]]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel CollectionRevision :collection_revision)

(defn- pre-insert [revision]
  (assoc revision :created_at (du/new-sql-timestamp)))

(u/strict-extend (class CollectionRevision)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:before :json
                                   :after  :json
                                   :remark :clob})
          :pre-insert pre-insert
          :pre-update (fn [& _] (throw (Exception. (str (tru "You cannot update a CollectionRevision!")))))}))


(defn latest-id
  "Return the ID of the newest `CollectionRevision`, or zero if none have been made yet.
   (This is used by the collection graph update logic that checks for changes since the original graph was fetched)."
  []
  (or (db/select-one-id CollectionRevision {:order-by [[:id :desc]]})
      0))
