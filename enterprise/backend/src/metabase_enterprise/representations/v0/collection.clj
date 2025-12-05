(ns metabase-enterprise.representations.v0.collection
  (:require
   [flatland.ordered.map :refer [ordered-map]]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.collections-rest.api :as coll.api]
   [metabase.util :as u]))

(def toucan-model
  "The toucan model keyword associated with collection representations"
  :model/Collection)

(defmethod v0-common/representation-type :model/Collection [_entity]
  :collection)

(defn- model->card-type ; TODO: DRY -- repeated in export.clj
  "Given a model, returns a card-type."
  [model]
  (let [kw (keyword (:model model))]
    (get {:dataset :model :card :question} kw kw)))

(defn- model->url
  "Given a model, return a url."
  [model]
  (format "/api/ee/representation/%s/%s" (name (model->card-type model)) (:id model)))

(defn children
  "Returns the URLS of children of a collection."
  [collection]
  (->> (coll.api/collection-children collection {:show-dashboard-questions? true
                                                 :archived? false})
       :data
       (mapv model->url)))

(defn yaml->toucan
  "Convert a v0 collection representation to Toucan-compatible data."
  [{collection-name :display_name
    :keys [name description collection] :as _representation}
   ref-index]
  (let [parent (when collection
                 (v0-common/lookup-entity ref-index collection))
        location (if parent
                   (str (:location parent) (:id parent) "/")
                   "/")]
    (u/remove-nils
     {:name (or collection-name name)
      :description description
      :location location})))

(defn export-collection
  "Export a Collection Toucan entity to a v0 collection representation."
  [t2-collection]
  (-> (ordered-map
       {:name (v0-common/unref (v0-common/->ref (:id t2-collection) :collection))
        :type :collection
        :version :v0
        :display_name (:name t2-collection)
        :description (:description t2-collection)})
      u/remove-nils))
