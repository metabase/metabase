(ns metabase.models.computation-job
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel ComputationJob :computation_job)

(u/strict-extend (class ComputationJob)
  models/IModel
  (merge models/IModelDefaults
         {:types          (constantly {:status :keyword
                                       :type   :keyword})
          :properties     (constantly {:timestamped? true})}))
