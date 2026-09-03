(ns metabase.xrays.transforms.materialize
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.core :as queries]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.util.malli :as mu]
   [metabase.xrays.db :as xrays.db]
   [metabase.xrays.transforms.specs :as transforms.specs]))

(declare get-or-create-root-container-collection!)

(defn- root-container-location
  []
  (collection/children-location
   (xrays.db/collection-location-columns (get-or-create-root-container-collection!))))

(mu/defn get-collection :- [:maybe ::lib.schema.id/collection]
  "Get collection named `collection-name`. If no location is given root collection for automatically
   generated transforms is assumed (see `get-or-create-root-container-collection!`)."
  ([collection-name]
   (get-collection collection-name (root-container-location)))
  ([collection-name :- :string
    location        :- :string]
   (xrays.db/collection-id-by-name-and-location collection-name location)))

(defn- create-collection!
  ([collection-name description]
   (create-collection! collection-name description (root-container-location)))
  ([collection-name description location]
   (xrays.db/insert-collection-returning-pk! {:name        collection-name
                                              :description description
                                              :location    location})))

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
    (xrays.db/delete-cards-in-collection! collection-id)
    (create-collection! name description)))

(mu/defn make-card-for-step! :- ::queries.schema/card
  "Make and save a card for a given transform step and query."
  [{:keys [name transform description]} :- transforms.specs/Step
   query                                :- ::transforms.specs/query]
  (let [query (lib-be/normalize-query query)]
    (->> {:creator_id             api/*current-user-id*
          :dataset_query          query
          :description            description
          :name                   name
          :collection_id          (get-collection transform)
          :result_metadata        (qp.preprocess/query->expected-cols query)
          :visualization_settings {}
          :display                :table}
         queries/populate-card-query-fields
         xrays.db/insert-card!)))
