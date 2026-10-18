(ns metabase-enterprise.dependencies.models.result-metadata-status
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ResultMetadataStatus [_model] :result_metadata_status)

(derive :model/ResultMetadataStatus :metabase/model)

(t2/deftransforms :model/ResultMetadataStatus
  {:entity_type mi/transform-keyword})

(def entity-types
  "The entity types whose result columns the result metadata of dependent MBQL cards is derived from."
  [:card :measure :table])

(def derived-types
  "The entity types whose result columns are derived from those of the entities they depend on: cards, of which the
  MBQL ones are re-derived, and measures, which pass a change on."
  #{:card :measure})
