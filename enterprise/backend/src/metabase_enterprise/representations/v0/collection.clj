(ns metabase-enterprise.representations.v0.collection
  (:require
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.collections.api :as coll.api]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defmethod v0-common/representation-type :model/Collection [_entity]
  :collection)

(defn- model->url
  "Given a model, return a url."
  [model]
  (format "/api/ee/representation/%s/%s" (name (export/model->card-type model)) (:id model)))

(defn children
  "Returns the URLS of children of a collection."
  [collection]
  (->> (coll.api/collection-children collection {:show-dashboard-questions? true
                                                 :archived? false})
       :data
       (mapv model->url)))

(defmethod v0-common/type->model :collection
  [_]
  :model/Collection)

(defmethod import/yaml->toucan [:v0 :collection]
  [{collection-name :display_name
    :keys [description collection] :as _representation}
   _ref-index]
  (let [parent-id (when collection
                    (if (number? collection)
                      collection
                      (:id collection)))
        location (if parent-id
                   (str "/" parent-id "/")
                   "/")]
    (u/remove-nils
     {:name collection-name
      :description description
      :location location})))

(defn- persist!
  [new-collection]
  (log/debug "Creating new collection" (:name new-collection))
  (t2/insert-returning-instance! :model/Collection new-collection))

(defn- archive-and-persist!
  [existing-collection new-collection]
  (let [collection-name (:name existing-collection)
        archived-name (str collection-name " (archived)")]
    (log/info "Renaming existing collection" collection-name "to" archived-name)
    (t2/update! :model/Collection (:id existing-collection) {:name archived-name})
    (persist! new-collection)))

(defmethod import/persist! [:v0 :collection]
  [representation ref-index]
  (let [new-collection (->> (import/yaml->toucan representation ref-index)
                            (rep-t2/with-toucan-defaults :model/Collection))
        collection-name (:name new-collection)
        existing (t2/select-one :model/Collection :name collection-name :location "/")]
    (if existing
      (archive-and-persist! existing new-collection)
      (persist! new-collection))))

(defmethod export/export-entity :collection [collection]
  (-> {:type :collection
       :version :v0
       :name (format "%s-%s" "collection" (:id collection))
       :display_name (:name collection)
       :description (:description collection)
       :children (children collection)}
      u/remove-nils))
