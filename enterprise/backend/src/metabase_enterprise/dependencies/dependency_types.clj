(ns metabase-enterprise.dependencies.dependency-types
  (:require
   [clojure.set :as set]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def model->dependency-type
  "A map relating models to their corresponding dependency type."
  {:model/Card               :card
   :model/Table              :table
   :model/NativeQuerySnippet :snippet
   :model/Transform          :transform
   :model/Dashboard          :dashboard
   :model/Document           :document
   :model/Sandbox            :sandbox
   :model/Segment            :segment
   :model/Measure            :measure})

(def dependency-type->model
  "A map relating dependency types to their corresponding model."
  (set/map-invert model->dependency-type))

(def dependency-types
  "The set of all dependency types."
  (-> model->dependency-type vals set))

(def models
  "The set of all models that are handled by dependencies."
  (-> model->dependency-type keys set))

(mr/def ::dependency-types
  (ms/enum-decode-keyword dependency-types))

(mr/def ::entity-id pos-int?)
