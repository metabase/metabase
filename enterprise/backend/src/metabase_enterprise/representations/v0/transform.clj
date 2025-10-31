(ns metabase-enterprise.representations.v0.transform
  "The v0 transform representation namespace."
  (:require
   [flatland.ordered.map :refer [ordered-map]]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(defmethod v0-common/representation-type :model/Transform [_entity]
  :transform)

(defmethod v0-common/type->model :transform
  [_]
  :model/Transform)

(defmethod import/yaml->toucan [:v0 :transform]
  [{:keys [database] :as representation}
   ref-index]
  (let [database-id (-> ref-index
                        (v0-common/lookup-entity database)
                        (v0-common/ensure-correct-type :database)
                        (or (lookup/lookup-by-name :database database))
                        (or (lookup/lookup-by-id :database database))
                        :id
                        (v0-common/ensure-not-nil))
        query (v0-mbql/import-dataset-query representation ref-index)]
    (-> {:database database-id
         :name (or (:display_name representation)
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

(defmethod import/insert! [:v0 :transform]
  [representation ref-index]
  (let [representation (rep-read/parse representation)]
    (if-some [model (v0-common/type->model (:type representation))]
      (let [toucan (->> (import/yaml->toucan representation ref-index)
                        (rep-t2/with-toucan-defaults model))
            transform (t2/insert-returning-instance! model toucan)]
        (set-up-tags (:id transform) (:tags representation))
        (t2/hydrate transform :transform_tag_names))
      (throw (ex-info (str "Unknown representation type: " (:type representation))
                      {:representation representation
                       :type (:type representation)})))))

(defmethod import/update! [:v0 :transform]
  [representation id ref-index]
  (let [representation (rep-read/parse representation)]
    (if-some [model (v0-common/type->model (:type representation))]
      (let [toucan (import/yaml->toucan representation ref-index)]
        (t2/update! model id (dissoc toucan :entity_id))
        (t2/delete! :model/TransformTransformTag :transform_id id)
        (set-up-tags id (:tags representation))
        (t2/hydrate (t2/select-one :model/Transform :id id) :transform_tag_names))
      (throw (ex-info (str "Unknown representation type: " (:type representation))
                      {:representation representation
                       :type (:type representation)})))))

(defmethod import/persist! [:v0 :transform]
  [representation ref-index]
  (let [transform-data (->> (import/yaml->toucan representation ref-index)
                            (rep-t2/with-toucan-defaults :model/Transform))
        entity-id (:entity_id transform-data)
        existing (when entity-id
                   (t2/select-one :model/Transform :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing transform" (:name transform-data) "with name" (:name representation))
        (t2/update! :model/Transform (:id existing) (dissoc transform-data :entity_id))
        (t2/delete! :model/TransformTransformTag :transform_id (:id existing))
        (set-up-tags (:id existing) (:tags representation))
        (t2/hydrate (t2/select-one :model/Transform :id (:id existing)) :transform_tag_names))
      (do
        (log/info "Creating new transform" (:name transform-data))
        (let [transform (t2/insert-returning-instance! :model/Transform transform-data)]
          (set-up-tags (:id transform) (:tags representation))
          (t2/hydrate transform :transform_tag_names))))))

;; EXPORT

(defmethod export/export-entity :transform [transform]
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
