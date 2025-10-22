(ns metabase-enterprise.representations.v0.collection
  (:require
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.collections.api :as coll.api]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defmethod import/type->schema [:v0 :collection] [_]
  ::collection)

(defmethod v0-common/representation-type :model/Collection [_entity]
  :collection)

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'collection' for this schema"}
   :collection])

(mr/def ::version
  [:enum {:decode/json keyword
          :description "Version of this collection schema"}
   :v0])

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
   [:version ::version]
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

(defmethod v0-common/type->model :collection
  [_]
  :model/Collection)

(defmethod import/yaml->toucan [:v0 :collection]
  [{collection-name :name
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
  (let [new-collection (import/yaml->toucan representation ref-index)
        collection-name (:name new-collection)
        existing (t2/select-one :model/Collection :name collection-name :location "/")]
    (if existing
      (archive-and-persist! existing new-collection)
      (persist! new-collection))))

(defmethod export/export-entity :collection [collection]
  (-> {:type :collection
       :version :v0
       :ref (format "%s-%s" "collection" (:id collection))
       :name (:name collection)
       :description (:description collection)
       :children (children collection)}
      u/remove-nils))
