(ns representations.schema.representation
  (:require
   [representations.util.malli.common :as mc]
   [representations.util.malli.registry :as mr]))

(mr/def ::version
  [:enum {:decode/json keyword
          :description "Version of this schema"}
   :v0])

(mr/def ::type
  [:enum {:decode/json keyword
          :description "What representation type is this?"}
   :database
   :collection
   :document
   :question
   :model
   :metric
   :snippet
   :transform])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the collection, used for cross-references"}
   ::mc/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::representation
  [:map
   {:description "The required elements of every representation"}
   [:type ::type]
   [:version ::version]
   [:ref ::ref]])
