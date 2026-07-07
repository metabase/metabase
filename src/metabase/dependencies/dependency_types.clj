(ns metabase.dependencies.dependency-types
  (:require
   [clojure.set :as set]
   [metabase.premium-features.core :as premium-features]
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

(def backfillable-dependency-types
  "Dependency types that the backfill job computes dependencies for. Excludes `:table`: tables aren't
  backfilled directly; links involving tables are found via analysis of the other side of the relation."
  (disj dependency-types :table))

(defn enabled-backfill-dependency-types
  "The backfillable dependency types enabled on this instance. Transform dependencies are tracked
  on all instances (transform-job planning reads them so it doesn't have to re-parse every
  transform's source on every read); everything else requires the `:dependencies` premium feature."
  []
  (if (premium-features/has-feature? :dependencies)
    backfillable-dependency-types
    #{:transform}))

(def models
  "The set of all models that are handled by dependencies."
  (-> model->dependency-type keys set))

(mr/def ::dependency-types
  (ms/enum-decode-keyword dependency-types))

(mr/def ::entity-id pos-int?)
