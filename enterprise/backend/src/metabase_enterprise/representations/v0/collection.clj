(ns metabase-enterprise.representations.v0.collection
  (:require
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.collections-rest.api :as coll.api]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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
   _ref-index]
  (let [parent-id (when collection
                    (if (number? collection)
                      collection
                      (:id collection)))
        location (if parent-id
                   (str "/" parent-id "/")
                   "/")]
    (u/remove-nils
     {:name (or collection-name name)
      :description description
      :location location})))

(defn- insert-collection!
  [new-collection]
  (log/debug "Creating new collection" (:name new-collection))
  (t2/insert-returning-instance! :model/Collection new-collection))

(defn- archive-and-persist!
  [existing-collection new-collection]
  (let [collection-name (:name existing-collection)
        archived-name (str collection-name " (archived)")]
    (log/info "Renaming existing collection" collection-name "to" archived-name)
    (t2/update! :model/Collection (:id existing-collection) {:name archived-name})
    (insert-collection! new-collection)))

(defn persist!
  "Persist a v0 collection representation by creating or updating it in the database."
  [representation ref-index]
  (let [new-collection (->> (yaml->toucan representation ref-index)
                            (rep-t2/with-toucan-defaults :model/Collection))
        collection-name (:name new-collection)
        existing (t2/select-one :model/Collection :name collection-name :location "/")]
    (if existing
      (archive-and-persist! existing new-collection)
      (insert-collection! new-collection))))

(defn export-collection
  "Export a Collection Toucan entity to a v0 collection representation."
  [t2-collection]
  (-> {:type :collection
       :version :v0
       :name (format "%s-%s" "collection" (:id t2-collection))
       :display_name (:name t2-collection)
       :description (:description t2-collection)
       :children (children t2-collection)} ;; todo: where's the other collection exporter?
      u/remove-nils))
