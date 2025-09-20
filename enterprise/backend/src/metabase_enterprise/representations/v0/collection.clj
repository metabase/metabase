(ns metabase-enterprise.representations.v0.collection
  (:require
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.collections.api :as coll.api]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

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

(defn- model->url [model]
  (let [modelname (get {:dataset :model
                        :card :question}
                       (keyword (:model model)) (:model model))]
    (format "/api/ee/representation/%s/%s" (name modelname) (:id model))))

(defn children [collection]
  (->> (coll.api/collection-children collection {:show-dashboard-questions? true
                                                 :archived? false})
       :data
       (mapv model->url)))

(defn export [collection]
  (-> {:type "collection"
       :ref (format "%s-%s" "collection" (:id collection))
       :name (:name collection)
       :description (:description collection)
       :children (children collection)}
      v0-common/remove-nils))
