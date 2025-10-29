(ns representations.schema.v0.collection
  (:require
   [representations.read.impl :as read-impl]
   [representations.schema.representation :as representation]
   [representations.util.malli.common :as mc]
   [representations.util.malli.registry :as mr]))

(mr/def ::display-name
  [:and
   {:description "Human-readable name for the collection"}
   ::mc/non-blank-string])

(mr/def ::description
  [:and
   {:description "Optional documentation explaining the collection's purpose"}
   :string])

(mr/def ::collection
  [:merge
   ::representation/representation
   [:map
    {:closed true
     :description "v0 schema for human-writable collection representation
                  Collections organize cards, dashboards, and other resources.
                  Every representations directory MUST have a collection.yml file."}
    [:display_name {:optional true} [:maybe ::display-name]]
    [:description {:optional true} [:maybe ::description]]
    [:children {:optional true} [:maybe [:vector :string]]]]])

(defmethod read-impl/representation->schema [:v0 :collection] [_] ::collection)
