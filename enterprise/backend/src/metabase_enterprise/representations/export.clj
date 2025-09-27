(ns metabase-enterprise.representations.export
  "Export functionality for Metabase entities to human-readable representations"
  (:require
   [toucan2.core :as t2]))

(def export-entity nil)
(def representation-type nil)

(defmulti representation-type
  ""
  (fn [entity] (t2/model entity)))

(defmethod representation-type :model/Card [card] (:type card))
(defmethod representation-type :default [entity] (t2/model entity))

(defmulti export-entity
  "Export a Metabase entity to its human-readable representation format.
   Dispatches on [model type] for Cards, [model nil] for other entities."
  representation-type)
