(ns metabase.explorations.models.exploration-query
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationQuery [_model] :exploration_query)

(doto :model/ExplorationQuery
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/deftransforms :model/ExplorationQuery
  {:dimension_ids          mi/transform-json
   :visualization_settings mi/transform-json
   :dataset_query          mi/transform-json})
