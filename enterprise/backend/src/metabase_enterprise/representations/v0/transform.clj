(ns metabase-enterprise.representations.v0.transform
  "The v0 transform representation namespace."
  (:require
   [flatland.ordered.map :refer [ordered-map]]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.util :as u]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(defmethod v0-common/representation-type :model/Transform [_entity]
  :transform)

(def toucan-model
  "The toucan model keyword associated with transform representations"
  :model/Transform)

(defn yaml->toucan
  "Convert a v0 transform representation to Toucan-compatible data."
  [representation
   ref-index]
  (let [query (v0-mbql/import-dataset-query representation ref-index)]
    (-> {:name (or (:display_name representation)
                   (:name representation))
         :description (:description representation)
         :source {:type "query"
                  :query query}
         :target {:type "table"
                  :schema (-> representation :target_table :schema)
                  :name (-> representation :target_table :table)}}
        u/remove-nils)))

(defn- set-up-tags [transform-id tags]
  (when (seq tags)
    (let [existing-tags (t2/select :model/TransformTag :name [:in tags])
          missing-tags (reduce disj (set tags) (map :name existing-tags))
          new-tags (t2/insert-returning-instances! :model/TransformTag (for [tag missing-tags] {:name tag}))
          by-name (into {} (map (juxt :name identity)) (concat existing-tags new-tags))]
      (t2/insert! :model/TransformTransformTag (for [[i tag] (map vector (range) tags)]
                                                 {:transform_id transform-id
                                                  :tag_id (-> tag by-name :id)
                                                  :position i})))))

(defn insert!
  "Insert a v0 transform as a new entity, handling tags as well"
  [representation ref-index]
  (let [representation (rep-read/parse representation)]
    (assert (= :transform (:type representation)))
    (let [toucan (->> (yaml->toucan representation ref-index)
                      (rep-t2/with-toucan-defaults :model/Transform))
          transform (t2/insert-returning-instance! :model/Transform toucan)]
      (set-up-tags (:id transform) (:tags representation))
      (t2/hydrate transform :transform_tag_names))))

(defn update!
  "Update an existing v0 transform from a representation."
  [representation id ref-index]
  (let [representation (rep-read/parse representation)]
    (assert (= :transform (:type representation)))
    (let [toucan (yaml->toucan representation ref-index)]
      (t2/update! :model/Transform id (dissoc toucan :entity_id))
      (t2/delete! :model/TransformTransformTag :transform_id id)
      (set-up-tags id (:tags representation))
      (t2/hydrate (t2/select-one :model/Transform :id id) :transform_tag_names))))

;; EXPORT

(defn export-transform
  "Export a Transform Toucan entity to a v0 transform representation."
  [transform]
  (let [query (v0-mbql/export-dataset-query (-> transform :source :query))]
    (cond-> (ordered-map
             :name (v0-common/unref (v0-common/->ref (:id transform) :transform))
             :type :transform
             :version :v0
             :tags (:tags transform)
             :display_name (:name transform)
             :description (:description transform)
             :database (:database query))

      (#{"table" :table} (-> transform :target :type))
      (assoc :target_table {:schema (-> transform :target :schema)
                            :table (-> transform :target :name)})

      :always
      (assoc :query (:query query))

      :always
      u/remove-nils)))
