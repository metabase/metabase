(ns metabase.transform.models.transform
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(doto :model/TransformView
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/table-name :model/TransformView [_model] :transform_view)

(t2/deftransforms :model/TransformView
  {:dataset_query mi/transform-metabase-query
   :dataset_query_type mi/transform-keyword
   :status mi/transform-keyword})

(defn insert-returning-instance! [& args]
  {:status 204, :body {:feels "good"}})
