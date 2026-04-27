(ns metabase-enterprise.similarity.models.similar-edge
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SimilarEdge [_model] :similar_edge)

(derive :model/SimilarEdge :metabase/model)

(t2/deftransforms :model/SimilarEdge
  {:from_entity_type  mi/transform-keyword
   :to_entity_type    mi/transform-keyword
   :view              mi/transform-keyword
   :contributing_data mi/transform-json})
