(ns metabase-enterprise.dependencies.dependency-types
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def dependency-types
  "The entity types of the dependency graph, the `:type`s that the dependencies specs of the models declare, which the
  API takes as parameters."
  #{:action :card :dashboard :data-app :document :measure :sandbox :segment :snippet :table :transform})

(mr/def ::dependency-types
  (ms/enum-decode-keyword dependency-types))

(mr/def ::entity-id pos-int?)
