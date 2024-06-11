(ns metabase.xrays.transforms.materialize
  (:require
   [metabase.api.common :as api]
   [metabase.models.card :as card :refer [Card]]
   [metabase.models.collection :as collection :refer [Collection]]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [toucan2.core :as t2]))

(declare get-or-create-root-container-collection!)

(defn- root-container-location
  []
  (collection/children-location
   (t2/select-one [Collection :location :id]
     :id (get-or-create-root-container-collection!))))

(defn get-collection
  "Get collection named `collection-name`. If no location is given root collection for automatically
   generated transforms is assumed (see `get-or-create-root-container-collection!`)."
  ([collection-name]
   (get-collection collection-name (root-container-location)))
  ([collection-name location]
   (t2/select-one-pk Collection
     :name     collection-name
     :location location)))

(defn- create-collection!
  ([collection-name description]
   (create-collection! collection-name description (root-container-location)))
  ([collection-name description location]
   (first (t2/insert-returning-pks! Collection
                                    {:name        collection-name
                                     :description description
                                     :location    location}))))

(defn- get-or-create-root-container-collection!
  "Get or create container collection for transforms in the root collection."
  []
  (let [location "/"
        name     "Automatically Generated Transforms"]
    (or (get-collection name location)
        (create-collection! name nil location))))

(defn fresh-collection-for-transform!
  "Create a new collection for all the artefacts belonging to transform, or reset it if it already
   exists."
  [{:keys [name description]}]
  (if-let [collection-id (get-collection name)]
    (t2/delete! Card :collection_id collection-id)
    (create-collection! name description)))

(defn make-card-for-step!
  "Make and save a card for a given transform step and query."
  [{:keys [name transform description]} query]
  (->> {:creator_id             api/*current-user-id*
        :dataset_query          query
        :description            description
        :name                   name
        :collection_id          (get-collection transform)
        :result_metadata        (qp.preprocess/query->expected-cols query)
        :visualization_settings {}
        :display                :table}
       card/populate-query-fields
       (t2/insert-returning-instances! Card)
       first))
