(ns metabase-enterprise.similarity.models.similar-edge-status
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SimilarEdgeStatus [_model] :similar_edge_status)

(derive :model/SimilarEdgeStatus :metabase/model)

(t2/deftransforms :model/SimilarEdgeStatus
  {:view   mi/transform-keyword
   :status mi/transform-keyword})
