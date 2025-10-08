(ns metabase-enterprise.representations.v0.collection
  (:require
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase.collections.api :as coll.api]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defmethod import/type->schema :v0/collection [_]
  ::collection)

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'collection' for this schema"}
   :v0/collection])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the collection, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the collection"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Optional documentation explaining the collection's purpose"}
   :string])

;;; ------------------------------------ Main Schema ------------------------------------

(mr/def ::collection
  [:map
   {:description "v0 schema for human-writable collection representation
                  Collections organize cards, dashboards, and other resources.
                  Every representations directory MUST have a collection.yml file."}
   [:type ::type]
   [:ref ::ref]
   [:name {:optional true} [:maybe ::name]]
   [:description {:optional true} [:maybe ::description]]
   [:chilren {:optional true} [:maybe [:vector :string]]]])

;;; -- Export --

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

(defmethod import/yaml->toucan :v0/collection
  [{collection-name :name
    :keys [entity-id description collection] :as _representation}
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
      :location location
      :entity_id entity-id})))

(defn export
  "Export the collection, returning EDN suitable for yml"
  [collection]
  (-> {:type "collection"
       :ref (format "%s-%s" "collection" (:id collection))
       :name (:name collection)
       :description (:description collection)
       :children (children collection)}
      u/remove-nils))

(defmethod import/persist! :v0/collection
  [representation ref-index]
  (let [collection-data (import/yaml->toucan representation ref-index)
        entity-id (:entity_id collection-data)
        location (:location collection-data)
        is-root? (= location "/")]

    (if is-root?
      (let [collection-name (:name collection-data)
            existing-collections (t2/select :model/Collection :name collection-name :location "/")]

        (when (> (count existing-collections) 1)
          (throw (ex-info (str "Multiple collections found with name: " collection-name)
                          {:collection-name collection-name
                           :count (count existing-collections)})))

        (when (= (count existing-collections) 1)
          (let [existing (first existing-collections)
                archived-name (str collection-name " (archived)")]
            (log/info "Renaming existing collection" collection-name "to" archived-name)
            (t2/update! :model/Collection (:id existing) {:name archived-name})))

        (log/info "Creating new root collection" (:name collection-data))
        (t2/insert-returning-instance! :model/Collection collection-data))

      (let [existing (when entity-id
                       (t2/select-one :model/Collection :entity_id entity-id))]
        (if existing
          (do
            (log/info "Updating existing nested collection" (:name collection-data) "with ref" (:ref representation))
            (t2/update! :model/Collection (:id existing) (dissoc collection-data :entity_id))
            (t2/select-one :model/Collection :id (:id existing)))
          (do
            (log/info "Creating new nested collection" (:name collection-data))
            (t2/insert-returning-instance! :model/Collection collection-data)))))))

(defmethod export/export-entity :model/Collection [collection]
  (export collection))
