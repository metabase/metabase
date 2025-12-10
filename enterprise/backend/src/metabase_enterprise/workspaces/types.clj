(ns metabase-enterprise.workspaces.types
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::appdb-id ms/PositiveInt)

(mr/def ::ref-id [:string {:min 1}])

(def entity-types
  "The kinds of entities we can store within a Workspace."
  [{:name  "Transform"
    :key   :transform
    :group :transforms
    :model :model/Transform}])

(mr/def ::entity-type (into [:enum] (map :key) entity-types))

(mr/def ::entity-grouping (into [:enum] (map :group) entity-types))

;; Map like {:transforms [1 2 3]}
(mr/def ::entity-map
  [:map-of ::entity-grouping [:sequential ms/PositiveInt]])
