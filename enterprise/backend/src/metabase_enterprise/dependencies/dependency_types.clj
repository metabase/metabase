(ns metabase-enterprise.dependencies.dependency-types
  (:require
   [clojure.set :as set]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def model->dependency-type
  "A map relating models to their corresponding dependency type."
  {:model/Card               :card
   :model/Table              :table
   :model/Field              :field
   :model/NativeQuerySnippet :snippet
   :model/Transform          :transform
   :model/Dashboard          :dashboard
   :model/Document           :document
   :model/Sandbox            :sandbox
   :model/Segment            :segment
   :model/Measure            :measure
   :model/Action             :action
   :model/DataApp            :data-app})

(def dependency-type->model
  "A map relating dependency types to their corresponding model."
  (set/map-invert model->dependency-type))

(def dependency-types
  "The set of all dependency types."
  (-> model->dependency-type vals set))

(def backfillable-dependency-types
  "Dependency types that the dependency job computes dependencies for. Excludes `:table` and `:field`: neither is
  backfilled directly; links involving them are found via analysis of the other side of the relation."
  (disj dependency-types :table :field))

(def column-level-dependency-types
  "Dependency types finer than the entities the dependency graph shows by default: a `:field` is only ever the
  upstream end of a dependency, next to the dependency on its table, so the graph leaves it out unless asked."
  #{:field})

(def entity-level-dependency-types
  "The dependency types the dependency graph and the item lists show by default: every type except the
  [[column-level-dependency-types]]."
  (set/difference dependency-types column-level-dependency-types))

(def models
  "The set of all models that are handled by dependencies."
  (-> model->dependency-type keys set))

(mr/def ::dependency-types
  (ms/enum-decode-keyword dependency-types))

(mr/def ::entity-level-dependency-types
  (ms/enum-decode-keyword entity-level-dependency-types))

(mr/def ::entity-id pos-int?)
